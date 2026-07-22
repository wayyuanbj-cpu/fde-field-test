import { presentTalent, profilePath } from './talent-model.js';

const STATUSES = new Set(['member', 'cert_pending', 'certified', 'delivery']);
const AVAILABILITY = new Set(['available', 'limited', 'unavailable']);

function cleanText(value, maximum = 80) {
  return String(value ?? '').trim().slice(0, maximum);
}

export function normalizeFilters(searchParams) {
  const status = cleanText(searchParams.get('status'));
  const availability = cleanText(searchParams.get('availability'));
  return {
    status: STATUSES.has(status) ? status : '',
    city: cleanText(searchParams.get('city')),
    tag: cleanText(searchParams.get('tag')),
    availability: AVAILABILITY.has(availability) ? availability : '',
  };
}

export function buildTalentCardModel(talent) {
  const view = presentTalent(talent);
  return {
    ...view,
    displayName: cleanText(talent.display_name, 180),
    headline: cleanText(talent.headline, 180),
    city: cleanText(talent.city),
    summary: cleanText(talent.summary, 2000),
    servicePackage: cleanText(talent.service_package, 2000),
    evidence: cleanText(talent.evidence_summary, 2000),
    notFit: cleanText(talent.not_fit, 2000),
    tags: Array.isArray(talent.tags) ? talent.tags.slice(0, 6).map((tag) => cleanText(tag, 40)) : [],
    profilePath: profilePath(view.slug),
  };
}

export function renderTalentCard(talent, documentObject = document) {
  const cardModel = buildTalentCardModel(talent);
  const card = documentObject.createElement('article');
  card.className = 'talent-card';
  const top = documentObject.createElement('div');
  top.className = 'talent-card-top';
  const code = documentObject.createElement('span');
  code.className = 'talent-card-code';
  code.textContent = `FDE NETWORK / ${cardModel.slug.toUpperCase()}`;
  const status = documentObject.createElement('span');
  status.className = `talent-status talent-status-${cleanText(talent.status)}`;
  status.textContent = cardModel.statusLabel;
  const certification = documentObject.createElement('strong');
  certification.className = `talent-certification${cardModel.isCertified ? ' is-certified' : ''}`;
  certification.textContent = cardModel.certificationLabel;
  const delivery = documentObject.createElement('span');
  delivery.className = `talent-delivery${talent.delivery_status === 'verified' ? ' is-verified' : ''}`;
  delivery.textContent = cardModel.deliveryLabel;
  top.append(code, status, certification, delivery);
  const title = documentObject.createElement('h2');
  title.textContent = cardModel.displayName;
  const headline = documentObject.createElement('h3');
  headline.textContent = cardModel.headline;
  const meta = documentObject.createElement('div');
  meta.className = 'talent-meta';
  for (const value of [cardModel.city, cardModel.serviceModeLabel, cardModel.availabilityLabel]) {
    if (!value) continue;
    const item = documentObject.createElement('span');
    item.textContent = cleanText(value);
    meta.append(item);
  }
  const tags = documentObject.createElement('div');
  tags.className = 'talent-tags';
  for (const value of cardModel.tags) {
    const item = documentObject.createElement('span');
    item.textContent = value;
    tags.append(item);
  }
  const details = documentObject.createElement('dl');
  for (const [label, value] of [
    ['能力概要', cardModel.summary],
    ['服务包', cardModel.servicePackage],
    ['不适合', cardModel.notFit],
  ]) {
    const group = documentObject.createElement('div');
    const term = documentObject.createElement('dt');
    const description = documentObject.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    group.append(term, description);
    details.append(group);
  }
  const evidence = documentObject.createElement('p');
  evidence.className = 'talent-evidence';
  const evidenceLabel = documentObject.createElement('strong');
  evidenceLabel.className = 'talent-evidence-label';
  evidenceLabel.textContent = '可核验的脱敏证据';
  const evidenceValue = documentObject.createElement('span');
  evidenceValue.textContent = cardModel.evidence;
  evidence.append(evidenceLabel, evidenceValue);
  card.append(top, title, headline, meta, tags, details, evidence);
  if (cardModel.profilePath) {
    const link = documentObject.createElement('a');
    link.className = 'talent-profile-link';
    link.href = cardModel.profilePath;
    link.textContent = '查看独立主页';
    link.setAttribute('aria-label', `查看 ${cleanText(talent.display_name, 180)} 的独立主页`);
    card.append(link);
  }
  return card;
}

async function loadDirectory(documentObject, environment) {
  const form = documentObject.querySelector('#talent-filters');
  const grid = documentObject.querySelector('#talent-grid');
  const state = documentObject.querySelector('#directory-state');
  if (!form || !grid || !state) return;
  const filters = normalizeFilters(new URL(environment.location.href).searchParams);
  for (const [key, value] of Object.entries(filters)) form.elements.namedItem(key).value = value;

  async function refresh() {
    grid.replaceChildren();
    state.textContent = '正在读取经授权的公开人才资料…';
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(normalizeFilters(new URLSearchParams(new FormData(form))))) {
      if (value) params.set(key, value);
    }
    try {
      const response = await environment.fetch(`/api/network/public/talents?${params}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(response.status === 404 ? 'disabled' : 'failed');
      const payload = await response.json();
      const items = Array.isArray(payload.items) ? payload.items : [];
      state.textContent = items.length ? `已显示 ${items.length} 位授权公开的人才库成员` : '暂时没有符合条件的公开档案。';
      if (!items.length) {
        const empty = documentObject.createElement('div');
        empty.className = 'empty-panel';
        empty.textContent = '可以调整城市、标签或可用状态后重试。';
        grid.append(empty);
      } else {
        for (const talent of items) grid.append(renderTalentCard(talent, documentObject));
      }
      environment.history.replaceState(null, '', `${environment.location.pathname}${params.size ? `?${params}` : ''}`);
    } catch (error) {
      state.textContent = error.message === 'disabled' ? '人才目录正在灰度准备，暂未对外开放。' : '人才目录暂时读取失败。';
      const empty = documentObject.createElement('div');
      empty.className = 'empty-panel';
      empty.textContent = state.textContent;
      const retry = documentObject.createElement('button');
      retry.type = 'button';
      retry.textContent = '重试';
      retry.addEventListener('click', refresh);
      empty.append(documentObject.createElement('br'), retry);
      const recovery = documentObject.createElement('nav');
      recovery.className = 'network-recovery-links';
      for (const [href, label] of [['/', 'FDE 公开测试'], ['/fde-training/', 'FDE 小班培训']]) {
        const link = documentObject.createElement('a');
        link.href = href;
        link.textContent = label;
        recovery.append(link);
      }
      empty.append(recovery);
      grid.append(empty);
    }
  }
  form.addEventListener('submit', (event) => { event.preventDefault(); refresh(); });
  await refresh();
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  loadDirectory(document, window);
}
