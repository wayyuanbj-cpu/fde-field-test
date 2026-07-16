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

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  assert.deepEqual(errors, [], errors.join(" | "));
  console.log("FDE progression browser lock checks passed");
} finally {
  await browser.close();
}
