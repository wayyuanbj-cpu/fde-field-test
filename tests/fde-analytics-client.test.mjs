import assert from "node:assert/strict";
import { analyticsEnabled, createAnalyticsClient, sourceOf } from "../analytics.js";

function environment(overrides = {}) {
  const local = new Map();
  const session = new Map();
  const storage = (map) => ({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
  });
  const beacons = [];
  const env = {
    location: { protocol: "https:", hostname: "fde.onex.plus", search: "", href: "https://fde.onex.plus/" },
    navigator: { doNotTrack: "0", webdriver: false, userAgent: "Mozilla/5.0 (Macintosh)" },
    document: { referrer: "", documentElement: { lang: "zh-CN" } },
    localStorage: storage(local),
    sessionStorage: storage(session),
    crypto: { randomUUID: (() => { let index = 0; return () => `uuid-${++index}`; })() },
    Blob: class Blob { constructor(parts) { this.text = parts.join(""); } },
    sendBeacon: (url, blob) => { beacons.push({ url, payload: JSON.parse(blob.text) }); return true; },
    fetch: async () => ({ ok: true }),
    ...overrides,
  };
  env.navigator.sendBeacon = env.sendBeacon;
  return { env, beacons, local, session };
}

for (const patch of [
  { location: { protocol: "file:", hostname: "", search: "", href: "file:///test" } },
  { location: { protocol: "http:", hostname: "localhost", search: "", href: "http://localhost" } },
  { navigator: { doNotTrack: "1", webdriver: false, userAgent: "test" } },
  { navigator: { doNotTrack: "0", webdriver: true, userAgent: "test" } },
]) {
  const { env } = environment(patch);
  assert.equal(analyticsEnabled(env), false);
}

const { env, beacons, local, session } = environment();
const client = createAnalyticsClient(env);
assert.equal(client.track("page_view", { name: "secret", answers: [1], score: 99 }), true);
assert.equal(client.track("level_complete", {
  level: "junior",
  mode: "full",
  score: 88,
  confidence: "low",
  visibility: 2,
  clipboard: 3,
  fast: 1,
  duration: 2,
  name: "secret",
  answers: { J001: [1] },
  questionIds: ["J001"],
  timestamps: [1000, 2000],
}), true);
assert.equal(beacons.length, 2);
assert.equal(beacons[0].url, "/api/analytics/events");
assert.equal(beacons[0].payload.event, "page_view");
assert.equal(beacons[0].payload.source, "direct");
assert.equal(beacons[0].payload.device, "desktop");
assert.equal(beacons[0].payload.locale, "zh-CN");
assert.ok(beacons[0].payload.visitor_id.startsWith("uuid-"));
assert.ok(beacons[0].payload.session_id.startsWith("uuid-"));
assert.equal("name" in beacons[1].payload, false);
assert.equal("answers" in beacons[1].payload, false);
assert.equal("questionIds" in beacons[1].payload, false);
assert.equal("timestamps" in beacons[1].payload, false);
assert.deepEqual(
  {
    level: beacons[1].payload.level,
    mode: beacons[1].payload.mode,
    score: beacons[1].payload.score,
    confidence: beacons[1].payload.confidence,
    visibility: beacons[1].payload.visibility,
    clipboard: beacons[1].payload.clipboard,
    fast: beacons[1].payload.fast,
    duration: beacons[1].payload.duration,
  },
  { level: "junior", mode: "full", score: 88, confidence: "low", visibility: 2, clipboard: 3, fast: 1, duration: 2 },
);
assert.equal("confidence" in beacons[0].payload, false, "confidence fields are allowed only on assessment completion");
assert.equal(local.size, 1);
assert.equal(session.size, 1);

for (const [referrer, expected] of [
  ["https://chatgpt.com/c/abc", "chatgpt"],
  ["https://www.perplexity.ai/search/abc", "perplexity"],
  ["https://copilot.microsoft.com/", "copilot"],
  ["https://claude.ai/", "claude"],
  ["https://gemini.google.com/app/abc", "gemini"],
  ["https://www.google.com/search?q=fde", "search"],
  ["https://mp.weixin.qq.com/s/abc", "wechat"],
]) {
  const { env: sourceEnvironment } = environment();
  sourceEnvironment.document.referrer = referrer;
  assert.equal(sourceOf(sourceEnvironment), expected, referrer);
}

for (const [utm, expected] of [["openai", "chatgpt"], ["perplexity", "perplexity"], ["twitter", "x"], ["unknown-partner", "other"]]) {
  const { env: sourceEnvironment } = environment();
  sourceEnvironment.location.href = `https://fde.onex.plus/en/?utm_source=${utm}`;
  assert.equal(sourceOf(sourceEnvironment), expected, utm);
}

const english = environment({ document: { referrer: "", documentElement: { lang: "en" } } });
createAnalyticsClient(english.env).track("page_view");
assert.equal(english.beacons[0].payload.locale, "en");
assert.equal("referrer" in english.beacons[0].payload, false);
assert.equal("query" in english.beacons[0].payload, false);

console.log("FDE anonymous analytics client checks passed");
