const CLIPBOARD_EVENTS = new Set(["copy", "cut", "paste", "contextmenu"]);

function finiteTime(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function cloneSession(session) {
  return {
    ...session,
    questionFirstSeen: { ...(session.questionFirstSeen ?? {}) },
    questionAnsweredAt: { ...(session.questionAnsweredAt ?? {}) },
    answerChanges: { ...(session.answerChanges ?? {}) },
  };
}

export function createIntegritySession({ startedAt = Date.now(), suggestedMinutes = 1, questionCount = 1 } = {}) {
  return {
    version: 1,
    startedAt: finiteTime(startedAt),
    suggestedMinutes: Math.max(1, finiteTime(suggestedMinutes, 1)),
    questionCount: Math.max(1, Math.trunc(finiteTime(questionCount, 1))),
    questionFirstSeen: {},
    questionAnsweredAt: {},
    answerChanges: {},
    visibilityExits: 0,
    hiddenMs: 0,
    hiddenSince: null,
    clipboardAttempts: 0,
  };
}

export function recordQuestionView(session, questionId, at = Date.now()) {
  const id = String(questionId ?? "");
  if (!id || Object.hasOwn(session.questionFirstSeen ?? {}, id)) return session;
  const next = cloneSession(session);
  next.questionFirstSeen[id] = finiteTime(at, next.startedAt);
  return next;
}

export function recordAnswerEvent(session, questionId, at = Date.now()) {
  const id = String(questionId ?? "");
  if (!id) return session;
  const next = cloneSession(session);
  if (Object.hasOwn(next.questionAnsweredAt, id)) {
    next.answerChanges[id] = (Number(next.answerChanges[id]) || 0) + 1;
  } else {
    next.questionAnsweredAt[id] = finiteTime(at, next.startedAt);
    next.answerChanges[id] = 0;
  }
  return next;
}

export function recordIntegrityEvent(session, type, at = Date.now()) {
  if (!["hidden", "visible"].includes(type) && !CLIPBOARD_EVENTS.has(type)) return session;
  const timestamp = finiteTime(at, session.startedAt);
  const next = cloneSession(session);
  if (CLIPBOARD_EVENTS.has(type)) {
    next.clipboardAttempts = (Number(next.clipboardAttempts) || 0) + 1;
    return next;
  }
  if (type === "hidden") {
    if (Number.isFinite(next.hiddenSince)) return session;
    next.hiddenSince = timestamp;
    next.visibilityExits = (Number(next.visibilityExits) || 0) + 1;
    return next;
  }
  if (!Number.isFinite(next.hiddenSince)) return session;
  next.hiddenMs = (Number(next.hiddenMs) || 0) + Math.max(0, timestamp - next.hiddenSince);
  next.hiddenSince = null;
  return next;
}

function countEvidence(value, reviewAt, lowAt) {
  if (value >= lowAt) return 4;
  if (value >= reviewAt) return 2;
  return 0;
}

function greaterEvidence(value, reviewAbove, lowAbove) {
  if (value > lowAbove) return 4;
  if (value > reviewAbove) return 2;
  return 0;
}

export function finalizeIntegrity(session, submittedAt = Date.now()) {
  const finish = finiteTime(submittedAt, session.startedAt);
  const openHiddenMs = Number.isFinite(session.hiddenSince) ? Math.max(0, finish - session.hiddenSince) : 0;
  const hiddenMs = (Number(session.hiddenMs) || 0) + openHiddenMs;
  const durationMs = Math.max(0, finish - finiteTime(session.startedAt));
  const answered = Object.entries(session.questionAnsweredAt ?? {});
  const fastAnswers = answered.filter(([id, answeredAt]) => {
    const firstSeen = session.questionFirstSeen?.[id];
    return Number.isFinite(firstSeen) && Number(answeredAt) - firstSeen < 3_000;
  }).length;
  const fastAnswerShare = answered.length ? fastAnswers / answered.length : 0;
  const suggestedMs = Math.max(1, Number(session.suggestedMinutes) || 1) * 60_000;
  const durationRatio = durationMs / suggestedMs;

  const clipboardRisk = countEvidence(Number(session.clipboardAttempts) || 0, 2, 5);
  const visibilityRisk = countEvidence(Number(session.visibilityExits) || 0, 4, 9);
  const hiddenRisk = greaterEvidence(hiddenMs, 90_000, 300_000);
  const fastRisk = greaterEvidence(fastAnswerShare, 0.25, 0.5);
  const durationRisk = durationRatio < 0.18 ? 4 : durationRatio < 0.3 ? 2 : 0;
  const speedRisk = Math.max(fastRisk, durationRisk);
  const risk = clipboardRisk + visibilityRisk + hiddenRisk + speedRisk;
  const reasons = [];
  if (clipboardRisk) reasons.push("clipboard");
  if (visibilityRisk) reasons.push("visibility");
  if (hiddenRisk) reasons.push("hidden");
  if (fastRisk) reasons.push("fast");
  if (durationRisk) reasons.push("duration");
  const band = risk >= 8 ? "low" : risk >= 4 ? "review" : "trusted";

  return {
    band,
    eligible: band !== "low",
    risk,
    reasons,
    durationMs,
    fastAnswerShare,
    visibilityExits: Number(session.visibilityExits) || 0,
    hiddenMs,
    clipboardAttempts: Number(session.clipboardAttempts) || 0,
  };
}
