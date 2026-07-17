# FDE Assessment Integrity and Confidence Design

**Status:** Approved  
**Date:** 2026-07-17  
**Scope:** Chinese and English public FDE assessments

## Purpose

The public assessment must reduce casual AI-assisted answering without turning a lead-generation experience into invasive online proctoring. It must also stop presenting a single raw percentage as if it were a fully calibrated measurement.

The system will therefore report two independent results:

1. **Ability result** — a diagnostic score plus the existing strict qualification gates.
2. **Answer confidence** — a conservative assessment of whether the attempt contains enough independent-answering signals to support progression.

The feature does not claim to prove cheating. It identifies attempts that require an independent retake.

## Product Boundary

- No camera, microphone, screen recording, identity document, or mandatory account.
- No answer content, question IDs, names, raw timestamps, or full referrers are uploaded.
- One accidental tab switch must not invalidate an attempt.
- A low-confidence result may show learning feedback but may not unlock the next level.
- This remains a public diagnostic challenge, not formal OneX FDE certification.

## Attempt Randomization

Each new attempt randomizes both question order and the four option positions. The displayed option order and remapped answer indexes are persisted with the resumable attempt so refresh and resume cannot corrupt scoring.

The option mapping is local to the browser. It is never sent to analytics.

## Local Integrity Signals

`exam-integrity.js` owns a pure, testable session model. The browser records only the following local signals:

- attempt start, resume, and submit time;
- first-view and answer time per displayed question;
- number of answer changes;
- document visibility exits and total hidden duration;
- copy, cut, paste, and context-menu attempts inside the exam surface;
- number and share of implausibly fast answers.

Question content remains selectable for accessibility where possible, but copying from the exam surface is intercepted and recorded. Browser shortcuts outside the exam are not globally modified.

## Confidence Rules

The classifier returns `trusted`, `review`, or `low`, plus human-readable reason codes. It uses additive evidence with caps so one signal cannot dominate:

| Signal | Review evidence | Low-confidence evidence |
| --- | --- | --- |
| Exam copy/paste/context attempts | 2 or more | 5 or more |
| Visibility exits | 4 or more | 9 or more |
| Total hidden duration | over 90 seconds | over 5 minutes |
| Answers made under 3 seconds | over 25% | over 50% |
| Total full-exam duration | under 30% of suggested time | under 18% of suggested time |

The implementation converts these observations into a capped risk score:

- `0–3`: `trusted`
- `4–7`: `review`
- `8+`: `low`

Only `low` blocks progression. `review` is displayed as “signals limited” but does not by itself accuse or block the candidate. The policy is intentionally tolerant of ordinary interruptions.

## Ability and Qualification Scores

The result screen distinguishes two calculations:

### Diagnostic ability score

Single-choice and judgment questions remain exact. Multiple-choice questions receive diagnostic evidence credit:

```text
credit = max(0, selected-correct / all-correct - selected-wrong / all-wrong)
```

Selecting every option therefore earns zero. Selecting only part of the correct set earns limited diagnostic credit. The displayed diagnostic score and module profile use this credit.

### Strict qualification score

Progression remains deliberately stricter:

- multiple-choice questions require an exact set match;
- full-assessment strict score must be at least 85;
- every strict module score must be at least 70;
- all critical questions must be correct;
- confidence must not be `low`.

The strict score is shown beside the ability score so candidates can understand why a nuanced diagnostic result did or did not unlock progression.

## State and Data Flow

1. Starting an attempt creates randomized question/option mappings and an integrity session.
2. Answer and visibility events update local persisted state.
3. Submission computes strict scoring, diagnostic scoring, and confidence independently.
4. Qualification evaluates score, module floor, critical misses, then confidence.
5. The result page displays ability score, strict score, confidence label, and a neutral retake message when blocked.
6. Analytics receives only coarse buckets and the final confidence band.

The exam-state schema advances to version 3. Version-2 attempts cannot resume because they lack stable randomized option mappings and integrity state.

## Localization and Accessibility

Chinese uses “答题可信度 / 可信 / 信号有限 / 需要独立复测”. English uses “Answer confidence / Trusted / Limited signals / Independent retake required”. Neither locale uses “cheater”, “fraud”, or an equivalent accusation.

All controls remain keyboard accessible. The confidence explanation is text, not color-only. Copy interception is limited to the active exam surface and does not block assistive technology navigation.

## Testing

Pure Node tests must cover:

- option remapping preserves the correct answer;
- resume preserves question and option order;
- multiple-choice diagnostic credit and all-option penalty;
- each confidence threshold and the tolerant one-switch path;
- low confidence blocks an otherwise qualified result;
- no raw answer or question data appears in analytics payloads;
- Chinese and English copy parity.

Browser tests must cover:

- a normal all-correct path remains qualified;
- copy plus repeated visibility exits produce the neutral retake result;
- refresh/resume retains randomized options and answers;
- mobile layout has no horizontal overflow.

## Limitations

A static public website cannot reliably detect a second device, screenshots, or a determined developer reading the bundled source. This mechanism raises the cost of casual AI-assisted completion and prevents suspicious attempts from being treated as reliable evidence; it does not claim forensic proof.
