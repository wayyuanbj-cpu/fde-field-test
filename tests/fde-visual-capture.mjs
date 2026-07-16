import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const baseUrl = process.env.FDE_TEST_URL ?? "http://127.0.0.1:4174/";
const output = process.env.FDE_PROOF_DIR ?? "/tmp/fde-geo-proof";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function publicCapture(route, name, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(new URL(route, baseUrl).href, { waitUntil: "networkidle" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${route} overflow`);
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: false });
  assert.deepEqual(errors, [], `${route}: ${errors.join(" | ")}`);
  await page.close();
}

await publicCapture("", "home-zh-desktop", { width: 1365, height: 900 });
await publicCapture("en/", "home-en-mobile", { width: 390, height: 844 });
await publicCapture("fde-guide/", "guide-zh-desktop", { width: 1365, height: 900 });
await publicCapture("en/fde-guide/", "guide-en-mobile", { width: 390, height: 844 });

{
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  await page.goto(new URL("en/", baseUrl).href, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole("button", { name: "Take the Level Assessments" }).click();
  await page.locator("button[data-level='junior']").click();
  await page.getByRole("button", { name: /Start Full Assessment/ }).click();
  for (let index = 0; index < 30 && !/Multiple Select/.test(await page.locator("#exam-question-type").innerText()); index += 1) {
    await page.locator("#exam-options label").first().click();
    await page.locator("[data-exam-action='next']").click();
  }
  assert.match(await page.locator("#exam-question-type").innerText(), /Multiple Select/);
  await page.screenshot({ path: `${output}/english-multiple-select.png`, fullPage: false });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(new URL("en/", baseUrl).href, { waitUntil: "networkidle" });
  const dataUrl = await page.evaluate(async () => {
    const { drawExamShareCard } = await import("/exam-share-card.js");
    const { activeBundle } = await import("/locales/index.js");
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1440;
    const result = { score: 92 };
    drawExamShareCard(canvas, result, activeBundle.levels.advanced, {
      final: true,
      name: "ALEX CHEN",
      scores: { junior: 91, intermediate: 88, advanced: 92 },
      bundle: activeBundle,
      mode: "full",
    });
    return canvas.toDataURL("image/png");
  });
  writeFileSync(`${output}/english-final-share-card.png`, Buffer.from(dataUrl.split(",")[1], "base64"));
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  const dashboard = {
    range: "7d", summary: { pv: 1280, uv: 836, sessions: 914 },
    daily: [{ day: "2026-07-16", pv: 650, uv: 390 }],
    funnel: { page_view: 1280, quick_start: 900, quick_complete: 710, level_start: 420, level_complete: 260, final_complete: 38, share_generate: 188 },
    levels: { junior: { start: 300, complete: 210, unlock: 120 }, intermediate: { start: 110, complete: 72, unlock: 45 }, advanced: { start: 36, complete: 20, unlock: 0 } },
    sources: [{ label: "wechat", value: 720 }, { label: "direct", value: 410 }],
    devices: [{ label: "mobile", value: 890 }, { label: "desktop", value: 390 }],
    scores: [{ bucket: "80-89", value: 130 }],
    ai_sources: [{ label: "chatgpt", value: 92 }, { label: "perplexity", value: 34 }],
    locales: [{ label: "zh-CN", value: 990 }, { label: "en", value: 290 }],
  };
  await page.route("**/api/analytics/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith("/auth/me")
      ? { user: { id: 2, username: "observer", role: "analyst", active: true, must_change_password: false }, csrf: "proof" }
      : dashboard;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(new URL("stats/", baseUrl).href, { waitUntil: "networkidle" });
  await page.locator(".signal-panel").scrollIntoViewIfNeeded();
  await page.locator(".signal-panel").screenshot({ path: `${output}/stats-ai-locale-panel.png` });
  await page.close();
}

await browser.close();
console.log(`FDE visual proof written to ${output}`);
