import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const baseUrl = process.env.FDE_TEST_URL ?? 'http://127.0.0.1:4174/';
const browser = await chromium.launch({ headless: true });

async function openTrainingPage(viewport, colorScheme = 'light') {
  const context = await browser.newContext({ viewport, colorScheme });
  const page = await context.newPage();
  const errors = [];
  const applicationRequests = [];
  const analyticsPayloads = [];
  let attempts = 0;
  page.on('console', (message) => {
    if (
      message.type() === 'error'
      && !/Failed to load resource: the server responded with a status of 500/.test(message.text())
    ) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/analytics/events', async (route) => {
    try {
      analyticsPayloads.push(route.request().postDataJSON());
    } catch {
      errors.push('analytics payload was not JSON');
    }
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/commercial/public/**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'FDE-TRAINING-SMALL-CLASS',
          name: 'OneX FDE 小班实战培训',
          capacity_per_cohort: 10,
          application_status: 'open',
          price_display: '沟通后确认',
          public_path: '/fde-training/',
        }),
      });
    }
    attempts += 1;
    applicationRequests.push({
      idempotencyKey: request.headers()['idempotency-key'],
      payload: request.postDataJSON(),
    });
    if (attempts === 1) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'internal_error' }),
      });
    }
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        public_id: 'FDE-A-AB12CD34EF',
        status: 'submitted',
        message: '申请已提交，我们会在审核后与您联系。',
        next_step: '请留意 OneX 招生运营的后续沟通。',
      }),
    });
  });
  await page.goto(new URL('fde-training/?source=public_test', baseUrl).href, {
    waitUntil: 'networkidle',
  });
  return { context, page, errors, applicationRequests, analyticsPayloads };
}

async function fillApplication(page) {
  await page.getByLabel('姓名', { exact: true }).fill('张三');
  await page.getByLabel('手机号', { exact: true }).fill('13800138000');
  await page.getByLabel('当前职业或岗位', { exact: true }).fill('产品经理');
  await page.getByLabel('目前的 AI 使用或交付经验').selectOption('practitioner');
  await page.getByLabel('已有项目或交付经验').fill('参与过知识库项目');
  await page.getByLabel('希望通过小班解决什么问题').fill('建立完整企业 AI 交付能力');
  await page.getByLabel('可以投入的学习与实操时间').fill('每周 10 小时');
  await page.getByLabel(/我同意 OneX/).check();
}

async function contrastRatio(page, selector, backgroundHex) {
  return page.locator(selector).first().evaluate((element, hex) => {
    const parseRgb = (value) => {
      const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      if (!channels || channels.length !== 3) throw new Error(`无法解析颜色：${value}`);
      return channels;
    };
    const parseHex = (value) => [
      Number.parseInt(value.slice(1, 3), 16),
      Number.parseInt(value.slice(3, 5), 16),
      Number.parseInt(value.slice(5, 7), 16),
    ];
    const luminance = (channels) => {
      const linear = channels.map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
    };
    const foreground = luminance(parseRgb(getComputedStyle(element).color));
    const background = luminance(parseHex(hex));
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  }, backgroundHex);
}

try {
  {
    const { context, page, errors, applicationRequests, analyticsPayloads } =
      await openTrainingPage({ width: 1365, height: 900 });
    assert.equal(await page.getByRole('heading', { name: /从会用 AI/ }).isVisible(), true);
    assert.equal(await page.getByRole('link', { name: '申请加入小班' }).first().isVisible(), true);
    assert.equal(await page.getByRole('heading', { name: '你会完整跑一遍企业 AI 交付。' }).isVisible(), true);
    assert.equal(await page.getByRole('heading', { name: '结业不是听完课，是交出一个可验收项目包。' }).isVisible(), true);
    assert.equal(await page.locator('.outcome-card').count(), 6);
    assert.equal(await page.locator('.rubric-list li').count(), 6);
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
      'rgb(7, 22, 43)',
    );
    assert.equal(await page.locator('#product-state').innerText(), '开放申请');
    assert.equal(await page.locator('.hero-visual img').evaluate((image) => image.complete && image.naturalWidth > 1000), true);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
      true,
    );
    const primaryLabel = await page.getByRole('link', { name: '申请加入小班' }).first().boundingBox();
    assert.ok(primaryLabel && primaryLabel.height <= 56, 'desktop CTA must not wrap');

    await page.locator('#training-application-form').scrollIntoViewIfNeeded();
    await fillApplication(page);
    await page.getByRole('button', { name: '提交申请' }).click();
    await page.waitForFunction(() => document.querySelector('#form-error')?.textContent.trim().length > 0);
    assert.match(await page.locator('#form-error').innerText(), /暂时无法提交/);
    await page.getByRole('button', { name: '提交申请' }).click();
    await page.locator('#application-success:not([hidden])').waitFor();

    assert.equal(await page.locator('#success-public-id').innerText(), 'FDE-A-AB12CD34EF');
    assert.equal(applicationRequests.length, 2);
    assert.ok(applicationRequests[0].idempotencyKey);
    assert.equal(applicationRequests[0].idempotencyKey, applicationRequests[1].idempotencyKey);
    assert.deepEqual(applicationRequests[1].payload, {
      product_code: 'FDE-TRAINING-SMALL-CLASS',
      offer_id: 'fde-small-class-open-application',
      name: '张三',
      mobile: '13800138000',
      wechat: '',
      current_role: '产品经理',
      ai_experience: 'practitioner',
      fde_experience: '参与过知识库项目',
      learning_goal: '建立完整企业 AI 交付能力',
      time_commitment: '每周 10 小时',
      source: 'public_test',
      consent_version: 'training-application-v1',
      _company: '',
    });
    const analyticsJson = JSON.stringify(analyticsPayloads);
    assert.equal(analyticsJson.includes('13800138000'), false);
    assert.equal(analyticsJson.includes('张三'), false);
    assert.equal(analyticsJson.includes('FDE-A-AB12CD34EF'), false);
    assert.deepEqual(errors, []);
    await context.close();
  }

  {
    const { context, page, errors } = await openTrainingPage(
      { width: 390, height: 844 },
      'dark',
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
      true,
    );
    assert.equal(await page.getByRole('link', { name: '申请加入小班' }).first().isVisible(), true);
    assert.equal(await page.locator('.training-header nav').isHidden(), true);
    assert.match(await page.locator('.hero-visual figcaption').innerText(), /每期最多 10 人/);
    assert.equal(await page.locator('.outcome-card').count(), 6);
    await page.locator('#graduation').scrollIntoViewIfNeeded();
    assert.equal(await page.getByText('70', { exact: true }).isVisible(), true);
    assert.equal(await page.getByText('85+', { exact: true }).isVisible(), true);
    for (const [selector, background, minimum] of [
      ['.hero-kicker', '#07162b', 4.5],
      ['.hero-visual figcaption strong', '#030b17', 4.5],
      ['.practice-grid article:not(.practice-main) span', '#07162b', 4.5],
      ['.graduation-thresholds > div:last-child strong', '#eef3f8', 3],
      ['.boundary-label', '#0a1e40', 4.5],
      ['.boundary-copy a', '#0a1e40', 4.5],
    ]) {
      assert.ok(
        await contrastRatio(page, selector, background) >= minimum,
        `${selector} must meet WCAG contrast ${minimum}:1`,
      );
    }
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
      true,
    );
    assert.deepEqual(errors, []);
    await context.close();
  }

  console.log('FDE training browser checks passed');
} finally {
  await browser.close();
}
