import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import {
  createMemoryId,
  deleteMemory,
  listMemories,
  normalizeText,
  resolveMemoryStore,
  resolveUserMemoryDir,
} from '../src/memory-service.mjs';

async function seedFile(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}

async function createFixture() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'github-memory-admin-'));
  const workspaceDir = path.join(tempDir, 'workspace');
  const homeDir = path.join(tempDir, 'home');

  await seedFile(path.join(homeDir, '.vscode', 'copilot', 'memories', 'user.md'), 'Use TypeScript');
  await seedFile(path.join(workspaceDir, '.github', 'copilot', 'memories', 'repo.md'), 'Repository memory');
  await seedFile(path.join(workspaceDir, '.github', 'copilot', 'memories', 'nested', 'topic.md'), 'Nested repository memory');
  await seedFile(path.join(workspaceDir, '.github', 'copilot', 'memories', 'session', 'task.md'), 'Session memory');

  return { workspaceDir, homeDir };
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

test('resolveMemoryStore returns workspace-based session and repo paths', () => {
  assert.equal(
    resolveMemoryStore({ scope: 'session', workspaceDir: '/workspace' }),
    '/workspace/.github/copilot/memories/session',
  );
  assert.equal(
    resolveMemoryStore({ scope: 'repo', workspaceDir: '/workspace' }),
    '/workspace/.github/copilot/memories',
  );
});

test('createMemoryId is stable for the same inputs', () => {
  const first = createMemoryId('repo', 'nested/topic.md');
  const second = createMemoryId('repo', 'nested/topic.md');
  assert.equal(first, second);
});

test('listMemories reads user, session, and repo stores from local disk', async () => {
  const { workspaceDir, homeDir } = await createFixture();

  const userResult = await listMemories({ scope: 'user', workspaceDir, homeDir, platform: 'linux' });
  assert.equal(userResult.memories.length, 1);
  assert.equal(userResult.memories[0].relativePath, 'user.md');

  const sessionResult = await listMemories({ scope: 'session', workspaceDir, homeDir, platform: 'linux' });
  assert.deepEqual(sessionResult.memories.map((memory) => memory.relativePath), ['task.md']);

  const repoResult = await listMemories({ scope: 'repo', workspaceDir, homeDir, platform: 'linux' });
  assert.deepEqual(repoResult.memories.map((memory) => memory.relativePath), ['nested/topic.md', 'repo.md']);
});

test('listMemories reports missing stores without throwing', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'github-memory-admin-'));
  const result = await listMemories({ scope: 'session', workspaceDir: tempDir, homeDir: tempDir, platform: 'linux' });
  assert.equal(result.exists, false);
  assert.equal(result.memories.length, 0);
  assert.match(result.message, /No session memory directory/i);
});

test('deleteMemory removes the selected local file', async () => {
  const { workspaceDir, homeDir } = await createFixture();
  const repoResult = await listMemories({ scope: 'repo', workspaceDir, homeDir, platform: 'linux' });
  const target = repoResult.memories.find((memory) => memory.relativePath === 'repo.md');

  const deletion = await deleteMemory({ scope: 'repo', workspaceDir, homeDir, platform: 'linux', id: target.id });
  assert.equal(deletion.deleted, true);
  assert.equal(deletion.deletedPath, 'repo.md');

  await assert.rejects(
    readFile(path.join(workspaceDir, '.github', 'copilot', 'memories', 'repo.md'), 'utf8'),
    /ENOENT/,
  );
});
