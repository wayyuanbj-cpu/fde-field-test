import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(root, 'fde-training/index.html'), 'utf8');
const homeHtml = await readFile(path.join(root, 'index.html'), 'utf8');
const quickApp = await readFile(path.join(root, 'app.js'), 'utf8');
const examApp = await readFile(path.join(root, 'exam-app.js'), 'utf8');
const {
  buildApplicationPayload,
  loadTrainingProduct,
  normalizeTrainingSource,
} = await import('../fde-training/training.js');

assert.match(html, /OneX FDE 小班实战培训/);
assert.match(html, /每期最多 10 人/);
assert.match(html, /完成培训或支付培训费用，不代表自动进入/);
assert.match(html, /name="mobile"/);
assert.match(html, /name="learning_goal"/);
assert.match(html, /name="consent"/);
assert.match(html, /不保证。培训提供能力训练和交付反馈/);
assert.doesNotMatch(html, /完成培训即可获得认证|付款后自动进入人才库/);
assert.match(homeHtml, /id="home-training-link"[^>]+fde-training\/\?source=direct/);
assert.match(homeHtml, /id="quick-training-link"/);
assert.match(homeHtml, /id="exam-training-link"/);
assert.match(quickApp, /quick-training-link["']\)\.href = "\.\/fde-training\/\?source=public_test"/);
assert.match(examApp, /exam-training-link["']\)\.href = "\.\/fde-training\/\?source=public_test"/);

const values = {
  name: ' 张三 ',
  mobile: ' 13800138000 ',
  wechat: ' ',
  current_role: ' 产品经理 ',
  ai_experience: 'practitioner',
  fde_experience: ' 参与过知识库项目 ',
  learning_goal: ' 建立完整企业 AI 交付能力 ',
  time_commitment: ' 每周 10 小时 ',
  _company: '',
};
const formFixture = {
  elements: {
    namedItem(name) {
      return { value: values[name] ?? '' };
    },
  },
};

assert.deepEqual(buildApplicationPayload(formFixture, 'public_test'), {
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

assert.equal(normalizeTrainingSource('wechat_article'), 'wechat_article');
assert.equal(normalizeTrainingSource('enterprise'), 'referral');
assert.equal(normalizeTrainingSource('unknown-source'), 'direct');

const requests = [];
const product = await loadTrainingProduct(async (url, options) => {
  requests.push({ url, options });
  return {
    ok: true,
    json: async () => ({
      code: 'FDE-TRAINING-SMALL-CLASS',
      name: 'OneX FDE 小班实战培训',
      capacity_per_cohort: 10,
      application_status: 'open',
      price_display: '沟通后确认',
      public_path: '/fde-training/',
    }),
  };
});
assert.equal(requests[0].url, '/api/commercial/public/products/FDE-TRAINING-SMALL-CLASS');
assert.equal(requests[0].options.credentials, 'same-origin');
assert.equal(product.capacity_per_cohort, 10);

await assert.rejects(
  () => loadTrainingProduct(async () => ({ ok: false, status: 503 })),
  /暂时无法读取培训信息/,
);

console.log('FDE training deterministic tests passed');
