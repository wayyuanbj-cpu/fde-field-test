# FDE Field Test English Mirror Design

**Date:** 2026-07-16  
**Status:** Approved direction, pending written-spec review  
**Production routes:** `https://fde.onex.plus/` and `https://fde.onex.plus/en/`

## 1. Objective

Deliver a complete English mirror of the existing Chinese FDE Field Test. The English version must match the Chinese site in layout, interaction, assessment scope, progression rules, privacy behavior, analytics behavior, and share-card output. It is a localization project, not a separate product and not a literal translation.

The English copy must read as if it were written by a native product and editorial team for global AI delivery practitioners, founders, and enterprise decision-makers.

## 2. Product Parity

The English route includes everything available on the Chinese route:

- the 12-question quick potential test;
- the 100-question junior assessment;
- the 60-question intermediate assessment;
- the 40-question advanced assessment;
- sequential unlock rules;
- full-assessment and practice modes;
- exact-match scoring for multiple-choice questions;
- module diagnosis, answer review, progress restore, and retry flows;
- level-result cards and the final three-level share card;
- optional local-only display name on the final card;
- anonymous analytics with the same privacy boundaries.

The private analytics dashboard remains Chinese-only.

## 3. Routes and Language Switching

- Chinese: `/`
- English: `/en/`
- The Chinese header exposes an `EN` switch.
- The English header exposes a `中文` switch.
- Both documents declare canonical URLs and reciprocal `hreflang` entries for `zh-CN`, `en`, and `x-default`.
- The English document uses `lang="en"`, English title, description, and social metadata.

Switching languages preserves:

- the active question position;
- saved answers;
- sequential qualification records;
- best scores;
- final completion state.

Question IDs, answer keys, module IDs, and progression storage keys remain identical across languages. Only user-facing content changes.

## 4. Localization Architecture

Use a localized surface with shared language-neutral engines:

- retain the existing scoring, persistence, progression, validation, and analytics modules as the source of truth;
- add English UI copy and English question-bank content under `/en/`;
- keep the English page structure and CSS behavior aligned with the Chinese page;
- avoid a fully duplicated scoring or progression implementation;
- expose a small locale configuration to UI modules instead of forking rules.

This preserves exact parity while allowing English copy to be edited independently.

## 5. Editorial Standard

Localization uses the project translation profile in `.baoyu-skills/baoyu-translate/EXTEND.md`:

- target: global English / en-US;
- mode: refined;
- audience: global AI delivery practitioners, founders, and enterprise decision-makers;
- voice: native, sharp, credible, concise, and outcome-oriented;
- avoid Chinese sentence structures and literal idiom translation.

The refined workflow produces and preserves:

- content analysis;
- terminology and voice prompt;
- first draft;
- critical review;
- revised draft;
- final polished copy.

These artifacts live under `docs/localization/en-US/` and are not deployed into the public web root.

### Editorial examples

- `你具备成为 FDE 的潜质吗？` becomes `Could You Actually Ship as an FDE?`
- `会用 AI，不等于能做 FDE。` becomes `Knowing the tools is not the same as owning the outcome.`
- `高级不是选的，是一关关考出来的。` becomes `Advanced is not a label you choose. It is a standard you earn.`
- `测测你的 FDE 灵根` becomes `Test Your FDE Instincts`, never a literal rendering of `灵根`.

## 6. Chinese Entry Copy Adjustment

The existing Chinese quick-test primary action changes from `开始校准` to:

- primary label: `测测你的 FDE 灵根`
- supporting label: `12 题 · 约 8 分钟`
- professional secondary action remains: `直接参加分级考核`

This gives the public entry a memorable, shareable tone while preserving the serious assessment path underneath it.

## 7. Question-Bank Rules

All 212 public questions are rewritten in natural English:

- 12 quick-test scenarios;
- 100 junior questions;
- 60 intermediate questions;
- 40 advanced questions.

For every question:

- preserve ID, type, module, answer indices, and scoring behavior;
- rewrite scenario, prompt, options, and explanation;
- use credible enterprise AI delivery language;
- preserve risk nuance and distractor intent;
- avoid Chinese-specific organizational shorthand unless the scenario requires it;
- replace culture-bound phrasing with an equivalent global enterprise context without changing the tested capability.

Automated parity checks fail if IDs, counts, answer keys, question types, or modules diverge.

## 8. Share Cards and Boundaries

English share cards preserve the Chinese card layouts and data:

- quick-test profile card;
- level result card;
- final three-level completion card;
- optional name remains memory-only and is never uploaded or stored.

The English boundary statement must explicitly say that the result comes from a public capability challenge and is not a formal graduation, certification, or real-project capability determination.

## 9. Analytics

Both language versions send the same anonymous event whitelist. Add a constrained `locale` value (`zh-CN` or `en`) so the Chinese private dashboard can show language-version traffic share.

No new personal data is collected. The English version must retain the current rules:

- no names;
- no answers;
- no raw IP storage;
- no full User-Agent storage;
- no tracking on `file:`, localhost, DNT, or webdriver environments;
- analytics failure cannot block any assessment flow.

## 10. Professional SEO and Search Discovery

SEO is part of both public language versions, not an English-only add-on. The goal is to make the site technically discoverable and genuinely useful for searches around FDE and Field Deployment Engineer. No implementation or submission may claim guaranteed indexing, recommendation, or ranking.

### 10.1 Keyword intent

Use a narrow, credible keyword map instead of keyword stuffing.

Chinese primary intents:

- `FDE`
- `FDE 是什么`
- `FDE 工程师`
- `FDE 能力测试`
- `FDE 水平测试`
- `FDE 培训`
- `Field Deployment Engineer`
- `企业 AI 交付`

English primary intents:

- `FDE`
- `Field Deployment Engineer`
- `FDE assessment`
- `FDE skills test`
- `Field Deployment Engineer assessment`
- `enterprise AI delivery`
- `AI deployment engineer`
- `AI solution delivery`

`FD` is not a primary keyword because it is highly ambiguous. It may appear naturally where relevant, but the site must consistently establish `FDE` and `Field Deployment Engineer` as the intended entity.

### 10.2 Search-facing page content

Both home pages add a mirrored, visible, below-the-fold knowledge section that answers real search intent without weakening the existing hero:

- What is an FDE?
- What does a Field Deployment Engineer actually do?
- Which capabilities does this assessment measure?
- How do the junior, intermediate, and advanced levels work?
- Is this a formal certification?
- How is FDE different from a prompt engineer, solutions engineer, or implementation consultant?

This content must demonstrate the OneX FDE training framework, explain the assessment methodology, and remain useful even if a visitor does not take the test. Chinese and English versions carry equivalent meaning but are written natively for their respective audiences.

### 10.3 Titles, snippets, headings, and share metadata

Each language receives distinct, descriptive metadata aligned with the visible H1:

- Chinese title direction: `FDE 测试：你具备成为 Field Deployment Engineer 的潜质吗？｜OneX`
- English title direction: `FDE Assessment: Could You Ship as a Field Deployment Engineer? | OneX`

Add localized:

- meta descriptions;
- canonical URLs;
- reciprocal `hreflang`;
- Open Graph title, description, URL, locale, and image;
- Twitter card metadata;
- a 1200×630 bilingual-safe social preview image;
- descriptive, crawlable internal language-switch links.

Do not add obsolete `meta keywords` tags.

### 10.4 Structured data

Add accurate JSON-LD using only properties supported by visible content:

- `WebSite` for the FDE Field Test site name and canonical URL;
- `Organization` for OneX AI Community and its logo;
- localized descriptions and `inLanguage` where applicable.

Do not add fake reviews, ratings, certificates, FAQ rich-result promises, or unsupported claims. Validate JSON-LD before release.

### 10.5 Crawling and multilingual indexing

The current production fallback incorrectly returns the HTML home page for `/robots.txt` and `/sitemap.xml`. Replace that behavior with real files and exact static routes:

- `/robots.txt` served as `text/plain`;
- `/sitemap.xml` served as XML;
- the sitemap lists only canonical public URLs;
- both `/` and `/en/` include reciprocal `xhtml:link` language alternates;
- `lastmod` reflects a real content release date;
- `robots.txt` references the sitemap;
- `/api/` is not crawlable;
- `/stats/` remains protected from indexing through its existing HTML and HTTP `noindex` signals.

Unknown SEO assets must return a real 404 instead of the home page.

### 10.6 Search-engine notification and ownership tools

- Generate and host an IndexNow key file.
- Submit `/` and `/en/` to IndexNow after production deployment.
- Prepare Google Search Console and Bing Webmaster Tools verification paths.
- Submit `sitemap.xml` and request inspection for both public URLs once the user is signed in to the relevant webmaster accounts.

Search Console ownership and manual inspection require the user's authenticated Google account. The site implementation and verification endpoints can be prepared without that login, but account-side submission is a separate acceptance step.

### 10.7 SEO quality and measurement

Acceptance covers:

- people-first, original FDE methodology content rather than keyword repetition;
- one clear H1 per language page;
- correct heading hierarchy and crawlable links;
- mobile layout and page experience;
- no public-page `noindex`;
- canonical and `hreflang` reciprocity;
- valid sitemap and robots responses with correct content types;
- valid JSON-LD;
- correct Open Graph image dimensions and metadata;
- successful IndexNow response;
- a post-launch checklist for Search Console impressions, queries, indexing, Core Web Vitals, and Bing crawl diagnostics.

## 11. Error Handling and Compatibility

- Missing English content must fail loudly in tests, not silently fall back to Chinese inside a question.
- A language switch during an active assessment must restore by question ID.
- Corrupt or obsolete progress follows the existing safe-clear behavior.
- English text must not cause horizontal overflow at 390 px.
- Share-card text must fit or shrink predictably for long English labels and optional names.

## 12. Testing and Acceptance

Acceptance requires:

- unit parity tests for 12/100/60/40 counts and exact answer-key equivalence;
- a scan proving no user-facing Chinese remains under `/en/` except the `中文` language switch and OneX proper names;
- full English browser completion from junior through advanced;
- language switching during an active exam with progress preserved;
- exact-match multiple-choice behavior;
- final English share-card generation and download;
- desktop and 390 px mobile checks with no overflow or console errors;
- analytics locale validation and Chinese-dashboard language breakdown;
- SEO regression checks for titles, descriptions, canonical URLs, `hreflang`, JSON-LD, robots, sitemap, and social cards;
- production verification for `/`, `/en/`, `/stats/`, API health, Xray, and analytics failure isolation.

## 13. Deployment

The English mirror ships in the existing GitHub repository and is deployed through the existing GitHub-to-Aliyun script. Public web deployment includes `/en/`; translation working files under `docs/` remain excluded from the web root.

The release is complete only when GitHub `main`, the Aliyun web root, and live browser checks all match the same commit.

## 14. SEO Reference Basis

The implementation follows current primary-source guidance from:

- Google Search Central: multilingual sites, localized versions, title links, structured data, people-first content, sitemaps, and recrawl requests;
- Bing Webmaster Guidelines: crawlable links, canonical URLs, sitemap freshness, and IndexNow.
