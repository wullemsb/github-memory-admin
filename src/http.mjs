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
  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
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
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const filePath = path.resolve(PUBLIC_DIR, relativePath);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`) && filePath !== path.join(PUBLIC_DIR, 'index.html')) {
    throw new Error('Invalid path.');
  }
  const contents = await readFile(filePath);
  response.writeHead(200, {
    'content-type': MIME_TYPES.get(path.extname(filePath)) || 'application/octet-stream',
  });
  response.end(contents);
}

export function createRequestHandler(options = {}) {
  return (request, response) => {
    Promise.resolve().then(async () => {
      const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);

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
    }).catch((error) => {
      const status = error?.code === 'ENOENT' ? 404 : 400;
      const message = status === 404
        ? 'Not found'
        : error instanceof Error
          ? error.message
          : 'Unknown error';
      return json(response, status, { error: message });
    });
  };
}
