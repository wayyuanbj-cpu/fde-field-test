import { levelOrder } from "./assessment-levels.js";
import { buildExam, getQuestionBank, scoreExam } from "./exam-scoring.js";
import {
  canAccessLevel,
  createEmptyProgression,
  evaluateQualification,
  loadProgression,
  nextLevel,
  saveProgression,
  updateProgression,
} from "./exam-progression.js";
import { clearExamState, examStateKey, loadExamState, saveExamState } from "./exam-state.js";
import {
  createIntegritySession,
  finalizeIntegrity,
  recordAnswerEvent,
  recordIntegrityEvent,
  recordQuestionView,
} from "./exam-integrity.js";
import { prepareAttempt, restoreAttempt } from "./exam-randomization.js";
import { drawExamShareCard } from "./exam-share-card.js";
import { sanitizeShareName, shareFilename } from "./share-name.js";
import { track } from "./analytics.js";
import { activeBundle } from "./locales/index.js";

const ACTIVE_KEY = "onex-fde-exam:active";
const levelDefinitions = activeBundle.levels;
const ui = activeBundle.ui.exam;
const TYPE_LABELS = ui.typeLabels;
const moduleDefinition = (level, moduleId) => levelDefinitions[level]?.modules.find((module) => module.id === moduleId) ?? null;
const state = {
  level: null,
  mode: null,
  questions: [],
  optionOrders: {},
  integrity: null,
  answers: {},
  currentIndex: 0,
  result: null,
  resume: null,
  progressIssue: null,
  potentialScore: null,
  returnView: "landing-view",
  reviewModule: "all",
  reviewLimit: 10,
  progression: createEmptyProgression(),
  progressionIssue: null,
  qualification: null,
};

const $ = (selector) => document.querySelector(selector);

function showView(id) {
  document.querySelectorAll(".view").forEach((view) => { view.hidden = view.id !== id; });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function storage() {
  try { return window.localStorage; } catch { return null; }
}

function removeActivePointer() {
  try { storage()?.removeItem(ACTIVE_KEY); } catch { /* current-page exam remains usable */ }
}

function saveActivePointer() {
  try {
    storage()?.setItem(ACTIVE_KEY, JSON.stringify({ level: state.level, mode: state.mode, updatedAt: Date.now() }));
  } catch { /* current-page exam remains usable */ }
}

function persist() {
  const target = storage();
  if (!target || !state.level || !state.mode) {
    $("#exam-save-status").textContent = ui.storageUnavailable;
    return;
  }
  const saved = saveExamState(target, examStateKey(state.level, state.mode), {
    level: state.level,
    mode: state.mode,
    questionIds: state.questions.map((question) => question.id),
    optionOrders: state.optionOrders,
    integrity: state.integrity,
    answers: state.answers,
    currentIndex: state.currentIndex,
  });
  if (saved) {
    saveActivePointer();
    $("#exam-save-status").textContent = ui.storageSaved;
  } else {
    $("#exam-save-status").textContent = ui.storageFailed;
  }
}

function findResumable(level) {
  const target = storage();
  if (!target) return null;
  const validIds = new Set(getQuestionBank(level).map((question) => question.id));
  return ["full", "mock"]
    .map((mode) => ({ mode, loaded: loadExamState(target, examStateKey(level, mode), validIds) }))
    .filter((entry) => entry.loaded.valid)
    .sort((a, b) => (b.loaded.state.updatedAt ?? 0) - (a.loaded.state.updatedAt ?? 0))[0] ?? null;
}

function findProgressIssue(level) {
  const target = storage();
  if (!target) return null;
  const validIds = new Set(getQuestionBank(level).map((question) => question.id));
  return ["full", "mock"]
    .map((mode) => ({ mode, loaded: loadExamState(target, examStateKey(level, mode), validIds) }))
    .find((entry) => !entry.loaded.valid && entry.loaded.reason !== "missing") ?? null;
}

function showProgressionNotice(copy) {
  $("#progression-notice").textContent = copy;
}

function renderProgression() {
  levelOrder.forEach((level, index) => {
    const card = document.querySelector(`[data-level-card='${level}']`);
    const button = document.querySelector(`button[data-level='${level}']`);
    const badge = document.querySelector(`[data-level-status='${level}']`);
    const lockCopy = document.querySelector(`[data-lock-copy='${level}']`);
    const bestCopy = document.querySelector(`[data-best-score='${level}']`);
    const record = state.progression.records[level];
    const accessible = canAccessLevel(state.progression, level);
    card.classList.toggle("is-locked", !accessible);
    card.classList.toggle("is-qualified", record?.qualifies === true);
    button.disabled = !accessible;
    button.setAttribute("aria-disabled", String(!accessible));
    if (record?.qualifies) {
      badge.textContent = ui.statusQualified;
      lockCopy.textContent = index === levelOrder.length - 1 ? ui.pathComplete : ui.pathNextUnlocked;
      bestCopy.textContent = ui.bestQualified(record);
    } else if (accessible) {
      badge.textContent = index === 0 ? ui.statusStart : ui.statusUnlocked;
      lockCopy.textContent = index === 0 ? ui.pathStart : ui.pathAccessible;
      bestCopy.textContent = ui.bestPending(record);
    } else {
      badge.textContent = ui.statusLocked;
      const previous = levelDefinitions[levelOrder[index - 1]]?.shortLabel;
      lockCopy.textContent = ui.pathLocked(previous);
      bestCopy.textContent = "";
    }
    document.querySelector(`[data-path-level='${level}']`)?.classList.toggle("is-unlocked", accessible);
    document.querySelector(`[data-path-level='${level}']`)?.classList.toggle("is-complete", record?.qualifies === true);
  });
}

export function openLevelSelector(potentialScore = null, returnView = "landing-view") {
  state.potentialScore = Number.isFinite(potentialScore) ? potentialScore : null;
  state.returnView = returnView;
  $("#level-back-button").textContent = returnView === "result-view" ? ui.backResult : ui.backHome;
  renderProgression();
  if (state.progressionIssue) {
    showProgressionNotice(ui.progressionUpgraded);
  } else if (Number.isFinite(state.potentialScore)) {
    showProgressionNotice(ui.quickProfileOnly);
  } else {
    showProgressionNotice("");
  }
  showView("level-view");
}

function renderMode(level) {
  if (!canAccessLevel(state.progression, level)) {
    openLevelSelector(state.potentialScore, state.returnView);
    const index = levelOrder.indexOf(level);
    const previous = levelDefinitions[levelOrder[index - 1]]?.shortLabel ?? ui.previousLevel;
    showProgressionNotice(ui.noSkipping(previous));
    return;
  }
  const definition = levelDefinitions[level];
  state.level = level;
  $("#mode-level-code").innerHTML = `<span>${definition.code}</span><span>MODE SELECT</span>`;
  $("#mode-title").textContent = definition.title;
  $("#mode-description").textContent = definition.description;
  $("#full-count").textContent = ui.questionCount(definition.fullCount);
  $("#mock-count").textContent = ui.questionCount(definition.mockCount);
  $("#full-time").textContent = ui.suggestedTime(definition.fullTime);
  $("#mock-time").textContent = ui.suggestedTime(definition.mockTime);
  $("#mode-modules").replaceChildren(...definition.modules.map((module) => {
    const row = document.createElement("div");
    row.className = "mode-module";
    row.innerHTML = `<span>${module.code}</span><strong>${module.label}</strong>`;
    return row;
  }));

  state.resume = findResumable(level);
  state.progressIssue = findProgressIssue(level);
  const panel = $("#resume-panel");
  panel.hidden = !state.resume;
  if (state.resume) {
    const saved = state.resume.loaded.state;
    const answered = Object.values(saved.answers).filter((answer) => Array.isArray(answer) && answer.length).length;
    $("#resume-copy").textContent = ui.resume(state.resume.mode, answered, saved.questionIds.length);
  }
  const warning = $("#progress-warning");
  warning.hidden = !state.progressIssue;
  if (state.progressIssue) {
    $("#progress-warning-copy").textContent = ui.progressIssue(state.progressIssue.loaded.reason);
  }
  showView("mode-view");
}

function startExam(mode, restoredState = null) {
  state.mode = mode;
  state.result = null;
  state.qualification = null;
  if (restoredState) {
    state.optionOrders = restoredState.optionOrders;
    state.integrity = restoredState.integrity;
    state.questions = restoreAttempt(getQuestionBank(state.level), restoredState.questionIds, state.optionOrders);
    state.answers = restoredState.answers ?? {};
    state.currentIndex = restoredState.currentIndex ?? 0;
  } else {
    const target = storage();
    if (target) clearExamState(target, examStateKey(state.level, mode));
    const prepared = prepareAttempt(buildExam(state.level, mode));
    state.questions = prepared.questions;
    state.optionOrders = prepared.optionOrders;
    const definition = levelDefinitions[state.level];
    state.integrity = createIntegritySession({
      startedAt: Date.now(),
      suggestedMinutes: mode === "full" ? definition.fullMinutes : definition.mockMinutes,
      questionCount: state.questions.length,
    });
    state.answers = {};
    state.currentIndex = 0;
    track("level_start", { level: state.level, mode });
  }
  showView("exam-view");
  renderExamShell();
  renderQuestion();
  persist();
}

function renderExamShell() {
  const definition = levelDefinitions[state.level];
  $("#exam-level-code").textContent = definition.code;
  $("#exam-mode-label").textContent = ui.modeLabel(state.mode);
  $("#exam-total").textContent = String(state.questions.length);
  const grid = $("#exam-number-grid");
  grid.replaceChildren(...state.questions.map((question, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.examAction = "go-question";
    button.dataset.index = String(index);
    button.textContent = String(index + 1).padStart(2, "0");
    button.setAttribute("aria-label", ui.questionAria(index + 1));
    return button;
  }));
  renderNavigator();
}

function renderNavigator() {
  const buttons = $("#exam-number-grid").querySelectorAll("button");
  buttons.forEach((button, index) => {
    const question = state.questions[index];
    const answered = Array.isArray(state.answers[question.id]) && state.answers[question.id].length > 0;
    button.classList.toggle("is-answered", answered);
    button.classList.toggle("is-current", index === state.currentIndex);
    if (index === state.currentIndex) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current");
  });
  $("#exam-answered").textContent = String(Object.values(state.answers).filter((answer) => Array.isArray(answer) && answer.length).length);
}

function renderQuestion() {
  const question = state.questions[state.currentIndex];
  const definition = levelDefinitions[state.level];
  const module = moduleDefinition(state.level, question.module);
  const selected = state.answers[question.id] ?? [];
  state.integrity = recordQuestionView(state.integrity, question.id, Date.now());
  $("#exam-question-number").textContent = `QUESTION ${String(state.currentIndex + 1).padStart(3, "0")}`;
  const type = $("#exam-question-type");
  const guidance = $("#exam-question-guidance");
  const isMultiple = question.type === "multiple";
  type.textContent = TYPE_LABELS[question.type];
  type.classList.toggle("is-multiple", isMultiple);
  guidance.hidden = !isMultiple;
  $("#exam-module-label").textContent = module?.label ?? question.module;
  $("#exam-question-context").textContent = question.context;
  $("#exam-question-title").textContent = question.prompt;
  $("#exam-progress-bar").style.width = `${((state.currentIndex + 1) / state.questions.length) * 100}%`;
  const options = $("#exam-options");
  if (isMultiple) options.setAttribute("aria-describedby", "exam-question-guidance"); else options.removeAttribute("aria-describedby");
  options.replaceChildren(...question.options.map((copy, index) => {
    const label = document.createElement("label");
    label.className = "exam-option";
    const input = document.createElement("input");
    input.type = question.type === "multiple" ? "checkbox" : "radio";
    input.name = question.id;
    input.value = String(index);
    input.checked = selected.includes(index);
    input.addEventListener("change", () => {
      if (question.type === "multiple") {
        const current = new Set(state.answers[question.id] ?? []);
        if (input.checked) current.add(index); else current.delete(index);
        state.answers[question.id] = [...current].sort((a, b) => a - b);
      } else {
        state.answers[question.id] = [index];
      }
      state.integrity = recordAnswerEvent(state.integrity, question.id, Date.now());
      renderNavigator();
      persist();
    });
    const key = document.createElement("span");
    key.className = "exam-option-key";
    key.textContent = String.fromCharCode(65 + index);
    const text = document.createElement("span");
    text.className = "exam-option-copy";
    text.textContent = copy;
    label.append(input, key, text);
    return label;
  }));
  const controls = $(".exam-controls").querySelectorAll("button");
  controls[0].disabled = state.currentIndex === 0;
  controls[2].disabled = state.currentIndex === state.questions.length - 1;
  $("#exam-save-status").textContent = ui.autosave;
  renderNavigator();
  document.documentElement.style.setProperty("--active-level-accent", definition.accent);
}

function goQuestion(index) {
  if (!Number.isInteger(index) || index < 0 || index >= state.questions.length) return;
  state.currentIndex = index;
  renderQuestion();
  persist();
  $("#exam-navigator").classList.remove("is-open");
  $("[data-exam-action='toggle-nav']").setAttribute("aria-expanded", "false");
}

function requestSubmit() {
  const unanswered = state.questions.filter((question) => !(state.answers[question.id]?.length)).length;
  const baseCopy = unanswered
    ? ui.submitUnanswered(unanswered)
    : ui.submitComplete;
  const multipleReminder = state.questions[state.currentIndex]?.type === "multiple"
    ? ui.multipleReminder
    : "";
  $("#submit-copy").textContent = `${baseCopy}${multipleReminder}`;
  $("#submit-panel").hidden = false;
}

function trainingCopy(definition, weakModule, score) {
  return ui.training(weakModule.label, score);
}

function renderResult() {
  const definition = levelDefinitions[state.level];
  const result = state.result;
  $("#exam-training-link").href = "./fde-training/?source=public_test";
  $("#exam-result-code").innerHTML = `<span>${definition.code}</span><span>ASSESSMENT COMPLETE</span>`;
  $("#exam-result-status").textContent = `${definition.resultNoun}${result.classification.label}`;
  $("#exam-result-score").textContent = String(result.diagnosticScore).padStart(2, "0");
  $("#exam-ability-label").textContent = ui.abilityScoreLabel;
  $("#exam-result-mode").textContent = ui.resultMode(state.mode, state.questions.length);
  $("#exam-strict-title").textContent = ui.strictScoreLabel;
  $("#exam-strict-score").textContent = String(result.score).padStart(2, "0");
  $("#exam-confidence-title").textContent = ui.confidenceLabel;
  $("#exam-confidence-label").textContent = ui.confidenceLabels[result.integrity.band];
  $("#exam-confidence-reason").textContent = ui.confidenceReason(result.integrity.band);
  const qualification = state.qualification ?? evaluateQualification(state.mode, result);
  const followingLevel = qualification.qualifies ? nextLevel(state.level) : null;
  const status = $("#qualification-status");
  const reason = $("#qualification-reason");
  const nextButton = $("#next-level-button");
  const finalQualified = state.level === "advanced" && state.mode === "full" && qualification.qualifies;
  const identityPanel = $("#final-share-identity");
  const shareButton = $("#share-result-button");
  nextButton.hidden = !followingLevel;
  if (followingLevel) nextButton.textContent = ui.nextLevel(levelDefinitions[followingLevel].shortLabel);
  identityPanel.hidden = !finalQualified;
  shareButton.textContent = finalQualified ? ui.finalShareButton : ui.levelShareButton;
  if (!finalQualified) $("#final-share-name").value = "";
  if (state.mode === "mock") {
    status.textContent = ui.mockStatus;
    reason.textContent = ui.mockReason;
  } else if (qualification.qualifies) {
    status.textContent = ui.qualifiedStatus(state.level);
    reason.textContent = ui.qualifiedReason(followingLevel ? levelDefinitions[followingLevel].shortLabel : null);
  } else if (qualification.reason === "critical") {
    status.textContent = ui.criticalStatus;
    reason.textContent = ui.criticalReason(qualification.criticalMisses);
  } else if (qualification.reason === "integrity") {
    status.textContent = ui.integrityStatus;
    reason.textContent = ui.integrityReason;
  } else if (result.score >= 70) {
    status.textContent = ui.passedStatus;
    reason.textContent = qualification.reason === "module"
      ? ui.moduleFloorReason(qualification.lowestModuleScore)
      : ui.advanceScoreReason(result.score);
  } else {
    status.textContent = ui.failedStatus;
    reason.textContent = ui.failedReason(result.score);
  }
  $("#stat-correct").textContent = result.correct;
  $("#stat-partial").textContent = result.partial;
  $("#stat-wrong").textContent = result.incorrect;
  $("#stat-blank").textContent = result.unanswered;

  const moduleValues = definition.modules.map((module) => ({ module, score: result.diagnosticModuleScores[module.id] ?? 0 }));
  const strongest = [...moduleValues].sort((a, b) => b.score - a.score)[0];
  const weakest = [...moduleValues].sort((a, b) => a.score - b.score)[0];
  $("#result-strong-module").textContent = ui.moduleScore(strongest.module.label, strongest.score);
  $("#result-weak-module").textContent = trainingCopy(definition, weakest.module, result.diagnosticScore);
  $("#module-results").replaceChildren(...moduleValues.map(({ module, score }) => {
    const row = document.createElement("div");
    row.className = "module-result-row";
    row.innerHTML = `<span>${module.label}</span><div class="module-result-track"><i style="width:${score}%"></i></div><strong>${score}</strong>`;
    return row;
  }));

  const filter = $("#review-filter");
  filter.replaceChildren(new Option(ui.allModules, "all"), ...definition.modules.map((module) => new Option(module.label, module.id)));
  renderReview("all");
  $("#exam-share-panel").hidden = true;
  showView("exam-result-view");
}

function answerText(question, selected) {
  if (!selected.length) return ui.unanswered;
  return selected.map((index) => `${String.fromCharCode(65 + index)}. ${question.options[index]}`).join("；");
}

function renderReview(moduleId, resetLimit = true) {
  const definition = levelDefinitions[state.level];
  const entries = state.result.review.filter((entry) => moduleId === "all" || entry.question.module === moduleId);
  const list = $("#review-list");
  state.reviewModule = moduleId;
  if (resetLimit) state.reviewLimit = 10;
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "review-empty";
    empty.textContent = moduleId === "all" ? ui.noWrongAll : ui.noWrongModule;
    list.replaceChildren(empty);
    return;
  }
  const visibleEntries = entries.slice(0, state.reviewLimit);
  const items = visibleEntries.map((entry) => {
    const question = entry.question;
    const module = definition.modules.find((item) => item.id === question.module);
    const article = document.createElement("article");
    article.className = "review-item";
    article.dataset.module = question.module;
    article.innerHTML = `
      <header><span>${question.id} · ${module?.label ?? question.module}</span><b>${ui.reviewStatus(entry.points, entry.selected)}</b></header>
      ${question.context ? `<p class="review-context"></p>` : ""}
      <h3></h3>
      <div class="review-answers"><div><span>YOUR ANSWER</span><strong class="user-answer"></strong></div><div><span>REFERENCE</span><strong class="reference-answer"></strong></div></div>
      <p class="review-explanation"></p>`;
    if (question.context) article.querySelector(".review-context").textContent = question.context;
    article.querySelector("h3").textContent = question.prompt;
    article.querySelector(".user-answer").textContent = answerText(question, entry.selected);
    article.querySelector(".reference-answer").textContent = answerText(question, question.answer);
    article.querySelector(".review-explanation").textContent = question.explanation;
    return article;
  });
  const remaining = entries.length - visibleEntries.length;
  if (remaining > 0) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "review-more";
    more.dataset.examAction = "load-more-review";
    more.textContent = ui.moreReview(remaining);
    items.push(more);
  }
  list.replaceChildren(...items);
}

function confirmSubmit() {
  $("#submit-panel").hidden = true;
  const integrity = finalizeIntegrity(state.integrity, Date.now());
  state.result = { ...scoreExam(state.questions, state.answers), integrity };
  state.qualification = evaluateQualification(state.mode, state.result);
  const followingLevel = nextLevel(state.level);
  const wasFollowingAccessible = followingLevel ? canAccessLevel(state.progression, followingLevel) : false;
  const updated = updateProgression(state.progression, state.level, state.mode, state.result);
  if (updated !== state.progression) {
    state.progression = updated;
    saveProgression(storage(), state.progression);
  }
  const durationRatio = integrity.durationMs / Math.max(1, state.integrity.suggestedMinutes * 60_000);
  track("level_complete", {
    level: state.level,
    mode: state.mode,
    score: state.result.score,
    confidence: integrity.band,
    visibility: integrity.visibilityExits >= 9 ? 2 : integrity.visibilityExits >= 4 ? 1 : 0,
    clipboard: integrity.clipboardAttempts >= 5 ? 2 : integrity.clipboardAttempts >= 2 ? 1 : 0,
    fast: integrity.fastAnswerShare > 0.5 ? 2 : integrity.fastAnswerShare > 0.25 ? 1 : 0,
    duration: durationRatio < 0.18 ? 2 : durationRatio < 0.3 ? 1 : 0,
  });
  if (followingLevel && !wasFollowingAccessible && canAccessLevel(state.progression, followingLevel)) {
    track("level_unlock", { level: followingLevel });
  }
  if (state.level === "advanced" && state.mode === "full" && state.qualification.qualifies) {
    track("final_complete", { level: state.level, mode: state.mode, score: state.result.score });
  }
  const target = storage();
  if (target) clearExamState(target, examStateKey(state.level, state.mode));
  removeActivePointer();
  renderResult();
}

function resumeExam() {
  if (!state.resume?.loaded.valid) return;
  state.mode = state.resume.mode;
  startExam(state.mode, state.resume.loaded.state);
}

function clearCurrentProgress() {
  const target = storage();
  if (state.level && target) {
    if (state.mode) clearExamState(target, examStateKey(state.level, state.mode));
    if (state.resume?.mode) clearExamState(target, examStateKey(state.level, state.resume.mode));
  }
  removeActivePointer();
  state.answers = {};
  state.resume = null;
  if (!$("#exam-view").hidden) renderMode(state.level); else renderMode(state.level);
}

function clearInvalidProgress() {
  const target = storage();
  if (state.level && target) {
    ["full", "mock"].forEach((mode) => clearExamState(target, examStateKey(state.level, mode)));
  }
  removeActivePointer();
  state.progressIssue = null;
  renderMode(state.level);
}

function shareResult() {
  const panel = $("#exam-share-panel");
  const canvas = $("#exam-share-canvas");
  const status = $("#exam-share-status");
  panel.hidden = false;
  canvas.hidden = false;
  try {
    const final = state.level === "advanced" && state.mode === "full" && state.qualification?.qualifies === true;
    const name = sanitizeShareName(final ? $("#final-share-name").value : "", ui.anonymousName);
    const scores = Object.fromEntries(levelOrder.map((level) => [level, state.progression.records[level]?.score]));
    drawExamShareCard(canvas, state.result, levelDefinitions[state.level], { final, name, scores, bundle: activeBundle, mode: state.mode });
    track("share_generate", { level: state.level, mode: state.mode });
    status.textContent = final
      ? ui.finalShareSuccess(name)
      : ui.levelShareSuccess;
  } catch {
    canvas.hidden = true;
    status.textContent = ui.shareFailed;
  }
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function downloadResultCard() {
  const link = document.createElement("a");
  const final = state.level === "advanced" && state.mode === "full" && state.qualification?.qualifies === true;
  link.download = final
    ? shareFilename($("#final-share-name").value, { fallback: ui.anonymousName, prefix: ui.finalFilenamePrefix })
    : ui.resultFilename(levelDefinitions[state.level].resultNoun);
  link.href = $("#exam-share-canvas").toDataURL("image/png");
  link.click();
}

function restoreActiveExam() {
  const target = storage();
  if (!target) return;
  let pointer;
  try { pointer = JSON.parse(target.getItem(ACTIVE_KEY)); } catch { return; }
  if (!pointer || !levelDefinitions[pointer.level] || !["full", "mock"].includes(pointer.mode)) return;
  if (!canAccessLevel(state.progression, pointer.level)) {
    clearExamState(target, examStateKey(pointer.level, pointer.mode));
    removeActivePointer();
    state.progressionIssue = "locked-active";
    openLevelSelector(null);
    return;
  }
  const validIds = new Set(getQuestionBank(pointer.level).map((question) => question.id));
  const loaded = loadExamState(target, examStateKey(pointer.level, pointer.mode), validIds);
  if (!loaded.valid) {
    removeActivePointer();
    state.level = pointer.level;
    renderMode(pointer.level);
    return;
  }
  state.level = pointer.level;
  state.mode = pointer.mode;
  startExam(pointer.mode, loaded.state);
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-exam-action]");
  const action = target?.dataset.examAction;
  if (!action) return;
  const actions = {
    home: () => { removeActivePointer(); showView("landing-view"); },
    "back-from-level": () => showView(state.returnView),
    levels: () => openLevelSelector(state.potentialScore),
    "select-level": () => {
      const level = target.dataset.level;
      if (!canAccessLevel(state.progression, level)) {
        const index = levelOrder.indexOf(level);
        const previous = levelDefinitions[levelOrder[index - 1]]?.shortLabel ?? ui.previousLevel;
        showProgressionNotice(ui.noSkipping(previous));
        return;
      }
      renderMode(level);
    },
    "start-mode": () => startExam(target.dataset.mode),
    resume: resumeExam,
    mode: () => renderMode(state.level),
    previous: () => goQuestion(state.currentIndex - 1),
    next: () => goQuestion(state.currentIndex + 1),
    "go-question": () => goQuestion(Number(target.dataset.index)),
    submit: requestSubmit,
    "cancel-submit": () => { $("#submit-panel").hidden = true; },
    "confirm-submit": confirmSubmit,
    "clear-progress": clearCurrentProgress,
    "clear-invalid-progress": clearInvalidProgress,
    "toggle-nav": () => {
      const navigator = $("#exam-navigator");
      const open = navigator.classList.toggle("is-open");
      target.setAttribute("aria-expanded", String(open));
    },
    retry: () => startExam(state.mode),
    "next-level": () => {
      const followingLevel = nextLevel(state.level);
      if (followingLevel && canAccessLevel(state.progression, followingLevel)) renderMode(followingLevel);
    },
    "load-more-review": () => {
      state.reviewLimit += 10;
      renderReview(state.reviewModule, false);
    },
    "share-result": shareResult,
    "download-result-card": downloadResultCard,
  };
  actions[action]?.();
});

document.addEventListener("change", (event) => {
  if (event.target.matches("#review-filter")) renderReview(event.target.value);
});

document.addEventListener("visibilitychange", () => {
  if ($("#exam-view").hidden || !state.integrity) return;
  state.integrity = recordIntegrityEvent(
    state.integrity,
    document.visibilityState === "hidden" ? "hidden" : "visible",
    Date.now(),
  );
  if (document.visibilityState === "visible") persist();
});

for (const type of ["copy", "cut", "paste", "contextmenu"]) {
  document.addEventListener(type, (event) => {
    if ($("#exam-view").hidden || !state.integrity || !event.target.closest?.("#exam-view")) return;
    event.preventDefault();
    state.integrity = recordIntegrityEvent(state.integrity, type, Date.now());
    persist();
  });
}

const loadedProgression = loadProgression(storage());
state.progression = loadedProgression.state;
state.progressionIssue = loadedProgression.valid ? null : loadedProgression.reason;
restoreActiveExam();
