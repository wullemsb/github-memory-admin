import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMemoryUrl,
  createMemoryId,
  dedupeMemories,
  normalizeText,
  parseRepoInput,
} from '../src/memory-service.mjs';

test('normalizeText trims and collapses whitespace', () => {
  assert.equal(normalizeText('  hello\n\nworld  '), 'hello world');
});

test('parseRepoInput accepts owner/repo and strips github URL prefixes', () => {
  assert.deepEqual(parseRepoInput('https://github.com/octo/example'), {
    owner: 'octo',
    repo: 'example',
  });
});

test('parseRepoInput rejects invalid values', () => {
  assert.throws(() => parseRepoInput('octo'), /owner\/repo/);
});

test('buildMemoryUrl supports user and repository scopes', () => {
  assert.equal(buildMemoryUrl({ scope: 'user' }), 'https://github.com/settings/copilot/memory');
  assert.equal(buildMemoryUrl({ scope: 'repo', owner: 'octo', repo: 'example' }), 'https://github.com/octo/example/settings/copilot/memory');
});

test('createMemoryId is stable for the same inputs', () => {
  const first = createMemoryId('https://github.com/settings/copilot/memory', 1, 'Use TypeScript');
  const second = createMemoryId('https://github.com/settings/copilot/memory', 1, 'Use TypeScript');
  assert.equal(first, second);
});

test('dedupeMemories removes exact duplicates', () => {
  const memory = { id: '1', text: 'Use TypeScript' };
  assert.deepEqual(dedupeMemories([memory, memory, { id: '2', text: 'Write tests' }]), [
    memory,
    { id: '2', text: 'Write tests' },
  ]);
});
