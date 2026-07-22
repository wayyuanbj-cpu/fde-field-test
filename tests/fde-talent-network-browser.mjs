import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const baseUrl = process.env.FDE_TEST_URL ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ headless: true });
const fixture = {
  slug: 'manufacturing-kb-fde', display_name: '制造业知识库 FDE',
  headline: '把复杂现场知识变成可运行的 AI 流程', city: '北京',
  service_mode: 'hybrid', availability: 'available', status: 'delivery',
  certification_status: 'not_certified', delivery_status: 'verified',
  summary: '擅长知识梳理、检索设计与一线试点。',
  not_fit: '不承接只要求演示的项目。', service_package: '两周问题诊断与试点设计。',
  evidence_summary: '已完成脱敏调研纪要和验收清单。', tags: ['知识库', '制造业'],
  certification_label: '尚未完成 OneX 认证', locale: 'zh-CN', published_at: '2026-07-20T09:00:00Z',
};

async function pageWithRoutes(viewport, scenario = {}) {
  const config = scenario.config ?? { network_enabled: true, talent_directory_enabled: true };
  const detailStatus = scenario.detailStatus ?? 200;
  const talent = scenario.fixture ?? fixture;
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => { window.__FDE_NETWORK_PREVIEW__ = true; });
  const page = await context.newPage();
  let listAttempts = 0;
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
    body: scenario.detailBody ?? (detailStatus === 200 ? JSON.stringify({ talent }) : JSON.stringify({ error: 'not_found' })),
  }));
  await page.route(/\/api\/network\/public\/talents(?:\?.*)?$/, (route) => {
    const responses = scenario.listResponses ?? [{ status: 200, items: [talent] }];
    const selected = responses[Math.min(listAttempts, responses.length - 1)];
    listAttempts += 1;
    return route.fulfill({
    status: selected.status,
    contentType: 'application/json',
    body: JSON.stringify(selected.status === 200 ? { items: selected.items, filters: {} } : { error: 'internal_error' }),
  });
  });
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
  assert.equal(await desktop.page.locator('#profile-recovery').isVisible(), false);
  assert.equal(await desktop.page.locator('#profile-status').getByText('OneX 交付 FDE', { exact: true }).isVisible(), true);
  assert.equal(await desktop.page.getByText('OneX 认证 FDE', { exact: true }).count(), 0);
  assert.equal(await desktop.page.locator('#profile-certification').getByText('尚未完成 OneX 认证', { exact: true }).isVisible(), true);
  assert.equal(await desktop.page.locator('#profile-delivery').getByText('已有经核验交付记录', { exact: true }).isVisible(), true);
  assert.equal(await desktop.page.getByText('公开测试、培训结业、人才入库、正式认证和项目交付记录分别核验、分别存储、分别展示，任何一项都不能替代另一项。', { exact: true }).isVisible(), true);
  assert.equal(await desktop.page.getByText('两周问题诊断与试点设计。', { exact: true }).isVisible(), true);
  assert.equal(await desktop.page.getByText('已完成脱敏调研纪要和验收清单。', { exact: true }).isVisible(), true);
  assert.equal(await desktop.page.getByText('公开页不展示真实姓名、手机、邮箱、微信、客户机密或精确考试分数。', { exact: true }).isVisible(), true);
  assert.equal(await desktop.page.getByRole('link', { name: '带着这位 FDE 提交需求' }).getAttribute('href'), '/enterprise/?talent=manufacturing-kb-fde');
  assert.deepEqual(desktop.errors, []);
  await desktop.context.close();

  const certifiedOnly = await pageWithRoutes(
    { width: 1440, height: 1000 },
    {
      fixture: {
        ...fixture,
        slug: 'certified-only-fde',
        status: 'certified',
        certification_status: 'certified',
        delivery_status: 'unverified',
        certification_label: 'OneX 认证 FDE',
      },
    },
  );
  await certifiedOnly.page.goto(new URL('talents/certified-only-fde/', baseUrl).href, { waitUntil: 'networkidle' });
  assert.equal(await certifiedOnly.page.locator('#profile-certification').getByText('OneX 认证 FDE', { exact: true }).isVisible(), true);
  assert.equal(await certifiedOnly.page.locator('#profile-delivery').getByText('尚无经核验交付记录', { exact: true }).isVisible(), true);
  assert.equal(await certifiedOnly.page.locator('#profile-status').getByText('OneX 认证 FDE', { exact: true }).isVisible(), true);
  await certifiedOnly.context.close();

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
  assert.equal(await missing.page.getByRole('link', { name: 'FDE 公开测试' }).getAttribute('href'), '/');
  assert.equal(await missing.page.getByRole('link', { name: 'FDE 小班培训' }).getAttribute('href'), '/fde-training/');
  assert.equal(missing.errors.every((error) => /404|Failed to load resource/.test(error)), true);
  await missing.context.close();

  const disabled = await pageWithRoutes(
    { width: 390, height: 844 },
    { config: { network_enabled: false, talent_directory_enabled: false } },
  );
  await disabled.page.goto(new URL('talents/manufacturing-kb-fde/', baseUrl).href, { waitUntil: 'networkidle' });
  assert.equal(await disabled.page.getByText('人才网络正在灰度准备中', { exact: true }).isVisible(), true);
  await disabled.page.getByRole('link', { name: 'FDE 公开测试' }).focus();
  assert.equal(await disabled.page.evaluate(() => document.activeElement?.getAttribute('href')), '/');
  assert.deepEqual(disabled.errors, []);
  await disabled.context.close();

  const homeDisabled = await pageWithRoutes(
    { width: 390, height: 844 },
    { config: { network_enabled: false, talent_directory_enabled: false } },
  );
  await homeDisabled.page.goto(baseUrl, { waitUntil: 'networkidle' });
  assert.equal(await homeDisabled.page.getByRole('heading', { name: '人才网络正在灰度准备。' }).isVisible(), true);
  assert.equal(await homeDisabled.page.getByRole('link', { name: 'FDE 小班培训', exact: true }).isVisible(), true);
  await homeDisabled.context.close();

  const brokenJson = await pageWithRoutes(
    { width: 390, height: 844 },
    { detailBody: '<private socket error>' },
  );
  await brokenJson.page.goto(new URL('talents/manufacturing-kb-fde/', baseUrl).href, { waitUntil: 'networkidle' });
  assert.equal(await brokenJson.page.getByText('人才档案暂时读取失败', { exact: true }).isVisible(), true);
  assert.equal(await brokenJson.page.getByText('private socket error').count(), 0);
  await brokenJson.context.close();

  const directoryDisabled = await pageWithRoutes(
    { width: 390, height: 844 },
    { listResponses: [{ status: 404, items: [] }] },
  );
  await directoryDisabled.page.goto(new URL('talents/', baseUrl).href, { waitUntil: 'networkidle' });
  assert.equal(await directoryDisabled.page.getByText('人才目录正在灰度准备，暂未对外开放。', { exact: true }).isVisible(), true);
  assert.equal(await directoryDisabled.page.locator('.empty-panel').getByRole('link', { name: 'FDE 小班培训' }).isVisible(), true);
  await directoryDisabled.context.close();

  const empty = await pageWithRoutes(
    { width: 390, height: 844 },
    { listResponses: [{ status: 200, items: [] }] },
  );
  await empty.page.goto(new URL('talents/?city=%E5%8C%97%E4%BA%AC', baseUrl).href, { waitUntil: 'networkidle' });
  assert.equal(await empty.page.getByText('暂时没有符合条件的公开档案。', { exact: true }).isVisible(), true);
  assert.match(empty.page.url(), /city=%E5%8C%97%E4%BA%AC/);
  await empty.context.close();

  const retry = await pageWithRoutes(
    { width: 390, height: 844 },
    { listResponses: [{ status: 500, items: [] }, { status: 200, items: [fixture] }] },
  );
  await retry.page.goto(new URL('talents/?city=%E5%8C%97%E4%BA%AC', baseUrl).href, { waitUntil: 'networkidle' });
  assert.equal(await retry.page.getByText('人才目录暂时读取失败。', { exact: true }).isVisible(), true);
  await retry.page.getByRole('button', { name: '重试' }).click();
  await retry.page.getByRole('heading', { name: '制造业知识库 FDE' }).waitFor();
  assert.match(retry.page.url(), /city=%E5%8C%97%E4%BA%AC/);
  await retry.context.close();
  console.log('FDE talent network browser checks passed');
} finally {
  await browser.close();
}
