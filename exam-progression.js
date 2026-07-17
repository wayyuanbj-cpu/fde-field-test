import {
  ADVANCE_SCORE,
  MODULE_FLOOR,
  levelDefinitions,
  levelOrder,
} from "./assessment-levels.js";

export const PROGRESSION_VERSION = 3;
export const PROGRESSION_KEY = `onex-fde-progression:${PROGRESSION_VERSION}`;

export function createEmptyProgression() {
  return { version: PROGRESSION_VERSION, records: {} };
}

function lowestModuleScore(moduleScores = {}) {
  const values = Object.values(moduleScores).filter(Number.isFinite);
  return values.length ? Math.min(...values) : 0;
}

export function evaluateQualification(mode, result) {
  const lowest = lowestModuleScore(result?.moduleScores);
  if (mode !== "full") return { qualifies: false, reason: "mode", lowestModuleScore: lowest };
  if ((result?.unanswered ?? 0) > 0) return { qualifies: false, reason: "incomplete", lowestModuleScore: lowest };
  if ((result?.score ?? 0) < ADVANCE_SCORE) return { qualifies: false, reason: "score", lowestModuleScore: lowest };
  if (lowest < MODULE_FLOOR) return { qualifies: false, reason: "module", lowestModuleScore: lowest };
  if ((result?.criticalMisses ?? 0) > 0) {
    return { qualifies: false, reason: "critical", lowestModuleScore: lowest, criticalMisses: result.criticalMisses };
  }
  if (result?.integrity?.eligible === false) {
    return { qualifies: false, reason: "integrity", lowestModuleScore: lowest, integrityBand: result.integrity.band ?? "low" };
  }
  return { qualifies: true, reason: "qualified", lowestModuleScore: lowest };
}

function compareRecords(candidate, existing) {
  if (!existing) return 1;
  if (candidate.qualifies !== existing.qualifies) return candidate.qualifies ? 1 : -1;
  if (candidate.score !== existing.score) return candidate.score - existing.score;
  return candidate.lowestModuleScore - existing.lowestModuleScore;
}

function cloneProgression(current) {
  return {
    version: PROGRESSION_VERSION,
    records: Object.fromEntries(Object.entries(current?.records ?? {}).map(([level, record]) => [level, {
      ...record,
      moduleScores: { ...(record.moduleScores ?? {}) },
    }])),
  };
}

export function updateProgression(current, level, mode, result, now = new Date().toISOString()) {
  if (!levelDefinitions[level]) throw new Error(`未知等级：${level}`);
  if (mode !== "full") return current;
  const evaluation = evaluateQualification(mode, result);
  const candidate = {
    score: Number(result.score) || 0,
    diagnosticScore: Number.isFinite(result.diagnosticScore) ? result.diagnosticScore : Number(result.score) || 0,
    lowestModuleScore: evaluation.lowestModuleScore,
    moduleScores: { ...(result.moduleScores ?? {}) },
    criticalMisses: Number(result.criticalMisses) || 0,
    integrityBand: ["trusted", "review", "low"].includes(result.integrity?.band) ? result.integrity.band : "review",
    qualifies: evaluation.qualifies,
    completedAt: now,
  };
  const existing = current?.records?.[level];
  if (compareRecords(candidate, existing) <= 0) return current;
  const next = cloneProgression(current ?? createEmptyProgression());
  next.records[level] = candidate;
  return next;
}

export function canAccessLevel(current, level) {
  const index = levelOrder.indexOf(level);
  if (index < 0) return false;
  return levelOrder.slice(0, index).every((required) => current?.records?.[required]?.qualifies === true);
}

export function nextLevel(level) {
  const index = levelOrder.indexOf(level);
  return index >= 0 && index < levelOrder.length - 1 ? levelOrder[index + 1] : null;
}

function validRecord(level, record) {
  if (!levelDefinitions[level] || !record || typeof record !== "object") return false;
  if (!Number.isFinite(record.score) || !Number.isFinite(record.diagnosticScore) || !Number.isFinite(record.lowestModuleScore)) return false;
  if (!Number.isFinite(record.criticalMisses) || record.criticalMisses < 0) return false;
  if (!["trusted", "review", "low"].includes(record.integrityBand)) return false;
  if (typeof record.qualifies !== "boolean" || !record.moduleScores || typeof record.moduleScores !== "object") return false;
  return Object.values(record.moduleScores).every(Number.isFinite);
}

export function loadProgression(storage) {
  const empty = createEmptyProgression();
  let raw;
  try { raw = storage?.getItem(PROGRESSION_KEY); } catch { return { valid: false, reason: "storage", state: empty }; }
  if (!raw) return { valid: true, state: empty };
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { valid: false, reason: "parse", state: empty }; }
  if (parsed?.version !== PROGRESSION_VERSION) return { valid: false, reason: "version", state: empty };
  if (!parsed.records || typeof parsed.records !== "object" || Array.isArray(parsed.records)) {
    return { valid: false, reason: "records", state: empty };
  }
  if (Object.entries(parsed.records).some(([level, record]) => !validRecord(level, record))) {
    return { valid: false, reason: "records", state: empty };
  }
  return { valid: true, state: cloneProgression(parsed) };
}

export function saveProgression(storage, state) {
  try {
    storage?.setItem(PROGRESSION_KEY, JSON.stringify(cloneProgression(state)));
    return Boolean(storage);
  } catch {
    return false;
  }
}

export function clearProgression(storage) {
  try {
    storage?.removeItem(PROGRESSION_KEY);
    return Boolean(storage);
  } catch {
    return false;
  }
}
