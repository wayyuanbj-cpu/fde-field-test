import { track } from '../analytics.js';

const PRODUCT_CODE = 'FDE-TRAINING-SMALL-CLASS';
const OFFER_CODE = 'fde-small-class-open-application';
const CONSENT_VERSION = 'training-application-v1';
const PRODUCT_ENDPOINT = `/api/commercial/public/products/${PRODUCT_CODE}`;
const APPLICATION_ENDPOINT = '/api/commercial/public/training-applications';
const ALLOWED_SOURCES = new Set([
  'public_test',
  'wechat_article',
  'community',
  'talent_page',
  'referral',
  'direct',
  'other',
]);
const SOURCE_ALIASES = Object.freeze({
  test: 'public_test',
  assessment: 'public_test',
  wechat: 'wechat_article',
  weixin: 'wechat_article',
  enterprise: 'referral',
  enterprise_referral: 'referral',
  recommendation: 'referral',
});

export function normalizeTrainingSource(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);
  const mapped = SOURCE_ALIASES[normalized] ?? normalized;
  return ALLOWED_SOURCES.has(mapped) ? mapped : 'direct';
}

export function buildApplicationPayload(form, source) {
  const value = (name) => String(form.elements.namedItem(name)?.value ?? '').trim();
  return {
    product_code: PRODUCT_CODE,
    offer_id: OFFER_CODE,
    name: value('name'),
    mobile: value('mobile'),
    wechat: value('wechat'),
    current_role: value('current_role'),
    ai_experience: value('ai_experience'),
    fde_experience: value('fde_experience'),
    learning_goal: value('learning_goal'),
    time_commitment: value('time_commitment'),
    source: normalizeTrainingSource(source),
    consent_version: CONSENT_VERSION,
    _company: value('_company'),
  };
}

export async function loadTrainingProduct(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(PRODUCT_ENDPOINT, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!response?.ok) {
    throw new Error('暂时无法读取培训信息，请稍后重试。');
  }
  const product = await response.json();
  if (
    product?.code !== PRODUCT_CODE
    || !Number.isInteger(product?.capacity_per_cohort)
    || !['open', 'waitlist_only', 'paused', 'closed'].includes(product?.application_status)
  ) {
    throw new Error('培训信息格式异常，请稍后重试。');
  }
  return product;
}

function sourceFromLocation(locationObject) {
  try {
    const url = new URL(locationObject.href);
    return normalizeTrainingSource(
      url.searchParams.get('source') || url.searchParams.get('utm_source') || 'direct',
    );
  } catch {
    return 'direct';
  }
}

function newIdempotencyKey(environment = globalThis) {
  if (environment.crypto?.randomUUID) return environment.crypto.randomUUID();
  if (environment.crypto?.getRandomValues) {
    const bytes = new Uint8Array(18);
    environment.crypto.getRandomValues(bytes);
    return Array.from(bytes, (item) => item.toString(16).padStart(2, '0')).join('');
  }
  return `fde-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function productStateCopy(status) {
  return {
    open: '开放申请',
    waitlist_only: '开放候补申请',
    paused: '暂停接收新申请',
    closed: '本期申请已关闭',
  }[status] ?? '暂时无法确认';
}

function publicStatusCopy(status) {
  return {
    submitted: '已提交',
    waitlisted: '候补审核中',
  }[status] ?? '审核中';
}

function errorCopy(response, payload) {
  if (response.status === 409 && payload?.error === 'existing_application') {
    return '该手机号已有一份有效申请，请等待运营联系。';
  }
  if (response.status === 409 && payload?.error === 'applications_closed') {
    return '当前招生方案暂不接收新申请。';
  }
  if (response.status === 413) {
    return '申请内容过长，请精简后再次提交。';
  }
  if (response.status === 400 && payload?.message) {
    return String(payload.message).slice(0, 180);
  }
  return '申请暂时无法提交，请稍后重试。';
}

function setupPage(documentObject, environment = globalThis) {
  const form = documentObject.querySelector('#training-application-form');
  if (!form) return;

  const submit = documentObject.querySelector('#application-submit');
  const error = documentObject.querySelector('#form-error');
  const success = documentObject.querySelector('#application-success');
  const reset = documentObject.querySelector('#application-reset');
  const productName = documentObject.querySelector('#product-name');
  const productCapacity = documentObject.querySelector('#product-capacity');
  const productState = documentObject.querySelector('#product-state');
  const productPrice = documentObject.querySelector('#product-price');
  const successPublicId = documentObject.querySelector('#success-public-id');
  const successStatus = documentObject.querySelector('#success-status');
  const successNextStep = documentObject.querySelector('#success-next-step');
  const source = sourceFromLocation(environment.location);
  let product = null;
  let idempotencyKey = null;
  let applyStarted = false;

  track('training_page_view', { source });

  function setProductState(item) {
    product = item;
    productName.textContent = item.name;
    productCapacity.textContent = `每期最多 ${item.capacity_per_cohort} 人`;
    productPrice.textContent = item.price_display || '沟通后确认';
    productState.textContent = productStateCopy(item.application_status);
    productState.dataset.state = item.application_status;
    const canApply = ['open', 'waitlist_only'].includes(item.application_status);
    submit.disabled = !canApply;
    submit.textContent = item.application_status === 'waitlist_only' ? '提交候补申请' : '提交申请';
    if (!canApply) {
      error.textContent = '你仍可查看课程信息，当前暂不接收新申请。';
    }
  }

  function setProductError(message) {
    product = null;
    productState.textContent = '读取失败';
    productState.dataset.state = 'closed';
    submit.disabled = true;
    error.textContent = message;
  }

  loadTrainingProduct(environment.fetch?.bind(environment))
    .then(setProductState)
    .catch((reason) => setProductError(reason.message));

  form.addEventListener('focusin', () => {
    if (applyStarted) return;
    applyStarted = true;
    track('training_apply_start', { source });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.textContent = '';
    if (!form.reportValidity()) {
      error.textContent = '请检查必填项，并确认信息使用说明。';
      return;
    }
    if (!product || !['open', 'waitlist_only'].includes(product.application_status)) {
      error.textContent = '当前招生状态不允许提交新申请。';
      return;
    }

    idempotencyKey ||= newIdempotencyKey(environment);
    submit.disabled = true;
    submit.textContent = '正在提交';
    form.setAttribute('aria-busy', 'true');
    try {
      const response = await environment.fetch(APPLICATION_ENDPOINT, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(buildApplicationPayload(form, source)),
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        const result = payload?.error === 'existing_application' ? 'existing' : 'error';
        track('training_apply_error', { source, result });
        error.textContent = errorCopy(response, payload);
        if (payload?.error === 'applications_closed') {
          setProductState({ ...product, application_status: payload.application_status || 'closed' });
        }
        return;
      }

      successPublicId.textContent = payload.public_id;
      successStatus.textContent = publicStatusCopy(payload.status);
      successNextStep.textContent = payload.next_step;
      form.hidden = true;
      success.hidden = false;
      track('training_apply_submit', {
        source,
        result: payload.status === 'waitlisted' ? 'waitlisted' : 'submitted',
      });
      success.focus?.();
    } catch {
      track('training_apply_error', { source, result: 'network' });
      error.textContent = '网络连接异常。你的提交编号已保留，可直接重试，不会重复创建申请。';
    } finally {
      form.removeAttribute('aria-busy');
      if (!form.hidden && product) {
        const canApply = ['open', 'waitlist_only'].includes(product.application_status);
        submit.disabled = !canApply;
        submit.textContent = product.application_status === 'waitlist_only' ? '提交候补申请' : '提交申请';
      }
    }
  });

  reset.addEventListener('click', () => {
    form.reset();
    form.hidden = false;
    success.hidden = true;
    idempotencyKey = null;
    applyStarted = false;
    error.textContent = '';
    if (product) setProductState(product);
    form.querySelector('input')?.focus();
  });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  setupPage(document, window);
}
