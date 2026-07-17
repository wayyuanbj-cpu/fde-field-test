const STATE_VERSION = 2;

export function examStateKey(level, mode) {
  return `onex-fde-exam:${STATE_VERSION}:${level}:${mode}`;
}

export function saveExamState(storage, key, state) {
  try {
    storage.setItem(key, JSON.stringify({ ...state, version: STATE_VERSION, updatedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function loadExamState(storage, key, validQuestionIds) {
  let raw;
  try {
    raw = storage.getItem(key);
  } catch {
    return { valid: false, reason: "storage" };
  }
  if (!raw) return { valid: false, reason: "missing" };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, reason: "parse" };
  }
  if (parsed.version !== STATE_VERSION) return { valid: false, reason: "version" };
  if (!Array.isArray(parsed.questionIds) || parsed.questionIds.some((id) => !validQuestionIds.has(id))) {
    return { valid: false, reason: "questions" };
  }
  if (!parsed.answers || typeof parsed.answers !== "object") return { valid: false, reason: "answers" };
  const maxIndex = Math.max(parsed.questionIds.length - 1, 0);
  parsed.currentIndex = Math.min(Math.max(Number(parsed.currentIndex) || 0, 0), maxIndex);
  return { valid: true, state: parsed };
}

export function clearExamState(storage, key) {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
