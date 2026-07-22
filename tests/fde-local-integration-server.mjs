import { createReadStream, statSync } from 'node:fs';
import http from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = resolve(process.env.FDE_SITE_ROOT ?? process.cwd());
const port = Number(process.env.FDE_INTEGRATION_PORT ?? 4175);
const TALENT_PROFILE_PATH = /^\/talents\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/;
const targets = [
  ['/api/commercial/', new URL(process.env.FDE_COMMERCIAL_API_URL ?? 'http://127.0.0.1:8767')],
  ['/api/analytics/', new URL(process.env.FDE_ANALYTICS_API_URL ?? 'http://127.0.0.1:8765')],
  ['/api/network/', new URL(process.env.FDE_NETWORK_API_URL ?? 'http://127.0.0.1:8766')],
];
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
};

function proxy(request, response, target) {
  const upstream = http.request(
    new URL(request.url, target),
    {
      method: request.method,
      headers: { ...request.headers, host: target.host },
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'application/json' });
    response.end('{"error":"bad_gateway"}');
  });
  request.pipe(upstream);
}

function staticFile(request, response) {
  if (!['GET', 'HEAD'].includes(request.method ?? 'GET')) {
    response.writeHead(405).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  let file = TALENT_PROFILE_PATH.test(pathname)
    ? resolve(root, 'talents', 'profile.html')
    : resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end();
    return;
  }
  try {
    if (statSync(file).isDirectory()) file = resolve(file, 'index.html');
    const metadata = statSync(file);
    if (!metadata.isFile()) throw new Error('not a file');
    response.writeHead(200, {
      'Content-Type': types[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': metadata.size,
      'Cache-Control': 'no-cache',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

const server = http.createServer((request, response) => {
  const match = targets.find(([prefix]) => request.url?.startsWith(prefix));
  if (match) proxy(request, response, match[1]);
  else staticFile(request, response);
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`FDE local integration server: http://127.0.0.1:${port}/\n`);
});
