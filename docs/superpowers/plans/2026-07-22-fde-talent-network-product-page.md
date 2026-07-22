# OneX FDE 人才网络产品页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有 `/talents/` 升级为企业找 FDE 优先的人才网络产品页，并为每位已发布工程师提供 `/talents/<slug>/` 独立公开主页。

**Architecture:** 保持原生 HTML/CSS/ES module 和现有 `fde_network` 公开字段投影不变；目录页读取列表接口，独立主页读取现有详情接口。新增纯前端共享人才视图模型，Nginx 与本地集成服务器把稳定的工程师 URL 映射到静态详情外壳，所有页面仍只渲染同源公开 API 允许的字段。

**Tech Stack:** 原生 HTML/CSS/JavaScript、Python 3.11+ WSGI/SQLite、Node.js 确定性测试、Playwright 浏览器验收、Nginx、systemd。

## Global Constraints

- 人才网络页以“企业找 FDE”为第一任务，工程师入库为第二入口。
- 每位已发布工程师必须拥有唯一 `/talents/<slug>/` 公开地址；展示名变化不得改变该地址。
- 公开页面不得展示真实姓名、手机、邮箱、微信、身份证明、客户机密、未脱敏材料或精确考试分数。
- 未认证档案始终显示“尚未完成 OneX 认证”，不得出现平台认证徽章。
- 公开测试、培训结业、人才入库、正式认证和项目交付记录必须分开表述。
- 首屏不得虚构工程师数量、企业数量、成功率、剩余名额或合作金额。
- 继续复用 `GET /api/network/config`、`GET /api/network/public/talents` 和 `GET /api/network/public/talents/<slug>`；不得新增读取私密字段的前端接口。
- 独立主页首期不展示照片、客户 Logo、客户原文评价或直接联系方式。
- 390×844 移动端不得横向滚动，所有键盘焦点必须可见，并尊重 `prefers-reduced-motion`。
- 原有中英文测试、FDE 指南、培训页、统计后台和匿名分析不得回退。

---

### Task 1: 建立共享人才视图模型与稳定主页 URL

**Files:**
- Create: `talents/talent-model.js`
- Modify: `tests/fde-talent-network.test.mjs`

**Interfaces:**
- Consumes: 后端公开档案字段 `slug`、`status`、`service_mode`、`availability`、`certification_label`。
- Produces: `profilePath(slug): string`、`profileSlug(pathname): string`、`presentTalent(talent): object`，供目录页与独立主页共同使用。

- [ ] **Step 1: 写共享模型的失败测试**

在 `tests/fde-talent-network.test.mjs` 增加：

```javascript
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
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node tests/fde-talent-network.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `talents/talent-model.js`.

- [ ] **Step 3: 创建最小共享模型**

创建 `talents/talent-model.js`：

```javascript
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const STATUS_LABELS = {
  member: '人才库成员',
  cert_pending: '认证审核中',
  certified: 'OneX 认证 FDE',
  delivery: 'OneX 交付 FDE',
};

const SERVICE_MODE_LABELS = {
  remote: '远程协作',
  onsite: '驻场协作',
  hybrid: '混合协作',
};

const AVAILABILITY_LABELS = {
  available: '可对接',
  limited: '排期有限',
  unavailable: '暂不可用',
};

export function profilePath(slug) {
  const normalized = String(slug ?? '').trim();
  return SLUG.test(normalized) ? `/talents/${normalized}/` : '';
}

export function profileSlug(pathname) {
  const match = String(pathname ?? '').match(/^\/talents\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
  return match?.[1] ?? '';
}

export function presentTalent(talent) {
  const status = STATUS_LABELS[talent?.status] ? talent.status : 'member';
  return {
    slug: SLUG.test(String(talent?.slug ?? '')) ? talent.slug : '',
    statusLabel: STATUS_LABELS[status],
    certificationLabel: String(talent?.certification_label || '尚未完成 OneX 认证'),
    serviceModeLabel: SERVICE_MODE_LABELS[talent?.service_mode] ?? '服务方式待确认',
    availabilityLabel: AVAILABILITY_LABELS[talent?.availability] ?? '档期待确认',
    isCertified: status === 'certified' || status === 'delivery',
  };
}
```

- [ ] **Step 4: 运行测试并确认 GREEN**

Run: `node tests/fde-talent-network.test.mjs`

Expected: `FDE talent network deterministic checks passed`.

- [ ] **Step 5: 提交共享模型**

```bash
git add talents/talent-model.js tests/fde-talent-network.test.mjs
git commit -m "feat: add FDE talent presentation model"
```

---

### Task 2: 重构企业找 FDE 优先的目录结构

**Files:**
- Modify: `talents/index.html`
- Modify: `talents/talents.css`
- Modify: `tests/fde-talent-network.test.mjs`

**Interfaces:**
- Consumes: 现有筛选表单 ID `talent-filters`、状态区 ID `directory-state`、人才网格 ID `talent-grid`。
- Produces: 首屏 `directory-hero`、项目匹配控制台 `match-console`、四种状态说明 `talent-status-guide`、双向入口 `network-next-actions`。

- [ ] **Step 1: 写目录信息架构的失败测试**

在 `tests/fde-talent-network.test.mjs` 增加：

```javascript
const directoryHtml = read('talents/index.html');
const directoryCss = read('talents/talents.css');

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
]) assert.match(directoryCss, new RegExp(selector.replace('.', '\\.')));

assert.match(directoryCss, /--navy-950:\s*#061427/i);
assert.match(directoryCss, /--cobalt:\s*#3f67ff/i);
assert.match(directoryCss, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(directoryHtml, /成功率|合作企业\s*\d+|工程师\s*\d+\s*位|剩余名额/);
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node tests/fde-talent-network.test.mjs`

Expected: FAIL because the enterprise-first hero and matching console are absent.

- [ ] **Step 3: 替换目录页主体结构**

在 `talents/index.html` 保留既有 head、筛选表单和脚本引用，将 main 内容改为以下结构；筛选表单内的四个字段继续使用 `status`、`city`、`tag`、`availability`：

```html
<main class="network-main" id="main-content">
  <section class="directory-hero" aria-labelledby="directory-title">
    <div class="directory-hero-copy">
      <p class="page-code">ONEX FDE NETWORK / FIND DELIVERY CAPABILITY</p>
      <h1 id="directory-title">按交付能力，<span>找到合适的 FDE。</span></h1>
      <p>先看能解决的问题、服务边界与脱敏交付证据，再由 OneX 运营确认项目适配。这里不是公开考试排行榜。</p>
      <div class="network-hero-actions">
        <a class="network-button" href="#directory">浏览人才</a>
        <a class="network-button secondary" href="../enterprise/">企业提交项目需求</a>
      </div>
    </div>
    <aside class="match-console" aria-label="项目匹配控制台">
      <p class="console-title">项目匹配控制台</p>
      <dl>
        <div><dt>企业问题</dt><dd>知识无法稳定复用</dd></div>
        <div><dt>项目阶段</dt><dd>诊断与试点设计</dd></div>
        <div><dt>协作方式</dt><dd>远程 + 关键节点驻场</dd></div>
        <div><dt>选择依据</dt><dd>服务包、证据与能力边界</dd></div>
      </dl>
      <p>先定义问题，再选择工程师。</p>
    </aside>
  </section>

  <section class="talent-status-guide" aria-labelledby="status-guide-title">
    <div><p class="page-code">STATUS IS NOT A SCORE</p><h2 id="status-guide-title">先看清人才状态。</h2></div>
    <div class="status-track">
      <article><strong>人才库成员</strong><p>资料已授权发布，尚未完成 OneX 认证。</p></article>
      <article><strong>认证审核中</strong><p>已进入认证流程，不代表已经通过。</p></article>
      <article><strong>OneX 认证 FDE</strong><p>已完成规定的综合认证流程。</p></article>
      <article><strong>OneX 交付 FDE</strong><p>存在经授权和核验的交付记录。</p></article>
    </div>
  </section>

  <section id="directory" class="directory-section" aria-labelledby="directory-list-title">
    <div class="directory-section-head"><div><p class="page-code">AUTHORIZED PUBLIC PROFILES</p><h2 id="directory-list-title">按项目条件筛选</h2></div><p>只展示本人授权、运营审核并完成脱敏的公开字段。</p></div>
    <form id="talent-filters" class="filter-bar">
      <label>成员状态<select name="status"><option value="">全部公开成员</option><option value="member">人才库成员</option><option value="cert_pending">认证审核中</option><option value="certified">已认证</option><option value="delivery">有交付记录</option></select></label>
      <label>城市<input name="city" maxlength="80" placeholder="例如：北京" /></label>
      <label>能力标签<input name="tag" maxlength="80" placeholder="例如：知识库" /></label>
      <label>可用状态<select name="availability"><option value="">全部</option><option value="available">可对接</option><option value="limited">排期有限</option><option value="unavailable">暂不可用</option></select></label>
      <button type="submit">应用筛选</button>
    </form>
    <p id="directory-state" class="directory-state" aria-live="polite">正在读取人才目录…</p>
    <section id="talent-grid" class="talent-grid" aria-label="公开人才档案"></section>
  </section>

  <aside class="boundary-panel"><strong>人才库展示不等于正式认证。</strong><p>未认证成员始终显示“尚未完成 OneX 认证”。公开测试分、培训结业、入库状态、认证结果和项目交付记录分别保存、分别展示。</p></aside>

  <section class="network-next-actions" aria-label="人才网络下一步">
    <article><p class="page-code">FOR ENTERPRISE</p><h2>带着真实问题找 FDE。</h2><a href="../enterprise/">企业提交项目需求</a></article>
    <article><p class="page-code">FOR ENGINEERS</p><h2>已有交付经验，申请进入人才网络。</h2><a href="../talent/apply/">我是 FDE，申请入库</a></article>
  </section>
</main>
```

- [ ] **Step 4: 实现目录视觉系统**

在 `talents/talents.css` 顶部固定色彩 token，并为新增结构增加以下规则；保留现有表单、卡片和页脚的语义选择器并改用这些 token：

```css
:root {
  color-scheme: dark;
  --navy-950:#061427;
  --navy-900:#0b1e37;
  --navy-800:#123055;
  --cobalt:#3f67ff;
  --ice:#f2f6ff;
  --mist:#9aaeca;
  --orange:#ff7248;
  --line:rgba(154,174,202,.24);
  --mono:"SFMono-Regular",Consolas,monospace;
}
body { background:var(--navy-950); color:var(--ice); }
.directory-hero { min-height:620px; display:grid; grid-template-columns:minmax(0,1.2fr) minmax(320px,.8fr); gap:clamp(42px,7vw,104px); align-items:center; border-bottom:1px solid var(--line); }
.directory-hero h1 { margin:0; max-width:820px; font-size:clamp(54px,7.4vw,106px); line-height:.92; letter-spacing:-.065em; }
.directory-hero h1 span { display:block; color:var(--mist); }
.match-console { padding:28px; background:var(--navy-900); border:1px solid var(--line); box-shadow:18px 18px 0 rgba(63,103,255,.12); }
.match-console dl { margin:26px 0; border-top:1px solid var(--line); }
.match-console dl div { display:grid; grid-template-columns:110px 1fr; gap:18px; padding:17px 0; border-bottom:1px solid var(--line); }
.match-console dt { color:var(--mist); font:10px/1.4 var(--mono); letter-spacing:.08em; }
.match-console dd { margin:0; font-size:13px; }
.talent-status-guide,.directory-section { padding:72px 0; border-bottom:1px solid var(--line); }
.status-track { display:grid; grid-template-columns:repeat(4,1fr); border:1px solid var(--line); }
.status-track article { min-height:190px; padding:24px; border-right:1px solid var(--line); }
.status-track article:last-child { border-right:0; }
.network-next-actions { display:grid; grid-template-columns:1fr 1fr; }
.network-next-actions article { min-height:320px; padding:48px; border-right:1px solid var(--line); }
.network-next-actions article:last-child { border-right:0; }
@media (max-width:850px) { .directory-hero { grid-template-columns:1fr; padding:72px 0; } .status-track { grid-template-columns:1fr 1fr; } }
@media (max-width:560px) { .directory-hero h1 { font-size:52px; } .status-track,.network-next-actions { grid-template-columns:1fr; } .network-next-actions article,.status-track article { border-right:0; border-bottom:1px solid var(--line); } }
@media (prefers-reduced-motion: reduce) { *,*::before,*::after { scroll-behavior:auto !important; transition-duration:.01ms !important; animation-duration:.01ms !important; animation-iteration-count:1 !important; } }
```

- [ ] **Step 5: 运行确定性测试并提交**

Run: `node tests/fde-talent-network.test.mjs`

Expected: `FDE talent network deterministic checks passed`.

```bash
git add talents/index.html talents/talents.css tests/fde-talent-network.test.mjs
git commit -m "feat: make FDE directory enterprise first"
```

---

### Task 3: 把人才卡片变成可比较的交付能力产品

**Files:**
- Modify: `talents/talents.js`
- Modify: `talents/talents.css`
- Modify: `tests/fde-talent-network.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `profilePath()` 与 `presentTalent()`。
- Produces: `buildTalentCardModel(talent): object` 和 `renderTalentCard(talent, documentObject)`；卡片含状态、服务方式、档期、最多 6 个标签、关键证据和唯一主页链接。

- [ ] **Step 1: 写人才卡片的失败测试**

在确定性测试中调用纯函数 `buildTalentCardModel`，并断言：

```javascript
const { buildTalentCardModel } = await import('../talents/talents.js');
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
  tags: ['制造业','知识库'],
  certification_label: '尚未完成 OneX 认证',
});
assert.equal(card.profilePath, '/talents/manufacturing-kb-fde/');
assert.equal(card.statusLabel, '人才库成员');
assert.equal(card.certificationLabel, '尚未完成 OneX 认证');
assert.equal(card.evidence, '已完成脱敏调研纪要和验收清单。');
assert.deepEqual(card.tags, ['制造业','知识库']);
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node tests/fde-talent-network.test.mjs`

Expected: FAIL because `.talent-profile-link` and `.talent-status` are absent.

- [ ] **Step 3: 更新人才卡片渲染**

在 `talents/talents.js` 引入共享模型：

```javascript
import { presentTalent, profilePath } from './talent-model.js';
```

增加纯函数：

```javascript
export function buildTalentCardModel(talent) {
  const view = presentTalent(talent);
  return {
    ...view,
    displayName: cleanText(talent.display_name, 180),
    headline: cleanText(talent.headline, 180),
    city: cleanText(talent.city),
    summary: cleanText(talent.summary, 2000),
    servicePackage: cleanText(talent.service_package, 2000),
    evidence: cleanText(talent.evidence_summary, 2000),
    notFit: cleanText(talent.not_fit, 2000),
    tags: Array.isArray(talent.tags) ? talent.tags.slice(0, 6).map((tag) => cleanText(tag, 40)) : [],
    profilePath: profilePath(view.slug),
  };
}
```

在 `renderTalentCard` 中先调用 `const cardModel = buildTalentCardModel(talent)`，再创建：

```javascript
const status = documentObject.createElement('span');
status.className = `talent-status talent-status-${cleanText(talent.status)}`;
status.textContent = cardModel.statusLabel;

const certification = documentObject.createElement('strong');
certification.className = `talent-certification${cardModel.isCertified ? ' is-certified' : ''}`;
certification.textContent = cardModel.certificationLabel;

const evidence = documentObject.createElement('p');
evidence.className = 'talent-evidence';
evidence.textContent = cardModel.evidence;

const link = documentObject.createElement('a');
link.className = 'talent-profile-link';
link.href = cardModel.profilePath;
link.textContent = '查看独立主页';
link.setAttribute('aria-label', `查看 ${cleanText(talent.display_name, 180)} 的独立主页`);
```

卡片必须继续用 `textContent` 写入 API 文本；不得使用 `innerHTML`。标签从 `cardModel.tags` 渲染。

- [ ] **Step 4: 增加状态和主页链接样式**

在 `talents/talents.css` 增加：

```css
.talent-status { color:var(--mist); font:10px/1.4 var(--mono); letter-spacing:.08em; }
.talent-certification { color:var(--orange); border-color:rgba(255,114,72,.5); }
.talent-certification.is-certified { color:#9cc7ff; border-color:rgba(63,103,255,.65); }
.talent-evidence { margin:18px 0 0; padding-top:18px; color:var(--mist); border-top:1px solid var(--line); font-size:13px; line-height:1.7; }
.talent-profile-link { margin-top:24px; min-height:46px; display:inline-flex; align-items:center; color:var(--ice); text-decoration:none; border-bottom:1px solid var(--cobalt); }
.talent-profile-link::after { content:'↗'; margin-left:12px; color:var(--cobalt); }
```

- [ ] **Step 5: 运行测试并提交**

Run: `node tests/fde-talent-network.test.mjs`

Expected: `FDE talent network deterministic checks passed`.

```bash
git add talents/talents.js talents/talents.css tests/fde-talent-network.test.mjs
git commit -m "feat: productize FDE talent cards"
```

---

### Task 4: 实现每位工程师的独立公开主页

**Files:**
- Create: `talents/profile.html`
- Create: `talents/profile.js`
- Modify: `talents/talents.css`
- Modify: `tests/fde-talent-network.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `profileSlug()`、`presentTalent()`；现有详情接口 `/api/network/public/talents/<slug>`。
- Produces: `loadTalentProfile(fetchImpl, pathname): Promise<object>`、`renderTalentProfile(documentObject, talent)` 与页面 ID `profile-state`、`profile-content`、`profile-request-link`。

- [ ] **Step 1: 写详情加载与静态外壳的失败测试**

在 `tests/fde-talent-network.test.mjs` 增加：

```javascript
const profileHtml = read('talents/profile.html');
for (const phrase of ['我能解决的问题','标准服务包','可核验的脱敏证据','不适合的项目','认证与交付状态']) {
  assert.match(profileHtml, new RegExp(phrase));
}
assert.match(profileHtml, /id="profile-state"/);
assert.match(profileHtml, /id="profile-content"[^>]+hidden/);
assert.match(profileHtml, /id="profile-request-link"/);

const { loadTalentProfile } = await import('../talents/profile.js');
const requests = [];
const loaded = await loadTalentProfile(async (url) => {
  requests.push(url);
  if (url === '/api/network/config') return { ok:true, json:async () => ({ features:{ network_enabled:true, talent_directory_enabled:true } }) };
  return { ok:true, json:async () => ({ talent:{ slug:'manufacturing-kb-fde', display_name:'制造业知识库 FDE' } }) };
}, '/talents/manufacturing-kb-fde/');
assert.equal(requests[1], '/api/network/public/talents/manufacturing-kb-fde');
assert.equal(loaded.slug, 'manufacturing-kb-fde');
let missingRequest = 0;
await assert.rejects(() => loadTalentProfile(async () => {
  missingRequest += 1;
  if (missingRequest === 1) return { ok:true, json:async () => ({ features:{ network_enabled:true, talent_directory_enabled:true } }) };
  return { ok:false, status:404 };
}, '/talents/invalid/'), /没有找到这份公开档案/);
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node tests/fde-talent-network.test.mjs`

Expected: FAIL because `talents/profile.html` and `talents/profile.js` do not exist.

- [ ] **Step 3: 创建独立主页静态外壳**

创建 `talents/profile.html`，head 引用绝对资源路径，并提供可由脚本更新的 canonical：

```html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>FDE 工程师主页｜OneX FDE 人才网络</title>
<meta name="description" content="查看经本人授权、运营审核和脱敏处理的 OneX FDE 工程师公开交付能力主页。" />
<link id="profile-canonical" rel="canonical" href="https://fde.onex.plus/talents/" />
<link rel="icon" href="/logo.svg" type="image/svg+xml" />
<link rel="stylesheet" href="/talents/talents.css" />
</head>
<body>
<header class="network-header">
  <a class="network-brand" href="/"><img src="/logo.svg" alt="" /><span><strong>ONEX FDE NETWORK</strong><small>PUBLIC DELIVERY PROFILE</small></span></a>
  <nav><a href="/talents/">人才目录</a><a href="/talent/apply/">我是 FDE</a></nav>
</header>
<main class="network-main profile-main" id="main-content">
  <p id="profile-state" class="directory-state" role="status" aria-live="polite">正在读取经授权的公开档案…</p>
  <article id="profile-content" class="profile-content" hidden>
    <header class="profile-hero">
      <div><a class="profile-back" href="/talents/">← 返回人才目录</a><p id="profile-code" class="page-code"></p><h1 id="profile-name"></h1><p id="profile-headline" class="profile-headline"></p></div>
      <aside class="profile-status-panel"><span id="profile-status"></span><strong id="profile-certification"></strong><div id="profile-meta" class="talent-meta"></div><div id="profile-tags" class="talent-tags"></div></aside>
    </header>
    <section class="delivery-trail" aria-label="交付能力说明">
      <article><p class="page-code">01 / PROBLEM</p><h2>我能解决的问题</h2><p id="profile-summary"></p></article>
      <article><p class="page-code">02 / PACKAGE</p><h2>标准服务包</h2><p id="profile-package"></p></article>
      <article><p class="page-code">03 / EVIDENCE</p><h2>可核验的脱敏证据</h2><p id="profile-evidence"></p></article>
      <article><p class="page-code">04 / BOUNDARY</p><h2>不适合的项目</h2><p id="profile-not-fit"></p></article>
    </section>
    <section class="profile-conversion"><div><p class="page-code">MATCH WITH CONTEXT</p><h2>认证与交付状态</h2><p>人才库展示、正式认证和项目交付记录分别核验，不使用公开测试分数替代人才信用。</p></div><a id="profile-request-link" class="network-button" href="/enterprise/">带着这位 FDE 提交需求</a></section>
  </article>
</main>
<script type="module" src="/talents/profile.js"></script>
</body>
</html>
```

- [ ] **Step 4: 实现详情加载和安全渲染**

创建 `talents/profile.js`：

```javascript
import { presentTalent, profileSlug } from './talent-model.js';

export async function loadTalentProfile(fetchImpl, pathname) {
  const slug = profileSlug(pathname);
  if (!slug) throw new Error('没有找到这份公开档案');
  const configResponse = await fetchImpl('/api/network/config', { credentials:'same-origin', headers:{ Accept:'application/json' } });
  if (!configResponse.ok) throw new Error('人才网络暂时无法读取');
  const config = await configResponse.json();
  if (config?.features?.network_enabled !== true || config?.features?.talent_directory_enabled !== true) {
    throw new Error('人才网络正在灰度准备中');
  }
  const response = await fetchImpl(`/api/network/public/talents/${slug}`, { credentials:'same-origin', headers:{ Accept:'application/json' } });
  if (!response.ok) throw new Error(response.status === 404 ? '没有找到这份公开档案' : '人才档案暂时读取失败');
  const payload = await response.json();
  if (!payload?.talent || payload.talent.slug !== slug) throw new Error('人才档案暂时读取失败');
  return payload.talent;
}

function setText(documentObject, id, value) {
  const node = documentObject.getElementById(id);
  if (node) node.textContent = String(value ?? '');
}

export function renderTalentProfile(documentObject, talent) {
  const view = presentTalent(talent);
  setText(documentObject, 'profile-code', `FDE NETWORK / ${view.slug.toUpperCase()}`);
  setText(documentObject, 'profile-name', talent.display_name);
  setText(documentObject, 'profile-headline', talent.headline);
  setText(documentObject, 'profile-status', view.statusLabel);
  setText(documentObject, 'profile-certification', view.certificationLabel);
  setText(documentObject, 'profile-summary', talent.summary);
  setText(documentObject, 'profile-package', talent.service_package);
  setText(documentObject, 'profile-evidence', talent.evidence_summary);
  setText(documentObject, 'profile-not-fit', talent.not_fit);
  const meta = documentObject.getElementById('profile-meta');
  meta.replaceChildren();
  for (const value of [talent.city, view.serviceModeLabel, view.availabilityLabel]) {
    if (!value) continue;
    const item = documentObject.createElement('span');
    item.textContent = String(value);
    meta.append(item);
  }
  const tags = documentObject.getElementById('profile-tags');
  tags.replaceChildren();
  for (const value of Array.isArray(talent.tags) ? talent.tags.slice(0, 10) : []) {
    const item = documentObject.createElement('span');
    item.textContent = String(value).trim().slice(0, 40);
    tags.append(item);
  }
  const requestLink = documentObject.getElementById('profile-request-link');
  requestLink.href = `/enterprise/?talent=${encodeURIComponent(view.slug)}`;
  documentObject.getElementById('profile-canonical').href = `https://fde.onex.plus/talents/${view.slug}/`;
  documentObject.title = `${talent.display_name}｜OneX FDE 人才网络`;
  documentObject.getElementById('profile-state').hidden = true;
  documentObject.getElementById('profile-content').hidden = false;
}

async function setup(documentObject, environment) {
  try {
    const talent = await loadTalentProfile(environment.fetch.bind(environment), environment.location.pathname);
    renderTalentProfile(documentObject, talent);
  } catch (error) {
    setText(documentObject, 'profile-state', error.message);
  }
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') setup(document, window);
```

页面所有 API 文本均使用 `textContent`；不得使用 `innerHTML`。

- [ ] **Step 5: 增加独立主页样式**

在 `talents/talents.css` 增加：

```css
.profile-main { padding-top:36px; }
.profile-content[hidden] { display:none; }
.profile-hero { min-height:560px; display:grid; grid-template-columns:minmax(0,1.25fr) minmax(300px,.75fr); gap:72px; align-items:center; border-bottom:1px solid var(--line); }
.profile-hero h1 { margin:20px 0; font-size:clamp(54px,7vw,96px); line-height:.94; letter-spacing:-.06em; }
.profile-headline { max-width:760px; color:var(--mist); font-size:clamp(20px,2vw,30px); line-height:1.45; }
.profile-status-panel { padding:28px; background:var(--navy-900); border-left:3px solid var(--cobalt); }
.delivery-trail { display:grid; grid-template-columns:repeat(2,1fr); border-bottom:1px solid var(--line); }
.delivery-trail article { min-height:320px; padding:48px; border-right:1px solid var(--line); border-bottom:1px solid var(--line); }
.delivery-trail article:nth-child(2n) { border-right:0; }
.delivery-trail h2 { margin:18px 0 30px; font-size:clamp(28px,3vw,44px); }
.delivery-trail article > p:last-child { color:var(--mist); line-height:1.85; }
.profile-conversion { padding:72px 0; display:grid; grid-template-columns:1fr auto; gap:48px; align-items:end; }
@media (max-width:850px) { .profile-hero,.profile-conversion { grid-template-columns:1fr; } .delivery-trail { grid-template-columns:1fr; } .delivery-trail article { border-right:0; } }
```

- [ ] **Step 6: 运行测试并提交**

Run: `node tests/fde-talent-network.test.mjs`

Expected: `FDE talent network deterministic checks passed`.

```bash
git add talents/profile.html talents/profile.js talents/talents.css tests/fde-talent-network.test.mjs
git commit -m "feat: add individual FDE profile pages"
```

---

### Task 5: 为独立主页增加本地与生产路由映射

**Files:**
- Modify: `tests/fde-local-integration-server.mjs`
- Modify: `deploy/fde.onex.plus.nginx.conf`
- Modify: `tests/fde-network-deploy.test.mjs`

**Interfaces:**
- Consumes: URL 规则 `/talents/<slug>/` 与静态外壳 `talents/profile.html`。
- Produces: 本地和 Nginx 对同一 URL 规则的一致映射；API 与静态资源路由不受影响。

- [ ] **Step 1: 写部署契约的失败测试**

在 `tests/fde-network-deploy.test.mjs` 增加：

```javascript
assert.match(nginx, /location ~ \^\\\/talents\\\/[a-z0-9]/);
assert.match(nginx, /try_files \/talents\/profile\.html =404/);
assert.match(localServer, /TALENT_PROFILE_PATH/);
assert.match(localServer, /talents', 'profile\.html/);
assert.match(localServer, /FDE_NETWORK_API_URL/);
```

同时在测试顶部读取：

```javascript
const localServer = read('tests/fde-local-integration-server.mjs');
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node tests/fde-network-deploy.test.mjs`

Expected: FAIL because neither server maps profile slugs to `profile.html`.

- [ ] **Step 3: 实现本地路由映射**

在 `tests/fde-local-integration-server.mjs` 增加：

```javascript
const TALENT_PROFILE_PATH = /^\/talents\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/;
```

在 `targets` 中加入人才网络同源代理：

```javascript
['/api/network/', new URL(process.env.FDE_NETWORK_API_URL ?? 'http://127.0.0.1:8766')],
```

在 `staticFile` 解析 `pathname` 后、拼接普通文件路径前加入：

```javascript
let file = TALENT_PROFILE_PATH.test(pathname)
  ? resolve(root, 'talents', 'profile.html')
  : resolve(root, `.${pathname}`);
```

删除原有重复的 `let file = resolve(root, ...)`。

- [ ] **Step 4: 实现生产 Nginx 映射**

在 `deploy/fde.onex.plus.nginx.conf` 的 `/ops/` 和通用 `location /` 之间加入：

```nginx
location ~ ^/talents/[a-z0-9]+(?:-[a-z0-9]+)*/?$ {
    try_files /talents/profile.html =404;
    add_header Cache-Control "no-cache" always;
}
```

- [ ] **Step 5: 运行契约测试并提交**

Run: `node tests/fde-network-deploy.test.mjs`

Expected: `FDE network deployment contract passed`.

```bash
git add tests/fde-local-integration-server.mjs deploy/fde.onex.plus.nginx.conf tests/fde-network-deploy.test.mjs
git commit -m "feat: route public FDE profile pages"
```

---

### Task 6: 扩展桌面端、移动端与失败状态浏览器验收

**Files:**
- Modify: `tests/fde-talent-network-browser.mjs`

**Interfaces:**
- Consumes: 目录页、独立主页、列表 API、详情 API 与 config API。
- Produces: 1440px 目录、390×844 独立主页、筛选 URL、无效详情与灰度关闭状态的端到端证据。

- [ ] **Step 1: 写独立主页浏览器断言并确认 RED**

把 `pageWithRoutes` 的人才接口改为按 URL 返回列表或详情：

```javascript
await page.route('**/api/network/public/talents/*', (route) => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ talent:fixture }) }));
await page.route(/\/api\/network\/public\/talents(?:\?.*)?$/, (route) => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ items:[fixture], filters:{} }) }));
```

新增断言：

```javascript
await desktop.page.goto(new URL('talents/', baseUrl).href, { waitUntil:'networkidle' });
await desktop.page.getByRole('heading', { name:'按交付能力，找到合适的 FDE。' }).waitFor();
await desktop.page.getByRole('link', { name:'查看 制造业知识库 FDE 的独立主页' }).click();
await desktop.page.waitForURL('**/talents/manufacturing-kb-fde/');
await desktop.page.getByRole('heading', { name:'制造业知识库 FDE' }).waitFor();
assert.equal(await desktop.page.getByText('两周问题诊断与试点设计。', { exact:true }).isVisible(), true);
assert.equal(await desktop.page.getByText('已完成脱敏调研纪要和验收清单。', { exact:true }).isVisible(), true);
assert.equal(await desktop.page.getByRole('link', { name:'带着这位 FDE 提交需求' }).getAttribute('href'), '/enterprise/?talent=manufacturing-kb-fde');
```

Run: `FDE_TEST_URL=http://127.0.0.1:4176/ NODE_PATH=/Users/yuanwei/.npm/_npx/e41f203b7505f1fb/node_modules node tests/fde-talent-network-browser.mjs`

Expected: FAIL until Tasks 2–5 are implemented and the server runs on 4176.

- [ ] **Step 2: 增加移动端和受控失败状态断言**

增加 390×844 独立主页检查：

```javascript
const mobile = await pageWithRoutes({ width:390, height:844 });
await mobile.page.goto(new URL('talents/manufacturing-kb-fde/', baseUrl).href, { waitUntil:'networkidle' });
await mobile.page.getByRole('heading', { name:'制造业知识库 FDE' }).waitFor();
assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
await mobile.page.getByRole('link', { name:'返回人才目录' }).focus();
assert.ok(await mobile.page.evaluate(() => document.activeElement?.classList.contains('profile-back')));
assert.deepEqual(mobile.errors, []);
await mobile.context.close();
```

把 `pageWithRoutes` 改为接收场景参数：

```javascript
async function pageWithRoutes(viewport, scenario = {}) {
  const config = scenario.config ?? { network_enabled:true, talent_directory_enabled:true };
  const detailStatus = scenario.detailStatus ?? 200;
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => { window.__FDE_NETWORK_PREVIEW__ = true; });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/network/config', (route) => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ features:config }) }));
  await page.route('**/api/network/public/talents/*', (route) => route.fulfill({ status:detailStatus, contentType:'application/json', body:detailStatus === 200 ? JSON.stringify({ talent:fixture }) : JSON.stringify({ error:'not_found' }) }));
  await page.route(/\/api\/network\/public\/talents(?:\?.*)?$/, (route) => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ items:[fixture], filters:{} }) }));
  return { context, page, errors };
}
```

增加受控状态断言：

```javascript
const missing = await pageWithRoutes({ width:390, height:844 }, { detailStatus:404 });
await missing.page.goto(new URL('talents/missing-profile/', baseUrl).href, { waitUntil:'networkidle' });
assert.equal(await missing.page.getByText('没有找到这份公开档案', { exact:true }).isVisible(), true);
await missing.context.close();

const disabled = await pageWithRoutes(
  { width:390, height:844 },
  { config:{ network_enabled:false, talent_directory_enabled:false } },
);
await disabled.page.goto(new URL('talents/manufacturing-kb-fde/', baseUrl).href, { waitUntil:'networkidle' });
assert.equal(await disabled.page.getByText('人才网络正在灰度准备中', { exact:true }).isVisible(), true);
await disabled.context.close();
```

- [ ] **Step 3: 保存桌面和移动截图**

保留现有截图环境变量，并新增：

```javascript
if (process.env.FDE_NETWORK_PROFILE_SCREENSHOT) {
  await mobile.page.screenshot({ path:process.env.FDE_NETWORK_PROFILE_SCREENSHOT, fullPage:true });
}
```

- [ ] **Step 4: 运行浏览器验收并提交**

启动集成服务器：

Run: `FDE_INTEGRATION_PORT=4176 node tests/fde-local-integration-server.mjs`

在另一个终端运行：

Run: `FDE_TEST_URL=http://127.0.0.1:4176/ NODE_PATH=/Users/yuanwei/.npm/_npx/e41f203b7505f1fb/node_modules FDE_NETWORK_TALENTS_SCREENSHOT=/tmp/fde-network-directory.png FDE_NETWORK_PROFILE_SCREENSHOT=/tmp/fde-network-profile-mobile.png node tests/fde-talent-network-browser.mjs`

Expected: `FDE talent network browser checks passed` and both PNG files exist.

```bash
git add tests/fde-talent-network-browser.mjs
git commit -m "test: verify FDE talent profile experience"
```

---

### Task 7: 全量回归、视觉检查与文档同步

**Files:**
- Modify: `README.md`
- Verify: `talents/index.html`
- Verify: `talents/profile.html`
- Verify: `talents/talents.css`
- Verify: `talents/talents.js`
- Verify: `talents/profile.js`
- Verify: `deploy/fde.onex.plus.nginx.conf`

**Interfaces:**
- Consumes: Tasks 1–6 的完整实现。
- Produces: 可合并、可部署且有新鲜验证证据的功能分支。

- [ ] **Step 1: 更新 README 公开路由说明**

在公开路由列表中把人才目录写为：

```markdown
- `/talents/`：企业找 FDE 优先的公开人才目录，可按状态、城市、能力标签和档期筛选
- `/talents/<slug>/`：每位已授权、已发布工程师的独立公开主页
```

在人才网络说明中增加：

```markdown
人才卡片与独立主页只读取 `fde_network` 的公开字段投影。工程师主页使用稳定 `slug` URL，不公开真实姓名、联系方式、客户机密或精确考试分数；企业合作先进入 OneX 统一需求入口。
```

- [ ] **Step 2: 运行全部确定性测试**

Run: `for test in tests/*.test.mjs; do node "$test" || exit 1; done`

Expected: 14 组确定性检查全部打印 passed，退出码 0。

- [ ] **Step 3: 运行全部 Python 后端测试**

Run: `PYTHONPATH=backend /Users/yuanwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest discover -s backend/tests -v`

Expected: `Ran 58 tests` and `OK`.

- [ ] **Step 4: 运行人才网络浏览器验收**

Run: `FDE_TEST_URL=http://127.0.0.1:4176/ NODE_PATH=/Users/yuanwei/.npm/_npx/e41f203b7505f1fb/node_modules node tests/fde-talent-network-browser.mjs`

Expected: `FDE talent network browser checks passed`.

- [ ] **Step 5: 检查截图和页面状态**

打开 `/tmp/fde-network-directory.png` 与 `/tmp/fde-network-profile-mobile.png`，逐项确认：无横向滚动、文字不截断、未认证状态醒目但不冒充徽章、首屏主按钮可见、移动端返回目录与企业需求入口可聚焦。

- [ ] **Step 6: 运行差异与工作区检查**

Run: `git diff --check`

Expected: no output, exit code 0.

Run: `git status --short --branch`

Expected: only intended README change remains before the final commit.

- [ ] **Step 7: 提交文档同步**

```bash
git add README.md
git commit -m "docs: describe public FDE profile pages"
```

- [ ] **Step 8: 最终分支证据**

Run: `git status --short --branch`

Expected: clean `feat/fde-talent-network-product-page` worktree.

Run: `git log --oneline main..HEAD`

Expected: design commits plus Task 1–7 implementation commits are present.
