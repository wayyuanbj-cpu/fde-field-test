import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const service = read("deploy/fde-commercial.service");
assert.match(service, /FDE_COMMERCIAL_DB=\/var\/lib\/fde-commercial\/commercial\.db/);
assert.match(service, /FDE_COMMERCIAL_HOST=127\.0\.0\.1/);
assert.match(service, /FDE_COMMERCIAL_PORT=8767/);
assert.match(service, /ReadWritePaths=\/var\/lib\/fde-commercial/);
assert.match(service, /ProtectSystem=strict/);
assert.match(service, /NoNewPrivileges=true/);

const nginx = read("deploy/fde.onex.plus.nginx.conf");
assert.match(nginx, /limit_req_zone[^;]+zone=fde_commercial_apply:/);
assert.match(nginx, /location \^~ \/api\/commercial\//);
assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:8767/);
assert.match(nginx, /client_max_body_size 32k/);
assert.match(nginx, /X-Robots-Tag "noindex, nofollow" always/);
assert.match(nginx, /Cache-Control "no-store" always/);

const install = read("deploy/install-or-update.sh");
assert.match(install, /COMMERCIAL_DATA="\/var\/lib\/fde-commercial"/);
assert.match(install, /install -d -m 0750[^\n]+"\$COMMERCIAL_DATA"/);
assert.match(install, /fde-commercial\.service/);
assert.match(install, /fde_commercial\.db import connect, initialize/);
assert.match(install, /127\.0\.0\.1:8767\/api\/commercial\/health/);
assert.match(install, /Python 3\.11\+/);

const robots = read("robots.txt");
assert.match(robots, /Disallow: \/api\//);
assert.match(robots, /Disallow: \/ops\//);

const sitemap = read("sitemap.xml");
assert.match(sitemap, /https:\/\/fde\.onex\.plus\/fde-training\//);

const llms = read("llms.txt");
assert.match(llms, /FDE 小班实战培训/);
assert.match(llms, /training[^\n]*not[^\n]*certification/i);

const readme = read("README.md");
assert.match(readme, /FDE-TRAINING-SMALL-CLASS/);
assert.match(readme, /python -m fde_commercial\.manage list-applications/);
assert.match(readme, /set-offer-status --status paused --actor/);
assert.match(readme, /未配置外部 CRM/);
assert.match(readme, /暂停招生/);

console.log("FDE commercial deployment contract passed");
