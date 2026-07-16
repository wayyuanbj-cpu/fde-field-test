import assert from "node:assert/strict";
import { analyticsEnabled, createAnalyticsClient } from "../analytics.js";

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
    document: { referrer: "" },
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
assert.equal(client.track("level_complete", { level: "junior", mode: "full", score: 88, name: "secret" }), true);
assert.equal(beacons.length, 2);
assert.equal(beacons[0].url, "/api/analytics/events");
assert.equal(beacons[0].payload.event, "page_view");
assert.equal(beacons[0].payload.source, "direct");
assert.equal(beacons[0].payload.device, "desktop");
assert.ok(beacons[0].payload.visitor_id.startsWith("uuid-"));
assert.ok(beacons[0].payload.session_id.startsWith("uuid-"));
assert.equal("name" in beacons[1].payload, false);
assert.equal("answers" in beacons[1].payload, false);
assert.deepEqual(
  { level: beacons[1].payload.level, mode: beacons[1].payload.mode, score: beacons[1].payload.score },
  { level: "junior", mode: "full", score: 88 },
);
assert.equal(local.size, 1);
assert.equal(session.size, 1);

console.log("FDE anonymous analytics client checks passed");
