// Minimal static server for `out/` that mirrors GitHub Pages: the export is
// mounted under LIVESHOW_BASE_PATH, `/path/` serves `/path/index.html`, and
// unknown paths return the exported 404 page.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../out/', import.meta.url));
const port = Number(process.argv[2] ?? 4323);
const basePath = exportBasePath();
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml',
  '.woff2': 'font/woff2',
  '.gif': 'image/gif',
};

async function resolve(pathname) {
  const file = normalize(join(root, pathname));
  if (!file.startsWith(root)) return null;
  const info = await stat(file).catch(() => null);
  if (info?.isFile()) return file;
  if (info?.isDirectory()) {
    const index = join(file, 'index.html');
    if (await stat(index).catch(() => null)) return index;
  }
  const html = `${file}.html`;
  if (await stat(html).catch(() => null)) return html;
  return null;
}

/** The base path recorded by the last build, unless LIVESHOW_BASE_PATH overrides it. */
function exportBasePath() {
  if (process.env.LIVESHOW_BASE_PATH != null) return process.env.LIVESHOW_BASE_PATH.replace(/\/$/, '');
  try {
    return readFileSync(new URL('../.next/export-base-path', import.meta.url), 'utf8').trim();
  } catch {
    return '';
  }
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (basePath) {
    if (!pathname.startsWith(`${basePath}/`) && pathname !== basePath) {
      response.writeHead(404).end('Not found');
      return;
    }
    pathname = pathname.slice(basePath.length) || '/';
  }
  // GitHub Pages redirects directory URLs without a trailing slash.
  const direct = normalize(join(root, pathname));
  const info = await stat(direct).catch(() => null);
  if (info?.isDirectory() && !pathname.endsWith('/')) {
    response.writeHead(301, { Location: `${basePath}${pathname}/${url.search}` }).end();
    return;
  }
  const file = await resolve(pathname);
  if (!file) {
    response.writeHead(404, { 'Content-Type': types['.html'] });
    response.end(await readFile(join(root, '404.html')).catch(() => 'Not found'));
    return;
  }
  response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  response.end(await readFile(file));
}).listen(port, '127.0.0.1', () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}${basePath}/`);
});
