import assert from "node:assert/strict";
import {
  createIntegritySession,
  finalizeIntegrity,
  recordAnswerEvent,
  recordIntegrityEvent,
  recordQuestionView,
} from "../exam-integrity.js";

function answerSequence({ questionCount = 10, secondsPerQuestion = 12, suggestedMinutes = 10 } = {}) {
  let session = createIntegritySession({ startedAt: 0, suggestedMinutes, questionCount });
  for (let index = 0; index < questionCount; index += 1) {
    const viewedAt = index * secondsPerQuestion * 1_000;
    session = recordQuestionView(session, `Q${index + 1}`, viewedAt);
    session = recordAnswerEvent(session, `Q${index + 1}`, viewedAt + Math.min(6_000, secondsPerQuestion * 800));
  }
  return session;
}

const normal = finalizeIntegrity(answerSequence(), 8 * 60_000);
assert.equal(normal.band, "trusted");
assert.equal(normal.eligible, true);
assert.equal(normal.risk, 0);
assert.equal(normal.fastAnswerShare, 0);

let oneSwitch = answerSequence();
oneSwitch = recordIntegrityEvent(oneSwitch, "hidden", 120_000);
oneSwitch = recordIntegrityEvent(oneSwitch, "visible", 140_000);
const oneSwitchResult = finalizeIntegrity(oneSwitch, 8 * 60_000);
assert.equal(oneSwitchResult.band, "trusted", "one ordinary interruption must not invalidate an attempt");
assert.equal(oneSwitchResult.visibilityExits, 1);
assert.equal(oneSwitchResult.hiddenMs, 20_000);

let repeatedCopyAndExit = answerSequence();
for (let index = 0; index < 5; index += 1) {
  repeatedCopyAndExit = recordIntegrityEvent(repeatedCopyAndExit, "copy", 50_000 + index);
}
for (let index = 0; index < 9; index += 1) {
  const hiddenAt = 100_000 + index * 2_000;
  repeatedCopyAndExit = recordIntegrityEvent(repeatedCopyAndExit, "hidden", hiddenAt);
  repeatedCopyAndExit = recordIntegrityEvent(repeatedCopyAndExit, "visible", hiddenAt + 1_000);
}
const low = finalizeIntegrity(repeatedCopyAndExit, 8 * 60_000);
assert.equal(low.band, "low");
assert.equal(low.eligible, false);
assert.equal(low.risk, 8);
assert.deepEqual(low.reasons.sort(), ["clipboard", "visibility"]);

const veryFast = finalizeIntegrity(answerSequence({ secondsPerQuestion: 2 }), 60_000);
assert.equal(veryFast.band, "review", "correlated speed signals must not alone create a low-confidence verdict");
assert.equal(veryFast.risk, 4);
assert.ok(veryFast.fastAnswerShare > 0.5);

let hiddenLong = answerSequence();
hiddenLong = recordIntegrityEvent(hiddenLong, "hidden", 60_000);
hiddenLong = recordIntegrityEvent(hiddenLong, "visible", 170_001);
const review = finalizeIntegrity(hiddenLong, 8 * 60_000);
assert.equal(review.band, "trusted", "one long interruption alone stays below the review threshold");
assert.equal(review.risk, 2);
assert.deepEqual(review.reasons, ["hidden"]);

let changes = createIntegritySession({ startedAt: 0, suggestedMinutes: 10, questionCount: 1 });
changes = recordQuestionView(changes, "Q1", 10_000);
changes = recordQuestionView(changes, "Q1", 11_000);
changes = recordAnswerEvent(changes, "Q1", 15_000);
changes = recordAnswerEvent(changes, "Q1", 17_000);
assert.equal(changes.questionFirstSeen.Q1, 10_000);
assert.equal(changes.questionAnsweredAt.Q1, 15_000);
assert.equal(changes.answerChanges.Q1, 1);

const unchanged = recordIntegrityEvent(changes, "unknown", 20_000);
assert.deepEqual(unchanged, changes);

console.log("FDE integrity classifier checks passed");
