import http from 'node:http';
import { createRequestHandler } from './src/http.mjs';
import { closeBrowser } from './src/memory-service.mjs';

export async function startServer(options = {}) {
  const host = options.host || '127.0.0.1';
  const port = options.port || 4173;
  const handler = createRequestHandler(options);
  const server = http.createServer(handler);
  let shutdownPromise;

  await new Promise((resolve) => server.listen(port, host, resolve));
  const url = `http://${host}:${server.address().port}`;
  const shutdown = async () => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    process.off('SIGINT', shutdown);
    process.off('SIGTERM', shutdown);
    shutdownPromise = (async () => {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      await closeBrowser();
    })();
    await shutdownPromise;
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  return { server, url, close: shutdown };
}
