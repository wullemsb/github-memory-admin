import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deleteMemory, listMemories } from './memory-service.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const VALID_SCOPES = new Set(['user', 'session', 'repo']);

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
]);

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

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
    throw validationError('Request body must be valid JSON.');
  }
}

function validateScope(scope) {
  const normalizedScope = scope || 'user';
  if (!VALID_SCOPES.has(normalizedScope)) {
    throw validationError('Scope must be one of "user", "session", or "repo".');
  }
  return normalizedScope;
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
        const scope = validateScope(url.searchParams.get('scope'));
        const result = await listMemories({ ...options, scope });
        return json(response, 200, result);
      }

      if (url.pathname === '/api/memories' && request.method === 'DELETE') {
        const body = await readBody(request);
        const scope = validateScope(body.scope);
        const result = await deleteMemory({ ...options, scope, id: body.id });
        return json(response, 200, result);
      }

      if (url.pathname === '/api/config' && request.method === 'GET') {
        return json(response, 200, {
          rootDir: options.rootDir || options.workspaceDir || process.cwd(),
        });
      }

      if (request.method === 'GET') {
        return serveStaticFile(url.pathname, response);
      }

      return json(response, 404, { error: 'Not found' });
    }).catch((error) => {
      const status = error?.code === 'ENOENT' ? 404 : error?.statusCode || 500;
      const message = status === 404
        ? 'Not found'
        : error instanceof Error
          ? error.message
          : 'Unknown error';
      return json(response, status, { error: message });
    });
  };
}
