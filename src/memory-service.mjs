import { createHash } from 'node:crypto';
import { readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules']);

function sha(input) {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

async function getPathStats(targetPath) {
  try {
    return await stat(targetPath);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'EACCES' || error?.code === 'EPERM') {
      return null;
    }
    throw error;
  }
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function workspaceNameFromReference(reference) {
  if (!reference) {
    return '';
  }

  try {
    if (reference.startsWith('file:')) {
      return path.basename(fileURLToPath(reference));
    }

    if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(reference)) {
      return path.posix.basename(new URL(reference).pathname);
    }
  } catch {
    return path.basename(reference);
  }

  return path.basename(reference);
}

async function resolveWorkspaceLabel(workspacePath, fallbackLabel) {
  if (!workspacePath) {
    return fallbackLabel;
  }

  try {
    const contents = await readFile(path.join(workspacePath, 'workspace.json'), 'utf8');
    const workspace = JSON.parse(contents);
    const folderName = workspaceNameFromReference(workspace.folder);
    if (folderName) {
      return folderName;
    }

    const configName = workspaceNameFromReference(workspace.configPath);
    if (configName) {
      return configName.replace(/\.code-workspace$/i, '');
    }
  } catch (error) {
    if (!['ENOENT', 'EACCES', 'EPERM'].includes(error?.code) && !(error instanceof SyntaxError)) {
      throw error;
    }
  }

  return fallbackLabel;
}

export function normalizeText(value) {
  return String(value ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

export function createMemoryId(scope, storePath, relativePath) {
  return sha(`${scope}|${storePath}|${relativePath}`);
}

export function resolveCodeUserDir({ platform = process.platform, homeDir = os.homedir(), appData = process.env.APPDATA } = {}) {
  if (platform === 'win32') {
    const root = appData || path.win32.join(homeDir, 'AppData', 'Roaming');
    return path.win32.join(root, 'Code', 'User');
  }

  if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'Code', 'User');
  }

  return path.join(homeDir, '.config', 'Code', 'User');
}

export function resolveUserMemoryDir(options = {}) {
  const join = (options.platform || process.platform) === 'win32' ? path.win32.join : path.join;
  return join(resolveCodeUserDir(options), 'globalStorage', 'github.copilot-chat', 'memory-tool', 'memories');
}

export function resolveWorkspaceStorageDir(options = {}) {
  const join = (options.platform || process.platform) === 'win32' ? path.win32.join : path.join;
  return join(resolveCodeUserDir(options), 'workspaceStorage');
}

export function resolveRootDir({ rootDir, workspaceDir, platform, homeDir, appData } = {}) {
  return path.resolve(rootDir || workspaceDir || resolveWorkspaceStorageDir({ platform, homeDir, appData }));
}

export function resolveMemoryStore({ scope = 'user', rootDir, workspaceDir, platform, homeDir, appData } = {}) {
  if (scope === 'user') {
    return resolveUserMemoryDir({ platform, homeDir, appData });
  }

  const root = resolveRootDir({ rootDir, workspaceDir, platform, homeDir, appData });
  if (scope === 'session') {
    return path.join(root, 'github.copilot-chat', 'memory-tool', 'memories', 'session');
  }

  if (scope === 'repo') {
    return path.join(root, 'github.copilot-chat', 'memory-tool', 'memories', 'repo');
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

async function discoverScopedStores(scope, currentDir, rootDir, stores) {
  const candidateMemoriesRoot = path.join(currentDir, 'github.copilot-chat', 'memory-tool', 'memories');
  const candidateRepoStore = path.join(candidateMemoriesRoot, 'repo');
  const candidateSessionStore = path.join(candidateMemoriesRoot, 'session');
  const relativeWorkspacePath = toPosix(path.relative(rootDir, currentDir)) || '.';
  const workspaceLabel = await resolveWorkspaceLabel(currentDir, relativeWorkspacePath);

  const repoStoreStats = await getPathStats(candidateRepoStore);
  if (scope === 'repo' && repoStoreStats?.isDirectory()) {
    stores.push({
      scope,
      workspacePath: currentDir,
      storePath: candidateRepoStore,
      relativeWorkspacePath,
      workspaceLabel,
    });
  }

  const sessionStoreStats = await getPathStats(candidateSessionStore);
  if (scope === 'session' && sessionStoreStats?.isDirectory()) {
    stores.push({
      scope,
      workspacePath: currentDir,
      storePath: candidateSessionStore,
      relativeWorkspacePath,
      workspaceLabel,
    });
  }

  let entries;
  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'EACCES' || error?.code === 'EPERM') {
      return;
    }
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '.github' || SKIPPED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    await discoverScopedStores(scope, path.join(currentDir, entry.name), rootDir, stores);
  }
}

export async function discoverMemoryStores(options = {}) {
  const scope = options.scope || 'repo';
  if (scope === 'user') {
    const storePath = resolveUserMemoryDir(options);
    const exists = (await getPathStats(storePath))?.isDirectory();
    return exists
      ? [{
          scope,
          workspacePath: null,
          storePath,
          relativeWorkspacePath: 'User scope',
          workspaceLabel: 'User scope',
        }]
      : [];
  }

  const rootDir = resolveRootDir(options);
  if (!(await getPathStats(rootDir))?.isDirectory()) {
    return [];
  }

  const stores = [];
  await discoverScopedStores(scope, rootDir, rootDir, stores);
  stores.sort((left, right) => left.storePath.localeCompare(right.storePath));
  return stores;
}

async function toMemory(store, absolutePath) {
  const [contents, details] = await Promise.all([
    readFile(absolutePath, 'utf8'),
    stat(absolutePath),
  ]);

  const relativePath = toPosix(path.relative(store.storePath, absolutePath));
  const title = path.basename(relativePath);

  return {
    id: createMemoryId(store.scope, store.storePath, relativePath),
    title,
    text: normalizeText(contents),
    relativePath,
    absolutePath,
    scope: store.scope,
    size: details.size,
    modifiedAt: details.mtime.toISOString(),
    storeId: createMemoryId(store.scope, store.storePath, '.'),
    storePath: store.storePath,
    workspacePath: store.workspacePath,
    relativeWorkspacePath: store.relativeWorkspacePath,
    workspaceLabel: store.workspaceLabel,
  };
}

async function listStoreMemories(store) {
  let absoluteFiles;
  try {
    absoluteFiles = await walkMemoryFiles(store.storePath, store.storePath, store.scope);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { ...store, exists: false, memories: [], memoryCount: 0 };
    }
    throw error;
  }

  const memories = await Promise.all(
    absoluteFiles
      .sort((left, right) => left.localeCompare(right))
      .map((absolutePath) => toMemory(store, absolutePath)),
  );

  return {
    ...store,
    exists: true,
    id: createMemoryId(store.scope, store.storePath, '.'),
    memories,
    memoryCount: memories.length,
  };
}

export async function listMemories(options = {}) {
  const scope = options.scope || 'user';
  if (scope === 'combined') {
    const [userResult, repoResult] = await Promise.all([
      listMemories({ ...options, scope: 'user' }),
      listMemories({ ...options, scope: 'repo' }),
    ]);
    const stores = [...userResult.stores, ...repoResult.stores];
    const memories = [...userResult.memories, ...repoResult.memories];
    const rootDir = resolveRootDir(options);
    const userExists = userResult.exists;
    const repoExists = repoResult.exists;

    if (!stores.length) {
      return {
        exists: false,
        userExists,
        repoExists,
        scope,
        rootDir,
        stores: [],
        memories: [],
        message: `No user memory directory was found at ${resolveUserMemoryDir(options)} and no repo memory stores were found under ${rootDir}.`,
      };
    }

    return {
      exists: userExists || repoExists,
      userExists,
      repoExists,
      scope,
      rootDir,
      stores,
      memories,
      message: `Loaded ${memories.length} memory file${memories.length === 1 ? '' : 's'} from ${stores.length} store${stores.length === 1 ? '' : 's'}.`,
    };
  }

  const stores = await discoverMemoryStores(options);
  const rootDir = scope === 'user' ? null : resolveRootDir(options);

  if (!stores.length) {
    return {
      exists: false,
      scope,
      rootDir,
      stores: [],
      memories: [],
      message: scope === 'user'
        ? `No user memory directory was found at ${resolveUserMemoryDir(options)}.`
        : `No ${scope} memory stores were found under ${rootDir}.`,
    };
  }

  const populatedStores = await Promise.all(stores.map((store) => listStoreMemories(store)));
  const memories = populatedStores.flatMap((store) => store.memories);

  return {
    exists: true,
    scope,
    rootDir,
    stores: populatedStores,
    memories,
    message: `Loaded ${memories.length} memory file${memories.length === 1 ? '' : 's'} from ${populatedStores.length} store${populatedStores.length === 1 ? '' : 's'}.`,
  };
}

export async function deleteMemory({ id, ...options }) {
  if (!id) {
    throw new Error('A memory id is required for deletion.');
  }

  const { memories } = await listMemories(options);
  const target = memories.find((memory) => memory.id === id);
  if (!target) {
    throw new Error('The requested memory entry could not be found. Refresh and try again.');
  }

  const targetPath = path.resolve(target.absolutePath);
  const normalizedRoot = `${path.resolve(target.storePath)}${path.sep}`;
  if (!targetPath.startsWith(normalizedRoot)) {
    throw new Error('The requested memory entry is outside the allowed store path.');
  }

  await rm(targetPath);

  return {
    deleted: true,
    storePath: target.storePath,
    deletedPath: target.relativePath,
    storeId: target.storeId,
  };
}
