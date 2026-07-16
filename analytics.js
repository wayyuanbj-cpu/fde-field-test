const EVENTS = new Set([
  "page_view", "quick_start", "quick_complete", "level_start", "level_complete",
  "level_unlock", "final_complete", "share_generate",
]);
const LEVELS = new Set(["junior", "intermediate", "advanced"]);
const MODES = new Set(["full", "mock"]);
const VISITOR_KEY = "onex-fde-analytics:visitor";
const SESSION_KEY = "onex-fde-analytics:session";

export function analyticsEnabled(environment = globalThis) {
  const location = environment.location;
  const navigator = environment.navigator;
  if (!location || !navigator) return false;
  if (location.protocol === "file:" || ["localhost", "127.0.0.1", "::1"].includes(location.hostname)) return false;
  if (["1", "yes"].includes(String(navigator.doNotTrack).toLowerCase())) return false;
  if (navigator.webdriver) return false;
  return location.protocol === "https:";
}

function opaqueId(environment) {
  if (environment.crypto?.randomUUID) return environment.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function storedId(storage, key, environment) {
  try {
    const existing = storage?.getItem(key);
    if (existing) return existing;
    const created = opaqueId(environment);
    storage?.setItem(key, created);
    return created;
  } catch {
    return opaqueId(environment);
  }
}

function sourceOf(environment) {
  try {
    const url = new URL(environment.location.href);
    const campaign = url.searchParams.get("utm_source");
    if (campaign) return campaign.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32) || "campaign";
    const referrer = environment.document?.referrer;
    if (!referrer) return "direct";
    const host = new URL(referrer).hostname;
    if (/weixin|wechat|qq\.com/.test(host)) return "wechat";
    if (/(^|\.)x\.com$|twitter/.test(host)) return "x";
    return "referral";
  } catch {
    return "direct";
  }
}

function deviceOf(environment) {
  const userAgent = String(environment.navigator?.userAgent ?? "");
  if (/iPad|Tablet/i.test(userAgent)) return "tablet";
  if (/Mobile|Android|iPhone/i.test(userAgent)) return "mobile";
  return userAgent ? "desktop" : "other";
}

function allowedProperties(properties) {
  const safe = {};
  if (LEVELS.has(properties?.level)) safe.level = properties.level;
  if (MODES.has(properties?.mode)) safe.mode = properties.mode;
  if (Number.isInteger(properties?.score) && properties.score >= 0 && properties.score <= 100) safe.score = properties.score;
  return safe;
}

export function createAnalyticsClient(environment = globalThis) {
  function track(event, properties = {}) {
    if (!EVENTS.has(event) || !analyticsEnabled(environment)) return false;
    const payload = {
      event,
      visitor_id: storedId(environment.localStorage, VISITOR_KEY, environment),
      session_id: storedId(environment.sessionStorage, SESSION_KEY, environment),
      source: sourceOf(environment),
      device: deviceOf(environment),
      ...allowedProperties(properties),
    };
    const json = JSON.stringify(payload);
    try {
      const blob = new environment.Blob([json], { type: "application/json" });
      if (environment.navigator.sendBeacon?.("/api/analytics/events", blob)) return true;
    } catch { /* use keepalive fallback */ }
    try {
      Promise.resolve(environment.fetch?.("/api/analytics/events", {
        method: "POST",
        body: json,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      })).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }
  return { track };
}

const defaultClient = createAnalyticsClient();
export const track = defaultClient.track;
