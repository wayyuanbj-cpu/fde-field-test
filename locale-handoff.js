const KEY = "onex-fde-locale-handoff";
const VERSION = 1;
const MAX_AGE_MS = 5 * 60 * 1000;

export function writeLocaleHandoff(storage, payload, now = Date.now()) {
  if (!storage || !["quiz-view", "result-view"].includes(payload?.view)) return false;
  const value = {
    version: VERSION,
    view: payload.view,
    current: payload.current,
    answers: payload.answers,
    createdAt: now,
  };
  try {
    storage.setItem(KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readLocaleHandoff(storage, questions, now = Date.now()) {
  if (!storage || !Array.isArray(questions)) return null;
  let parsed;
  try {
    const raw = storage.getItem(KEY);
    storage.removeItem(KEY);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed?.version !== VERSION || !["quiz-view", "result-view"].includes(parsed.view)) return null;
  if (!Number.isFinite(parsed.createdAt) || now - parsed.createdAt < 0 || now - parsed.createdAt > MAX_AGE_MS) return null;
  if (!Number.isInteger(parsed.current) || parsed.current < 0 || parsed.current >= questions.length) return null;
  if (!parsed.answers || typeof parsed.answers !== "object" || Array.isArray(parsed.answers)) return null;
  const contract = new Map(questions.map((question) => [question.id, question.options.length]));
  const answers = {};
  for (const [id, answer] of Object.entries(parsed.answers)) {
    const optionCount = contract.get(id);
    if (!optionCount || !Number.isInteger(answer) || answer < 0 || answer >= optionCount) return null;
    answers[id] = answer;
  }
  return { view: parsed.view, current: parsed.current, answers };
}
