const scopeInput = document.querySelector('#scope');
const searchInput = document.querySelector('#search');
const refreshButton = document.querySelector('#refresh');
const exportButton = document.querySelector('#export');
const list = document.querySelector('#memories');
const count = document.querySelector('#count');
const storePath = document.querySelector('#store-path');
const workspacePath = document.querySelector('#workspace-path');
const status = document.querySelector('#status');
const template = document.querySelector('#memory-template');
const confirmDialog = document.querySelector('#confirm-dialog');
const confirmMessage = document.querySelector('#confirm-message');

let allMemories = [];
let pendingDeletion;

function setStatus(message, isError = false) {
  status.textContent = message;
  status.dataset.error = isError ? 'true' : 'false';
}

function selectedScope() {
  return scopeInput.value;
}

function filteredMemories() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    return allMemories;
  }
  return allMemories.filter((memory) => `${memory.relativePath} ${memory.text}`.toLowerCase().includes(query));
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
  workspacePath.textContent = config.workspaceDir || '-';
}

function render() {
  const memories = filteredMemories();
  list.replaceChildren();
  count.textContent = String(memories.length);

  if (!memories.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = searchInput.value.trim()
      ? 'No memories matched your current search.'
      : 'No memory files were found for this scope.';
    list.append(empty);
    return;
  }

  for (const memory of memories) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector('.memory-title').textContent = memory.title || memory.relativePath;
    node.querySelector('.memory-meta').textContent = `${memory.relativePath} • ${memory.size} bytes • ${new Date(memory.modifiedAt).toLocaleString()}`;
    node.querySelector('.memory-body').textContent = memory.text || '(empty file)';
    const deleteButton = node.querySelector('.delete-button');
    deleteButton.setAttribute('aria-label', `Delete memory: ${memory.relativePath}`);
    deleteButton.addEventListener('click', () => removeMemory(memory));
    list.append(node);
  }
}

async function refresh() {
  setStatus('Loading memories...');
  const response = await fetch(`/api/memories?scope=${selectedScope()}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Unable to load memories.');
  }

  allMemories = payload.memories || [];
  storePath.textContent = payload.storePath || '-';
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
      scope: selectedScope(),
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Unable to delete memory.');
  }

  if (payload.deleted) {
    allMemories = allMemories.filter((item) => item.id !== memory.id);
    render();
  }
  setStatus(payload.deleted ? `Deleted ${payload.deletedPath}.` : 'Memory deleted.');
}

function removeMemory(memory) {
  pendingDeletion = memory;
  confirmMessage.textContent = `Delete ${memory.relativePath}?`;
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
  downloadJson(`github-copilot-memory-${selectedScope()}.json`, filteredMemories());
});

searchInput.addEventListener('input', render);
scopeInput.addEventListener('change', () => {
  refresh().catch((error) => setStatus(error.message, true));
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
