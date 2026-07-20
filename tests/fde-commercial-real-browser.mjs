import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const siteBase = process.env.FDE_TEST_URL ?? 'http://127.0.0.1:4174/';
const apiBase = process.env.FDE_COMMERCIAL_API_URL ?? 'http://127.0.0.1:8767';
const desktopScreenshot = process.env.FDE_DESKTOP_SCREENSHOT ?? '/tmp/fde-training-real-desktop.png';
const mobileScreenshot = process.env.FDE_MOBILE_SCREENSHOT ?? '/tmp/fde-training-real-mobile.png';
const useSiteProxy = process.env.FDE_USE_SITE_PROXY === '1';
const browser = await chromium.launch({ headless: true });

async function proxyCommercial(route) {
  const request = route.request();
  const incoming = new URL(request.url());
  const target = new URL(`${incoming.pathname}${incoming.search}`, apiBase);
  const headers = { ...request.headers() };
  delete headers.host;
  const response = await fetch(target, {
    method: request.method(),
    headers,
    body: ['GET', 'HEAD'].includes(request.method()) ? undefined : request.postDataBuffer(),
  });
  const responseHeaders = Object.fromEntries(response.headers.entries());
  delete responseHeaders['content-encoding'];
  delete responseHeaders['content-length'];
  await route.fulfill({
    status: response.status,
    headers: responseHeaders,
    body: Buffer.from(await response.arrayBuffer()),
  });
}

async function newPage(viewport, colorScheme = 'light') {
  const context = await browser.newContext({ viewport, colorScheme });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  if (!useSiteProxy) await page.route('**/api/commercial/**', proxyCommercial);
  return { context, page, errors };
}

try {
  const desktop = await newPage({ width: 1440, height: 1000 });
  let submitted = null;
  desktop.page.on('request', (request) => {
    if (request.url().includes('/api/commercial/public/training-applications')) {
      submitted = {
        idempotencyKey: request.headers()['idempotency-key'],
        payload: request.postDataJSON(),
      };
    }
  });
  await desktop.page.goto(new URL('fde-training/?source=community', siteBase).href, {
    waitUntil: 'networkidle',
  });
  assert.equal(await desktop.page.locator('#product-state').innerText(), '开放申请');
  await desktop.page.getByLabel('姓名', { exact: true }).fill('浏览器验收申请人');
  await desktop.page.getByLabel('手机号', { exact: true }).fill('13900007777');
  await desktop.page.getByLabel('当前职业或岗位', { exact: true }).fill('企业 AI 项目经理');
  await desktop.page.getByLabel('目前的 AI 使用或交付经验').selectOption('practitioner');
  await desktop.page.getByLabel('已有项目或交付经验').fill('参与过虚构企业知识库试点');
  await desktop.page.getByLabel('希望通过小班解决什么问题').fill('建立可验收的企业 AI 交付方法');
  await desktop.page.getByLabel('可以投入的学习与实操时间').fill('每周 10 小时');
  await desktop.page.getByLabel(/我同意 OneX/).check();
  await desktop.page.getByRole('button', { name: '提交申请' }).click();
  await desktop.page.locator('#application-success:not([hidden])').waitFor();
  const publicId = await desktop.page.locator('#success-public-id').innerText();
  assert.match(publicId, /^FDE-A-[A-Z0-9]{10}$/);
  assert.ok(submitted?.idempotencyKey);

  const repeated = await fetch(
    new URL('/api/commercial/public/training-applications', apiBase),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': submitted.idempotencyKey,
      },
      body: JSON.stringify(submitted.payload),
    },
  );
  assert.equal(repeated.status, 200);
  const repeatedPayload = await repeated.json();
  assert.equal(repeatedPayload.public_id, publicId);
  assert.deepEqual(Object.keys(repeatedPayload).sort(), [
    'message',
    'next_step',
    'public_id',
    'status',
  ]);
  assert.equal(
    await desktop.page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
    true,
  );
  await desktop.page.screenshot({ path: desktopScreenshot, fullPage: true });
  assert.deepEqual(desktop.errors, []);
  await desktop.context.close();

  const mobile = await newPage({ width: 390, height: 844 }, 'dark');
  await mobile.page.goto(new URL('fde-training/?source=community', siteBase).href, {
    waitUntil: 'networkidle',
  });
  assert.equal(await mobile.page.locator('#product-state').innerText(), '开放申请');
  assert.equal(
    await mobile.page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
    true,
  );
  await mobile.page.screenshot({ path: mobileScreenshot, fullPage: true });
  assert.deepEqual(mobile.errors, []);
  await mobile.context.close();

  console.log(JSON.stringify({ publicId, desktopScreenshot, mobileScreenshot }));
} finally {
  await browser.close();
}
