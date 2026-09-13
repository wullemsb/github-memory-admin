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
