import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const home = read('index.html');
assert.match(home, /我想成为 FDE/);
assert.match(home, /我是 FDE/);
assert.match(home, /我需要 FDE/);
assert.match(home, /人才库成员不等于 OneX 认证 FDE/);
assert.match(home, /id="network-entry"[^>]+hidden/);
assert.match(home, /id="network-unavailable"[^>]+hidden/);
assert.match(home, /href="\.\/"[^>]*>FDE 公开测试/);
assert.match(home, /href="\.\/fde-training\/"[^>]*>FDE 小班培训/);

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
    certification_status: 'not_certified',
    delivery_status: 'verified',
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
  presentTalent({ status: 'delivery', certification_status: 'not_certified', certification_label: 'OneX 认证 FDE' }).certificationLabel,
  '尚未完成 OneX 认证',
);
assert.equal(
  presentTalent({ status: 'member', certification_status: 'certified', delivery_status: 'unverified' }).certificationLabel,
  'OneX 认证 FDE',
);

const card = buildTalentCardModel({
  slug: 'manufacturing-kb-fde',
  display_name: '制造业知识库 FDE',
  headline: '把复杂现场知识变成可运行的 AI 流程',
  city: '北京',
  service_mode: 'hybrid',
  availability: 'available',
  status: 'member',
  certification_status: 'not_certified',
  delivery_status: 'verified',
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
const renderedCard = renderTalentCard({
  slug: 'delivery-only', display_name: '交付 FDE', headline: '交付能力', city: '北京',
  service_mode: 'hybrid', availability: 'available', status: 'delivery',
  certification_status: 'not_certified', delivery_status: 'verified',
  summary: '概要', service_package: '服务包', evidence_summary: '脱敏证据', not_fit: '边界', tags: ['交付'],
}, createDocumentFixture());
assert.equal(findByClassName(renderedCard, 'talent-evidence-label').textContent, '可核验的脱敏证据');

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
assert.match(directoryHtml, /href="\/"[^>]*>FDE 公开测试/);
assert.match(directoryHtml, /href="\/fde-training\/"[^>]*>FDE 小班培训/);

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

const profileHtml = read('talents/profile.html');
const profileScript = read('talents/profile.js');
for (const phrase of ['我能解决的问题', '标准服务包', '可核验的脱敏证据', '不适合的项目', '认证与交付状态']) {
  assert.match(profileHtml, new RegExp(phrase));
}
assert.match(
  profileHtml,
  /公开测试、培训结业、人才入库、正式认证和项目交付记录分别核验、分别存储、分别展示，任何一项都不能替代另一项。/,
);
assert.match(profileHtml, /id="profile-state"/);
assert.match(profileHtml, /id="profile-content"[^>]+hidden/);
assert.match(profileHtml, /id="profile-request-link"/);
assert.match(profileHtml, /href="\/talents\/talents\.css"/);
assert.match(profileHtml, /src="\/talents\/profile\.js"/);
assert.match(profileHtml, /公开页不展示真实姓名、手机、邮箱、微信、客户机密或精确考试分数/);
assert.doesNotMatch(profileHtml + profileScript, /13800000000|private@example\.com|wxid_|tel:|mailto:/i);
for (const id of ['profile-test-link', 'profile-training-link']) assert.match(profileHtml, new RegExp(`id="${id}"`));
assert.doesNotMatch(profileScript, /innerHTML/);
assert.match(directoryCss, /\.profile-content\s*\{[^}]*overflow-wrap:\s*anywhere/);
assert.match(directoryCss, /\.profile-hero\s*>\s*\*,\s*\.delivery-trail article,\s*\.profile-conversion\s*>\s*\*\s*\{[^}]*min-width:\s*0/);

const { loadTalentProfile, renderTalentProfile } = await import('../talents/profile.js');
const requests = [];
const loaded = await loadTalentProfile(async (url, options) => {
  requests.push([url, options]);
  if (url === '/api/network/config') {
    return { ok: true, json: async () => ({ features: { network_enabled: true, talent_directory_enabled: true } }) };
  }
  return { ok: true, json: async () => ({ talent: { slug: 'manufacturing-kb-fde', display_name: '制造业知识库 FDE' } }) };
}, '/talents/manufacturing-kb-fde/');
assert.equal(requests[1][0], '/api/network/public/talents/manufacturing-kb-fde');
assert.equal(requests[0][1].cache, 'no-store');
assert.equal(requests[1][1].cache, 'no-store');
assert.equal(loaded.slug, 'manufacturing-kb-fde');

let missingRequest = 0;
await assert.rejects(() => loadTalentProfile(async () => {
  missingRequest += 1;
  if (missingRequest === 1) {
    return { ok: true, json: async () => ({ features: { network_enabled: true, talent_directory_enabled: true } }) };
  }
  return { ok: false, status: 404 };
}, '/talents/invalid/'), /没有找到这份公开档案/);

const disabledRequests = [];
await assert.rejects(() => loadTalentProfile(async (url) => {
  disabledRequests.push(url);
  return { ok: true, json: async () => ({ features: { network_enabled: true, talent_directory_enabled: false } }) };
}, '/talents/manufacturing-kb-fde/'), /人才网络正在灰度准备中/);
assert.deepEqual(disabledRequests, ['/api/network/config']);

await assert.rejects(() => loadTalentProfile(async (url) => {
  if (url === '/api/network/config') {
    return { ok: true, json: async () => ({ features: { network_enabled: true, talent_directory_enabled: true } }) };
  }
  return { ok: true, json: async () => { throw new SyntaxError('Unexpected token <'); } };
}, '/talents/manufacturing-kb-fde/'), /^Error: 人才档案暂时读取失败$/);
await assert.rejects(() => loadTalentProfile(async (url) => {
  if (url === '/api/network/config') {
    return { ok: true, json: async () => ({ features: { network_enabled: true, talent_directory_enabled: true } }) };
  }
  throw new Error('socket path /private/raw');
}, '/talents/manufacturing-kb-fde/'), /^Error: 人才档案暂时读取失败$/);

function createProfileDocumentFixture() {
  const ids = [
    'profile-code', 'profile-name', 'profile-headline', 'profile-status', 'profile-certification',
    'profile-summary', 'profile-package', 'profile-evidence', 'profile-not-fit', 'profile-meta',
    'profile-tags', 'profile-request-link', 'profile-canonical', 'profile-state', 'profile-content',
  ];
  const nodes = Object.fromEntries(ids.map((id) => [id, {
    id,
    children: [],
    hidden: id === 'profile-content',
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
  }]));
  return {
    title: '',
    nodes,
    getElementById(id) { return nodes[id] ?? null; },
    createElement(tagName) {
      return { tagName, textContent: '', children: [], append(...children) { this.children.push(...children); } };
    },
  };
}

const profileDocument = createProfileDocumentFixture();
renderTalentProfile(profileDocument, {
  slug: 'manufacturing-kb-fde',
  display_name: '<制造业知识库 FDE>',
  headline: '把复杂现场知识变成可运行的 AI 流程',
  city: '北京',
  service_mode: 'hybrid',
  availability: 'available',
  status: 'member',
  summary: '擅长知识梳理、检索设计与一线试点。',
  service_package: '两周问题诊断与试点设计。',
  evidence_summary: '已完成脱敏调研纪要和验收清单。',
  not_fit: '不承接只要求演示的项目。',
  tags: ['制造业', '<知识库>'],
  certification_label: '尚未完成 OneX 认证',
  photo_url: 'https://example.test/private.jpg',
  phone: '13800000000',
});
assert.equal(profileDocument.nodes['profile-name'].textContent, '<制造业知识库 FDE>');
assert.equal(profileDocument.nodes['profile-tags'].children[1].textContent, '<知识库>');
assert.equal(profileDocument.nodes['profile-request-link'].href, '/enterprise/?talent=manufacturing-kb-fde');
assert.equal(profileDocument.nodes['profile-canonical'].href, 'https://fde.onex.plus/talents/manufacturing-kb-fde/');
assert.equal(profileDocument.nodes['profile-state'].hidden, true);
assert.equal(profileDocument.nodes['profile-content'].hidden, false);
assert.doesNotMatch(JSON.stringify(profileDocument.nodes), /13800000000|private\.jpg|photo_url|phone/);

console.log('FDE talent network deterministic checks passed');
