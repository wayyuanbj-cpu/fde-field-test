import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const root = fileURLToPath(new URL('../', import.meta.url));

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
    server.kill();
    await once(server, 'exit');
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
assert.match(nginx, /location \^~ \/api\/network\//);
assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:8766/);
assert.match(nginx, /location = \/api\/network\/config/);
assert.match(nginx, /location \^~ \/api\/network\/public\//);
assert.ok(nginx.includes('location ~ ^/talents/[a-z0-9]+(?:-[a-z0-9]+)*/?$ {'));
assert.match(nginx, /try_files \/talents\/profile\.html =404/);
const profileLocation = nginx.indexOf('location ~ ^/talents/');
const genericStaticFallback = nginx.indexOf('    location / {', profileLocation);
assert.ok(profileLocation >= 0 && profileLocation < genericStaticFallback, 'profile location must precede generic static fallback');
assert.match(localServer, /TALENT_PROFILE_PATH/);
assert.ok(localServer.includes('const TALENT_PROFILE_PATH = /^\\/talents\\/[a-z0-9]+(?:-[a-z0-9]+)*\\/?$/;'));
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

  for (const pathname of ['/talents/Bad/', '/talents/a--b/', '/talents/a/b/']) {
    const response = await request(port, pathname);
    assert.notEqual(response.status, 200, `${pathname} must not resolve as a profile`);
    assert.doesNotMatch(response.body, /id="profile-state"/, `${pathname} must not serve the profile shell`);
  }
});
console.log('FDE network deployment contract passed');
