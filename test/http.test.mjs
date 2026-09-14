import test from 'node:test';
import assert from 'node:assert/strict';
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
  await new Promise((resolve) => setImmediate(resolve));

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
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), { error: 'Scope must be one of "user", "session", or "repo".' });
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
  await new Promise((resolve) => setImmediate(resolve));

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
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), { error: 'A memory id is required for deletion.' });
});
