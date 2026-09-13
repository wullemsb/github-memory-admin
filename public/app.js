const scopeInput = document.querySelector('#scope');
const repositoryInput = document.querySelector('#repository');
const repositoryField = document.querySelector('#repository-field');
const searchInput = document.querySelector('#search');
const refreshButton = document.querySelector('#refresh');
const exportButton = document.querySelector('#export');
const list = document.querySelector('#memories');
const count = document.querySelector('#count');
const status = document.querySelector('#status');
const template = document.querySelector('#memory-template');

let allMemories = [];

function setStatus(message, isError = false) {
  status.textContent = message;
  status.dataset.error = isError ? 'true' : 'false';
}

function selectedScope() {
  return scopeInput.value;
}

function selectedRepository() {
  return repositoryInput.value.trim();
}

function updateScopeVisibility() {
  repositoryField.hidden = selectedScope() !== 'repo';
}

function filteredMemories() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    return allMemories;
  }
  return allMemories.filter((memory) => memory.text.toLowerCase().includes(query));
}

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function loadConfig() {
  const response = await fetch('/api/config');
  const config = await response.json();
  if (config.defaultRepository) {
    repositoryInput.value = config.defaultRepository;
  }
}

function render() {
  const memories = filteredMemories();
  list.replaceChildren();
  count.textContent = String(memories.length);

  if (!memories.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'No memories matched your current selection.';
    list.append(empty);
    return;
  }

  for (const memory of memories) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector('.memory-title').textContent = memory.title || memory.text;
    node.querySelector('.memory-body').textContent = memory.text;
    node.querySelector('.delete-button').addEventListener('click', () => removeMemory(memory));
    list.append(node);
  }
}

async function refresh() {
  setStatus('Loading memories...');
  const params = new URLSearchParams({ scope: selectedScope() });
  if (selectedScope() === 'repo') {
    params.set('repository', selectedRepository());
  }

  const response = await fetch(`/api/memories?${params.toString()}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Unable to load memories.');
  }

  allMemories = payload.memories || [];
  render();
  setStatus(payload.loginRequired ? (payload.message || 'Sign into GitHub and refresh.') : `Loaded ${allMemories.length} memory entries.`);
}

async function removeMemory(memory) {
  const confirmation = window.confirm(`Delete this memory?\n\n${memory.text}`);
  if (!confirmation) {
    return;
  }

  setStatus('Deleting memory...');
  const response = await fetch('/api/memories', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: memory.id,
      scope: selectedScope(),
      repository: selectedRepository(),
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Unable to delete memory.');
  }

  allMemories = allMemories.filter((item) => item.id !== memory.id);
  render();
  setStatus(payload.loginRequired ? (payload.message || 'Sign into GitHub and retry.') : 'Memory deleted.');
}

refreshButton.addEventListener('click', async () => {
  try {
    await refresh();
  } catch (error) {
    setStatus(error.message, true);
  }
});

exportButton.addEventListener('click', () => {
  const scope = selectedScope();
  const repo = selectedRepository().replace('/', '-');
  const suffix = scope === 'repo' && repo ? `-${repo}` : '';
  downloadJson(`github-copilot-memory${suffix}.json`, filteredMemories());
});

searchInput.addEventListener('input', render);
scopeInput.addEventListener('change', () => {
  updateScopeVisibility();
  render();
});

updateScopeVisibility();
loadConfig()
  .then(refresh)
  .catch((error) => setStatus(error.message, true));
