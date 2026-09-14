import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { createRequestHandler } from '../src/http.mjs';

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(chunk = '') {
      this.body += chunk;
    },
  };
}

async function waitForResponse(response) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (response.statusCode !== 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test('DELETE /api/memories rejects malformed JSON bodies', async () => {
  const handler = createRequestHandler();
  const response = makeResponse();
  const request = {
    method: 'DELETE',
    url: '/api/memories',
    headers: { host: '127.0.0.1:4173' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from('{bad json');
    },
  };

  handler(request, response);
  await waitForResponse(response);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), { error: 'Request body must be valid JSON.' });
});

test('GET /api/memories validates the scope query parameter', async () => {
  const handler = createRequestHandler();
  const response = makeResponse();
  const request = {
    method: 'GET',
    url: '/api/memories?scope=invalid',
    headers: { host: '127.0.0.1:4173' },
  };

  handler(request, response);
  await waitForResponse(response);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), { error: 'Scope must be one of "user", "session", "repo", or "combined".' });
});

test('GET /api/memories supports the combined scope', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'github-memory-admin-http-'));
  const handler = createRequestHandler({ rootDir: tempDir, homeDir: tempDir, platform: 'linux' });
  const response = makeResponse();
  const request = {
    method: 'GET',
    url: '/api/memories?scope=combined',
    headers: { host: '127.0.0.1:4173' },
  };

  handler(request, response);
  await waitForResponse(response);

  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).scope, 'combined');
});

test('GET /api/config returns the configured root directory', async () => {
  const handler = createRequestHandler({ rootDir: '/scan/root' });
  const response = makeResponse();
  const request = {
    method: 'GET',
    url: '/api/config',
    headers: { host: '127.0.0.1:4173' },
  };

  handler(request, response);
  await waitForResponse(response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { rootDir: '/scan/root' });
});

test('DELETE /api/memories requires a memory id', async () => {
  const handler = createRequestHandler();
  const response = makeResponse();
  const request = {
    method: 'DELETE',
    url: '/api/memories',
    headers: { host: '127.0.0.1:4173' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify({ scope: 'repo' }));
    },
  };

  handler(request, response);
  await waitForResponse(response);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), { error: 'A memory id is required for deletion.' });
});

test('DELETE /api/memories rejects the combined scope', async () => {
  const handler = createRequestHandler();
  const response = makeResponse();
  const request = {
    method: 'DELETE',
    url: '/api/memories',
    headers: { host: '127.0.0.1:4173' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify({ scope: 'combined', id: 'memory-id' }));
    },
  };

  handler(request, response);
  await waitForResponse(response);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), { error: 'Scope must be one of "user", "session", or "repo".' });
});
