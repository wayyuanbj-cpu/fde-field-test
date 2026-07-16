import { levelDefinitions, moduleDefinition, recommendLevel } from "./assessment-levels.js";
import { buildExam, getQuestionBank, scoreExam } from "./exam-scoring.js";
import { clearExamState, examStateKey, loadExamState, saveExamState } from "./exam-state.js";
import { drawExamShareCard } from "./exam-share-card.js";

const ACTIVE_KEY = "onex-fde-exam:active";
const TYPE_LABELS = { single: "单选题", multiple: "多选题", judgment: "判断题" };
const state = {
  level: null,
  mode: null,
  questions: [],
  answers: {},
  currentIndex: 0,
  result: null,
  resume: null,
  potentialScore: null,
  returnView: "landing-view",
  reviewModule: "all",
  reviewLimit: 10,
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
    $("#exam-save-status").textContent = "当前浏览器未开放本地保存；请勿刷新页面";
    return;
  }
  const saved = saveExamState(target, examStateKey(state.level, state.mode), {
    level: state.level,
    mode: state.mode,
    questionIds: state.questions.map((question) => question.id),
    answers: state.answers,
    currentIndex: state.currentIndex,
  });
  if (saved) {
    saveActivePointer();
    $("#exam-save-status").textContent = "已自动保存到当前浏览器";
  } else {
    $("#exam-save-status").textContent = "保存失败；本页仍可继续答题";
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

function renderRecommendation() {
  const recommended = recommendLevel(state.potentialScore);
  document.querySelectorAll("[data-level-card]").forEach((card) => card.classList.toggle("is-recommended", card.dataset.levelCard === recommended));
  document.querySelectorAll("[data-recommend-badge]").forEach((badge) => {
    badge.hidden = badge.dataset.recommendBadge !== recommended;
    badge.textContent = Number.isFinite(state.potentialScore) ? "系统推荐" : "推荐起点";
  });
}

export function openLevelSelector(potentialScore = null, returnView = "landing-view") {
  state.potentialScore = Number.isFinite(potentialScore) ? potentialScore : null;
  state.returnView = returnView;
  $("#level-back-button").textContent = returnView === "result-view" ? "← 返回我的结果" : "← 返回首页";
  renderRecommendation();
  showView("level-view");
}

function renderMode(level) {
  const definition = levelDefinitions[level];
  state.level = level;
  $("#mode-level-code").innerHTML = `<span>${definition.code}</span><span>MODE SELECT</span>`;
  $("#mode-title").textContent = definition.title;
  $("#mode-description").textContent = definition.description;
  $("#full-count").textContent = `${definition.fullCount} 题`;
  $("#mock-count").textContent = `${definition.mockCount} 题`;
  $("#full-time").textContent = `建议 ${definition.fullTime}`;
  $("#mock-time").textContent = `建议 ${definition.mockTime}`;
  $("#mode-modules").replaceChildren(...definition.modules.map((module) => {
    const row = document.createElement("div");
    row.className = "mode-module";
    row.innerHTML = `<span>${module.code}</span><strong>${module.label}</strong>`;
    return row;
  }));

  state.resume = findResumable(level);
  const panel = $("#resume-panel");
  panel.hidden = !state.resume;
  if (state.resume) {
    const saved = state.resume.loaded.state;
    const answered = Object.values(saved.answers).filter((answer) => Array.isArray(answer) && answer.length).length;
    $("#resume-copy").textContent = `${state.resume.mode === "full" ? "完整挑战" : "随机模拟"} · 已答 ${answered}/${saved.questionIds.length}`;
  }
  showView("mode-view");
}

function startExam(mode, restoredState = null) {
  state.mode = mode;
  state.result = null;
  if (restoredState) {
    const bankById = new Map(getQuestionBank(state.level).map((question) => [question.id, question]));
    state.questions = restoredState.questionIds.map((id) => bankById.get(id)).filter(Boolean);
    state.answers = restoredState.answers ?? {};
    state.currentIndex = restoredState.currentIndex ?? 0;
  } else {
    const target = storage();
    if (target) clearExamState(target, examStateKey(state.level, mode));
    state.questions = buildExam(state.level, mode);
    state.answers = {};
    state.currentIndex = 0;
  }
  showView("exam-view");
  renderExamShell();
  renderQuestion();
  persist();
}

function renderExamShell() {
  const definition = levelDefinitions[state.level];
  $("#exam-level-code").textContent = definition.code;
  $("#exam-mode-label").textContent = state.mode === "full" ? "完整挑战" : "随机模拟";
  $("#exam-total").textContent = String(state.questions.length);
  const grid = $("#exam-number-grid");
  grid.replaceChildren(...state.questions.map((question, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.examAction = "go-question";
    button.dataset.index = String(index);
    button.textContent = String(index + 1).padStart(2, "0");
    button.setAttribute("aria-label", `第 ${index + 1} 题`);
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
  $("#exam-question-number").textContent = `QUESTION ${String(state.currentIndex + 1).padStart(3, "0")}`;
  $("#exam-question-type").textContent = TYPE_LABELS[question.type];
  $("#exam-module-label").textContent = module?.label ?? question.module;
  $("#exam-question-context").textContent = question.context;
  $("#exam-question-title").textContent = question.prompt;
  $("#exam-progress-bar").style.width = `${((state.currentIndex + 1) / state.questions.length) * 100}%`;
  const options = $("#exam-options");
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
  $("#exam-save-status").textContent = "答案自动保存在当前浏览器";
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
  $("#submit-copy").textContent = unanswered
    ? `你还有 ${unanswered} 道题未作答，未答题将按 0 分计算。`
    : "所有题目都已作答，交卷后将生成分模块成绩与错题解析。";
  $("#submit-panel").hidden = false;
}

function trainingCopy(definition, weakModule, score) {
  if (score >= 85) return `你已在本级题目中表现优秀。下一步用真实项目证据验证“${weakModule.label}”，不要停在答题分数。`;
  if (score >= 70) return `你已达到本级线上题目的基准线。优先补强“${weakModule.label}”，再进入更高等级或实战评审。`;
  return `当前最值得训练的是“${weakModule.label}”。回到教材和真实案例，先补齐判断依据，再重新挑战。`;
}

function renderResult() {
  const definition = levelDefinitions[state.level];
  const result = state.result;
  $("#exam-result-code").innerHTML = `<span>${definition.code}</span><span>ASSESSMENT COMPLETE</span>`;
  $("#exam-result-status").textContent = `${definition.resultNoun}${result.classification.label}`;
  $("#exam-result-score").textContent = String(result.score).padStart(2, "0");
  $("#exam-result-mode").textContent = `${state.mode === "full" ? "完整挑战" : "随机模拟"} · ${state.questions.length} 题`;
  $("#stat-correct").textContent = result.correct;
  $("#stat-partial").textContent = result.partial;
  $("#stat-wrong").textContent = result.incorrect;
  $("#stat-blank").textContent = result.unanswered;

  const moduleValues = definition.modules.map((module) => ({ module, score: result.moduleScores[module.id] ?? 0 }));
  const strongest = [...moduleValues].sort((a, b) => b.score - a.score)[0];
  const weakest = [...moduleValues].sort((a, b) => a.score - b.score)[0];
  $("#result-strong-module").textContent = `${strongest.module.label} · ${strongest.score} 分`;
  $("#result-weak-module").textContent = trainingCopy(definition, weakest.module, result.score);
  $("#module-results").replaceChildren(...moduleValues.map(({ module, score }) => {
    const row = document.createElement("div");
    row.className = "module-result-row";
    row.innerHTML = `<span>${module.label}</span><div class="module-result-track"><i style="width:${score}%"></i></div><strong>${score}</strong>`;
    return row;
  }));

  const filter = $("#review-filter");
  filter.replaceChildren(new Option("全部模块", "all"), ...definition.modules.map((module) => new Option(module.label, module.id)));
  renderReview("all");
  $("#exam-share-panel").hidden = true;
  showView("exam-result-view");
}

function answerText(question, selected) {
  if (!selected.length) return "未作答";
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
    empty.textContent = moduleId === "all" ? "本次没有错题。接下来请用真实项目验证能力。" : "该模块没有错题。";
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
      <header><span>${question.id} · ${module?.label ?? question.module}</span><b>${entry.points === 0.5 ? "部分正确" : entry.selected.length ? "错误" : "未作答"}</b></header>
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
    more.textContent = `继续查看剩余 ${remaining} 题`;
    items.push(more);
  }
  list.replaceChildren(...items);
}

function confirmSubmit() {
  $("#submit-panel").hidden = true;
  state.result = scoreExam(state.questions, state.answers);
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

function shareResult() {
  drawExamShareCard($("#exam-share-canvas"), state.result, levelDefinitions[state.level]);
  $("#exam-share-panel").hidden = false;
  $("#exam-share-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function downloadResultCard() {
  const link = document.createElement("a");
  link.download = `FDE-${levelDefinitions[state.level].resultNoun}-成绩.png`;
  link.href = $("#exam-share-canvas").toDataURL("image/png");
  link.click();
}

function restoreActiveExam() {
  const target = storage();
  if (!target) return;
  let pointer;
  try { pointer = JSON.parse(target.getItem(ACTIVE_KEY)); } catch { return; }
  if (!pointer || !levelDefinitions[pointer.level] || !["full", "mock"].includes(pointer.mode)) return;
  const validIds = new Set(getQuestionBank(pointer.level).map((question) => question.id));
  const loaded = loadExamState(target, examStateKey(pointer.level, pointer.mode), validIds);
  if (!loaded.valid) { removeActivePointer(); return; }
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
    "select-level": () => renderMode(target.dataset.level),
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
    "toggle-nav": () => {
      const navigator = $("#exam-navigator");
      const open = navigator.classList.toggle("is-open");
      target.setAttribute("aria-expanded", String(open));
    },
    retry: () => startExam(state.mode),
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

restoreActiveExam();
