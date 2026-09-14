import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import {
  createMemoryId,
  deleteMemory,
  discoverMemoryStores,
  listMemories,
  normalizeText,
  resolveRootDir,
  resolveUserMemoryDir,
} from '../src/memory-service.mjs';

async function seedFile(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}

async function createFixture() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'github-memory-admin-'));
  const rootDir = path.join(tempDir, 'projects');
  const homeDir = path.join(tempDir, 'home');
  const alphaWorkspace = path.join(rootDir, 'alpha');
  const betaWorkspace = path.join(rootDir, 'nested', 'beta');

  await seedFile(path.join(homeDir, '.vscode', 'copilot', 'memories', 'user.md'), 'Use TypeScript');
  await seedFile(path.join(alphaWorkspace, '.github', 'copilot', 'memories', 'repo.md'), 'Repository memory');
  await seedFile(path.join(alphaWorkspace, '.github', 'copilot', 'memories', 'session', 'task.md'), 'Session memory');
  await seedFile(path.join(betaWorkspace, '.github', 'copilot', 'memories', 'ideas.md'), 'Beta repo memory');
  await seedFile(path.join(betaWorkspace, '.github', 'copilot', 'memories', 'session', 'draft.md'), 'Beta session memory');

  return { rootDir, homeDir, alphaWorkspace, betaWorkspace };
}

test('normalizeText trims surrounding whitespace', () => {
  assert.equal(normalizeText('  hello\n\nworld  '), 'hello\n\nworld');
});

test('resolveUserMemoryDir supports linux/mac and windows conventions', () => {
  assert.equal(
    resolveUserMemoryDir({ platform: 'linux', homeDir: '/home/tester' }),
    '/home/tester/.vscode/copilot/memories',
  );
  assert.equal(
    resolveUserMemoryDir({ platform: 'win32', homeDir: 'C:\\Users\\tester', appData: 'C:\\Users\\tester\\AppData\\Roaming' }),
    'C:\\Users\\tester\\AppData\\Roaming\\Code\\User\\copilot\\memories',
  );
});

test('resolveRootDir prefers the configured root directory', () => {
  assert.equal(resolveRootDir({ rootDir: '/scan/root', workspaceDir: '/workspace' }), '/scan/root');
  assert.equal(resolveRootDir({ workspaceDir: '/workspace' }), '/workspace');
});

test('createMemoryId is stable for the same inputs', () => {
  const first = createMemoryId('repo', '/stores/alpha', 'repo.md');
  const second = createMemoryId('repo', '/stores/alpha', 'repo.md');
  assert.equal(first, second);
});

test('discoverMemoryStores finds recursive repo and session stores under the configured root', async () => {
  const { rootDir, homeDir } = await createFixture();

  const repoStores = await discoverMemoryStores({ scope: 'repo', rootDir, homeDir, platform: 'linux' });
  assert.deepEqual(repoStores.map((store) => store.relativeWorkspacePath), ['alpha', 'nested/beta']);

  const sessionStores = await discoverMemoryStores({ scope: 'session', rootDir, homeDir, platform: 'linux' });
  assert.deepEqual(sessionStores.map((store) => store.relativeWorkspacePath), ['alpha', 'nested/beta']);

  const userStores = await discoverMemoryStores({ scope: 'user', rootDir, homeDir, platform: 'linux' });
  assert.equal(userStores.length, 1);
  assert.equal(userStores[0].relativeWorkspacePath, 'User scope');
});

test('listMemories aggregates memories from all discovered stores', async () => {
  const { rootDir, homeDir } = await createFixture();

  const repoResult = await listMemories({ scope: 'repo', rootDir, homeDir, platform: 'linux' });
  assert.equal(repoResult.stores.length, 2);
  assert.deepEqual(repoResult.memories.map((memory) => `${memory.relativeWorkspacePath}:${memory.relativePath}`), [
    'alpha:repo.md',
    'nested/beta:ideas.md',
  ]);

  const sessionResult = await listMemories({ scope: 'session', rootDir, homeDir, platform: 'linux' });
  assert.deepEqual(sessionResult.memories.map((memory) => `${memory.relativeWorkspacePath}:${memory.relativePath}`), [
    'alpha:task.md',
    'nested/beta:draft.md',
  ]);
});

test('listMemories reports missing stores without throwing', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'github-memory-admin-'));
  const result = await listMemories({ scope: 'repo', rootDir: tempDir, homeDir: tempDir, platform: 'linux' });
  assert.equal(result.exists, false);
  assert.equal(result.memories.length, 0);
  assert.match(result.message, /No repo memory stores were found/i);
});

test('deleteMemory removes the selected local file from the matching discovered store', async () => {
  const { rootDir, homeDir, betaWorkspace } = await createFixture();
  const repoResult = await listMemories({ scope: 'repo', rootDir, homeDir, platform: 'linux' });
  const target = repoResult.memories.find((memory) => memory.relativeWorkspacePath === 'nested/beta');

  const deletion = await deleteMemory({ scope: 'repo', rootDir, homeDir, platform: 'linux', id: target.id });
  assert.equal(deletion.deleted, true);
  assert.equal(deletion.deletedPath, 'ideas.md');

  await assert.rejects(
    readFile(path.join(betaWorkspace, '.github', 'copilot', 'memories', 'ideas.md'), 'utf8'),
    /ENOENT/,
  );
});
