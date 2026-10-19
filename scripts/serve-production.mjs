import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Deliberately serve only built static files at the same subdirectory as Pages.
// There is no Vite middleware, application backend, or SPA fallback here.
const mount = '/fremontStreets/';
const directory = await realpath(fileURLToPath(new URL('../dist', import.meta.url)));
const port = Number(process.env.PRODUCTION_TEST_PORT ?? 4179);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (request, response) => {
  const fail = (status, message) => {
    response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(message);
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return fail(405, 'Method not allowed');
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    return fail(400, 'Invalid URL');
  }
  if (pathname === mount.slice(0, -1)) {
    response.writeHead(308, { Location: mount });
    return response.end();
  }
  if (!pathname.startsWith(mount) || pathname.includes('\0') || pathname.includes('\\')) {
    return fail(404, 'Not found');
  }
  const relative = pathname.slice(mount.length) || 'index.html';
  const candidate = resolve(directory, relative);
  if (!candidate.startsWith(directory + sep)) return fail(404, 'Not found');
  try {
    const filename = await realpath(candidate);
    if (!filename.startsWith(directory + sep)) return fail(404, 'Not found');
    const info = await stat(filename);
    if (!info.isFile()) return fail(404, 'Not found');
    response.writeHead(200, {
      'Content-Type': mime[extname(filename)] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (request.method === 'HEAD') return response.end();
    createReadStream(filename).on('error', () => response.destroy()).pipe(response);
  } catch {
    fail(404, 'Not found');
  }
});

// Large geographic-asset checks must not race the client's idle connection.
server.keepAliveTimeout = 60_000;
server.headersTimeout = 65_000;
server.listen(port, '127.0.0.1', () => {
  console.log(`Built static game: http://127.0.0.1:${port}${mount}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
