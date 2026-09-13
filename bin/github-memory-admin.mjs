#!/usr/bin/env node
import { startServer } from '../server.mjs';

function getArg(name, defaultValue) {
  const prefix = `--${name}=`;
  const exact = `--${name}`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  if (match) {
    return match.slice(prefix.length);
  }
  if (process.argv.includes(exact)) {
    return true;
  }
  return defaultValue;
}

const port = Number(getArg('port', process.env.PORT || 4173));
const host = getArg('host', process.env.HOST || '127.0.0.1');
const repository = getArg('repo', process.env.GITHUB_MEMORY_ADMIN_REPOSITORY || '');
const headless = Boolean(getArg('headless', process.env.HEADLESS === '1'));
const mockDataPath = process.env.GITHUB_MEMORY_ADMIN_MOCK_DATA || undefined;

const { url } = await startServer({
  port,
  host,
  defaultRepository: repository,
  headless,
  mockDataPath,
});

console.log(`GitHub Memory Admin is running at ${url}`);
if (repository) {
  console.log(`Default repository scope: ${repository}`);
}
if (mockDataPath) {
  console.log(`Using mock data from ${mockDataPath}`);
}
console.log(headless
  ? 'Running Playwright in headless mode.'
  : 'A persistent Playwright browser will open for GitHub authentication when needed.');
