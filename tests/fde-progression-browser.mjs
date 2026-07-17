import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const url = process.env.FDE_TEST_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(7000);
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(error.message));

async function findMultipleQuestion(targetPage) {
  const buttons = targetPage.locator("#exam-number-grid button");
  for (let index = 0; index < await buttons.count(); index += 1) {
    await buttons.nth(index).click();
    if ((await targetPage.locator("#exam-question-type").innerText()) === "多选题") return index;
  }
  throw new Error("No multiple question found");
}

async function fillCurrentExamWithCorrectAnswers(targetPage, level, mode, { fast = false, missCritical = false } = {}) {
  await targetPage.evaluate(async ({ examLevel, examMode, fastAttempt, missOneCritical }) => {
    const { getQuestionBank } = await import("./exam-scoring.js");
    const { examStateKey } = await import("./exam-state.js");
    const bank = new Map(getQuestionBank(examLevel).map((question) => [question.id, question]));
    const key = examStateKey(examLevel, examMode);
    const saved = JSON.parse(localStorage.getItem(key));
    if (!saved?.optionOrders || !saved?.integrity) throw new Error("version-3 attempt state is incomplete");
    saved.answers = Object.fromEntries(saved.questionIds.map((id) => [id, bank.get(id).answer
      .map((originalIndex) => saved.optionOrders[id].indexOf(originalIndex))
      .sort((a, b) => a - b)]));
    if (missOneCritical) {
      const criticalId = saved.questionIds.find((id) => bank.get(id).critical === true);
      if (!criticalId) throw new Error("No critical question found");
      const correctIndexes = new Set(saved.answers[criticalId]);
      const wrongIndex = saved.optionOrders[criticalId].findIndex((_, index) => !correctIndexes.has(index));
      if (wrongIndex < 0) throw new Error("No incorrect option found for critical question");
      saved.answers[criticalId] = [wrongIndex];
    }
    const now = Date.now();
    const duration = fastAttempt ? 10_000 : saved.integrity.suggestedMinutes * 60_000 * 0.6;
    saved.integrity.startedAt = now - duration;
    saved.integrity.questionFirstSeen = Object.fromEntries(saved.questionIds.map((id) => [id, now - (fastAttempt ? 1_000 : 10_000)]));
    saved.integrity.questionAnsweredAt = Object.fromEntries(saved.questionIds.map((id) => [id, now - (fastAttempt ? 500 : 5_000)]));
    saved.integrity.answerChanges = Object.fromEntries(saved.questionIds.map((id) => [id, 0]));
    saved.integrity.hiddenSince = null;
    localStorage.setItem(key, JSON.stringify(saved));
  }, { examLevel: level, examMode: mode, fastAttempt: fast, missOneCritical: missCritical });
}

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "直接参加分级考核" }).click();
  await page.locator("#level-view:not([hidden])").waitFor();

  const junior = page.locator("button[data-level='junior']");
  const intermediate = page.locator("button[data-level='intermediate']");
  const advanced = page.locator("button[data-level='advanced']");
  assert.equal(await junior.isEnabled(), true);
  assert.equal(await intermediate.isDisabled(), true);
  assert.equal(await advanced.isDisabled(), true);
  assert.match(await page.locator("#progression-path").innerText(), /初级.*中级.*高级/s);
  assert.match(await page.locator("[data-level-card='junior']").innerText(), /必经起点/);
  assert.match(await page.locator("[data-level-card='intermediate']").innerText(), /初级晋级后解锁/);
  assert.match(await page.locator("[data-level-card='advanced']").innerText(), /中级晋级后解锁/);

  await intermediate.evaluate((button) => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  assert.equal(await page.locator("#mode-view").isHidden(), true, "synthetic clicks must not bypass the access guard");
  assert.match(await page.locator("#progression-notice").innerText(), /不能跳级|先完成初级/);

  await junior.click();
  await page.getByRole("button", { name: "开始完整挑战 →" }).click();
  await page.locator("#exam-view:not([hidden])").waitFor();
  await findMultipleQuestion(page);
  assert.match(await page.locator("#exam-question-guidance").innerText(), /请选择全部正确答案.*少选.*多选.*错选.*不得分/);
  assert.equal(await page.locator("#exam-question-guidance").getAttribute("role"), "note");
  assert.ok((await page.locator("#exam-question-type").getAttribute("class"))?.includes("is-multiple"));
  assert.ok(await page.locator("#exam-options input[type='checkbox']").count() > 0);
  const optionSnapshot = await page.locator("#exam-options .exam-option-copy").allInnerTexts();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#exam-view:not([hidden])").waitFor();
  assert.deepEqual(await page.locator("#exam-options .exam-option-copy").allInnerTexts(), optionSnapshot, "resume must preserve randomized option order");

  await page.getByRole("button", { name: "交卷", exact: true }).click();
  assert.match(await page.locator("#submit-copy").innerText(), /多选题.*少选.*不得分/);
  await page.getByRole("button", { name: "继续答题" }).click();

  await fillCurrentExamWithCorrectAnswers(page, "junior", "full", { missCritical: true });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#exam-view:not([hidden])").waitFor();
  await page.getByRole("button", { name: "交卷", exact: true }).click();
  await page.getByRole("button", { name: "确认交卷" }).click();
  await page.locator("#exam-result-view:not([hidden])").waitFor();
  assert.equal(await page.locator("#qualification-status").innerText(), "关键边界未通过");
  assert.match(await page.locator("#qualification-reason").innerText(), /1 道关键题答错/);
  assert.equal(await page.locator("#next-level-button").isHidden(), true);
  await page.locator("button[data-exam-action='retry']").click();
  await page.locator("#exam-view:not([hidden])").waitFor();

  for (let index = 0; index < 5; index += 1) await page.locator("#exam-view").dispatchEvent("copy");
  await fillCurrentExamWithCorrectAnswers(page, "junior", "full", { fast: true });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#exam-view:not([hidden])").waitFor();
  await page.getByRole("button", { name: "交卷", exact: true }).click();
  await page.getByRole("button", { name: "确认交卷" }).click();
  await page.locator("#exam-result-view:not([hidden])").waitFor();
  assert.equal(await page.locator("#qualification-status").innerText(), "答题可信度不足");
  assert.match(await page.locator("#qualification-reason").innerText(), /独立复测/);
  assert.equal(await page.locator("#next-level-button").isHidden(), true);
  await page.locator("button[data-exam-action='retry']").click();
  await page.locator("#exam-view:not([hidden])").waitFor();

  await fillCurrentExamWithCorrectAnswers(page, "junior", "full");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#exam-view:not([hidden])").waitFor();
  await page.getByRole("button", { name: "交卷", exact: true }).click();
  await page.getByRole("button", { name: "确认交卷" }).click();
  await page.locator("#exam-result-view:not([hidden])").waitFor();
  assert.equal(await page.locator("#qualification-status").innerText(), "晋级成功");
  assert.equal(await page.locator("#exam-result-score").innerText(), "100");
  assert.equal(await page.locator("#exam-strict-score").innerText(), "100");
  assert.equal(await page.locator("#exam-confidence-label").innerText(), "可信");
  assert.match(await page.locator("#qualification-reason").innerText(), /中级已解锁/);
  await page.getByRole("button", { name: "进入中级" }).click();
  await page.locator("#mode-view:not([hidden])").waitFor();
  assert.match(await page.locator("#mode-title").innerText(), /中级/);

  await page.getByRole("button", { name: "开始完整挑战 →" }).click();
  await page.locator("#exam-view:not([hidden])").waitFor();
  await fillCurrentExamWithCorrectAnswers(page, "intermediate", "full");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "交卷", exact: true }).click();
  await page.getByRole("button", { name: "确认交卷" }).click();
  assert.equal(await page.locator("#qualification-status").innerText(), "晋级成功");
  await page.getByRole("button", { name: "进入高级" }).click();
  await page.locator("#mode-view:not([hidden])").waitFor();
  assert.match(await page.locator("#mode-title").innerText(), /高级/);

  await page.getByRole("button", { name: "开始完整挑战 →" }).click();
  await page.locator("#exam-view:not([hidden])").waitFor();
  await fillCurrentExamWithCorrectAnswers(page, "advanced", "full");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "交卷", exact: true }).click();
  await page.getByRole("button", { name: "确认交卷" }).click();
  await page.locator("#exam-result-view:not([hidden])").waitFor();
  assert.equal(await page.locator("#qualification-status").innerText(), "三级挑战完成");
  assert.equal(await page.locator("#final-share-identity").isVisible(), true);
  assert.equal(await page.locator("#final-share-name").getAttribute("maxlength"), "20");
  assert.match(await page.locator("#final-share-identity").innerText(), /不上传.*不写入浏览器.*不进入统计后台/s);
  await page.locator("#final-share-name").fill("袁威 FDE");
  await page.getByRole("button", { name: "生成三级挑战分享卡" }).click();
  await page.locator("#exam-share-panel:not([hidden])").waitFor();
  assert.match(await page.locator("#exam-share-status").innerText(), /袁威 FDE.*不会上传或保存/);
  assert.ok(await page.locator("#exam-share-canvas").evaluate((canvas) => canvas.toDataURL("image/png").length > 10000));
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes("袁威 FDE")), false);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "保存等级成绩卡 PNG" }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "FDE-三级挑战-袁威 FDE.png");

  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "直接参加分级考核" }).click();
  await page.locator("#level-view:not([hidden])").waitFor();
  await page.locator("button[data-level='junior']").click();
  await page.getByRole("button", { name: "开始随机模拟 →" }).click();
  await fillCurrentExamWithCorrectAnswers(page, "junior", "mock");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "交卷", exact: true }).click();
  await page.getByRole("button", { name: "确认交卷" }).click();
  assert.equal(await page.locator("#qualification-status").innerText(), "模拟练习");
  await page.getByRole("button", { name: "挑战其他等级" }).click();
  await page.locator("#level-view:not([hidden])").waitFor();
  assert.equal(await page.locator("button[data-level='intermediate']").isDisabled(), true, "mock full score must not unlock intermediate");

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  assert.deepEqual(errors, [], errors.join(" | "));
  console.log("FDE progression browser lock checks passed");
} finally {
  await browser.close();
}
