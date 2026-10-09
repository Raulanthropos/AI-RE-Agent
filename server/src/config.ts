import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const serverDirectory = fileURLToPath(new URL('../', import.meta.url));
const envFile = resolve(serverDirectory, '.env');
if (existsSync(envFile)) loadEnvFile(envFile);
export const databasePath = process.env.DATABASE_PATH === ':memory:'
  ? ':memory:'
  : resolve(serverDirectory, process.env.DATABASE_PATH || 'data/listings.sqlite');
export const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
