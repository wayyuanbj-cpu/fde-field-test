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

## 10. Error Handling and Compatibility

- Missing English content must fail loudly in tests, not silently fall back to Chinese inside a question.
- A language switch during an active assessment must restore by question ID.
- Corrupt or obsolete progress follows the existing safe-clear behavior.
- English text must not cause horizontal overflow at 390 px.
- Share-card text must fit or shrink predictably for long English labels and optional names.

## 11. Testing and Acceptance

Acceptance requires:

- unit parity tests for 12/100/60/40 counts and exact answer-key equivalence;
- a scan proving no user-facing Chinese remains under `/en/` except the `中文` language switch and OneX proper names;
- full English browser completion from junior through advanced;
- language switching during an active exam with progress preserved;
- exact-match multiple-choice behavior;
- final English share-card generation and download;
- desktop and 390 px mobile checks with no overflow or console errors;
- analytics locale validation and Chinese-dashboard language breakdown;
- production verification for `/`, `/en/`, `/stats/`, API health, Xray, and analytics failure isolation.

## 12. Deployment

The English mirror ships in the existing GitHub repository and is deployed through the existing GitHub-to-Aliyun script. Public web deployment includes `/en/`; translation working files under `docs/` remain excluded from the web root.

The release is complete only when GitHub `main`, the Aliyun web root, and live browser checks all match the same commit.
