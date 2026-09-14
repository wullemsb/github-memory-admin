#!/usr/bin/env node
import path from 'node:path';
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
const rootDir = path.resolve(getArg('root', getArg('workspace', process.cwd())));

const { url } = await startServer({
  port,
  host,
  rootDir,
});

console.log(`GitHub Memory Admin is running at ${url}`);
console.log(`Scanning for Copilot memory stores under ${rootDir}`);
