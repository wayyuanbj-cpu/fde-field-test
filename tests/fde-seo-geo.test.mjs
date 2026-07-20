import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const origin = "https://fde.onex.plus";
const pages = [
  { file: "index.html", path: "/", lang: "zh-CN" },
  { file: "en/index.html", path: "/en/", lang: "en" },
  { file: "fde-guide/index.html", path: "/fde-guide/", lang: "zh-CN", guide: true },
  { file: "en/fde-guide/index.html", path: "/en/fde-guide/", lang: "en", guide: true },
];

function contentOf(file) {
  const path = resolve(root, file);
  assert.equal(existsSync(path), true, `${file} must exist`);
  return readFileSync(path, "utf8");
}

function linksByRel(html, rel) {
  return [...html.matchAll(/<link\b([^>]+)>/gi)]
    .map((match) => match[1])
    .filter((attrs) => new RegExp(`\\brel=["']${rel}["']`, "i").test(attrs));
}

for (const page of pages) {
  const html = contentOf(page.file);
  assert.match(html, new RegExp(`<html[^>]+lang=["']${page.lang}["']`, "i"), `${page.file} lang`);
  assert.equal((html.match(/<h1\b/gi) ?? []).length, 1, `${page.file} must have one H1`);
  assert.match(html, /<meta\s+name=["']description["']\s+content=["'][^"']{60,}["']/i, `${page.file} description`);
  assert.match(html, new RegExp(`<link[^>]+rel=["']canonical["'][^>]+href=["']${origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${page.path}["']`, "i"), `${page.file} canonical`);

  const alternates = linksByRel(html, "alternate").join("\n");
  for (const locale of ["zh-CN", "en", "x-default"]) {
    assert.match(alternates, new RegExp(`hreflang=["']${locale}["']`, "i"), `${page.file} ${locale} alternate`);
  }

  for (const property of ["og:title", "og:description", "og:url", "og:image"]) {
    assert.match(html, new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["'][^"']+["']`, "i"), `${page.file} ${property}`);
  }
  assert.match(html, /<meta[^>]+name=["']twitter:card["'][^>]+content=["']summary_large_image["']/i);
  assert.match(html, /OneX AI (?:社区|Community)/i, `${page.file} visible publisher`);
  assert.match(html, /(?:不代表正式毕业|不等同于正式|not (?:a )?(?:formal )?(?:graduation|certification)|does not certify)/i, `${page.file} boundary`);

  const scripts = [...html.matchAll(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length >= 1, `${page.file} JSON-LD`);
  for (const [, json] of scripts) assert.doesNotThrow(() => JSON.parse(json), `${page.file} valid JSON-LD`);

  if (page.guide) {
    for (const id of ["definition", "responsibilities", "capability-model", "role-comparison", "assessment-method", "boundaries"]) {
      assert.match(html, new RegExp(`id=["']${id}["']`), `${page.file} #${id}`);
    }
    assert.match(html, /<table\b/i, `${page.file} comparison table`);
    assert.match(html, /(?:审校日期|Reviewed)[:：]?\s*<time[^>]+datetime=["']2026-07-16["']/i);
    assert.match(html, /(?:版本|Version)[:：]?\s*1\.0/i);
    assert.ok(scripts.some(([, json]) => /"@type"\s*:\s*"(?:Article|TechArticle)"/.test(json)), `${page.file} Article schema`);
  }
}

for (const file of ["assets/og-fde-zh.png", "assets/og-fde-en.png"]) {
  const buffer = readFileSync(resolve(root, file));
  assert.equal(buffer.readUInt32BE(16), 1200, `${file} width`);
  assert.equal(buffer.readUInt32BE(20), 630, `${file} height`);
}

const robots = contentOf("robots.txt");
function robotGroup(userAgent) {
  const groups = robots.split(/\n\s*\n/);
  return groups.find((group) => new RegExp(`^User-agent:\\s*${userAgent}$`, "im").test(group)) ?? "";
}
for (const bot of ["Googlebot", "bingbot", "OAI-SearchBot", "PerplexityBot", "Claude-SearchBot", "Claude-User"]) {
  const group = robotGroup(bot);
  assert.ok(group, `${bot} robots group`);
  assert.match(group, /^Allow:\s*\/$/im, `${bot} public allow`);
  assert.match(group, /^Disallow:\s*\/api\/$/im, `${bot} api exclusion`);
  assert.match(group, /^Disallow:\s*\/stats\/$/im, `${bot} stats exclusion`);
  assert.match(group, /^Disallow:\s*\/ops\/$/im, `${bot} operations exclusion`);
}
for (const bot of ["GPTBot", "ClaudeBot", "Google-Extended"]) {
  assert.match(robotGroup(bot), /^Disallow:\s*\/$/im, `${bot} training exclusion`);
}
assert.match(robots, /^Sitemap:\s*https:\/\/fde\.onex\.plus\/sitemap\.xml$/im);

const sitemap = contentOf("sitemap.xml");
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert.deepEqual(sitemapUrls, [
  `${origin}/`, `${origin}/en/`, `${origin}/fde-guide/`, `${origin}/en/fde-guide/`,
  `${origin}/fde-training/`,
]);
assert.equal((sitemap.match(/<lastmod>2026-07-16<\/lastmod>/g) ?? []).length, 4);
assert.equal((sitemap.match(/<lastmod>2026-07-20<\/lastmod>/g) ?? []).length, 1);
assert.equal((sitemap.match(/hreflang="zh-CN"/g) ?? []).length, 5);
assert.equal((sitemap.match(/hreflang="en"/g) ?? []).length, 4);
assert.equal((sitemap.match(/hreflang="x-default"/g) ?? []).length, 5);

const llms = contentOf("llms.txt");
for (const path of ["/", "/en/", "/fde-guide/", "/en/fde-guide/", "/fde-training/"]) {
  assert.ok(llms.includes(`${origin}${path}`), `llms public link ${path}`);
}
assert.match(llms, /(?:not|does not constitute) (?:formal )?(?:graduation|certification)|不代表正式毕业/i);
for (const value of [robots, sitemap, llms]) {
  assert.doesNotMatch(value, /(?:answer[-_ ]?key|答案库)/i);
  if (value !== robots) assert.doesNotMatch(value, /\/(?:api|stats)\//);
}

const indexNowFiles = readdirSync(root).filter((file) => /^[a-f0-9]{32}\.txt$/.test(file));
assert.equal(indexNowFiles.length, 1, "one IndexNow key file");
const indexNowKey = indexNowFiles[0].replace(/\.txt$/, "");
assert.equal(contentOf(indexNowFiles[0]).trim(), indexNowKey, "IndexNow filename and content match");

for (const file of ["deploy/fde.onex.plus.nginx.conf", "deploy/fde.onex.plus.acme.nginx.conf"]) {
  const nginx = contentOf(file);
  for (const [route, type] of [["robots.txt", "text/plain"], ["sitemap.xml", "application/xml"], ["llms.txt", "text/plain"], [`${indexNowKey}.txt`, "text/plain"]]) {
    const match = nginx.match(new RegExp(`location = /${route.replace(".", "\\.")} \\{([^}]+)\\}`, "m"));
    assert.ok(match, `${file} exact /${route}`);
    assert.match(match[1], /try_files\s+\$uri\s+=404;/, `${file} ${route} no fallback`);
    assert.match(match[1], new RegExp(`default_type\\s+${type.replace("/", "\\/")};`), `${file} ${route} MIME`);
  }
}

console.log("FDE bilingual SEO/GEO and crawler discovery checks passed");
