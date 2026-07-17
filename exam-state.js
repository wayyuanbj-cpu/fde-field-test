const STATE_VERSION = 3;

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
  if (!parsed.optionOrders || typeof parsed.optionOrders !== "object" || Array.isArray(parsed.optionOrders)) {
    return { valid: false, reason: "options" };
  }
  const invalidOptionOrder = parsed.questionIds.some((id) => {
    const order = parsed.optionOrders[id];
    if (!Array.isArray(order) || ![2, 4].includes(order.length)) return true;
    return order.some((value, index) => !Number.isInteger(value)
      || value < 0
      || value >= order.length
      || order.indexOf(value) !== index);
  });
  if (invalidOptionOrder) return { valid: false, reason: "options" };
  if (!parsed.integrity || typeof parsed.integrity !== "object" || Array.isArray(parsed.integrity)) {
    return { valid: false, reason: "integrity" };
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
