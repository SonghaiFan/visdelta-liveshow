import './env.mjs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createAIHandler } from '../server/http.mjs';
const handle = createAIHandler();
const server = createServer(async (req, res) => {
  if (!await handle(req, res, new URL(req.url, 'http://localhost').pathname)) res.writeHead(404).end();
}).listen(4325, '127.0.0.1');
const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--port', '4323'], { stdio: 'inherit' });
function close() { next.kill('SIGTERM'); server.close(); }
process.on('SIGINT', close); process.on('SIGTERM', close);
next.on('exit', code => { server.close(); process.exitCode = code ?? 1; });
