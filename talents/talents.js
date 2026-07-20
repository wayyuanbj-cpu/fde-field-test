const STATUSES = new Set(['member', 'cert_pending', 'certified', 'delivery']);
const AVAILABILITY = new Set(['available', 'limited', 'unavailable']);
const SERVICE_COPY = { remote: '远程', onsite: '驻场', hybrid: '混合' };
const AVAILABILITY_COPY = { available: '可对接', limited: '排期有限', unavailable: '暂不可用' };

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

export function renderTalentCard(talent, documentObject = document) {
  const card = documentObject.createElement('article');
  card.className = 'talent-card';
  const top = documentObject.createElement('div');
  top.className = 'talent-card-top';
  const code = documentObject.createElement('span');
  code.className = 'talent-card-code';
  code.textContent = `FDE NETWORK / ${cleanText(talent.slug, 100).toUpperCase()}`;
  const certification = documentObject.createElement('strong');
  certification.className = 'talent-certification';
  certification.textContent = cleanText(talent.certification_label, 80) || '尚未完成 OneX 认证';
  top.append(code, certification);
  const title = documentObject.createElement('h2');
  title.textContent = cleanText(talent.display_name, 180);
  const headline = documentObject.createElement('h3');
  headline.textContent = cleanText(talent.headline, 180);
  const meta = documentObject.createElement('div');
  meta.className = 'talent-meta';
  for (const value of [talent.city, SERVICE_COPY[talent.service_mode], AVAILABILITY_COPY[talent.availability]]) {
    if (!value) continue;
    const item = documentObject.createElement('span');
    item.textContent = cleanText(value);
    meta.append(item);
  }
  const tags = documentObject.createElement('div');
  tags.className = 'talent-tags';
  for (const value of Array.isArray(talent.tags) ? talent.tags.slice(0, 10) : []) {
    const item = documentObject.createElement('span');
    item.textContent = cleanText(value, 40);
    tags.append(item);
  }
  const details = documentObject.createElement('dl');
  for (const [label, value] of [
    ['能力概要', talent.summary],
    ['服务包', talent.service_package],
    ['脱敏证据', talent.evidence_summary],
    ['不适合', talent.not_fit],
  ]) {
    const group = documentObject.createElement('div');
    const term = documentObject.createElement('dt');
    const description = documentObject.createElement('dd');
    term.textContent = label;
    description.textContent = cleanText(value, 2000);
    group.append(term, description);
    details.append(group);
  }
  card.append(top, title, headline, meta, tags, details);
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
      grid.append(empty);
    }
  }
  form.addEventListener('submit', (event) => { event.preventDefault(); refresh(); });
  await refresh();
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  loadDirectory(document, window);
}
