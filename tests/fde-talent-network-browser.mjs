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

async function pageWithRoutes(viewport, scenario = {}) {
  const config = scenario.config ?? { network_enabled: true, talent_directory_enabled: true };
  const detailStatus = scenario.detailStatus ?? 200;
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => { window.__FDE_NETWORK_PREVIEW__ = true; });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/network/config', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ features: config }),
  }));
  await page.route('**/api/network/public/talents/*', (route) => route.fulfill({
    status: detailStatus,
    contentType: 'application/json',
    body: detailStatus === 200 ? JSON.stringify({ talent: fixture }) : JSON.stringify({ error: 'not_found' }),
  }));
  await page.route(/\/api\/network\/public\/talents(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [fixture], filters: {} }),
  }));
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
  await desktop.page.goto(new URL('talents/', baseUrl).href, { waitUntil: 'networkidle' });
  await desktop.page.getByRole('heading', { name: '按交付能力，找到合适的 FDE。' }).waitFor();
  assert.equal(await desktop.page.getByLabel('项目匹配控制台').getByText('服务包、证据与能力边界', { exact: true }).isVisible(), true);
  await desktop.page.getByLabel('城市').fill('北京');
  await desktop.page.getByRole('button', { name: '应用筛选' }).click();
  await desktop.page.waitForFunction(() => location.search.includes('%E5%8C%97%E4%BA%AC'));
  if (process.env.FDE_NETWORK_TALENTS_SCREENSHOT) {
    await desktop.page.screenshot({ path: process.env.FDE_NETWORK_TALENTS_SCREENSHOT, fullPage: true });
  }
  await desktop.page.getByRole('link', { name: '查看 制造业知识库 FDE 的独立主页' }).click();
  await desktop.page.waitForURL('**/talents/manufacturing-kb-fde/');
  await desktop.page.getByRole('heading', { name: '制造业知识库 FDE' }).waitFor();
  assert.equal(await desktop.page.locator('#profile-certification').getByText('尚未完成 OneX 认证', { exact: true }).isVisible(), true);
  assert.equal(await desktop.page.locator('#profile-content .is-certified').count(), 0);
  assert.equal(await desktop.page.getByText('公开测试、培训结业、人才入库、正式认证和项目交付记录分别核验、分别存储、分别展示，任何一项都不能替代另一项。', { exact: true }).isVisible(), true);
  assert.equal(await desktop.page.getByText('两周问题诊断与试点设计。', { exact: true }).isVisible(), true);
  assert.equal(await desktop.page.getByText('已完成脱敏调研纪要和验收清单。', { exact: true }).isVisible(), true);
  assert.equal(await desktop.page.getByRole('link', { name: '带着这位 FDE 提交需求' }).getAttribute('href'), '/enterprise/?talent=manufacturing-kb-fde');
  assert.deepEqual(desktop.errors, []);
  await desktop.context.close();

  const mobile = await pageWithRoutes({ width: 390, height: 844 });
  await mobile.page.goto(new URL('talents/manufacturing-kb-fde/', baseUrl).href, { waitUntil: 'networkidle' });
  await mobile.page.getByRole('heading', { name: '制造业知识库 FDE' }).waitFor();
  assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await mobile.page.getByRole('link', { name: '返回人才目录' }).focus();
  assert.ok(await mobile.page.evaluate(() => document.activeElement?.classList.contains('profile-back')));
  if (process.env.FDE_NETWORK_PROFILE_SCREENSHOT) {
    await mobile.page.screenshot({ path: process.env.FDE_NETWORK_PROFILE_SCREENSHOT, fullPage: true });
  }
  assert.deepEqual(mobile.errors, []);
  await mobile.context.close();

  const missing = await pageWithRoutes({ width: 390, height: 844 }, { detailStatus: 404 });
  await missing.page.goto(new URL('talents/missing-profile/', baseUrl).href, { waitUntil: 'networkidle' });
  assert.equal(await missing.page.getByText('没有找到这份公开档案', { exact: true }).isVisible(), true);
  assert.equal(missing.errors.every((error) => /404|Failed to load resource/.test(error)), true);
  await missing.context.close();

  const disabled = await pageWithRoutes(
    { width: 390, height: 844 },
    { config: { network_enabled: false, talent_directory_enabled: false } },
  );
  await disabled.page.goto(new URL('talents/manufacturing-kb-fde/', baseUrl).href, { waitUntil: 'networkidle' });
  assert.equal(await disabled.page.getByText('人才网络正在灰度准备中', { exact: true }).isVisible(), true);
  assert.deepEqual(disabled.errors, []);
  await disabled.context.close();
  console.log('FDE talent network browser checks passed');
} finally {
  await browser.close();
}
