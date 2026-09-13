import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequestHandler } from './src/http.mjs';
import { closeBrowser } from './src/memory-service.mjs';

function openBrowser(url) {
  const platform = process.platform;
  const command = platform === 'darwin'
    ? ['open', url]
    : platform === 'win32'
      ? ['cmd', '/c', 'start', '', url]
      : ['xdg-open', url];

  const child = spawn(command[0], command.slice(1), { stdio: 'ignore', detached: true });
  child.on('error', () => {});
  child.unref();
}

export async function startServer(options = {}) {
  const host = options.host || '127.0.0.1';
  const port = options.port || 4173;
  const handler = createRequestHandler(options);
  const server = http.createServer(handler);

  await new Promise((resolve) => server.listen(port, host, resolve));
  const url = `http://${host}:${server.address().port}`;

  if (options.open !== false) {
    openBrowser(url);
  }

  const shutdown = async () => {
    server.close();
    await closeBrowser();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  return { server, url };
}
