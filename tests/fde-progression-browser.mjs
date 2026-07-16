import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const url = process.env.FDE_TEST_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
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

async function fillCurrentExamWithCorrectAnswers(targetPage, level, mode) {
  await targetPage.evaluate(async ({ examLevel, examMode }) => {
    const { getQuestionBank } = await import("./exam-scoring.js");
    const bank = new Map(getQuestionBank(examLevel).map((question) => [question.id, question]));
    const key = `onex-fde-exam:1:${examLevel}:${examMode}`;
    const saved = JSON.parse(localStorage.getItem(key));
    saved.answers = Object.fromEntries(saved.questionIds.map((id) => [id, [...bank.get(id).answer]]));
    localStorage.setItem(key, JSON.stringify(saved));
  }, { examLevel: level, examMode: mode });
}

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
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

  await page.getByRole("button", { name: "交卷", exact: true }).click();
  assert.match(await page.locator("#submit-copy").innerText(), /多选题.*少选.*不得分/);
  await page.getByRole("button", { name: "继续答题" }).click();

  await fillCurrentExamWithCorrectAnswers(page, "junior", "full");
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#exam-view:not([hidden])").waitFor();
  await page.getByRole("button", { name: "交卷", exact: true }).click();
  await page.getByRole("button", { name: "确认交卷" }).click();
  await page.locator("#exam-result-view:not([hidden])").waitFor();
  assert.equal(await page.locator("#qualification-status").innerText(), "晋级成功");
  assert.match(await page.locator("#qualification-reason").innerText(), /中级已解锁/);
  await page.getByRole("button", { name: "进入中级" }).click();
  await page.locator("#mode-view:not([hidden])").waitFor();
  assert.match(await page.locator("#mode-title").innerText(), /中级/);

  await page.getByRole("button", { name: "开始完整挑战 →" }).click();
  await page.locator("#exam-view:not([hidden])").waitFor();
  await fillCurrentExamWithCorrectAnswers(page, "intermediate", "full");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "交卷", exact: true }).click();
  await page.getByRole("button", { name: "确认交卷" }).click();
  assert.equal(await page.locator("#qualification-status").innerText(), "晋级成功");
  await page.getByRole("button", { name: "进入高级" }).click();
  await page.locator("#mode-view:not([hidden])").waitFor();
  assert.match(await page.locator("#mode-title").innerText(), /高级/);

  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "直接参加分级考核" }).click();
  await page.locator("#level-view:not([hidden])").waitFor();
  await page.locator("button[data-level='junior']").click();
  await page.getByRole("button", { name: "开始随机模拟 →" }).click();
  await fillCurrentExamWithCorrectAnswers(page, "junior", "mock");
  await page.reload({ waitUntil: "networkidle" });
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
