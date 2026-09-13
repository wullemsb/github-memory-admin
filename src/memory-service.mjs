import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const USER_MEMORY_URL = 'https://github.com/settings/copilot/memory';
const DELETE_LABEL = /^(delete|remove)$/i;

let browserContextPromise;

function sha(input) {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

export function buildMemoryUrl({ scope, owner, repo }) {
  if (scope === 'user') {
    return USER_MEMORY_URL;
  }

  if (!owner || !repo) {
    throw new Error('Repository scope requires both owner and repo.');
  }

  return `https://github.com/${owner}/${repo}/settings/copilot/memory`;
}

export function parseRepoInput(input) {
  const normalized = normalizeText(input).replace(/^https:\/\/github\.com\//, '').replace(/^github\.com\//, '').replace(/^\//, '');
  const [owner, repo, ...rest] = normalized.split('/').filter(Boolean);
  if (!owner || !repo || rest.length > 0) {
    throw new Error('Repository must be in the form owner/repo.');
  }
  return { owner, repo };
}

export function createMemoryId(targetUrl, ordinal, text) {
  return sha(`${targetUrl}|${ordinal}|${normalizeText(text)}`);
}

export function dedupeMemories(memories) {
  const seen = new Set();
  return memories.filter((memory) => {
    const key = `${memory.id}|${memory.text}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function getBrowserContext({ headless = false, profileDir } = {}) {
  if (!browserContextPromise) {
    const userDataDir = profileDir ?? path.join(os.homedir(), '.github-memory-admin', 'profile');
    browserContextPromise = chromium.launchPersistentContext(userDataDir, {
      headless,
      viewport: { width: 1440, height: 1024 },
    });
  }

  return browserContextPromise;
}

async function getPage(options) {
  const context = await getBrowserContext(options);
  const existingPage = context.pages()[0];
  return existingPage ?? context.newPage();
}

async function waitForSettled(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

async function isLoginRequired(page) {
  const url = page.url();
  if (url.includes('/login')) {
    return true;
  }

  return page.evaluate(() => {
    const text = document.body?.innerText ?? '';
    return /sign in to github/i.test(text) || /verify your account/i.test(text);
  });
}

function extractionScript(targetUrl, scope, owner, repo) {
  return ({ targetUrl, scope, owner, repo, deletePatternSource }) => {
    const DELETE_PATTERN = new RegExp(deletePatternSource, 'i');

    const textOf = (node) => (node?.innerText || node?.textContent || '').replace(/\s+/g, ' ').trim();

    const makeContainer = (button) => {
      let current = button.closest('li, article, tr, section, div');
      while (current && current !== document.body) {
        const text = textOf(current);
        if (text.length > 0 && text.length < 2500) {
          return current;
        }
        current = current.parentElement;
      }
      return button.parentElement || button;
    };

    const getMemoryText = (container) => {
      const clone = container.cloneNode(true);
      clone.querySelectorAll('button, a[role="button"], [data-view-component="true"] svg, summary').forEach((node) => node.remove());
      return textOf(clone);
    };

    const buttons = Array.from(document.querySelectorAll('button, a[role="button"], [role="button"]')).filter((node) => {
      const label = textOf(node);
      return DELETE_PATTERN.test(label);
    });

    return buttons.map((button, index) => {
      const container = makeContainer(button);
      const text = getMemoryText(container);
      const title = text.split(/\n+/).map((line) => line.trim()).find(Boolean) || text;
      return {
        ordinal: index,
        title,
        text,
        scope,
        owner,
        repo,
        deleteLabel: textOf(button),
      };
    }).filter((item) => item.text);
  };
}

function decorateMemories(targetUrl, rawMemories) {
  return dedupeMemories(rawMemories.map((memory) => ({
    ...memory,
    text: normalizeText(memory.text),
    title: normalizeText(memory.title || memory.text),
    id: createMemoryId(targetUrl, memory.ordinal, memory.text),
  })));
}

export async function listMemories(options = {}) {
  if (options.mockDataPath) {
    const data = JSON.parse(await readFile(options.mockDataPath, 'utf8'));
    return { loginRequired: false, memories: decorateMemories('mock://memory', data.memories || []) };
  }

  const page = await getPage(options);
  const targetUrl = buildMemoryUrl(options);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await waitForSettled(page);

  if (await isLoginRequired(page)) {
    return {
      loginRequired: true,
      targetUrl,
      memories: [],
      message: 'Sign into GitHub in the opened Playwright browser, then refresh this page.',
    };
  }

  const rawMemories = await page.evaluate(extractionScript(targetUrl, options.scope, options.owner, options.repo), {
    targetUrl,
    scope: options.scope,
    owner: options.owner ?? null,
    repo: options.repo ?? null,
    deletePatternSource: DELETE_LABEL.source,
  });

  return {
    loginRequired: false,
    targetUrl,
    memories: decorateMemories(targetUrl, rawMemories),
  };
}

export async function deleteMemory({ id, ...options }) {
  if (!id) {
    throw new Error('A memory id is required for deletion.');
  }

  if (options.mockDataPath) {
    const data = JSON.parse(await readFile(options.mockDataPath, 'utf8'));
    const memories = decorateMemories('mock://memory', data.memories || []);
    const nextMemories = memories.filter((memory) => memory.id !== id).map(({ id: _id, ...memory }) => memory);
    if (nextMemories.length === memories.length) {
      throw new Error('The requested memory entry could not be found. Refresh and try again.');
    }
    await writeFile(options.mockDataPath, JSON.stringify({ memories: nextMemories }, null, 2));
    return { deleted: true, loginRequired: false, targetUrl: 'mock://memory' };
  }

  const page = await getPage(options);
  const targetUrl = buildMemoryUrl(options);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await waitForSettled(page);

  if (await isLoginRequired(page)) {
    return {
      loginRequired: true,
      deleted: false,
      targetUrl,
      message: 'Sign into GitHub in the opened Playwright browser, then retry deletion.',
    };
  }

  const rawMemories = await page.evaluate(extractionScript(targetUrl, options.scope, options.owner, options.repo), {
    targetUrl,
    scope: options.scope,
    owner: options.owner ?? null,
    repo: options.repo ?? null,
    deletePatternSource: DELETE_LABEL.source,
  });

  const memories = decorateMemories(targetUrl, rawMemories);
  const target = memories.find((memory) => memory.id === id);
  if (!target) {
    throw new Error('The requested memory entry could not be found. Refresh and try again.');
  }

  const buttons = page.getByRole('button').filter({ hasText: DELETE_LABEL });
  const count = await buttons.count();

  let clicked = false;
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    const containerText = normalizeText(await button.locator('xpath=ancestor-or-self::*[self::li or self::article or self::tr or self::section or self::div][1]').textContent().catch(() => ''));
    if (containerText && containerText.includes(target.text)) {
      await button.click();
      clicked = true;
      break;
    }
  }

  if (!clicked && target.ordinal < count) {
    await buttons.nth(target.ordinal).click();
    clicked = true;
  }

  if (!clicked) {
    throw new Error('The delete action could not be matched to the selected memory.');
  }

  const confirmButton = page.getByRole('button', { name: /^(delete|remove)$/i }).last();
  if (await confirmButton.count()) {
    await confirmButton.click().catch(() => {});
  }

  await waitForSettled(page);
  return { deleted: true, loginRequired: false, targetUrl };
}

export async function closeBrowser() {
  if (!browserContextPromise) {
    return;
  }

  const context = await browserContextPromise;
  browserContextPromise = undefined;
  await context.close();
}
