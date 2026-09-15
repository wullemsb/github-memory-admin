import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { chmodSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import {
  resolveCodeUserDir,
  createMemoryId,
  deleteMemory,
  discoverMemoryStores,
  listMemories,
  normalizeText,
  resolveMemoryStore,
  resolveRootDir,
  resolveUserMemoryDir,
  resolveWorkspaceStorageDir,
} from '../src/memory-service.mjs';

async function seedFile(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}

async function createFixture() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'github-memory-admin-'));
  const homeDir = path.join(tempDir, 'home');
  const rootDir = path.join(homeDir, '.config', 'Code', 'User', 'workspaceStorage');
  const alphaWorkspace = path.join(rootDir, 'alpha-hash');
  const betaWorkspace = path.join(rootDir, 'nested', 'beta-hash');

  await seedFile(path.join(homeDir, '.config', 'Code', 'User', 'globalStorage', 'github.copilot-chat', 'memory-tool', 'memories', 'user.md'), 'Use TypeScript');
  await seedFile(path.join(alphaWorkspace, 'workspace.json'), JSON.stringify({ folder: 'file:///workspace/alpha-repo' }));
  await seedFile(path.join(alphaWorkspace, 'github.copilot-chat', 'memory-tool', 'memories', 'repo', 'repo.md'), 'Repository memory');
  await seedFile(path.join(alphaWorkspace, 'github.copilot-chat', 'memory-tool', 'memories', 'session', 'task.md'), 'Session memory');
  await seedFile(path.join(betaWorkspace, 'workspace.json'), JSON.stringify({ folder: 'file:///workspace/beta-repo' }));
  await seedFile(path.join(betaWorkspace, 'github.copilot-chat', 'memory-tool', 'memories', 'repo', 'ideas.md'), 'Beta repo memory');
  await seedFile(path.join(betaWorkspace, 'github.copilot-chat', 'memory-tool', 'memories', 'session', 'draft.md'), 'Beta session memory');

  return { rootDir, homeDir, alphaWorkspace, betaWorkspace };
}

test('normalizeText trims surrounding whitespace', () => {
  assert.equal(normalizeText('  hello\n\nworld  '), 'hello\n\nworld');
});

test('resolveCodeUserDir supports linux/mac and windows conventions', () => {
  assert.equal(
    resolveCodeUserDir({ platform: 'linux', homeDir: '/home/tester' }),
    '/home/tester/.config/Code/User',
  );
  assert.equal(
    resolveCodeUserDir({ platform: 'darwin', homeDir: '/Users/tester' }),
    '/Users/tester/Library/Application Support/Code/User',
  );
  assert.equal(
    resolveCodeUserDir({ platform: 'win32', homeDir: 'C:\\Users\\tester', appData: 'C:\\Users\\tester\\AppData\\Roaming' }),
    'C:\\Users\\tester\\AppData\\Roaming\\Code\\User',
  );
});

test('resolveUserMemoryDir supports linux/mac and windows conventions', () => {
  assert.equal(
    resolveUserMemoryDir({ platform: 'linux', homeDir: '/home/tester' }),
    '/home/tester/.config/Code/User/globalStorage/github.copilot-chat/memory-tool/memories',
  );
  assert.equal(
    resolveUserMemoryDir({ platform: 'darwin', homeDir: '/Users/tester' }),
    '/Users/tester/Library/Application Support/Code/User/globalStorage/github.copilot-chat/memory-tool/memories',
  );
  assert.equal(
    resolveUserMemoryDir({ platform: 'win32', homeDir: 'C:\\Users\\tester', appData: 'C:\\Users\\tester\\AppData\\Roaming' }),
    'C:\\Users\\tester\\AppData\\Roaming\\Code\\User\\globalStorage\\github.copilot-chat\\memory-tool\\memories',
  );
});

test('resolveWorkspaceStorageDir supports linux/mac and windows conventions', () => {
  assert.equal(
    resolveWorkspaceStorageDir({ platform: 'linux', homeDir: '/home/tester' }),
    '/home/tester/.config/Code/User/workspaceStorage',
  );
  assert.equal(
    resolveWorkspaceStorageDir({ platform: 'darwin', homeDir: '/Users/tester' }),
    '/Users/tester/Library/Application Support/Code/User/workspaceStorage',
  );
  assert.equal(
    resolveWorkspaceStorageDir({ platform: 'win32', homeDir: 'C:\\Users\\tester', appData: 'C:\\Users\\tester\\AppData\\Roaming' }),
    'C:\\Users\\tester\\AppData\\Roaming\\Code\\User\\workspaceStorage',
  );
});

test('resolveRootDir prefers the configured root directory', () => {
  assert.equal(resolveRootDir({ rootDir: '/scan/root', workspaceDir: '/workspace' }), '/scan/root');
  assert.equal(resolveRootDir({ workspaceDir: '/workspace' }), '/workspace');
  assert.equal(resolveRootDir({ platform: 'linux', homeDir: '/home/tester' }), '/home/tester/.config/Code/User/workspaceStorage');
});

test('resolveMemoryStore uses the configured or default VS Code storage roots', () => {
  assert.equal(
    resolveMemoryStore({ scope: 'repo', rootDir: '/scan/root' }),
    '/scan/root/github.copilot-chat/memory-tool/memories/repo',
  );
  assert.equal(
    resolveMemoryStore({ scope: 'session', platform: 'linux', homeDir: '/home/tester' }),
    '/home/tester/.config/Code/User/workspaceStorage/github.copilot-chat/memory-tool/memories/session',
  );
});

test('createMemoryId is stable for the same inputs', () => {
  const first = createMemoryId('repo', '/stores/alpha', 'repo.md');
  const second = createMemoryId('repo', '/stores/alpha', 'repo.md');
  assert.equal(first, second);
});

test('discoverMemoryStores finds recursive repo and session stores under the configured root', async () => {
  const { rootDir, homeDir } = await createFixture();

  const repoStores = await discoverMemoryStores({ scope: 'repo', rootDir, homeDir, platform: 'linux' });
  assert.deepEqual(repoStores.map((store) => store.relativeWorkspacePath), ['alpha-hash', 'nested/beta-hash']);

  const sessionStores = await discoverMemoryStores({ scope: 'session', rootDir, homeDir, platform: 'linux' });
  assert.deepEqual(sessionStores.map((store) => store.relativeWorkspacePath), ['alpha-hash', 'nested/beta-hash']);

  const userStores = await discoverMemoryStores({ scope: 'user', rootDir, homeDir, platform: 'linux' });
  assert.equal(userStores.length, 1);
  assert.equal(userStores[0].relativeWorkspacePath, 'User scope');
});

test('discoverMemoryStores resolves repository labels from workspace metadata', async () => {
  const { rootDir, homeDir } = await createFixture();

  const repoStores = await discoverMemoryStores({ scope: 'repo', rootDir, homeDir, platform: 'linux' });

  assert.deepEqual(repoStores.map((store) => `${store.relativeWorkspacePath}:${store.workspaceLabel}`), [
    'alpha-hash:alpha-repo',
    'nested/beta-hash:beta-repo',
  ]);
});

test('listMemories aggregates memories from all discovered stores', async () => {
  const { rootDir, homeDir } = await createFixture();

  const repoResult = await listMemories({ scope: 'repo', rootDir, homeDir, platform: 'linux' });
  assert.equal(repoResult.stores.length, 2);
  assert.deepEqual(repoResult.memories.map((memory) => `${memory.relativeWorkspacePath}:${memory.relativePath}`), [
    'alpha-hash:repo.md',
    'nested/beta-hash:ideas.md',
  ]);

  const sessionResult = await listMemories({ scope: 'session', rootDir, homeDir, platform: 'linux' });
  assert.deepEqual(sessionResult.memories.map((memory) => `${memory.relativeWorkspacePath}:${memory.relativePath}`), [
    'alpha-hash:task.md',
    'nested/beta-hash:draft.md',
  ]);
});

test('listMemories can combine user and repository memories for the UI', async () => {
  const { rootDir, homeDir } = await createFixture();

  const result = await listMemories({ scope: 'combined', rootDir, homeDir, platform: 'linux' });

  assert.equal(result.exists, true);
  assert.equal(result.userExists, true);
  assert.equal(result.repoExists, true);
  assert.equal(result.stores.length, 3);
  assert.deepEqual(result.stores.map((store) => `${store.scope}:${store.relativeWorkspacePath}`), [
    'user:User scope',
    'repo:alpha-hash',
    'repo:nested/beta-hash',
  ]);
  assert.deepEqual(result.memories.map((memory) => `${memory.scope}:${memory.relativeWorkspacePath}:${memory.relativePath}`), [
    'user:User scope:user.md',
    'repo:alpha-hash:repo.md',
    'repo:nested/beta-hash:ideas.md',
  ]);
  assert.deepEqual(result.stores.map((store) => `${store.scope}:${store.workspaceLabel}`), [
    'user:User scope',
    'repo:alpha-repo',
    'repo:beta-repo',
  ]);
  assert.deepEqual(result.memories.map((memory) => `${memory.scope}:${memory.workspaceLabel}:${memory.relativePath}`), [
    'user:User scope:user.md',
    'repo:alpha-repo:repo.md',
    'repo:beta-repo:ideas.md',
  ]);
});

test('listMemories reports missing stores without throwing', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'github-memory-admin-'));
  const result = await listMemories({ scope: 'repo', rootDir: tempDir, homeDir: tempDir, platform: 'linux' });
  assert.equal(result.exists, false);
  assert.equal(result.memories.length, 0);
  assert.match(result.message, /No repo memory stores were found/i);
});

test('listMemories reports per-scope availability for combined results', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'github-memory-admin-'));
  const homeDir = path.join(tempDir, 'home');
  const rootDir = path.join(homeDir, '.config', 'Code', 'User', 'workspaceStorage');
  await seedFile(path.join(rootDir, 'alpha-hash', 'github.copilot-chat', 'memory-tool', 'memories', 'repo', 'repo.md'), 'Repository memory');

  const result = await listMemories({ scope: 'combined', rootDir, homeDir, platform: 'linux' });

  assert.equal(result.exists, true);
  assert.equal(result.userExists, false);
  assert.equal(result.repoExists, true);
  assert.equal(result.memories.length, 1);
});

test('deleteMemory removes the selected local file from the matching discovered store', async () => {
  const { rootDir, homeDir, betaWorkspace } = await createFixture();
  const repoResult = await listMemories({ scope: 'repo', rootDir, homeDir, platform: 'linux' });
  const target = repoResult.memories.find((memory) => memory.relativeWorkspacePath === 'nested/beta-hash');

  const deletion = await deleteMemory({ scope: 'repo', rootDir, homeDir, platform: 'linux', id: target.id });
  assert.equal(deletion.deleted, true);
  assert.equal(deletion.deletedPath, 'ideas.md');

  await assert.rejects(
    readFile(path.join(betaWorkspace, 'github.copilot-chat', 'memory-tool', 'memories', 'repo', 'ideas.md'), 'utf8'),
    /ENOENT/,
  );
});

test('discoverMemoryStores skips unreadable directories', async () => {
  if (process.platform === 'win32') {
    return;
  }

  const { rootDir, homeDir } = await createFixture();
  const blockedDir = path.join(rootDir, 'blocked');
  await mkdir(blockedDir, { recursive: true });
  chmodSync(blockedDir, 0o000);

  try {
    const stores = await discoverMemoryStores({ scope: 'repo', rootDir, homeDir, platform: 'linux' });
    assert.deepEqual(stores.map((store) => store.relativeWorkspacePath), ['alpha-hash', 'nested/beta-hash']);
  } finally {
    chmodSync(blockedDir, 0o755);
  }
});
