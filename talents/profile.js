import { presentTalent, profileSlug } from './talent-model.js';

export async function loadTalentProfile(fetchImpl, pathname) {
  const slug = profileSlug(pathname);
  if (!slug) throw new Error('没有找到这份公开档案');

  let configResponse;
  try {
    configResponse = await fetchImpl('/api/network/config', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new Error('人才档案暂时读取失败');
  }
  if (!configResponse.ok) throw new Error('人才档案暂时读取失败');
  let config;
  try {
    config = await configResponse.json();
  } catch {
    throw new Error('人才档案暂时读取失败');
  }
  if (config?.features?.network_enabled !== true || config?.features?.talent_directory_enabled !== true) {
    throw new Error('人才网络正在灰度准备中');
  }

  let response;
  try {
    response = await fetchImpl(`/api/network/public/talents/${slug}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new Error('人才档案暂时读取失败');
  }
  if (!response.ok) {
    throw new Error(response.status === 404 ? '没有找到这份公开档案' : '人才档案暂时读取失败');
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('人才档案暂时读取失败');
  }
  if (!payload?.talent || payload.talent.slug !== slug) throw new Error('人才档案暂时读取失败');
  return payload.talent;
}

function setText(documentObject, id, value) {
  const node = documentObject.getElementById(id);
  if (node) node.textContent = String(value ?? '');
}

export function renderTalentProfile(documentObject, talent) {
  const view = presentTalent(talent);
  setText(documentObject, 'profile-code', `FDE NETWORK / ${view.slug.toUpperCase()}`);
  setText(documentObject, 'profile-name', talent.display_name);
  setText(documentObject, 'profile-headline', talent.headline);
  setText(documentObject, 'profile-status', view.statusLabel);
  setText(documentObject, 'profile-certification', view.certificationLabel);
  setText(documentObject, 'profile-summary', talent.summary);
  setText(documentObject, 'profile-package', talent.service_package);
  setText(documentObject, 'profile-evidence', talent.evidence_summary);
  setText(documentObject, 'profile-not-fit', talent.not_fit);

  const meta = documentObject.getElementById('profile-meta');
  meta.replaceChildren();
  for (const value of [talent.city, view.serviceModeLabel, view.availabilityLabel]) {
    if (!value) continue;
    const item = documentObject.createElement('span');
    item.textContent = String(value);
    meta.append(item);
  }

  const tags = documentObject.getElementById('profile-tags');
  tags.replaceChildren();
  for (const value of Array.isArray(talent.tags) ? talent.tags.slice(0, 10) : []) {
    const item = documentObject.createElement('span');
    item.textContent = String(value).trim().slice(0, 40);
    tags.append(item);
  }

  const requestLink = documentObject.getElementById('profile-request-link');
  requestLink.href = `/enterprise/?talent=${encodeURIComponent(view.slug)}`;
  documentObject.getElementById('profile-canonical').href = `https://fde.onex.plus/talents/${view.slug}/`;
  documentObject.title = `${talent.display_name}｜OneX FDE 人才网络`;
  documentObject.getElementById('profile-state').hidden = true;
  const recovery = documentObject.getElementById('profile-recovery');
  if (recovery) recovery.hidden = true;
  documentObject.getElementById('profile-content').hidden = false;
}

async function setup(documentObject, environment) {
  try {
    const talent = await loadTalentProfile(environment.fetch.bind(environment), environment.location.pathname);
    renderTalentProfile(documentObject, talent);
  } catch (error) {
    setText(documentObject, 'profile-state', error.message);
  }
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') setup(document, window);
