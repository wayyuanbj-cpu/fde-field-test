import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
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

console.log("FDE bilingual SEO/GEO document checks passed");
