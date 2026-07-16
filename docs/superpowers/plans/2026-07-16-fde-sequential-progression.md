# FDE Sequential Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有自由选级的三级测试改为严格顺序晋级挑战，并加入多选强提示、最终姓名分享卡和旧进度安全迁移。

**Architecture:** 使用新的 `exam-progression.js` 保持晋级规则与 DOM 解耦，`exam-scoring.js` 只负责严格计分和题序构建，`exam-app.js` 负责界面守卫和交卷状态机。晋级证据版本化存在 localStorage，但所有结果继续标注为非正式认证。

**Tech Stack:** Static HTML/CSS, native ES modules, Canvas 2D, Node.js `assert`, Playwright.

## Global Constraints

- 初级 100 题、中级 60 题、高级 40 题，必须顺序完成。
- 达标线 70；晋级须完整挑战总分不低于 85，且每模块不低于 70。
- 随机模拟不解锁下一级。
- 多选少选、多选、错选均得 0 分。
- 最终姓名最长 20 字符，不存储、不上传。
- 快速测试不得改变解锁状态。
- 结果始终显示“不代表正式毕业、认证或真实项目能力结论”。

---

### Task 1: Strict scoring and progression evidence

**Files:**
- Create: `exam-progression.js`
- Create: `tests/fde-progression.test.mjs`
- Modify: `assessment-levels.js`
- Modify: `exam-scoring.js`
- Modify: `tests/fde-exam-engine.test.mjs` if moved from the workspace test directory

**Interfaces:**
- Produces: `PASS_SCORE`, `ADVANCE_SCORE`, `MODULE_FLOOR`, `levelOrder`.
- Produces: `createEmptyProgression()`, `evaluateQualification(mode, result)`, `updateProgression(current, level, mode, result, now)`, `canAccessLevel(current, level)`, `nextLevel(level)`, `loadProgression(storage)`, `saveProgression(storage, state)`, `clearProgression(storage)`.
- Consumes: `result = { score, unanswered, moduleScores }` from `scoreExam()`.

- [ ] **Step 1: Write strict scoring failures**

Create assertions that require exact multi-select scoring and shuffled full exams:

```js
assert.equal(scoreQuestion(multipleQuestion, [0, 2]), 0);
assert.equal(scoreQuestion(multipleQuestion, [0, 2, 3]), 1);
const full = buildExam("junior", "full", () => 0);
assert.notDeepEqual(full.map(q => q.id), getQuestionBank("junior").map(q => q.id));
```

- [ ] **Step 2: Run the strict scoring test and verify RED**

Run: `node tests/fde-progression.test.mjs`

Expected: FAIL because `exam-progression.js` does not exist and multi-select still awards partial credit.

- [ ] **Step 3: Add progression rule failures**

Cover the exact decisions:

```js
assert.equal(evaluateQualification("mock", passing).qualifies, false);
assert.equal(evaluateQualification("full", {...passing, score: 84}).reason, "score");
assert.equal(evaluateQualification("full", {...passing, moduleScores: {a: 90, b: 69}}).reason, "module");
assert.equal(evaluateQualification("full", passing).qualifies, true);
assert.equal(canAccessLevel(empty, "junior"), true);
assert.equal(canAccessLevel(empty, "intermediate"), false);
```

- [ ] **Step 4: Implement the minimal pure progression module**

Use the following state shape and comparison rule:

```js
const state = { version: 1, records: {} };
const record = {
  score: 88,
  lowestModuleScore: 72,
  moduleScores: { "ai-foundation": 90 },
  qualifies: true,
  completedAt: "2026-07-16T00:00:00.000Z",
};
```

When comparing records, a qualifying result beats a non-qualifying result; otherwise higher total score wins, then higher lowest module score. Mock results never update records.

- [ ] **Step 5: Make scoring exact and full mode shuffled**

Replace partial credit in `scoreQuestion()` with exact-set equality and return `shuffled(bank, random)` for full mode.

- [ ] **Step 6: Run pure tests and verify GREEN**

Run: `node tests/fde-progression.test.mjs && node tests/fde-exam-engine.test.mjs`

Expected: both scripts print pass messages and exit 0.

- [ ] **Step 7: Commit**

```bash
git add assessment-levels.js exam-scoring.js exam-progression.js tests/
git commit -m "Add strict sequential progression rules"
```

### Task 2: Locked level selection and guarded restoration

**Files:**
- Modify: `index.html`
- Modify: `exam-app.js`
- Modify: `app.js`
- Modify: `exam.css`
- Create: `tests/fde-progression-browser.mjs`

**Interfaces:**
- Consumes all `exam-progression.js` functions from Task 1.
- Produces DOM states `is-locked`, `is-qualified`, `disabled`, and progression copy.

- [ ] **Step 1: Write the locked-selector browser test**

The new context must assert:

```js
assert.equal(await page.locator("[data-level='junior']").isEnabled(), true);
assert.equal(await page.locator("[data-level='intermediate']").isDisabled(), true);
assert.equal(await page.locator("[data-level='advanced']").isDisabled(), true);
```

It must also dispatch a synthetic click to the intermediate button and verify `#mode-view` remains hidden.

- [ ] **Step 2: Verify RED in a local server**

Run: `FDE_TEST_URL=http://127.0.0.1:4173/ NODE_PATH=/Users/yuanwei/.npm/_npx/e41f203b7505f1fb/node_modules node tests/fde-progression-browser.mjs`

Expected: FAIL because all three buttons are enabled.

- [ ] **Step 3: Add progression path and lock copy to HTML**

Add a `#progression-path` section and, inside each level card, `data-lock-copy`, `data-best-score`, and a real disabled level button. Add one global `#progression-notice` status region.

- [ ] **Step 4: Render and enforce access in `exam-app.js`**

Load progression once, update all cards on each selector open, and guard both `select-level` and `restoreActiveExam()` with `canAccessLevel()`. On a locked restore, clear the active pointer and show the rules-upgraded notice.

- [ ] **Step 5: Remove quick-test skip semantics**

Change quick-result CTA copy to `从初级开始晋级` and render the quick score only as a capability profile. `openLevelSelector()` may accept the quick score for display, but must never use it in `canAccessLevel()`.

- [ ] **Step 6: Style locked and completed cards**

Use reduced opacity, a lock glyph rendered in HTML text, clear disabled button cursor, and a visible progression rail. Ensure the lock is conveyed in text and `aria-disabled`, not only color.

- [ ] **Step 7: Run browser test and verify GREEN**

Run the Task 2 browser command again. Expected: pass, no page errors, and mobile width 390 has no horizontal overflow.

- [ ] **Step 8: Commit**

```bash
git add index.html exam-app.js app.js exam.css tests/fde-progression-browser.mjs
git commit -m "Enforce sequential level access"
```

### Task 3: Qualification result, next-level unlock, and multi-select warning

**Files:**
- Modify: `index.html`
- Modify: `exam-app.js`
- Modify: `exam.css`
- Modify: `tests/fde-progression-browser.mjs`

**Interfaces:**
- Consumes: `evaluateQualification()` and `updateProgression()`.
- Produces: result fields `#qualification-status`, `#qualification-reason`, and action `next-level`.

- [ ] **Step 1: Add RED browser fixtures for qualification**

Use `page.addInitScript()` to seed a valid junior qualifying record, verify intermediate unlocks, seed both junior and intermediate, and verify advanced unlocks. Also verify mock completion does not change the stored progression record.

- [ ] **Step 2: Add the multi-select warning RED assertion**

Navigate to the first multiple question and require visible text:

```text
请选择全部正确答案，少选、多选、错选均不得分。
```

Require checkbox inputs, a high-contrast `.is-multiple` badge, and `role="note"`.

- [ ] **Step 3: Verify RED**

Run the progression browser test. Expected: unlock and warning assertions fail.

- [ ] **Step 4: Update state after full submission**

In `confirmSubmit()`, call `updateProgression()` only after `scoreExam()`. Save the new state, compute the qualification reason, and render one of `未达标`, `本级达标，未晋级`, or `晋级成功`.

- [ ] **Step 5: Add next-level action**

Show `进入下一级` only when a full result qualifies and a next level exists. For advanced qualification, show the final-completion action instead.

- [ ] **Step 6: Render multi-select warning**

Set `#exam-question-guidance` per question type. When `question.type === "multiple"`, add `is-multiple`, strict copy, and link the note using `aria-describedby` on the fieldset.

- [ ] **Step 7: Re-run unit and browser tests**

Run: `node tests/fde-progression.test.mjs && NODE_PATH=/Users/yuanwei/.npm/_npx/e41f203b7505f1fb/node_modules node tests/fde-progression-browser.mjs`

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add index.html exam-app.js exam.css tests/
git commit -m "Show strict qualification and multi-select guidance"
```

### Task 4: Final name sharing card

**Files:**
- Create: `share-name.js`
- Modify: `exam-share-card.js`
- Modify: `exam-app.js`
- Modify: `index.html`
- Modify: `exam.css`
- Create: `tests/fde-share-name.test.mjs`
- Modify: `tests/fde-progression-browser.mjs`

**Interfaces:**
- Produces: `sanitizeShareName(value) -> string`, `shareFilename(name) -> string`.
- Extends: `drawExamShareCard(canvas, result, definition, options = {})` where `options = { mode, qualification, progression, name, final }`.

- [ ] **Step 1: Write name-sanitization RED tests**

Cover trim, control-character removal, 20-code-point truncation, anonymous fallback, and path-safe filenames.

```js
assert.equal(sanitizeShareName("  袁\n伟  "), "袁伟");
assert.equal(sanitizeShareName(""), "匿名挑战者");
assert.ok(!shareFilename("../a/b").includes("/"));
```

- [ ] **Step 2: Verify RED**

Run: `node tests/fde-share-name.test.mjs`

Expected: FAIL because `share-name.js` does not exist.

- [ ] **Step 3: Implement pure name helpers**

Use `Array.from()` for Unicode code-point truncation, strip `\p{Cc}` and filename separators, and do not persist the value.

- [ ] **Step 4: Add final-only name UI and card**

Add a hidden final share form with label, `maxlength=20`, privacy copy, and preview button. Reveal it only for qualified advanced full results. The final card must contain the name, three best scores, `200 题`, and the non-certification boundary.

- [ ] **Step 5: Add browser assertions**

Seed qualifying records, complete/seed the advanced final result, type a name, generate the card, verify canvas pixels and that no localStorage value contains the name. Ordinary junior/intermediate/mock results must not show the name form.

- [ ] **Step 6: Run tests and verify GREEN**

Run the name test plus progression browser test. Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add share-name.js exam-share-card.js exam-app.js index.html exam.css tests/
git commit -m "Add final named challenge card"
```

### Task 5: Full frontend regression and copy audit

**Files:**
- Modify: `README.md`
- Create: `tests/fde-regression.test.mjs`

- [ ] **Step 1: Write the consolidated regression test**

Create `tests/fde-regression.test.mjs` to assert all three bank sizes and IDs, exact multi-select scoring, 70/85 classification boundaries, OneX copyright copy, strict non-certification boundary, level order, and full/mock counts.

- [ ] **Step 2: Run every frontend test**

Run all Node data/engine/content/scoring tests and all Playwright flows against localhost. Expected: every script exits 0 and console error array is empty.

- [ ] **Step 3: Review desktop and mobile screenshots**

Capture landing, locked selector, multi-select question, qualification result, and final-name card at 1365x900 and 390x844. Verify no clipping, unreadable locked copy, or horizontal overflow.

- [ ] **Step 4: Update README**

Document the 200-question sequential rule, strict multi-select scoring, storage limitation, and separation from the future formal exam bank.

- [ ] **Step 5: Commit**

```bash
git add README.md tests/ *.js *.css index.html
git commit -m "Verify sequential FDE challenge frontend"
```
