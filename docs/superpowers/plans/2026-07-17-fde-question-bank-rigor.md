# FDE Question Bank Rigor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Chinese and English 12/100/60/40 FDE public assessments so answer wording no longer reveals the best choice, critical-boundary mistakes block progression, and production behavior is verified end to end.

**Architecture:** Keep the current static ES-module site and existing locale bundle boundary. Add pure rigor-analysis helpers for deterministic content checks, extend the question and scoring contracts with `critical`, then replace each localized bank while preserving stable IDs and module counts. The browser UI consumes the enriched score without receiving any new backend dependency.

**Tech Stack:** Native JavaScript ES modules, Node.js `assert`, Playwright browser scripts, static HTML/CSS, Python analytics backend unchanged, GitHub main-to-Aliyun deployment.

## Global Constraints

- Preserve the public-test boundary: this is not formal graduation or certification.
- Preserve 12 quick, 100 junior, 60 intermediate, and 40 advanced questions in both locales.
- Preserve pass score 70, qualification score 85, and module floor 70.
- Junior types: 60 single, 30 multiple, 10 judgment with five true and five false answers.
- Intermediate types: 48 single and 12 multiple; advanced types: 30 single and 10 multiple.
- Critical counts: junior 10, intermediate 8, advanced 6; every critical item must be correct to qualify.
- Non-judgment questions have four options; multi-select remains exact match with no partial credit.
- Within a bank, correct-to-distractor average option length ratio must be 0.90–1.10; a correct single answer may be uniquely longest in at most 35% of questions.
- Each four-choice single-answer position must hold 20%–30% of the bank's single answers.
- Chinese and English preserve identical IDs, modules, types, answer indexes, critical flags, and option counts while using native copy.
- Do not upload answers, review items, names, or full referrers.
- Do not change the visual direction, GEO information architecture, analytics accounts, or public registration boundary.

---

### Task 1: Add failing rigor and critical-gate tests

**Files:**
- Create: `question-rigor.js`
- Create: `tests/fde-question-rigor.test.mjs`
- Modify: `tests/fde-exam-engine.test.mjs`
- Modify: `tests/fde-progression.test.mjs`
- Modify: `tests/fde-localization-parity.test.mjs`

**Interfaces:**
- Consumes: `bundleFor(locale)`, `scoreExam(questions, answers)`, `evaluateQualification(mode, result)`.
- Produces: `analyzeBank(questions, locale)`, `validateRigorContract(bundle, locale)`, and failing assertions for the approved targets.

- [ ] **Step 1: Write the pure analyzer contract and failing tests**

`question-rigor.js` must export:

```js
export function optionLength(copy, locale) {
  if (locale === "en-US") return String(copy).trim().split(/\s+/u).filter(Boolean).length;
  return [...String(copy).replace(/[\s，。、“”‘’：；,.!?()（）/+-]/gu, "")].length;
}

export function analyzeBank(questions, locale) {
  // Return counts, singleAnswerPositions, criticalCount,
  // uniqueLongestCorrectRate, correctDistractorLengthRatio,
  // maxWithinQuestionLengthRatio, and bannedCueMatches.
}

export function validateRigorContract(bundle, locale) {
  // Throw one descriptive Error per violated approved threshold and return true otherwise.
}
```

`tests/fde-question-rigor.test.mjs` must assert exact counts/types/critical totals, four-option rules, balanced answer positions, judgment balance, maximum 1.6 within-question length ratio, 0.90–1.10 bank ratio, at most 35% unique-longest correct answers, and absence of the approved Chinese/English caricature phrases.

- [ ] **Step 2: Run the new test and verify RED**

Run: `node tests/fde-question-rigor.test.mjs`

Expected: FAIL against the current bank, including the known signal that junior correct answers are uniquely longest in nearly all single-answer items and critical counts are zero.

- [ ] **Step 3: Add critical-score and qualification assertions**

Add fixtures that prove the desired behavior:

```js
const criticalQuestion = {
  id: "C1", module: "safety", type: "single", critical: true,
  options: ["A", "B", "C", "D"], answer: [1],
};
const criticalResult = scoreExam([criticalQuestion], { C1: [0] });
assert.equal(criticalResult.criticalMisses, 1);
assert.equal(evaluateQualification("full", {
  score: 100, unanswered: 0, moduleScores: { safety: 100 }, criticalMisses: 1,
}).reason, "critical");
```

Update localization parity to compare `critical` across locales.

- [ ] **Step 4: Run focused tests and verify RED for missing behavior**

Run: `node tests/fde-exam-engine.test.mjs && node tests/fde-progression.test.mjs && node tests/fde-localization-parity.test.mjs`

Expected: FAIL because question objects and score results do not yet expose `critical` data and qualification does not inspect it.

- [ ] **Step 5: Commit the red tests**

Run:

```bash
git add question-rigor.js tests/fde-question-rigor.test.mjs tests/fde-exam-engine.test.mjs tests/fde-progression.test.mjs tests/fde-localization-parity.test.mjs
git commit -m "test: define rigorous FDE assessment contract"
```

### Task 2: Implement the critical question contract and state migration

**Files:**
- Modify: `question-schema.js`
- Modify: `exam-scoring.js`
- Modify: `exam-progression.js`
- Modify: `exam-state.js`
- Modify: `locales/zh-CN-ui.js`
- Modify: `locales/en-US/ui.js`
- Modify: `exam-app.js`

**Interfaces:**
- Consumes: question objects with optional `critical`.
- Produces: frozen boolean `critical`, `criticalTotal`, `criticalCorrect`, `criticalMisses`, qualification reason `critical`, progression version 2, and localized failure copy.

- [ ] **Step 1: Extend and validate the question schema**

`createQuestion()` must normalize `critical = false` and `validateQuestionBank()` must reject non-boolean values:

```js
if (typeof question.critical !== "boolean") throw new Error(`关键题标记错误：${question.id}`);
```

- [ ] **Step 2: Add critical counters to scoring**

Inside `scoreExam()`, count critical questions and misses from real per-question scores. Return all three counters without changing the numeric score or exact-match behavior.

- [ ] **Step 3: Enforce the critical gate after score and module gates**

`evaluateQualification()` must return `{ qualifies: false, reason: "critical", criticalMisses, lowestModuleScore }` when `criticalMisses > 0`; qualified progression records must persist `criticalMisses: 0` and record validation must require a finite non-negative value.

- [ ] **Step 4: Version stored state**

Set `PROGRESSION_VERSION = 2` and `STATE_VERSION = 2`. Existing qualified version-1 progression is not read as version-2 evidence, and changed question content cannot resume a version-1 answer sequence.

- [ ] **Step 5: Render localized critical failure status**

Add Chinese copy `关键边界未通过` / `你有 {count} 道关键题答错。即使总分达线，本次也不能晋级。` and equivalent native English copy. `renderResult()` must use it for reason `critical` and keep the retry action.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `node tests/fde-exam-engine.test.mjs && node tests/fde-progression.test.mjs && node tests/fde-localization-parity.test.mjs`

Expected: PASS while `node tests/fde-question-rigor.test.mjs` still fails only on content targets.

- [ ] **Step 7: Commit**

```bash
git add question-schema.js exam-scoring.js exam-progression.js exam-state.js exam-app.js locales/zh-CN-ui.js locales/en-US/ui.js tests
git commit -m "feat: block FDE progression on critical misses"
```

### Task 3: Rewrite the 12-question potential assessment in both locales

**Files:**
- Modify: `question-data.js`
- Modify: `locales/en-US/quick-question-data.js`

**Interfaces:**
- Consumes: existing `{ id, dimension, scenario, prompt, options[] }` quick-question contract.
- Produces: 12 four-option scenarios with score ladder 1/2/3/4, matched option ordering and native bilingual copy.

- [ ] **Step 1: Rewrite Chinese quick scenarios**

For every question, make all four actions operationally plausible. The score-4 action must win on one decisive constraint, while score-3 is a credible near miss. Keep IDs, dimensions, and score positions aligned with English.

- [ ] **Step 2: Write the native English counterparts**

Preserve the same behavior distinction rather than sentence structure. Keep Chinese names and organization-neutral enterprise contexts.

- [ ] **Step 3: Run rigor and parity tests**

Run: `node tests/fde-question-rigor.test.mjs && node tests/fde-localization-parity.test.mjs`

Expected: quick-bank metrics pass; level-bank metrics remain the only failures until Tasks 4–6.

- [ ] **Step 4: Commit**

```bash
git add question-data.js locales/en-US/quick-question-data.js
git commit -m "content: remove cues from FDE potential test"
```

### Task 4: Rewrite the 100-question junior bank in both locales

**Files:**
- Modify: `professional-question-data.js`
- Modify: `locales/en-US/junior-question-data.js`

**Interfaces:**
- Consumes: `createQuestion()` and the five 20-question junior modules.
- Produces: stable IDs J001–J100, 60 single/30 multiple/10 judgment, 10 critical questions, balanced answer indexes, and native bilingual explanations.

- [ ] **Step 1: Author the Chinese junior bank module by module**

Use enterprise-context questions for AI foundations, task decomposition, RAG/Agent, scenario design, and delivery governance. Mark exactly two critical questions per module where a real permission, evidence, commitment, or incident boundary exists. Every explanation must name the decisive constraint and the strongest distractor's missing condition.

- [ ] **Step 2: Balance structure mechanically**

Assign single-answer indexes as 15 A, 15 B, 15 C, and 15 D. Assign five judgment answers to each side. Use mostly two-answer multiple items; use three only when the explanation justifies a complete control set.

- [ ] **Step 3: Author the English junior bank**

Keep IDs, structure, answers, and critical flags exact while writing natural enterprise English. Do not translate Chinese idioms or use literal phrases such as “closed-loop thinking.”

- [ ] **Step 4: Run rigor, parity, and regression tests**

Run: `node tests/fde-question-rigor.test.mjs && node tests/fde-localization-parity.test.mjs && node tests/fde-regression.test.mjs`

Expected: junior and quick targets pass; intermediate and advanced remain the only rigor failures.

- [ ] **Step 5: Commit**

```bash
git add professional-question-data.js locales/en-US/junior-question-data.js
git commit -m "content: rebuild junior FDE assessment"
```

### Task 5: Rewrite the 60-question intermediate bank in both locales

**Files:**
- Modify: `intermediate-question-data.js`
- Modify: `locales/en-US/intermediate-question-data.js`

**Interfaces:**
- Consumes: six 10-question intermediate modules.
- Produces: stable IDs I001–I060, 48 single/12 multiple, 8 critical questions, balanced answer indexes, and constraint-led explanations.

- [ ] **Step 1: Author Chinese scenarios with explicit project constraints**

Every context must include at least one concrete constraint from authority, data, systems, time, adoption, or commercial scope. At least two options must be reasonable outside the decisive constraint. Distribute critical items 2/1/1/1/1/2 across diagnosis, priority, architecture, knowledge, delivery, and customer-success modules.

- [ ] **Step 2: Balance answer positions**

Assign the 48 single answers exactly 12 times to each A/B/C/D position. Use two-answer multi-select items unless a three-control set is indivisible.

- [ ] **Step 3: Author native English scenarios and explanations**

Preserve the same decisive constraint and strongest near miss in both languages.

- [ ] **Step 4: Run focused tests**

Run: `node tests/fde-question-rigor.test.mjs && node tests/fde-localization-parity.test.mjs && node tests/fde-regression.test.mjs`

Expected: quick, junior, and intermediate targets pass; advanced remains the only rigor failure.

- [ ] **Step 5: Commit**

```bash
git add intermediate-question-data.js locales/en-US/intermediate-question-data.js
git commit -m "content: rebuild intermediate FDE assessment"
```

### Task 6: Rewrite the 40-question advanced bank in both locales

**Files:**
- Modify: `advanced-question-data.js`
- Modify: `locales/en-US/advanced-question-data.js`

**Interfaces:**
- Consumes: current 7/7/7/7/6/6 module distribution.
- Produces: stable IDs A001–A040, 30 single/10 multiple, 6 critical questions, near-even single answer positions, and trade-off explanations.

- [ ] **Step 1: Author Chinese multi-constraint decisions**

Every question must combine at least two of goal conflict, incomplete information, cross-functional ownership, commercial pressure, continuity, or long-term operating cost. Mark one critical question per module. Correct answers must make a viable trade-off rather than simply choose the safest wording.

- [ ] **Step 2: Balance answer positions**

Distribute 30 single answers as 8/8/7/7 across A/B/C/D. Ensure all four proportions stay between 20% and 30%.

- [ ] **Step 3: Author native English counterparts**

Keep the same trade-off and avoid making English distractors shorter or more absolute than the best option.

- [ ] **Step 4: Run all deterministic frontend tests**

Run: `for test in tests/*.test.mjs; do node "$test"; done`

Expected: every deterministic frontend test exits 0 and the rigor analyzer prints all bilingual banks as compliant.

- [ ] **Step 5: Commit**

```bash
git add advanced-question-data.js locales/en-US/advanced-question-data.js
git commit -m "content: rebuild advanced FDE assessment"
```

### Task 7: Add browser coverage for critical failure and bilingual UX

**Files:**
- Modify: `tests/fde-progression-browser.mjs`
- Modify: `tests/fde-english-browser.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: the public static page and question bundles in a browser.
- Produces: verified critical-gate result rendering, locked progression, native English copy, and mobile overflow checks.

- [ ] **Step 1: Add a browser test that misses one critical answer**

Seed all correct answers except one `critical` question, compensate with a non-critical answer set so score and modules remain above thresholds, submit, and assert the localized critical status, retry action, and locked next level.

- [ ] **Step 2: Keep the all-correct qualification path**

Run the existing junior → intermediate → advanced browser flow and verify critical counts do not break a valid path.

- [ ] **Step 3: Document the stricter public challenge**

Update README assessment bullets with critical zero tolerance, new type mix, state-version reset, and the distinction between static rigor checks and the later 20-person blind calibration.

- [ ] **Step 4: Run local server and browser suite**

Run:

```bash
python3 -m http.server 4173
FDE_TEST_URL=http://127.0.0.1:4173/ NODE_PATH=/Users/yuanwei/.npm/_npx/e41f203b7505f1fb/node_modules node tests/fde-progression-browser.mjs
FDE_TEST_URL=http://127.0.0.1:4173/ NODE_PATH=/Users/yuanwei/.npm/_npx/e41f203b7505f1fb/node_modules node tests/fde-english-browser.mjs
```

Expected: both scripts pass, console/page error arrays are empty, and 390px pages have no horizontal overflow.

- [ ] **Step 5: Commit**

```bash
git add tests/fde-progression-browser.mjs tests/fde-english-browser.mjs README.md
git commit -m "test: verify strict bilingual FDE progression"
```

### Task 8: Full verification, GitHub push, Aliyun deploy, and live audit

**Implementation status:** Tasks 1–7 and the bilingual bank rebuild are complete. Answer confidence, dual scoring, option randomization, and version-3 resume behavior were added under `2026-07-17-fde-integrity-confidence.md`; only the combined release gate and deployment remain.

**Files:**
- Modify only if verification exposes an in-scope defect.

**Interfaces:**
- Consumes: committed main branch.
- Produces: GitHub main commit, deployed `fde.onex.plus`, and fresh local/live evidence.

- [ ] **Step 1: Run the complete local verification suite**

Run:

```bash
for test in tests/*.test.mjs; do node "$test"; done
PYTHONPATH=backend python3 -m unittest discover -s backend/tests -v
bash -n deploy/install-or-update.sh
git diff --check
```

Expected: zero failures, clean shell syntax, and no whitespace errors.

- [ ] **Step 2: Run all required browser scripts**

With the local HTTP server running, execute progression, English, stats, and regression browser scripts using the configured Playwright runtime. Expected: every script exits 0 with no page errors.

- [ ] **Step 3: Audit the requirements against the current files**

Re-run `validateRigorContract()` for both locales, inspect critical counts and type distributions, and manually review at least ten items from each level for a plausible strongest distractor.

- [ ] **Step 4: Push GitHub main**

Run: `git push origin main`

Expected: remote main advances to the verified local commit.

- [ ] **Step 5: Deploy from GitHub to Aliyun**

Run:

```bash
ssh -o BatchMode=yes -i /Users/yuanwei/.ssh/51tokens_deploy root@123.56.153.120 'bash /opt/fde-field-test/deploy/install-or-update.sh'
```

Expected: deploy script reports Nginx and analytics health success and prints the production URL.

- [ ] **Step 6: Verify production**

Run live deterministic fetch checks for `/`, `/en/`, `/fde-guide/`, `/en/fde-guide/`, `/stats/`, `/robots.txt`, `/sitemap.xml`, and `/llms.txt`; then run the progression and English browser tests with `FDE_TEST_URL=https://fde.onex.plus/`.

Expected: public pages return 200, stats remains protected as designed, the stricter question bank is served, and both live browser flows pass.
