import { createHash } from 'node:crypto';
import { readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function sha(input) {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export function normalizeText(value) {
  return String(value ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

export function createMemoryId(scope, relativePath) {
  return sha(`${scope}|${relativePath}`);
}

export function resolveUserMemoryDir({ platform = process.platform, homeDir = os.homedir(), appData = process.env.APPDATA } = {}) {
  if (platform === 'win32') {
    const root = appData || path.join(homeDir, 'AppData', 'Roaming');
    return path.win32.join(root, 'Code', 'User', 'copilot', 'memories');
  }

  return path.join(homeDir, '.vscode', 'copilot', 'memories');
}

export function resolveMemoryStore({ scope = 'user', workspaceDir = process.cwd(), platform, homeDir, appData } = {}) {
  if (scope === 'user') {
    return resolveUserMemoryDir({ platform, homeDir, appData });
  }

  if (scope === 'session') {
    return path.join(workspaceDir, '.github', 'copilot', 'memories', 'session');
  }

  if (scope === 'repo') {
    return path.join(workspaceDir, '.github', 'copilot', 'memories');
  }

  throw new Error('Scope must be one of "user", "session", or "repo".');
}

async function walkMemoryFiles(rootPath, currentPath, scope) {
  const entries = await readdir(currentPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (scope === 'repo' && currentPath === rootPath && entry.isDirectory() && entry.name === 'session') {
      continue;
    }

    const absolutePath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkMemoryFiles(rootPath, absolutePath, scope));
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

async function toMemory(rootPath, absolutePath, scope) {
  const [contents, details] = await Promise.all([
    readFile(absolutePath, 'utf8'),
    stat(absolutePath),
  ]);

  const relativePath = path.relative(rootPath, absolutePath).split(path.sep).join('/');
  const title = relativePath;

  return {
    id: createMemoryId(scope, relativePath),
    title,
    text: normalizeText(contents),
    relativePath,
    absolutePath,
    scope,
    size: details.size,
    modifiedAt: details.mtime.toISOString(),
  };
}

export async function listMemories(options = {}) {
  const scope = options.scope || 'user';
  const storePath = resolveMemoryStore({ ...options, scope });
  let absoluteFiles;

  try {
    absoluteFiles = await walkMemoryFiles(storePath, storePath, scope);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {
        exists: false,
        storePath,
        memories: [],
        message: `No ${scope} memory directory was found at ${storePath}.`,
      };
    }
    throw error;
  }

  const memories = await Promise.all(
    absoluteFiles
      .sort((left, right) => left.localeCompare(right))
      .map((absolutePath) => toMemory(storePath, absolutePath, scope)),
  );

  return {
    exists: true,
    storePath,
    memories,
    message: memories.length
      ? `Loaded ${memories.length} memory file${memories.length === 1 ? '' : 's'} from ${storePath}.`
      : `No memory files were found in ${storePath}.`,
  };
}

export async function deleteMemory({ id, ...options }) {
  if (!id) {
    throw new Error('A memory id is required for deletion.');
  }

  const { memories, storePath } = await listMemories(options);
  const target = memories.find((memory) => memory.id === id);
  if (!target) {
    throw new Error('The requested memory entry could not be found. Refresh and try again.');
  }

  const targetPath = path.resolve(storePath, target.relativePath);
  const normalizedRoot = `${path.resolve(storePath)}${path.sep}`;
  if (!targetPath.startsWith(normalizedRoot)) {
    throw new Error('The requested memory entry is outside the allowed store path.');
  }

  await rm(targetPath);

  return {
    deleted: true,
    storePath,
    deletedPath: target.relativePath,
  };
}
