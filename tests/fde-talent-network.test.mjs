import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const home = read('index.html');
assert.match(home, /我想成为 FDE/);
assert.match(home, /我是 FDE/);
assert.match(home, /我需要 FDE/);
assert.match(home, /人才库成员不等于 OneX 认证 FDE/);
assert.match(home, /id="network-entry"[^>]+hidden/);

for (const [path, phrase] of [
  ['become-fde/index.html', '公开挑战不是认证'],
  ['talent/apply/index.html', '灰度期采用邀请制'],
  ['enterprise/index.html', '需求提交将在下一个版本开放'],
  ['talents/index.html', '尚未完成 OneX 认证'],
]) {
  assert.match(read(path), new RegExp(phrase));
}

const { normalizeFilters } = await import('../talents/talents.js');
assert.deepEqual(
  normalizeFilters(new URLSearchParams('status=member&city=%E5%8C%97%E4%BA%AC')),
  { status: 'member', city: '北京', tag: '', availability: '' },
);
assert.deepEqual(
  normalizeFilters(new URLSearchParams('status=bad&availability=drop')),
  { status: '', city: '', tag: '', availability: '' },
);

console.log('FDE talent network deterministic checks passed');
