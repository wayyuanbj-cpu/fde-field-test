# FDE Bilingual Mirror and GEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship a native-English mirror of the complete FDE challenge and make both language versions technically discoverable, semantically understandable, and citation-ready for search engines and AI answer systems.

**Architecture:** Keep scoring, progression, persistence, analytics, and browser state in shared language-neutral modules. Select a frozen locale bundle from the document language, serve a separate `/en/` HTML surface and bilingual guide pages, and expose canonical text, metadata, crawler policy, sitemap, and supplemental `llms.txt` from exact static routes. Extend the existing anonymous analytics schema with normalized locale and acquisition-source buckets without storing full referrers or queries.

**Tech Stack:** Static HTML/CSS, native ES modules, Canvas 2D, Node.js `assert`, Playwright, Python 3 standard library/SQLite/WSGI, Nginx, systemd, IndexNow.

## Global Constraints

- Chinese routes remain `/` and `/fde-guide/`; English routes are `/en/` and `/en/fde-guide/`.
- The English version mirrors all 12/100/60/40 questions and the same strict sequential progression rules.
- English copy is native editorial English, not literal machine translation.
- Question IDs, types, modules, option counts, answer indices, and scoring behavior must remain identical across locales.
- Chinese primary CTA is `测测你的 FDE 灵根`; English primary CTA is `Test Your FDE Instincts`.
- The private analytics dashboard stays Chinese-only.
- Public results never claim formal graduation, certification, or proven real-project capability.
- No names, answers, raw IPs, full User-Agents, full referrers, or search queries enter analytics.
- Public search crawlers are allowed; `/api/` and `/stats/` are excluded; training-oriented crawler access is denied by default.
- GEO work may improve eligibility for grounding and citation but must never claim guaranteed indexing, ranking, recommendation, or citation.
- Public HTML is the source of truth; JSON-LD and `llms.txt` must agree with visible content.

---

### Task 1: Locale contract and parity test harness

**Files:**
- Create: `locales/index.js`
- Create: `locales/zh-CN.js`
- Create: `locales/en-US.js`
- Modify: `assessment-levels.js`
- Modify: `scoring.js`
- Modify: `exam-scoring.js`
- Create: `tests/fde-localization-parity.test.mjs`

**Interfaces:**
- Produces: `SUPPORTED_LOCALES`, `normalizeLocale(value)`, `bundleFor(locale)`, `activeLocale`, `activeBundle`.
- `activeBundle` shape: `{ locale, htmlLang, ui, quick, levels, questionBanks, quickShare, examShare }`.
- `scoreAssessment(answers, questionBank, content)` consumes `content.dimensionMeta`, `content.levels`, `content.adviceByDimension`, and `content.copy`.
- `buildExam(level, mode, random, bundle = activeBundle)` and `getQuestionBank(level, bundle = activeBundle)` keep existing defaults for Chinese tests.

- [x] **Step 1: Write failing locale-contract tests**

Add assertions that import both bundles and require identical assessment contracts:

```js
const expected = { quick: 12, junior: 100, intermediate: 60, advanced: 40 };
assert.equal(zh.quick.questions.length, expected.quick);
assert.equal(en.quick.questions.length, expected.quick);
for (const level of ["junior", "intermediate", "advanced"]) {
  assert.equal(zh.questionBanks[level].length, expected[level]);
  assert.equal(en.questionBanks[level].length, expected[level]);
  assert.deepEqual(
    en.questionBanks[level].map(({ id, type, module, answer, options }) => ({ id, type, module, answer, optionCount: options.length })),
    zh.questionBanks[level].map(({ id, type, module, answer, options }) => ({ id, type, module, answer, optionCount: options.length })),
  );
}
assert.equal(normalizeLocale("en"), "en-US");
assert.equal(normalizeLocale("zh-CN"), "zh-CN");
assert.equal(normalizeLocale("fr"), "zh-CN");
```

- [x] **Step 2: Run the locale test and verify RED**

Run: `node tests/fde-localization-parity.test.mjs`

Expected: FAIL because `locales/index.js` and the English bundle do not exist.

- [x] **Step 3: Add the locale selector and frozen bundle shape**

Implement deterministic selection without cookies:

```js
export const SUPPORTED_LOCALES = Object.freeze(["zh-CN", "en-US"]);
export function normalizeLocale(value) {
  return String(value ?? "").toLowerCase().startsWith("en") ? "en-US" : "zh-CN";
}
export const activeLocale = normalizeLocale(globalThis.document?.documentElement?.lang);
export function bundleFor(locale) {
  return normalizeLocale(locale) === "en-US" ? enUS : zhCN;
}
export const activeBundle = bundleFor(activeLocale);
```

- [x] **Step 4: Make quick scoring accept localized content**

Retain the scoring algorithm and move verdict/advice strings behind `content`:

```js
export function scoreAssessment(answers, questionBank, content) {
  const { dimensionMeta, levels, adviceByDimension, copy } = content;
  // Existing earned/max calculation remains unchanged.
  const level = [...levels].reverse().find((entry) => index >= entry.min);
  return {
    index, level, dimensions, strongest, weakest, flags, signals,
    exposure: copy.exposure({ dimensions, weakest, flags, adviceByDimension }),
    hasMaterialGap: ordered.at(-1)[1] < 80,
    strength: copy.strength(dimensionMeta[strongest].label, dimensions[strongest]),
    training: adviceByDimension[weakest],
    verified: false,
    evidenceLabel: copy.evidenceLabel,
  };
}
```

- [x] **Step 5: Make exam bank selection locale-aware**

Replace static bank imports in `exam-scoring.js` with `bundle.questionBanks`, while leaving `scoreQuestion()` and `scoreExam()` language-neutral. Unknown levels and modes still throw.

- [x] **Step 6: Run existing Chinese tests and new contract tests**

Run:

```bash
node tests/fde-exam-engine.test.mjs
node tests/fde-progression.test.mjs
node tests/fde-localization-parity.test.mjs
```

Expected: all scripts print their pass messages and exit 0.

- [x] **Step 7: Commit**

```bash
git add locales assessment-levels.js scoring.js exam-scoring.js tests/fde-localization-parity.test.mjs
git commit -m "Add bilingual assessment locale contract"
```

### Task 2: Native-English content and editorial QA

**Files:**
- Create: `locales/en-US/quick-question-data.js`
- Create: `locales/en-US/junior-question-data.js`
- Create: `locales/en-US/intermediate-question-data.js`
- Create: `locales/en-US/advanced-question-data.js`
- Create: `docs/localization/en-US/01-analysis.md`
- Create: `docs/localization/en-US/02-translation-prompt.md`
- Create: `docs/localization/en-US/03-draft-review.md`
- Create: `docs/localization/en-US/04-final-editorial-notes.md`
- Modify: `locales/en-US.js`
- Modify: `tests/fde-localization-parity.test.mjs`

**Interfaces:**
- English quick questions preserve `{ id, dimension, options[].score }` and localize `{ scenario, prompt, options[].text, options[].signal }`.
- English level questions preserve `{ id, level, module, type, answer }` and localize `{ context, prompt, options, explanation }`.
- English terminology uses `Field Deployment Engineer`, `enterprise AI delivery`, `full challenge`, `random practice`, `advance`, and `module floor` consistently.

- [x] **Step 1: Add failing editorial-quality checks**

Require all English fields to be present, free of CJK user-facing copy, and free of common literal-translation artifacts:

```js
const visibleEnglish = JSON.stringify({
  ui: en.ui,
  quick: en.quick,
  levels: en.levels,
  questionBanks: en.questionBanks,
});
assert.doesNotMatch(visibleEnglish, /[\u3400-\u9fff]/u);
assert.doesNotMatch(visibleEnglish, /carry out landing|empowerment|closed loop thinking|calibration your ability/i);
for (const question of Object.values(en.questionBanks).flat()) {
  assert.ok(question.prompt.trim());
  assert.ok(question.explanation.trim());
  assert.ok(question.options.every((option) => option.trim()));
}
```

- [x] **Step 2: Run the editorial test and verify RED**

Run: `node tests/fde-localization-parity.test.mjs`

Expected: FAIL on missing English content.

- [x] **Step 3: Produce the refined translation artifacts**

Follow `.baoyu-skills/baoyu-translate/EXTEND.md` and record: content/risk analysis, terminology and voice prompt, draft criticism, and final editorial decisions. Explicitly preserve distractor intent and enterprise-risk nuance; do not translate `灵根` literally.

- [x] **Step 4: Author the 12-question native-English quick test**

Use `Could You Actually Ship as an FDE?`, `Knowing the tools is not the same as owning the outcome.`, and `Test Your FDE Instincts` as fixed editorial anchors. Preserve all quick-test scoring values exactly.

- [x] **Step 5: Author the 100/60/40 English level banks**

Translate each scenario as a globally credible enterprise AI delivery situation. Keep product names generic unless technically necessary, use concise answer options, and explain why the reference action is safer or more deliverable without disclosing hidden scoring logic beyond the existing Chinese review experience.

- [x] **Step 6: Run structural and editorial QA**

Run:

```bash
node tests/fde-localization-parity.test.mjs
rg -n "[\p{Han}]" locales/en-US --glob '*.js'
```

Expected: parity test passes; `rg` returns no user-facing Chinese strings.

- [x] **Step 7: Commit**

```bash
git add locales/en-US locales/en-US.js docs/localization/en-US tests/fde-localization-parity.test.mjs
git commit -m "Author native English FDE assessment content"
```

### Task 3: English mirror UI, shared interactions, and share cards

**Files:**
- Create: `en/index.html`
- Create: `locale-handoff.js`
- Modify: `index.html`
- Modify: `app.js`
- Modify: `exam-app.js`
- Modify: `share-card.js`
- Modify: `exam-share-card.js`
- Modify: `styles.css`
- Modify: `exam.css`
- Create: `tests/fde-english-browser.mjs`

**Interfaces:**
- Both HTML pages use identical IDs and `data-action`/`data-exam-action` hooks.
- `writeLocaleHandoff(sessionStorage, payload)` and `readLocaleHandoff(sessionStorage)` transfer quick-test state exactly once.
- Existing exam state and progression keys remain unchanged so IDs restore across routes.
- Share-card functions accept localized copy through `activeBundle.quickShare` and `activeBundle.examShare`.

- [x] **Step 1: Write failing mirror browser assertions**

At 390×844 and desktop, require:

```js
await page.goto(`${base}/en/`);
await expectText(page, "h1", "Could You Actually Ship as an FDE?");
assert.equal(await page.locator("[data-action='start']").innerText(), "Test Your FDE Instincts\n12 QUESTIONS · ABOUT 8 MIN");
assert.equal(await page.locator("html").getAttribute("lang"), "en");
assert.equal(await page.locator("a[data-locale-switch]").getAttribute("href"), "../");
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
```

The test must also answer two quick questions, switch language, and require the same question ID/position and selected answers after reload.

- [x] **Step 2: Run the mirror test and verify RED**

Run: `FDE_TEST_URL=http://127.0.0.1:4173 NODE_PATH=/Users/yuanwei/.npm/_npx/e41f203b7505f1fb/node_modules node tests/fde-english-browser.mjs`

Expected: FAIL because `/en/` does not exist.

- [x] **Step 3: Build the English document with route-correct assets**

Copy the semantic structure and hooks of `index.html`, rewrite every visible string in native English, load `../styles.css`, `../exam.css`, and `../app.js`, and expose a real `中文` link. Update Chinese CTA to `测测你的 FDE 灵根` with `12 题 · 约 8 分钟`, and add a real `EN` link.

- [x] **Step 4: Localize JS-rendered UI without forking rules**

Replace inline Chinese result, error, progress, mode, qualification, review, filename, and share-status strings with keys/functions from `activeBundle.ui`. Keep event handlers, progression decisions, and scoring branches shared.

- [x] **Step 5: Preserve quick-test state during language switching**

Store only the handoff payload in session storage:

```js
{
  version: 1,
  view: "quiz-view",
  current: 2,
  answers: { q01: 2, q02: 1 },
  createdAt: 1784190000000
}
```

Read and delete it on the destination page. Reject invalid versions, question IDs, answer indices, or payloads older than five minutes. Full exams continue to restore through their existing ID-based local state.

- [x] **Step 6: Localize Canvas output**

Pass English font stacks and copy to both share-card modules. Test quick, level, and final cards for non-empty pixels and long-English fit; keep the same privacy and non-certification statements.

- [x] **Step 7: Run mirror and regression tests**

Run:

```bash
node tests/fde-localization-parity.test.mjs
node tests/fde-regression.test.mjs
FDE_TEST_URL=http://127.0.0.1:4173 NODE_PATH=/Users/yuanwei/.npm/_npx/e41f203b7505f1fb/node_modules node tests/fde-english-browser.mjs
```

Expected: all pass, with no page errors or mobile overflow.

- [x] **Step 8: Commit**

```bash
git add en index.html locale-handoff.js app.js exam-app.js share-card.js exam-share-card.js styles.css exam.css tests/fde-english-browser.mjs
git commit -m "Build complete English FDE mirror"
```

### Task 4: Bilingual FDE authority pages and search metadata

**Files:**
- Create: `fde-guide/index.html`
- Create: `en/fde-guide/index.html`
- Create: `guide.css`
- Create: `assets/og-fde-zh.png`
- Create: `assets/og-fde-en.png`
- Modify: `index.html`
- Modify: `en/index.html`
- Create: `tests/fde-seo-geo.test.mjs`

**Interfaces:**
- Guide pages publish equivalent native-language sections with stable fragment IDs: `definition`, `responsibilities`, `capability-model`, `role-comparison`, `assessment-method`, `boundaries`.
- Public pages expose localized title, description, canonical, reciprocal `hreflang`, Open Graph, Twitter Card, `WebSite`, and `Organization` JSON-LD.
- Guide pages additionally expose visible author/publisher, reviewed date, version, and matching `Article` JSON-LD.

- [x] **Step 1: Write failing SEO/GEO document tests**

For all four canonical pages require one H1, canonical URL, `zh-CN`/`en`/`x-default` alternates, non-empty description, OG image at 1200×630, valid JSON-LD, and visible OneX copyright/boundary copy. Require the guide fragment IDs and a role-comparison table.

- [x] **Step 2: Run the SEO/GEO test and verify RED**

Run: `node tests/fde-seo-geo.test.mjs`

Expected: FAIL on missing guide pages and metadata.

- [x] **Step 3: Author the Chinese FDE reference page**

Define FDE as the role that connects enterprise problems, AI capability, operational constraints, and accountable delivery outcomes. Explain the OneX five-part capability model, role boundaries, assessment mechanics, and public-challenge limitation in concise answer-first sections.

- [x] **Step 4: Author the English FDE reference page independently**

Use native English rather than sentence-level translation. Preserve methodology and boundaries, use `Field Deployment Engineer (FDE)` on first mention, and make comparison headings answerable without surrounding context.

- [x] **Step 5: Add localized metadata and honest structured data**

Use the approved title directions, canonical URLs, visible publisher identity, and JSON-LD properties that exactly match the page. Do not add reviews, ratings, certificates, or unsupported FAQ rich-result claims.

- [x] **Step 6: Render bilingual social cards**

Produce real 1200×630 PNGs using the existing FDE logo and visual system. Verify dimensions with `sips -g pixelWidth -g pixelHeight assets/og-fde-*.png` and inspect both images for clipping.

- [x] **Step 7: Run tests and commit**

```bash
node tests/fde-seo-geo.test.mjs
git add fde-guide en/fde-guide guide.css assets index.html en/index.html tests/fde-seo-geo.test.mjs
git commit -m "Publish bilingual FDE authority pages"
```

### Task 5: GEO crawler policy, sitemap, llms index, and exact Nginx routes

**Files:**
- Create: `robots.txt`
- Create: `sitemap.xml`
- Create: `llms.txt`
- Create: `<INDEXNOW_KEY>.txt`
- Modify: `deploy/fde.onex.plus.nginx.conf`
- Modify: `deploy/fde.onex.plus.acme.nginx.conf`
- Modify: `tests/fde-seo-geo.test.mjs`

**Interfaces:**
- Search retrieval bots: `Googlebot`, `bingbot`, `OAI-SearchBot`, `PerplexityBot`, `Claude-SearchBot`, `Claude-User`.
- Training/model-use controls denied by default: `GPTBot`, `ClaudeBot`, `Google-Extended`.
- Sitemap contains only `/`, `/en/`, `/fde-guide/`, `/en/fde-guide/`, with language alternates and real `lastmod`.
- `llms.txt` links only to canonical public pages and states the public-assessment boundary.

- [x] **Step 1: Extend RED tests for crawler groups and exact assets**

Parse robots groups and require every search bot to allow public content while excluding `/api/` and `/stats/`. Require training groups to `Disallow: /`. Assert sitemap and `llms.txt` contain no `/stats/`, `/api/`, answer keys, or certification claims.

- [x] **Step 2: Write the public crawler files**

Use explicit groups such as:

```text
User-agent: OAI-SearchBot
Allow: /
Disallow: /api/
Disallow: /stats/

User-agent: GPTBot
Disallow: /
```

Repeat complete rules for each specific bot because specific groups do not inherit the wildcard group.

- [x] **Step 3: Generate and publish the IndexNow key**

Run `openssl rand -hex 16`, save the exact value as the filename and file content, and keep it public at the root. Never reuse a credential or analytics secret.

- [x] **Step 4: Add exact Nginx SEO routes**

Serve `/robots.txt` and `/llms.txt` as `text/plain`, `/sitemap.xml` as `application/xml`, and the IndexNow key as `text/plain`. Every exact route uses `try_files $uri =404`; missing SEO assets must never fall through to `index.html`.

- [x] **Step 5: Validate files and Nginx configuration**

Run:

```bash
node tests/fde-seo-geo.test.mjs
bash -n deploy/install-or-update.sh
rg -n "location = /(robots.txt|sitemap.xml|llms.txt)" deploy/fde.onex.plus.nginx.conf
```

Expected: tests pass and all three exact locations exist.

- [x] **Step 6: Commit**

```bash
git add robots.txt sitemap.xml llms.txt *.txt deploy tests/fde-seo-geo.test.mjs
git commit -m "Configure GEO crawler discovery"
```

### Task 6: Locale and AI-referral analytics

**Files:**
- Modify: `analytics.js`
- Modify: `backend/fde_analytics/db.py`
- Modify: `backend/tests/test_analytics_db.py`
- Modify: `backend/tests/test_api.py`
- Modify: `stats/index.html`
- Modify: `stats/stats.js`
- Modify: `stats/stats.css`
- Modify: `tests/fde-analytics-client.test.mjs`
- Modify: `tests/fde-stats-browser.mjs`

**Interfaces:**
- Client emits `locale: "zh-CN" | "en"` and normalized source only.
- New source buckets: `chatgpt`, `perplexity`, `copilot`, `claude`, `gemini`; preserve existing `wechat`, `x`, `search`, `direct`, and `other` acquisition categories.
- Dashboard response adds `locales` and `ai_sources`; existing response keys remain compatible.

- [x] **Step 1: Write failing client source-classification tests**

Cover approved UTM values and referrer hosts:

```js
assert.equal(sourceOf(env("https://chatgpt.com/c/abc")), "chatgpt");
assert.equal(sourceOf(env("https://www.perplexity.ai/search/abc")), "perplexity");
assert.equal(sourceOf(env("https://copilot.microsoft.com/")), "copilot");
assert.equal(sourceOf(env("https://claude.ai/")), "claude");
assert.equal(sourceOf(env("https://gemini.google.com/")), "gemini");
assert.equal(payload.locale, "en");
assert.equal("referrer" in payload, false);
```

- [x] **Step 2: Write failing database migration and aggregate tests**

Initialize a legacy `events` table without `locale`, run `initialize()`, and require the new column to exist. Record English ChatGPT and Chinese direct events and require:

```python
self.assertEqual(result["locales"], [
    {"label": "en", "value": 1},
    {"label": "zh-CN", "value": 1},
])
self.assertEqual(result["ai_sources"], [{"label": "chatgpt", "value": 1}])
```

- [x] **Step 3: Implement strict client normalization**

Export `sourceOf()` for unit tests. Match only known UTM aliases and hostnames, return normalized buckets, derive locale from `<html lang>`, and never send full referrer or query data.

- [x] **Step 4: Migrate and validate the SQLite schema**

Add `locale TEXT` safely to existing databases using `PRAGMA table_info(events)` before `ALTER TABLE`. Add `locale` to allowed event keys and values, write it into raw events, and aggregate it through `daily_dimensions`.

- [x] **Step 5: Add dashboard AI and language panels**

Keep the admin UI Chinese. Render `AI 引用流量` and `中英文版本` panels from `ai_sources` and `locales`, including empty states and the existing date range behavior.

- [x] **Step 6: Run frontend, backend, and browser tests**

Run:

```bash
node tests/fde-analytics-client.test.mjs
PYTHONPATH=backend python3 -m unittest discover -s backend/tests -v
NODE_PATH=/Users/yuanwei/.npm/_npx/e41f203b7505f1fb/node_modules node tests/fde-stats-browser.mjs
```

Expected: all pass; mocked event payloads contain locale/source buckets but no full referrer, query, answers, or name.

- [x] **Step 7: Commit**

```bash
git add analytics.js backend stats tests
git commit -m "Measure bilingual and AI referral traffic"
```

### Task 7: Full local verification and release documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-16-fde-bilingual-geo.md`

**Interfaces:**
- No new runtime interface; this task verifies the integrated release candidate.

- [x] **Step 1: Run every deterministic test**

Run:

```bash
for test in tests/*.test.mjs; do node "$test"; done
PYTHONPATH=backend python3 -m unittest discover -s backend/tests -v
bash -n deploy/install-or-update.sh
git diff --check
```

Expected: all tests exit 0 and `git diff --check` prints nothing.

- [x] **Step 2: Run all browser flows against localhost**

Start `python3 -m http.server 4173`, then run progression, English mirror, and stats browser scripts. Verify no console/page errors and no horizontal overflow at 390×844.

- [x] **Step 3: Inspect key screenshots**

Capture and inspect Chinese/English landing pages, both guide pages, an English multi-select question, English final share card, and Chinese stats AI panel at desktop and mobile widths.

- [x] **Step 4: Audit search-facing content**

Confirm no hidden text, AI-directed prompt injection, fake endorsement, formal-certification claim, answer key, or private URL appears in public pages, JSON-LD, robots, sitemap, or `llms.txt`.

- [x] **Step 5: Update README**

Document bilingual routes, native-English parity, guide routes, crawler/training policy, SEO assets, anonymous locale/AI source measurement, and webmaster-account steps that remain manual.

- [x] **Step 6: Mark completed plan boxes and commit**

```bash
git add README.md docs/superpowers/plans/2026-07-16-fde-bilingual-geo.md
git commit -m "Document bilingual GEO release"
```

### Task 8: GitHub push, Aliyun deployment, and live GEO acceptance

**Files:**
- No source changes expected unless live verification finds a defect.

**Interfaces:**
- Production: `https://fde.onex.plus/`, `/en/`, `/fde-guide/`, `/en/fde-guide/`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/stats/`.

- [ ] **Step 1: Push the verified commit chain**

Run: `git push origin main`

Expected: GitHub `main` advances to the locally verified HEAD.

- [ ] **Step 2: Deploy from GitHub main to Aliyun**

Run:

```bash
ssh -o BatchMode=yes -i /Users/yuanwei/.ssh/51tokens_deploy root@123.56.153.120 'bash /opt/fde-field-test/deploy/install-or-update.sh'
```

Expected: deploy script completes, Nginx reloads, analytics health passes, and Xray SNI routing remains intact.

- [ ] **Step 3: Verify live HTTP and content types**

Use `curl --fail --silent --show-error --head` and GET checks to require `200` for all public routes, `text/plain` for robots/llms/IndexNow key, XML for sitemap, HTML for pages, and `X-Robots-Tag: noindex, nofollow` on `/stats/`.

- [ ] **Step 4: Verify crawler behavior**

Fetch public guide pages using each approved search User-Agent and require readable text. Confirm `/api/` and `/stats/` remain excluded/private and training groups are disallowed by the production robots response.

- [ ] **Step 5: Submit IndexNow update notification**

POST the four canonical URLs and public key location to `https://api.indexnow.org/indexnow`; require a successful accepted/OK response and record the timestamp without storing credentials.

- [ ] **Step 6: Run live browser acceptance**

Verify Chinese CTA, English mirror, language-state handoff, both guides, share cards, anonymous event ingestion, private Chinese stats login, AI-source panel, 390 px layout, and zero console errors.

- [ ] **Step 7: Record manual ownership follow-ups**

Prepare the exact Google Search Console and Bing Webmaster Tools sitemap/inspection steps. Account-side ownership and submission remain pending until the user is authenticated in those consoles; do not claim completion before that action occurs.

- [ ] **Step 8: Report release truthfully**

Deliver the production links, deployed Git commit, verification summary, crawler policy, and remaining webmaster-account step. State clearly that GEO makes the site eligible and citation-ready but does not guarantee recommendation.
