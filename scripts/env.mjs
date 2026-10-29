import { existsSync } from 'node:fs';
const path = new URL('../.env.local', import.meta.url);
if (existsSync(path)) process.loadEnvFile(path);
