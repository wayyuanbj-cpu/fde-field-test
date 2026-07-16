import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const baseUrl = process.env.FDE_TEST_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });

const dashboard = {
  range: "7d",
  summary: { pv: 1280, uv: 836, sessions: 914 },
  daily: [
    { day: "2026-07-14", pv: 220, uv: 160 },
    { day: "2026-07-15", pv: 410, uv: 286 },
    { day: "2026-07-16", pv: 650, uv: 390 },
  ],
  funnel: { page_view: 1280, quick_start: 900, quick_complete: 710, level_start: 420, level_complete: 260, final_complete: 38, share_generate: 188 },
  levels: {
    junior: { start: 300, complete: 210, unlock: 120 },
    intermediate: { start: 110, complete: 72, unlock: 45 },
    advanced: { start: 36, complete: 20, unlock: 0 },
  },
  sources: [{ label: "wechat", value: 720 }, { label: "direct", value: 410 }],
  ai_sources: [{ label: "chatgpt", value: 92 }, { label: "perplexity", value: 34 }],
  locales: [{ label: "zh-CN", value: 990 }, { label: "en", value: 290 }],
  devices: [{ label: "mobile", value: 890 }, { label: "desktop", value: 390 }],
  scores: [{ bucket: "70-79", value: 88 }, { bucket: "80-89", value: 130 }, { bucket: "90-100", value: 42 }],
};

async function mockApi(page, initialUser = null) {
  let user = initialUser;
  let users = [
    { id: 1, username: "owner", role: "owner", active: true, must_change_password: false, created_at: "2026-07-16T08:00:00Z", last_login_at: "2026-07-16T09:00:00Z" },
    { id: 2, username: "observer", role: "analyst", active: true, must_change_password: false, created_at: "2026-07-16T08:00:00Z", last_login_at: null },
  ];
  await page.route("**/api/analytics/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (status, body, headers = {}) => route.fulfill({ status, contentType: "application/json", body: body ? JSON.stringify(body) : "", headers });
    if (path.endsWith("/auth/me")) return json(200, { user, csrf: user ? "csrf-test" : null });
    if (path.endsWith("/auth/login")) {
      user = { id: 1, username: "owner", role: "owner", active: true, must_change_password: true };
      return json(200, { user, csrf: "csrf-test" });
    }
    if (path.endsWith("/auth/change-password")) {
      user = { ...user, must_change_password: false };
      return json(200, { user, csrf: "csrf-next" });
    }
    if (path.endsWith("/dashboard")) return json(200, dashboard);
    if (path.endsWith("/users") && request.method() === "GET") return json(200, { users });
    if (path.endsWith("/users") && request.method() === "POST") {
      const created = { id: 3, username: "teamviewer", role: "analyst", active: true, must_change_password: true };
      users.push(created);
      return json(201, { user: created, one_time_password: "TempPass!2026XYZ" });
    }
    if (/\/users\/\d+\/reset-password$/.test(path)) return json(200, { user: users[1], one_time_password: "ResetPass!2026XYZ" });
    if (/\/users\/\d+$/.test(path) && request.method() === "PATCH") {
      const id = Number(path.split("/").pop());
      const patch = request.postDataJSON();
      users = users.map((entry) => entry.id === id ? { ...entry, ...patch } : entry);
      return json(200, { user: users.find((entry) => entry.id === id) });
    }
    return json(204, null);
  });
}

async function newPage(user = null, viewport = { width: 1365, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await mockApi(page, user);
  await page.goto(new URL("stats/", baseUrl).href, { waitUntil: "networkidle" });
  return { context, page, errors };
}

try {
  {
    const { context, page, errors } = await newPage();
    assert.equal(await page.locator("#login-view").isVisible(), true);
    await page.getByLabel("账号", { exact: true }).fill("owner");
    await page.getByLabel("密码", { exact: true }).fill("InitialPass!2026");
    await page.getByRole("button", { name: "登录统计后台" }).click();
    await page.locator("#change-password-view:not([hidden])").waitFor();
    assert.equal(await page.locator("#change-password-view").isVisible(), true);
    assert.equal(await page.locator("#app-view").isHidden(), true);
    assert.deepEqual(errors, []);
    await context.close();
  }

  {
    const analyst = { id: 2, username: "observer", role: "analyst", active: true, must_change_password: false };
    const { context, page, errors } = await newPage(analyst, { width: 390, height: 844 });
    await page.locator("#overview-view:not([hidden])").waitFor();
    assert.match(await page.locator("#metric-pv").innerText(), /1,280/);
    assert.match(await page.locator("#ai-source-list").innerText(), /chatgpt.*92/s);
    assert.match(await page.locator("#locale-list").innerText(), /zh-CN.*990.*en.*290/s);
    assert.equal(await page.locator("[data-view='users']").isHidden(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    assert.deepEqual(errors, []);
    await context.close();
  }

  {
    const owner = { id: 1, username: "owner", role: "owner", active: true, must_change_password: false };
    const { context, page, errors } = await newPage(owner);
    await page.locator("#overview-view:not([hidden])").waitFor();
    assert.equal(await page.locator("[data-view='users']").isVisible(), true);
    await page.locator("[data-view='users']").click();
    await page.locator("#users-view:not([hidden])").waitFor();
    await page.locator("[data-user-id-row='2']").waitFor();
    assert.match(await page.locator("#user-list").innerText(), /owner.*observer/s);
    await page.getByLabel("新账号名").fill("teamviewer");
    await page.getByRole("button", { name: "创建账号" }).click();
    await page.waitForFunction(() => document.querySelector("#credential-password")?.textContent === "TempPass!2026XYZ");
    assert.match(await page.locator("#credential-panel").innerText(), /teamviewer.*TempPass!2026XYZ/s);
    await page.locator("[data-user-action='toggle'][data-user-id='2']").click();
    await page.waitForFunction(() => document.querySelector("[data-user-id-row='2']")?.textContent.includes("已停用"));
    assert.match(await page.locator("[data-user-id-row='2']").innerText(), /已停用/);
    await page.locator("[data-user-action='reset'][data-user-id='2']").click();
    await page.waitForFunction(() => document.querySelector("#credential-password")?.textContent === "ResetPass!2026XYZ");
    assert.match(await page.locator("#credential-panel").innerText(), /ResetPass!2026XYZ/);
    assert.deepEqual(errors, []);
    await context.close();
  }

  console.log("FDE stats dashboard browser checks passed");
} finally {
  await browser.close();
}
