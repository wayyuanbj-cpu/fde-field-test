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

const { buildTalentCardModel, normalizeFilters, renderTalentCard } = await import('../talents/talents.js');
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

const card = buildTalentCardModel({
  slug: 'manufacturing-kb-fde',
  display_name: '制造业知识库 FDE',
  headline: '把复杂现场知识变成可运行的 AI 流程',
  city: '北京',
  service_mode: 'hybrid',
  availability: 'available',
  status: 'member',
  summary: '擅长知识梳理、检索设计与一线试点。',
  service_package: '两周问题诊断与试点设计。',
  evidence_summary: '已完成脱敏调研纪要和验收清单。',
  not_fit: '不承接只要求演示的项目。',
  tags: ['制造业', '知识库'],
  certification_label: '尚未完成 OneX 认证',
});
assert.equal(card.profilePath, '/talents/manufacturing-kb-fde/');
assert.equal(card.statusLabel, '人才库成员');
assert.equal(card.certificationLabel, '尚未完成 OneX 认证');
assert.equal(card.evidence, '已完成脱敏调研纪要和验收清单。');
assert.deepEqual(card.tags, ['制造业', '知识库']);

function createDocumentFixture() {
  return {
    createElement(tagName) {
      return {
        tagName,
        children: [],
        append(...children) { this.children.push(...children); },
        setAttribute(name, value) { this[name] = value; },
      };
    },
  };
}

function findByClassName(element, className) {
  if (String(element.className || '').split(' ').includes(className)) return element;
  for (const child of element.children || []) {
    const match = findByClassName(child, className);
    if (match) return match;
  }
  return null;
}

const invalidProfileCard = renderTalentCard({
  display_name: '无主页人才',
  status: 'member',
  tags: [],
}, createDocumentFixture());
assert.equal(findByClassName(invalidProfileCard, 'talent-profile-link'), null);

assert.deepEqual(
  normalizeFilters(new URLSearchParams('status=member&city=%E5%8C%97%E4%BA%AC')),
  { status: 'member', city: '北京', tag: '', availability: '' },
);
assert.deepEqual(
  normalizeFilters(new URLSearchParams('status=bad&availability=drop')),
  { status: '', city: '', tag: '', availability: '' },
);

const directoryHtml = read('talents/index.html');
const directoryCss = read('talents/talents.css');
const directoryScript = read('talents/talents.js');

for (const id of ['talent-filters', 'directory-state', 'talent-grid']) {
  assert.match(directoryHtml, new RegExp(`id="${id}"`));
}
for (const fieldName of ['status', 'city', 'tag', 'availability']) {
  assert.match(directoryHtml, new RegExp(`name="${fieldName}"`));
}
assert.match(directoryHtml, /<script type="module" src="\.\/talents\.js"><\/script>/);

for (const phrase of [
  '按交付能力，找到合适的 FDE。',
  '项目匹配控制台',
  '人才库成员',
  '认证审核中',
  'OneX 认证 FDE',
  'OneX 交付 FDE',
  '企业提交项目需求',
  '我是 FDE，申请入库',
]) assert.match(directoryHtml, new RegExp(phrase));

for (const selector of [
  '.directory-hero',
  '.match-console',
  '.talent-status-guide',
  '.network-next-actions',
  '.talent-status',
  '.talent-profile-link',
]) assert.match(directoryCss, new RegExp(selector.replace('.', '\\.')));

assert.match(directoryScript, /talent-status/);
assert.match(directoryScript, /talent-profile-link/);

assert.match(directoryCss, /--navy-950:\s*#061427/i);
assert.match(directoryCss, /--cobalt:\s*#3f67ff/i);
assert.match(directoryCss, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(directoryHtml, /成功率|合作企业\s*\d+|工程师\s*\d+\s*位|剩余名额/);

console.log('FDE talent network deterministic checks passed');
