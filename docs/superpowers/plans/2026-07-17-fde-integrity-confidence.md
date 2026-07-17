# FDE Assessment Integrity and Confidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add conservative anti-AI answer signals, randomized option order, diagnostic multiple-choice credit, and a confidence gate to the bilingual public FDE assessments.

**Architecture:** Keep integrity capture, option remapping, strict scoring, and diagnostic scoring in separate pure ES modules. Persist only the local resumable attempt; send coarse confidence buckets through the existing allow-listed analytics client. The browser UI combines the diagnostic ability score with the unchanged strict progression standards and blocks progression only when the final confidence band is `low`.

**Tech Stack:** Native JavaScript ES modules, Node.js `assert`, browser localStorage, Playwright, static HTML/CSS.

## Global Constraints

- No camera, microphone, screen recording, identity document, or mandatory account.
- No answers, question IDs, names, raw timestamps, or full referrers in analytics payloads.
- Confidence bands are `trusted`, `review`, and `low`; only `low` blocks progression.
- A single visibility exit and an attempt with no other suspicious signal remain `trusted`.
- Copy interception applies only inside the active exam surface.
- Qualification still requires full mode, no unanswered questions, strict score at least 85, every strict module at least 70, and zero critical misses.
- Chinese and English use neutral retake language and never accuse a candidate of cheating.
- State and progression schemas advance to version 3.

---

### Task 1: Implement the pure integrity classifier

**Files:**
- Create: `exam-integrity.js`
- Create: `tests/fde-integrity.test.mjs`

**Interfaces:**
- Produces: `createIntegritySession({ startedAt, suggestedMinutes, questionCount })`, `recordQuestionView(session, questionId, at)`, `recordAnswerEvent(session, questionId, at)`, `recordIntegrityEvent(session, type, at)`, and `finalizeIntegrity(session, submittedAt)`.
- `finalizeIntegrity()` returns `{ band, eligible, risk, reasons, durationMs, fastAnswerShare, visibilityExits, hiddenMs, clipboardAttempts }`.

- [ ] **Step 1: Write failing classifier tests**

Create deterministic fixtures that assert:

```js
assert.equal(finalizeIntegrity(oneSwitch, finish).band, "trusted");
assert.equal(finalizeIntegrity(repeatedCopyAndExit, finish).band, "low");
assert.equal(finalizeIntegrity(veryFastOnly, finish).band, "review");
assert.equal(finalizeIntegrity(normalAttempt, finish).eligible, true);
```

Also assert exact risk boundaries: `0–3` trusted, `4–7` review, and `8+` low.

- [ ] **Step 2: Run the new test and verify RED**

Run: `node tests/fde-integrity.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `exam-integrity.js`.

- [ ] **Step 3: Implement the immutable session model**

Use the approved capped rules. Correlated speed signals share one capped contribution, so speed alone cannot produce a `low` band:

```js
const evidence = (review, low, value) => value >= low ? 4 : value >= review ? 2 : 0;
risk += evidence(2, 5, clipboardAttempts);
risk += evidence(4, 9, visibilityExits);
risk += evidence(90_000, 300_000, hiddenMs);
const fastRisk = evidence(0.25, 0.50, fastAnswerShare);
const durationRisk = durationRatio < 0.18 ? 4 : durationRatio < 0.30 ? 2 : 0;
risk += Math.max(fastRisk, durationRisk);
```

Fast answers are answered less than 3,000 ms after first view. `recordIntegrityEvent()` accepts only `hidden`, `visible`, `copy`, `cut`, `paste`, and `contextmenu`; unknown types leave the session unchanged.

- [ ] **Step 4: Run the classifier tests and verify GREEN**

Run: `node tests/fde-integrity.test.mjs`

Expected: `FDE integrity classifier checks passed`.

- [ ] **Step 5: Commit**

```bash
git add exam-integrity.js tests/fde-integrity.test.mjs
git commit -m "feat: classify FDE answer confidence"
```

### Task 2: Add diagnostic credit and confidence qualification

**Files:**
- Modify: `exam-scoring.js`
- Modify: `exam-progression.js`
- Modify: `tests/fde-exam-engine.test.mjs`
- Modify: `tests/fde-progression.test.mjs`

**Interfaces:**
- Produces: `scoreDiagnosticQuestion(question, selected)` and new `scoreExam()` fields `diagnosticScore`, `diagnosticEarned`, and `diagnosticModuleScores`.
- Consumes: `result.integrity = { band, eligible }` in `evaluateQualification()`.

- [ ] **Step 1: Write failing diagnostic and qualification assertions**

Add exact cases:

```js
assert.equal(scoreDiagnosticQuestion({ type: "multiple", answer: [0, 2], options: ["a", "b", "c", "d"] }, [0]), 0.5);
assert.equal(scoreDiagnosticQuestion({ type: "multiple", answer: [0, 2], options: ["a", "b", "c", "d"] }, [0, 1]), 0);
assert.equal(scoreDiagnosticQuestion({ type: "multiple", answer: [0, 2], options: ["a", "b", "c", "d"] }, [0, 1, 2, 3]), 0);
assert.equal(evaluateQualification("full", { ...passing, integrity: { band: "low", eligible: false } }).reason, "integrity");
```

Assert `score` and `moduleScores` stay strict while the diagnostic fields contain partial evidence.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node tests/fde-exam-engine.test.mjs && node tests/fde-progression.test.mjs`

Expected: FAIL because diagnostic exports and the confidence gate do not exist.

- [ ] **Step 3: Implement diagnostic scoring**

For multiple choice:

```js
const correctShare = selectedCorrect / answer.length;
const wrongShare = selectedWrong / (question.options.length - answer.length);
return Math.max(0, correctShare - wrongShare);
```

Single-choice and judgment remain exact. Keep `result.score` as the strict score, classify the visible ability result with `diagnosticScore`, and mark non-exact positive diagnostic credit as `partial` in review statistics.

- [ ] **Step 4: Add the confidence gate and progression version 3**

Evaluate `integrity` after score, module, and critical gates. Persist `integrityBand` on new progression records, require it in `validRecord()`, and set `PROGRESSION_VERSION = 3`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node tests/fde-exam-engine.test.mjs && node tests/fde-progression.test.mjs`

Expected: both scripts pass with strict score behavior unchanged.

- [ ] **Step 6: Commit**

```bash
git add exam-scoring.js exam-progression.js tests/fde-exam-engine.test.mjs tests/fde-progression.test.mjs
git commit -m "feat: separate diagnostic and qualification scores"
```

### Task 3: Randomize options and preserve resume state

**Files:**
- Create: `exam-randomization.js`
- Create: `tests/fde-randomization.test.mjs`
- Modify: `exam-state.js`
- Modify: `tests/fde-exam-engine.test.mjs`

**Interfaces:**
- Produces: `prepareAttempt(questions, random)` returning `{ questions, optionOrders }` and `restoreAttempt(bank, questionIds, optionOrders)` returning remapped display questions.
- Exam state requires `optionOrders`, `integrity`, and version 3.

- [ ] **Step 1: Write failing remap and state tests**

Use a question with answer indexes `[0, 2]` and a fixed option order `[2, 0, 3, 1]`. Assert displayed options follow the order and the remapped answer becomes `[0, 1]`. Assert save/load preserves `optionOrders`, while version-2 or missing mappings return `reason: "version"` or `reason: "options"`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node tests/fde-randomization.test.mjs && node tests/fde-exam-engine.test.mjs`

Expected: FAIL because `exam-randomization.js` and version-3 validation are missing.

- [ ] **Step 3: Implement option mapping and restoration**

Validate each order as a complete permutation of the option indexes. Clone each question with reordered `options` and remap every original answer index to its displayed position. Never mutate the bank object.

- [ ] **Step 4: Advance exam state to version 3**

Require one valid option order for every question ID and a plain-object integrity session. Clamp `currentIndex` as before. Keep all data local in `localStorage`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node tests/fde-randomization.test.mjs && node tests/fde-exam-engine.test.mjs`

Expected: both scripts pass.

- [ ] **Step 6: Commit**

```bash
git add exam-randomization.js exam-state.js tests/fde-randomization.test.mjs tests/fde-exam-engine.test.mjs
git commit -m "feat: randomize and resume FDE option order"
```

### Task 4: Wire integrity into the bilingual browser experience

**Files:**
- Modify: `exam-app.js`
- Modify: `analytics.js`
- Modify: `assessment-levels.js`
- Modify: `locales/en-US.js`
- Modify: `locales/zh-CN-ui.js`
- Modify: `locales/en-US/ui.js`
- Modify: `index.html`
- Modify: `en/index.html`
- Modify: `exam.css`
- Modify: `tests/fde-analytics-client.test.mjs`
- Modify: `tests/fde-localization-parity.test.mjs`
- Modify: `tests/fde-progression-browser.mjs`
- Modify: `tests/fde-english-browser.mjs`

**Interfaces:**
- Consumes: `prepareAttempt()`, `restoreAttempt()`, integrity session functions, diagnostic score fields, and qualification reason `integrity`.
- Produces: bilingual ability score, strict score, confidence band, neutral retake message, and coarse allow-listed analytics fields.

- [ ] **Step 1: Write failing analytics and localization tests**

Allow only `confidence` (`trusted|review|low`) and integer buckets `visibility`, `clipboard`, `fast`, and `duration` on `level_complete`. Assert injected `answers`, `questionIds`, `timestamps`, and `name` are stripped. Add bilingual parity assertions for all new confidence labels and messages.

- [ ] **Step 2: Write failing browser paths**

Update the test state key to version 3 and fill answers against the persisted randomized option mappings. Add one normal all-correct path that remains `trusted` and qualified, plus one otherwise qualified path that dispatches repeated copy and visibility events and ends with qualification reason `integrity`.

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
node tests/fde-analytics-client.test.mjs
node tests/fde-localization-parity.test.mjs
```

Expected: FAIL because allow-listed confidence data and localized copy are missing.

- [ ] **Step 4: Wire new-attempt and resume state**

Use numeric `fullMinutes` and `mockMinutes` fields in both locale level definitions. New attempts call `prepareAttempt()` and `createIntegritySession()`; resumes call `restoreAttempt()` and reuse persisted integrity. Persist `optionOrders` and `integrity` after every existing save point.

- [ ] **Step 5: Capture scoped browser signals**

On answer changes, record answer time and changes. On `visibilitychange`, record `hidden`/`visible`. On `copy`, `cut`, `paste`, and `contextmenu` inside `#exam-view`, prevent the default action and record the signal. Do not attach global keyboard blockers.

- [ ] **Step 6: Finalize scoring and render dual evidence**

At submission, attach `finalizeIntegrity()` to the score result before qualification. Show `diagnosticScore` as “能力分 / Ability score”, show strict `score` separately, and show the confidence label and reasons. For reason `integrity`, use “本次答题环境信号不足，请在不切换页面、不复制题目的情况下独立复测。” and “This attempt does not contain enough independent-answering signals. Retake it without leaving or copying the assessment.”

- [ ] **Step 7: Send coarse analytics only**

Map the finalized result to buckets and pass only those buckets plus `confidence`, level, mode, and strict score to `track("level_complete")`.

- [ ] **Step 8: Run Node tests and local browser tests**

Run:

```bash
node tests/fde-integrity.test.mjs
node tests/fde-randomization.test.mjs
node tests/fde-exam-engine.test.mjs
node tests/fde-progression.test.mjs
node tests/fde-analytics-client.test.mjs
node tests/fde-localization-parity.test.mjs
FDE_TEST_URL=http://127.0.0.1:4173/ NODE_PATH=/Users/yuanwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules node tests/fde-progression-browser.mjs
FDE_TEST_URL=http://127.0.0.1:4173/en/ NODE_PATH=/Users/yuanwei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules node tests/fde-english-browser.mjs
```

Expected: all scripts pass, no console errors, and no mobile horizontal overflow.

- [ ] **Step 9: Commit**

```bash
git add exam-app.js analytics.js assessment-levels.js locales/en-US.js locales/zh-CN-ui.js locales/en-US/ui.js index.html en/index.html exam.css tests
git commit -m "feat: add FDE answer confidence experience"
```

### Task 5: Document and run the combined release gate

**Implementation status:** Tasks 1–4 are complete in commits `e46e216`, `d032f2f`, `4be2d1a`, and `3387e04`. The remaining work in this task is the combined release gate and deployment.

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-17-fde-question-bank-rigor.md`

**Interfaces:**
- Consumes: the completed bilingual question banks and Tasks 1–4 above.
- Produces: one documented release gate covering content rigor, scoring, integrity, browser behavior, backend analytics, and deployment.

- [ ] **Step 1: Document the public-test boundary and confidence model**

Add the diagnostic/strict score distinction, zero-critical rule, conservative confidence gate, version-3 reset, local-only raw signals, and the limitation that a static public site cannot prove second-device use.

- [ ] **Step 2: Run the complete release gate**

Run every `tests/*.test.mjs`, both browser suites, the backend tests with the bundled Python 3.12 runtime, `git diff --check`, and a production-build/static-server smoke check.

- [ ] **Step 3: Commit documentation**

```bash
git add README.md docs/superpowers/plans/2026-07-17-fde-question-bank-rigor.md
git commit -m "docs: explain FDE answer confidence"
```

- [ ] **Step 4: Merge, push, deploy, and verify production**

Merge `codex/fde-question-rigor` into `main`, push `origin/main`, deploy with `/opt/fde-field-test/deploy/install-or-update.sh`, then verify Chinese and English flows at `https://fde.onex.plus/` with no console errors or mobile overflow.
