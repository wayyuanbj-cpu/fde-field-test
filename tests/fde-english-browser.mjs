import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const baseUrl = process.env.FDE_TEST_URL ?? "http://127.0.0.1:4173/";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.setDefaultTimeout(8000);
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(new URL("en/", baseUrl).href, { waitUntil: "domcontentloaded" });
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.match(await page.locator("#landing-title").innerText(), /Could You Actually\s+Ship as an FDE\?/);
  assert.match(await page.locator("[data-action='start']").innerText(), /Test Your FDE Instincts.*12 QUESTIONS.*8 MIN/s);
  assert.equal(await page.locator("a[data-locale-switch]").getAttribute("href"), "../");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  const englishBody = await page.locator("body").innerText();
  assert.doesNotMatch(englishBody.replace("中文", ""), /[\u3400-\u9fff]/u);

  await page.getByRole("button", { name: /Test Your FDE Instincts/ }).click();
  await page.locator("#quiz-view:not([hidden])").waitFor();
  await page.locator("#options-list label").nth(2).click();
  await page.getByRole("button", { name: /Lock Decision/ }).click();
  await page.locator("#options-list label").nth(1).click();
  const progressBefore = await page.locator("#progress-text").innerText();
  assert.match(progressBefore, /02 \/ 12/);

  await page.locator("a[data-locale-switch]").click();
  await page.waitForURL(new URL("./", baseUrl).href);
  await page.locator("#quiz-view:not([hidden])").waitFor();
  assert.match(await page.locator("#progress-text").innerText(), /02 \/ 12/);
  assert.equal(await page.locator("#options-list input").nth(1).isChecked(), true);

  await page.locator("a[data-locale-switch]").click();
  await page.waitForURL(new URL("en/", baseUrl).href);
  await page.locator("#quiz-view:not([hidden])").waitFor();
  assert.equal(await page.locator("#options-list input").nth(1).isChecked(), true);

  await page.evaluate(() => localStorage.clear());
  await page.goto(new URL("en/", baseUrl).href, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Take the Level Assessments" }).click();
  await page.locator("#level-view:not([hidden])").waitFor();
  assert.equal(await page.locator("button[data-level='junior']").isEnabled(), true);
  assert.equal(await page.locator("button[data-level='intermediate']").isDisabled(), true);
  await page.locator("button[data-level='junior']").click();
  await page.getByRole("button", { name: /Start Full Assessment/ }).click();
  await page.locator("#exam-view:not([hidden])").waitFor();
  assert.doesNotMatch(await page.locator("#exam-view").innerText(), /[\u3400-\u9fff]/u);
  const examText = await page.locator("#exam-view").innerText();
  assert.match(examText, /Answer confidence|independent assessment/i);

  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, [], errors.join(" | "));
  console.log("FDE English mirror browser checks passed");
} finally {
  await browser.close();
}
