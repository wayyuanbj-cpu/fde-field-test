# FDE Training Outcomes, Graduation, and UI Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the FDE small-class enrollment page explicitly explain learning outcomes and graduation rules while visually matching the FDE test page on desktop and mobile.

**Architecture:** Keep the existing static HTML/CSS/ES-module structure and commercial application API unchanged. Add semantic outcome and graduation sections to `fde-training/index.html`, then align `training.css` with the shared FDE test tokens and interaction language. Extend deterministic HTML/CSS assertions first, then extend the existing Playwright browser acceptance flow.

**Tech Stack:** Semantic HTML5, CSS custom properties and responsive layout, vanilla JavaScript ES modules, Node.js assertions, Playwright Chromium.

## Global Constraints

- Single cohort capacity remains `每期最多 10 人` and enrollment remains application-based.
- Do not invent dates, prices, remaining-seat counts, employment guarantees, or project-income guarantees.
- Course graduation does not automatically grant OneX FDE talent-pool admission, formal certification, or a badge.
- Graduation thresholds are 70/100 for pass and 85/100 for excellent; one resubmission or retest is allowed within 30 days.
- Use the test page's fixed dark tokens: navy `#030b17 / #07162b / #0c2a4d`, cobalt `#2962ff`, orange `#ff5a1f`, steel text, Inter/SF Pro/PingFang, and monospaced telemetry labels.
- Preserve the existing application API payload, idempotency behavior, analytics privacy, product-status loading, and form fields.
- Verify desktop at 1365×900 or wider and mobile at 390×844 with no horizontal overflow.

---

### Task 1: Lock Learning and Graduation Copy with Deterministic Tests

**Files:**
- Modify: `tests/fde-training.test.mjs`
- Modify: `fde-training/index.html`

**Interfaces:**
- Consumes: Existing semantic training page and `node:assert/strict` test runner.
- Produces: Stable `#outcomes` and `#graduation` sections for CSS and browser acceptance tests.

- [ ] **Step 1: Write the failing content assertions**

Add these assertions after the existing training-page boundary assertions:

```js
assert.match(html, /id="outcomes"/);
assert.match(html, /你会完整跑一遍企业 AI 交付/);
for (const outcome of [
  '企业问题诊断',
  'AI 方案设计',
  'Demo／工作流搭建',
  '项目推进与验收',
  '客户培训与运营',
  '复盘与答辩',
]) {
  assert.match(html, new RegExp(outcome));
}
assert.match(html, /id="graduation"/);
assert.match(html, /结业不是听完课，是交出一个可验收项目包/);
for (const rule of [
  '70 分',
  '85 分',
  'AI 基础理论',
  '工具实操',
  '企业场景诊断',
  'AI 方案设计',
  'Demo／工作流搭建',
  '答辩表达',
  '30 天内',
]) {
  assert.match(html, new RegExp(rule));
}
assert.match(html, /允许使用 AI，但必须能解释自己的诊断、方案选择和实现过程/);
```

- [ ] **Step 2: Run the deterministic test and verify RED**

Run:

```bash
node tests/fde-training.test.mjs
```

Expected: FAIL because `#outcomes` and the graduation content do not exist.

- [ ] **Step 3: Replace the duplicated delivery copy with outcome cards**

Add `学习成果` and `如何结业` anchors to the header navigation. Replace the current `delivery-section` with semantic cards using this stable shape:

```html
<section id="outcomes" class="section outcomes-section" aria-labelledby="outcomes-title">
  <div class="section-heading outcomes-heading">
    <p class="section-code">TRAINING OUTPUT / 01–06</p>
    <h2 id="outcomes-title">你会完整跑一遍企业 AI 交付。</h2>
    <p>每一项训练都对应一份能被检查、复盘和继续使用的项目成果。</p>
  </div>
  <div class="outcomes-grid">
    <article class="outcome-card outcome-card-lead">
      <span>01 / DIAGNOSE</span><h3>企业问题诊断</h3>
      <p>从业务抱怨、流程、角色和材料中找到真正问题。</p>
      <strong>产出：场景诊断表、AI 应用机会清单</strong>
    </article>
    <article class="outcome-card">
      <span>02 / DESIGN</span><h3>AI 方案设计</h3>
      <p>明确目标、范围、人机分工、风险边界和价值路径。</p>
      <strong>产出：AI 场景解决方案、ROI 粗算</strong>
    </article>
    <article class="outcome-card">
      <span>03 / BUILD</span><h3>Demo／工作流搭建</h3>
      <p>把方案做成可运行、可演示、可复现的最小应用。</p>
      <strong>产出：工作流或 Agent Demo、测试记录</strong>
    </article>
    <article class="outcome-card">
      <span>04 / DELIVER</span><h3>项目推进与验收</h3>
      <p>管理需求确认、排期、变更、验收和现场协同。</p>
      <strong>产出：项目计划、验收表、变更记录</strong>
    </article>
    <article class="outcome-card">
      <span>05 / ENABLE</span><h3>客户培训与运营</h3>
      <p>推动客户正确使用，收集反馈并规划持续改进。</p>
      <strong>产出：客户培训手册或操作说明</strong>
    </article>
    <article class="outcome-card">
      <span>06 / DEFEND</span><h3>复盘与答辩</h3>
      <p>用客户语言解释选择、结果、限制和下一步。</p>
      <strong>产出：项目复盘报告、5–8 分钟答辩记录</strong>
    </article>
  </div>
</section>
```

- [ ] **Step 4: Add the graduation scorecard after outcomes**

Add `#graduation` with a score summary, six rubric rows, pass conditions, AI-integrity text, and the explicit credential boundary. Use the exact facts below:

```html
<div class="graduation-thresholds" aria-label="结业分数线">
  <div><strong>70</strong><span>结业线 / PASS</span></div>
  <div><strong>85+</strong><span>优秀线 / EXCELLENT</span></div>
</div>
<ol class="rubric-list" aria-label="结业评分权重">
  <li><span>AI 基础理论</span><strong>20%</strong></li>
  <li><span>工具实操</span><strong>20%</strong></li>
  <li><span>企业场景诊断</span><strong>20%</strong></li>
  <li><span>AI 方案设计</span><strong>20%</strong></li>
  <li><span>Demo／工作流搭建</span><strong>15%</strong></li>
  <li><span>答辩表达</span><strong>5%</strong></li>
</ol>
```

The requirement copy must state: the three project items must jointly reach 60% of their available score; the Demo must run and reproduce; a 5–8 minute defense is required; one resubmission/retest is available within 30 days; AI may be used but the learner must explain key decisions; graduation does not trigger talent admission, formal certification, or a badge.

- [ ] **Step 5: Run deterministic tests and verify GREEN**

Run:

```bash
node tests/fde-training.test.mjs
```

Expected: `FDE training deterministic tests passed`.

- [ ] **Step 6: Commit the content slice**

```bash
git add tests/fde-training.test.mjs fde-training/index.html
git commit -m "feat: explain FDE training outcomes and graduation"
```

---

### Task 2: Align the Training Page with the FDE Test UI System

**Files:**
- Modify: `tests/fde-training.test.mjs`
- Modify: `tests/fde-training-browser.mjs`
- Modify: `fde-training/training.css`

**Interfaces:**
- Consumes: `#outcomes`, `.outcomes-grid`, `#graduation`, `.graduation-thresholds`, `.rubric-list`, existing training header/hero/form classes, and test-page tokens in `styles.css`.
- Produces: Fixed dark OneX FDE presentation at all color-scheme preferences and responsive outcome/graduation layouts.

- [ ] **Step 1: Write failing token assertions**

Load both stylesheets in `tests/fde-training.test.mjs`:

```js
const trainingCss = await readFile(path.join(root, 'fde-training/training.css'), 'utf8');
for (const token of [
  '--navy-950: #030b17',
  '--navy-900: #07162b',
  '--navy-800: #0c2a4d',
  '--cobalt: #2962ff',
  '--orange: #ff5a1f',
  '--white: #f4f7fb',
  '--steel: #92a4b8',
]) {
  assert.match(trainingCss, new RegExp(token));
}
assert.doesNotMatch(trainingCss, /@media \(prefers-color-scheme: dark\)/);
assert.match(trainingCss, /\.outcomes-grid/);
assert.match(trainingCss, /\.graduation-thresholds/);
assert.match(trainingCss, /@media \(prefers-reduced-motion: reduce\)/);
```

- [ ] **Step 2: Extend browser acceptance before styling**

In the desktop block of `tests/fde-training-browser.mjs`, add:

```js
assert.equal(await page.getByRole('heading', { name: '你会完整跑一遍企业 AI 交付。' }).isVisible(), true);
assert.equal(await page.getByRole('heading', { name: '结业不是听完课，是交出一个可验收项目包。' }).isVisible(), true);
assert.equal(await page.locator('.outcome-card').count(), 6);
assert.equal(await page.locator('.rubric-list li').count(), 6);
assert.equal(
  await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  'rgb(7, 22, 43)',
);
```

In the mobile block, add:

```js
assert.equal(await page.locator('.outcome-card').count(), 6);
await page.locator('#graduation').scrollIntoViewIfNeeded();
assert.equal(await page.getByText('70', { exact: true }).isVisible(), true);
assert.equal(await page.getByText('85+', { exact: true }).isVisible(), true);
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  true,
);
```

- [ ] **Step 3: Run the deterministic test and verify RED**

Run:

```bash
node tests/fde-training.test.mjs
```

Expected: FAIL because the training stylesheet does not yet expose the test-page token set and still contains a dark color-scheme media query.

- [ ] **Step 4: Replace the independent color system**

Replace the root variables and remove the dark color-scheme override:

```css
:root {
  color-scheme: dark;
  --navy-950: #030b17;
  --navy-900: #07162b;
  --navy-800: #0c2a4d;
  --cobalt: #2962ff;
  --cobalt-soft: #7394ff;
  --orange: #ff5a1f;
  --white: #f4f7fb;
  --steel: #92a4b8;
  --steel-dark: #51657c;
  --line: rgba(146, 164, 184, 0.22);
  --ink: #0a182a;
  --paper: #eef3f8;
  --success: #69e7a2;
  --danger: #ff9873;
  --sans: Inter, "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif;
  --mono: "SFMono-Regular", "Roboto Mono", Consolas, "Liberation Mono", monospace;
}
```

Map existing training selectors to these variables, set the body background to `var(--navy-900)`, remove soft rounded-card treatment, and match the test header, cobalt primary button, orange focus ring, steel body copy, and square line-border states.

- [ ] **Step 5: Add exact outcome and graduation component rules**

Implement the new structures with this layout contract:

```css
.outcomes-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: 1px solid var(--line);
}
.outcome-card {
  min-height: 286px;
  padding: 26px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.outcome-card > span { color: var(--cobalt-soft); font: 10px/1 var(--mono); letter-spacing: .12em; }
.outcome-card strong { margin-top: auto; color: #aebcff; font-size: 12px; line-height: 1.65; }
.graduation-section { background: var(--paper); color: var(--ink); }
.graduation-thresholds { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.graduation-thresholds strong { font: clamp(54px, 7vw, 92px)/.85 var(--mono); }
.rubric-list { margin: 0; padding: 0; list-style: none; border: 1px solid rgba(10, 24, 42, .16); }
.rubric-list li { min-height: 56px; padding: 0 18px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(10, 24, 42, .12); }
```

At `max-width: 760px`, collapse `.outcomes-grid` and `.graduation-thresholds` to one column, remove right borders, reduce card minimum height, and preserve the existing 390px no-overflow form behavior.

- [ ] **Step 6: Add reduced-motion behavior**

```css
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

- [ ] **Step 7: Run deterministic and browser tests**

Start the existing test server in one terminal:

```bash
FDE_NETWORK_PORT=4174 python3 server/fde_network.py
```

Run:

```bash
node tests/fde-training.test.mjs
FDE_TEST_URL=http://127.0.0.1:4174/ node tests/fde-training-browser.mjs
```

Expected: both print their PASS messages with no console errors and no horizontal overflow.

- [ ] **Step 8: Commit the UI alignment slice**

```bash
git add tests/fde-training.test.mjs tests/fde-training-browser.mjs fde-training/training.css
git commit -m "feat: align FDE training with test UI system"
```

---

### Task 3: Run Full Regression and Visual Acceptance

**Files:**
- Verify: `fde-training/index.html`
- Verify: `fde-training/training.css`
- Verify: `fde-training/training.js`
- Verify: `tests/fde-training.test.mjs`
- Verify: `tests/fde-training-browser.mjs`

**Interfaces:**
- Consumes: Final static page and unchanged FDE commercial application service.
- Produces: Evidence that content, application behavior, responsive layout, accessibility basics, and existing repository tests remain healthy.

- [ ] **Step 1: Run focused tests from a clean server state**

```bash
node tests/fde-training.test.mjs
FDE_TEST_URL=http://127.0.0.1:4174/ node tests/fde-training-browser.mjs
```

Expected: deterministic and browser PASS messages.

- [ ] **Step 2: Run the complete Node test set**

```bash
for test_file in tests/*.test.mjs; do node "$test_file"; done
```

Expected: every test script exits 0.

- [ ] **Step 3: Capture desktop and mobile acceptance screenshots**

Use Playwright against `http://127.0.0.1:4174/fde-training/?source=public_test` and save:

```text
/tmp/fde-training-desktop.png
/tmp/fde-training-mobile.png
```

Inspect both images for: matching FDE test-page color/typography, readable six-outcome grid, clear 70/85 score hierarchy, no clipped Chinese text, no broken image, and a usable application form.

- [ ] **Step 4: Run static and repository hygiene checks**

```bash
git diff --check
git status --short --branch
```

Expected: no whitespace errors; only intentional work remains.

- [ ] **Step 5: Commit any acceptance-only corrections**

If visual acceptance requires a correction, update the relevant deterministic or browser assertion first, verify it fails, apply the minimum CSS/HTML correction, rerun the focused tests, then commit only those files:

```bash
git add fde-training/index.html fde-training/training.css tests/fde-training.test.mjs tests/fde-training-browser.mjs
git commit -m "fix: polish FDE training responsive presentation"
```
