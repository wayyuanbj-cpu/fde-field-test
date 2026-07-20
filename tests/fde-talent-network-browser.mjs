import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const baseUrl = process.env.FDE_TEST_URL ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ headless: true });
const fixture = {
  slug: 'manufacturing-kb-fde', display_name: '制造业知识库 FDE',
  headline: '把复杂现场知识变成可运行的 AI 流程', city: '北京',
  service_mode: 'hybrid', availability: 'available', status: 'member',
  summary: '擅长知识梳理、检索设计与一线试点。',
  not_fit: '不承接只要求演示的项目。', service_package: '两周问题诊断与试点设计。',
  evidence_summary: '已完成脱敏调研纪要和验收清单。', tags: ['知识库', '制造业'],
  certification_label: '尚未完成 OneX 认证', locale: 'zh-CN', published_at: '2026-07-20T09:00:00Z',
};

async function pageWithRoutes(viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => { window.__FDE_NETWORK_PREVIEW__ = true; });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/network/config', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ features: { network_enabled: true, talent_directory_enabled: true } }) }));
  await page.route('**/api/network/public/talents**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [fixture], filters: {} }) }));
  return { context, page, errors };
}

try {
  const desktop = await pageWithRoutes({ width: 1440, height: 1000 });
  await desktop.page.goto(baseUrl, { waitUntil: 'networkidle' });
  await desktop.page.locator('#network-entry:not([hidden])').waitFor();
  for (const label of ['我想成为 FDE', '我是 FDE', '我需要 FDE']) {
    assert.equal(await desktop.page.getByRole('heading', { name: label }).isVisible(), true);
  }
  assert.match(await desktop.page.locator('.network-boundary').innerText(), /人才库成员不等于/);
  if (process.env.FDE_NETWORK_HOME_SCREENSHOT) {
    await desktop.page.screenshot({ path: process.env.FDE_NETWORK_HOME_SCREENSHOT, fullPage: true });
  }
  assert.deepEqual(desktop.errors, []);
  await desktop.context.close();

  const mobile = await pageWithRoutes({ width: 390, height: 844 });
  await mobile.page.goto(new URL('talents/', baseUrl).href, { waitUntil: 'networkidle' });
  await mobile.page.getByRole('heading', { name: '制造业知识库 FDE' }).waitFor();
  assert.equal(await mobile.page.getByText('尚未完成 OneX 认证', { exact: true }).first().isVisible(), true);
  await mobile.page.getByLabel('城市').fill('北京');
  await mobile.page.getByRole('button', { name: '应用筛选' }).click();
  await mobile.page.waitForFunction(() => location.search.includes('%E5%8C%97%E4%BA%AC'));
  assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await mobile.page.getByRole('link', { name: /ONEX FDE NETWORK/ }).focus();
  assert.ok(await mobile.page.evaluate(() => document.activeElement?.classList.contains('network-brand')));
  if (process.env.FDE_NETWORK_TALENTS_SCREENSHOT) {
    await mobile.page.screenshot({ path: process.env.FDE_NETWORK_TALENTS_SCREENSHOT, fullPage: true });
  }
  assert.deepEqual(mobile.errors, []);
  await mobile.context.close();
  console.log('FDE talent network browser checks passed');
} finally {
  await browser.close();
}
