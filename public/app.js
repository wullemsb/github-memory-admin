const searchInput = document.querySelector('#search');
const refreshButton = document.querySelector('#refresh');
const exportButton = document.querySelector('#export');
const storesList = document.querySelector('#stores');
const memoriesList = document.querySelector('#memories');
const details = document.querySelector('#details');
const count = document.querySelector('#count');
const storeCount = document.querySelector('#store-count');
const rootDir = document.querySelector('#root-dir');
const status = document.querySelector('#status');
const storeTemplate = document.querySelector('#store-template');
const memoryTemplate = document.querySelector('#memory-template');
const detailTemplate = document.querySelector('#detail-template');
const confirmDialog = document.querySelector('#confirm-dialog');
const confirmMessage = document.querySelector('#confirm-message');

let rootPath = '-';
let stores = [];
let allMemories = [];
let selectedStoreId = '';
let selectedMemoryId = '';
let pendingDeletion;
let refreshRequestId = 0;

function setStatus(message, isError = false) {
  status.textContent = message;
  status.dataset.error = isError ? 'true' : 'false';
}

function visibleMemories() {
  const query = searchInput.value.trim().toLowerCase();
  return allMemories.filter((memory) => {
    if (selectedStoreId && memory.storeId !== selectedStoreId) {
      return false;
    }
    if (!query) {
      return true;
    }
    return `${memory.relativePath} ${memory.relativeWorkspacePath} ${memory.text}`.toLowerCase().includes(query);
  });
}

function formatTimestamp(value) {
  return new Date(value).toLocaleString();
}

function storeLabel(store) {
  return store.relativeWorkspacePath || 'User scope';
}

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function loadConfig() {
  const response = await fetch('/api/config');
  const config = await response.json();
  rootPath = config.rootDir || '-';
  rootDir.textContent = rootPath;
}

function syncSelection() {
  if (!stores.some((store) => store.id === selectedStoreId)) {
    selectedStoreId = stores[0]?.id || '';
  }

  const visible = visibleMemories();
  if (!visible.some((memory) => memory.id === selectedMemoryId)) {
    selectedMemoryId = visible[0]?.id || '';
  }
}

function renderStores() {
  storesList.replaceChildren();

  if (!stores.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'No user or repository memory stores found.';
    storesList.append(empty);
    return;
  }

  let currentScope = '';
  for (const store of stores) {
    if (store.scope !== currentScope) {
      currentScope = store.scope;
      const section = document.createElement('li');
      section.className = 'store-section';
      section.textContent = store.scope === 'user' ? 'User scope' : 'Repository scope';
      storesList.append(section);
    }

    const node = storeTemplate.content.firstElementChild.cloneNode(true);
    const button = node.querySelector('.store-button');
    button.dataset.active = String(store.id === selectedStoreId);
    button.querySelector('.store-name').textContent = storeLabel(store);
    button.querySelector('.store-meta').textContent = `${store.memoryCount} file${store.memoryCount === 1 ? '' : 's'}`;
    button.addEventListener('click', () => {
      selectedStoreId = store.id;
      syncSelection();
      render();
    });
    storesList.append(node);
  }
}

function renderDetails() {
  details.replaceChildren();
  const memory = visibleMemories().find((item) => item.id === selectedMemoryId);

  if (!memory) {
    details.className = 'details empty-state';
    details.textContent = 'Select a memory to inspect its contents.';
    return;
  }

  details.className = 'details';
  const node = detailTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector('.detail-title').textContent = memory.title || memory.relativePath;
  node.querySelector('.detail-meta').textContent = `${memory.relativeWorkspacePath} • ${memory.relativePath} • ${memory.size} bytes • ${formatTimestamp(memory.modifiedAt)}`;
  node.querySelector('.detail-body').textContent = memory.text || '(empty file)';
  const deleteButton = node.querySelector('.detail-delete-button');
  deleteButton.setAttribute('aria-label', `Delete memory: ${memory.relativeWorkspacePath} ${memory.relativePath}`);
  deleteButton.addEventListener('click', () => removeMemory(memory));
  details.append(node);
}

function renderMemories() {
  const memories = visibleMemories();
  memoriesList.replaceChildren();
  count.textContent = String(memories.length);

  if (!memories.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = searchInput.value.trim()
      ? 'No memories matched your current search.'
      : 'No memories found in the selected store.';
    memoriesList.append(empty);
    return;
  }

  for (const memory of memories) {
    const node = memoryTemplate.content.firstElementChild.cloneNode(true);
    const button = node.querySelector('.memory-button');
    button.dataset.active = String(memory.id === selectedMemoryId);
    button.querySelector('.memory-title').textContent = memory.relativePath;
    button.querySelector('.memory-meta').textContent = `${memory.relativeWorkspacePath} • ${memory.size} bytes • ${formatTimestamp(memory.modifiedAt)}`;
    button.addEventListener('click', () => {
      selectedMemoryId = memory.id;
      renderMemories();
      renderDetails();
    });
    memoriesList.append(node);
  }
}

function render() {
  storeCount.textContent = String(stores.length);
  syncSelection();
  renderStores();
  renderMemories();
  renderDetails();
}

async function refresh() {
  const requestId = ++refreshRequestId;
  setStatus('Loading memories...');
  const response = await fetch('/api/memories?scope=combined');
  const payload = await response.json();
  if (requestId !== refreshRequestId) {
    return;
  }
  if (!response.ok) {
    throw new Error(payload.error || 'Unable to load memories.');
  }

  stores = payload.stores || [];
  allMemories = payload.memories || [];
  rootDir.textContent = payload.rootDir || rootPath;
  render();
  setStatus(payload.message || `Loaded ${allMemories.length} memory entries.`);
}

async function executeDeletion(memory) {
  setStatus('Deleting memory...');
  const response = await fetch('/api/memories', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: memory.id,
      scope: memory.scope,
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Unable to delete memory.');
  }

  stores = stores.map((store) => (
    store.id === payload.storeId
      ? { ...store, memoryCount: Math.max(0, store.memoryCount - 1) }
      : store
  ));
  allMemories = allMemories.filter((item) => item.id !== memory.id);
  if (selectedMemoryId === memory.id) {
    selectedMemoryId = '';
  }
  render();
  setStatus(payload.deleted ? `Deleted ${payload.deletedPath}.` : 'Memory deleted.');
}

function removeMemory(memory) {
  pendingDeletion = memory;
  confirmMessage.textContent = `Delete ${memory.relativeWorkspacePath} / ${memory.relativePath}?`;
  confirmDialog.showModal();
}

refreshButton.addEventListener('click', async () => {
  try {
    await refresh();
  } catch (error) {
    setStatus(error.message, true);
  }
});

exportButton.addEventListener('click', () => {
  downloadJson('github-copilot-memory.json', visibleMemories());
});

searchInput.addEventListener('input', () => {
  render();
});
confirmDialog.addEventListener('close', async () => {
  if (confirmDialog.returnValue !== 'confirm' || !pendingDeletion) {
    pendingDeletion = undefined;
    return;
  }

  try {
    await executeDeletion(pendingDeletion);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    pendingDeletion = undefined;
  }
});

loadConfig()
  .then(refresh)
  .catch((error) => setStatus(error.message, true));
