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
const {
  presentTalent,
  profilePath,
  profileSlug,
} = await import('../talents/talent-model.js');

assert.equal(profilePath('manufacturing-kb-fde'), '/talents/manufacturing-kb-fde/');
assert.equal(profilePath('../private'), '');
assert.equal(profileSlug('/talents/manufacturing-kb-fde/'), 'manufacturing-kb-fde');
assert.equal(profileSlug('/talents/missing/extra'), '');
assert.deepEqual(
  presentTalent({
    slug: 'manufacturing-kb-fde',
    status: 'member',
    service_mode: 'hybrid',
    availability: 'available',
    certification_label: '尚未完成 OneX 认证',
  }),
  {
    slug: 'manufacturing-kb-fde',
    statusLabel: '人才库成员',
    certificationLabel: '尚未完成 OneX 认证',
    serviceModeLabel: '混合协作',
    availabilityLabel: '可对接',
    isCertified: false,
  },
);
assert.equal(
  presentTalent({ status: 'member', certification_label: 'OneX 认证 FDE' }).certificationLabel,
  '尚未完成 OneX 认证',
);
assert.equal(
  presentTalent({ status: 'cert_pending', certification_label: 'OneX 认证 FDE' }).certificationLabel,
  '尚未完成 OneX 认证',
);

assert.deepEqual(
  normalizeFilters(new URLSearchParams('status=member&city=%E5%8C%97%E4%BA%AC')),
  { status: 'member', city: '北京', tag: '', availability: '' },
);
assert.deepEqual(
  normalizeFilters(new URLSearchParams('status=bad&availability=drop')),
  { status: '', city: '', tag: '', availability: '' },
);

console.log('FDE talent network deterministic checks passed');
