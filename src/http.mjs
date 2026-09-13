import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deleteMemory, listMemories, parseRepoInput } from './memory-service.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
]);

function json(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function resolveScope(searchParams) {
  const scope = searchParams.get('scope') || 'user';
  if (scope !== 'user' && scope !== 'repo') {
    throw new Error('Scope must be either "user" or "repo".');
  }

  const repoInput = searchParams.get('repository') || '';
  if (scope === 'repo') {
    return { scope, ...parseRepoInput(repoInput) };
  }

  return { scope };
}

export async function serveStaticFile(pathname, response) {
  const filePath = pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, pathname.replace(/^\//, ''));
  const contents = await readFile(filePath);
  response.writeHead(200, {
    'content-type': MIME_TYPES.get(path.extname(filePath)) || 'application/octet-stream',
  });
  response.end(contents);
}

export function createRequestHandler(options = {}) {
  return async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);

      if (url.pathname === '/api/memories' && request.method === 'GET') {
        const scopeOptions = resolveScope(url.searchParams);
        const result = await listMemories({ ...options, ...scopeOptions });
        return json(response, 200, result);
      }

      if (url.pathname === '/api/memories' && request.method === 'DELETE') {
        const body = await readBody(request);
        const scopeOptions = body.scope === 'repo' ? { scope: 'repo', ...parseRepoInput(body.repository || '') } : { scope: 'user' };
        const result = await deleteMemory({ ...options, ...scopeOptions, id: body.id });
        return json(response, 200, result);
      }

      if (url.pathname === '/api/config' && request.method === 'GET') {
        return json(response, 200, {
          defaultRepository: options.defaultRepository || '',
          headless: Boolean(options.headless),
        });
      }

      if (request.method === 'GET') {
        return serveStaticFile(url.pathname, response);
      }

      return json(response, 404, { error: 'Not found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return json(response, 400, { error: message });
    }
  };
}
