import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const root = fileURLToPath(new URL('../', import.meta.url));

function tlsServerBlock(config) {
  const tlsMarker = 'listen 127.0.0.1:8443 ssl;';
  const markerIndex = config.indexOf(tlsMarker);
  assert.notEqual(markerIndex, -1, 'TLS server block must exist');
  const start = config.lastIndexOf('\nserver {', markerIndex);
  const nextServer = config.indexOf('\nserver {', markerIndex + tlsMarker.length);
  return config.slice(start < 0 ? 0 : start, nextServer < 0 ? undefined : nextServer);
}

function request(port, pathname) {
  return new Promise((resolve, reject) => {
    const request = http.get(`http://127.0.0.1:${port}${pathname}`, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.on('error', reject);
  });
}

async function withLocalIntegrationServer(callback) {
  const port = 43000 + Math.floor(Math.random() * 1000);
  const server = spawn(process.execPath, ['tests/fde-local-integration-server.mjs'], {
    cwd: root,
    env: { ...process.env, FDE_INTEGRATION_PORT: String(port), FDE_SITE_ROOT: root },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exitPromise = once(server, 'exit');
  let startup = '';
  server.stdout.on('data', (chunk) => { startup += chunk; });
  try {
    await Promise.race([
      once(server.stdout, 'data'),
      once(server, 'error').then(([error]) => Promise.reject(error)),
      once(server, 'exit').then(([code]) => Promise.reject(new Error(`integration server exited: ${code}`))),
    ]);
    assert.match(startup, /FDE local integration server/);
    await callback(port);
  } finally {
    if (server.exitCode === null && server.signalCode === null) server.kill();
    await exitPromise;
  }
}
const service = read('deploy/fde-network.service');
assert.match(service, /FDE_NETWORK_DB=\/var\/lib\/fde-network\/network\.db/);
assert.match(service, /FDE_NETWORK_HOST=127\.0\.0\.1/);
assert.match(service, /FDE_NETWORK_PORT=8766/);
assert.match(service, /ReadWritePaths=\/var\/lib\/fde-network/);
assert.match(service, /ProtectSystem=strict/);
const nginx = read('deploy/fde.onex.plus.nginx.conf');
const localServer = read('tests/fde-local-integration-server.mjs');
const tlsServer = tlsServerBlock(nginx);
assert.match(tlsServer, /listen 127\.0\.0\.1:8443 ssl;/);
assert.doesNotMatch(tlsServer, /listen \[::\]:80;/);
assert.match(nginx, /location \^~ \/api\/network\//);
assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:8766/);
assert.match(nginx, /location = \/api\/network\/config/);
assert.match(nginx, /location \^~ \/api\/network\/public\//);
assert.ok(nginx.includes('location ~ ^/talents/[a-z0-9]+(?:-[a-z0-9]+)*$ {'));
assert.match(nginx, /return 301 https:\/\/\$host\$uri\//);
assert.ok(nginx.includes('location ~ ^/talents/[a-z0-9]+(?:-[a-z0-9]+)*/$ {'));
assert.match(nginx, /try_files \/talents\/profile\.html =404/);
const profileLocation = tlsServer.indexOf('location ~ ^/talents/');
const genericStaticFallback = tlsServer.indexOf('    location / {');
assert.ok(profileLocation >= 0 && profileLocation < genericStaticFallback, 'profile location must precede generic static fallback');
assert.match(localServer, /TALENT_PROFILE_PATH/);
assert.ok(localServer.includes('const TALENT_PROFILE_PATH = /^\\/talents\\/[a-z0-9]+(?:-[a-z0-9]+)*\\/$/;'));
assert.match(localServer, /TALENT_PROFILE_REDIRECT_PATH/);
assert.match(localServer, /talents', 'profile\.html/);
assert.match(localServer, /FDE_NETWORK_API_URL/);
const install = read('deploy/install-or-update.sh');
assert.match(install, /NETWORK_DATA="\/var\/lib\/fde-network"/);
assert.match(install, /fde-network\.service/);
assert.match(install, /fde_network\.db import connect, initialize/);
assert.match(install, /127\.0\.0\.1:8766\/api\/network\/health/);
const readme = read('README.md');
assert.match(readme, /FDE_NETWORK_DB=\/tmp\/fde-network\.db/);
assert.match(readme, /import_talents[\s\S]{0,180}--dry-run/);
assert.match(readme, /set-flag network_enabled true/);
assert.match(readme, /set-flag network_enabled false/);
await withLocalIntegrationServer(async (port) => {
  const profile = await request(port, '/talents/manufacturing-kb-fde/');
  assert.equal(profile.status, 200);
  assert.match(profile.body, /id="profile-state"/);
  const canonical = await request(port, '/talents/manufacturing-kb-fde');
  assert.equal(canonical.status, 301);

  for (const pathname of ['/talents/Bad/', '/talents/a--b/', '/talents/a/b/']) {
    const response = await request(port, pathname);
    assert.notEqual(response.status, 200, `${pathname} must not resolve as a profile`);
    assert.doesNotMatch(response.body, /id="profile-state"/, `${pathname} must not serve the profile shell`);
  }
});
for (const block of [
  /location = \/api\/network\/config \{[\s\S]*?\n    \}/,
  /location \^~ \/api\/network\/public\/ \{[\s\S]*?\n    \}/,
  /location ~ \^\/talents\/\[a-z0-9\][\s\S]*?profile\.html[\s\S]*?\n    \}/,
]) {
  assert.match(tlsServer.match(block)?.[0] ?? '', /Cache-Control "no-store" always/);
}
console.log('FDE network deployment contract passed');
