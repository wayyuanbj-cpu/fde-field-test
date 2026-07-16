import { scoreAssessment } from "./scoring.js";
import { drawShareCard } from "./share-card.js";
import { openLevelSelector } from "./exam-app.js";
import { track } from "./analytics.js";
import { activeBundle } from "./locales/index.js";
import { readLocaleHandoff, writeLocaleHandoff } from "./locale-handoff.js";

const { dimensionMeta, questions } = activeBundle.quick;
const copy = activeBundle.ui.quick;

const views = [...document.querySelectorAll(".view")];
const state = { current: 0, answers: {}, result: null, previousView: "landing-view" };
const elements = {
  progressText: document.querySelector("#progress-text"),
  dimensionCode: document.querySelector("#dimension-code"),
  progressBar: document.querySelector("#progress-bar"),
  questionNumber: document.querySelector("#question-number"),
  scenario: document.querySelector("#question-scenario"),
  title: document.querySelector("#question-title"),
  options: document.querySelector("#options-list"),
  error: document.querySelector("#question-error"),
  previous: document.querySelector('[data-action="previous"]'),
  next: document.querySelector('[data-action="next"]'),
};

function showView(id, scroll = true) {
  views.forEach((view) => { view.hidden = view.id !== id; });
  if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
}

function pad(number) {
  return String(number).padStart(2, "0");
}

function renderQuestion() {
  const question = questions[state.current];
  const meta = dimensionMeta[question.dimension];
  elements.progressText.textContent = `QUESTION ${pad(state.current + 1)} / ${questions.length}`;
  elements.dimensionCode.textContent = `${meta.code} · ${meta.label}`;
  elements.progressBar.style.width = `${((state.current + 1) / questions.length) * 100}%`;
  elements.questionNumber.textContent = pad(state.current + 1);
  elements.scenario.textContent = question.scenario;
  elements.title.textContent = question.prompt;
  elements.error.textContent = "";
  elements.previous.disabled = state.current === 0;
  elements.next.textContent = state.current === questions.length - 1 ? copy.nextResult : copy.lockDecision;
  elements.options.replaceChildren();

  question.options.forEach((option, index) => {
    const label = document.createElement("label");
    label.className = "option-label";
    const input = document.createElement("input");
    input.className = "sr-only";
    input.type = "radio";
    input.name = question.id;
    input.value = String(index);
    input.checked = state.answers[question.id] === index;
    input.addEventListener("change", () => {
      state.answers[question.id] = index;
      elements.error.textContent = "";
    });
    const key = document.createElement("span");
    key.className = "option-key";
    key.textContent = String(index + 1);
    const copy = document.createElement("span");
    copy.className = "option-copy";
    copy.textContent = option.text;
    label.append(input, key, copy);
    elements.options.append(label);
  });

  document.querySelector("#question-title").focus?.({ preventScroll: true });
}

function startAssessment(reset = false) {
  if (reset) {
    state.current = 0;
    state.answers = {};
    state.result = null;
    document.querySelector("#share-panel").hidden = true;
  }
  showView("quiz-view");
  renderQuestion();
  track("quick_start");
}

function nextQuestion() {
  const question = questions[state.current];
  if (!Number.isInteger(state.answers[question.id])) {
    elements.error.textContent = copy.required;
    elements.options.querySelector("input")?.focus();
    return;
  }
  if (state.current < questions.length - 1) {
    state.current += 1;
    renderQuestion();
    return;
  }
  state.result = scoreAssessment(state.answers, questions, activeBundle.quick);
  track("quick_complete", { score: state.result.index });
  renderResult();
}

function previousQuestion() {
  if (state.current === 0) return;
  state.current -= 1;
  renderQuestion();
}

function drawRadar(canvas, dimensions) {
  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const displayWidth = canvas.clientWidth || 560;
  const displayHeight = Math.min(displayWidth * .75, 420);
  canvas.width = displayWidth * ratio;
  canvas.height = displayHeight * ratio;
  context.scale(ratio, ratio);
  const width = displayWidth;
  const height = displayHeight;
  const centerX = width / 2;
  const centerY = height / 2 + 6;
  const radius = Math.min(width, height) * .32;
  const keys = Object.keys(dimensionMeta);
  const point = (index, factor = 1) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / keys.length;
    return [centerX + Math.cos(angle) * radius * factor, centerY + Math.sin(angle) * radius * factor];
  };

  context.clearRect(0, 0, width, height);
  context.lineWidth = 1;
  for (let ring = 1; ring <= 4; ring += 1) {
    context.beginPath();
    keys.forEach((_, index) => {
      const [x, y] = point(index, ring / 4);
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.closePath();
    context.strokeStyle = "rgba(10,24,42,.15)";
    context.stroke();
  }

  context.beginPath();
  keys.forEach((key, index) => {
    const [x, y] = point(index, dimensions[key] / 100);
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  });
  context.closePath();
  context.fillStyle = "rgba(41,98,255,.22)";
  context.fill();
  context.strokeStyle = "#2962ff";
  context.lineWidth = 3;
  context.stroke();

  context.font = "600 12px PingFang SC, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  keys.forEach((key, index) => {
    const [x, y] = point(index, 1.22);
    context.fillStyle = "#405a75";
    context.fillText(dimensionMeta[key].label, x, y);
  });
}

function renderResult() {
  const { result } = state;
  showView("result-view");
  document.querySelector("#result-level").textContent = `${copy.profilePrefix} · ${result.level.label}`;
  document.querySelector("#result-verdict").textContent = result.level.verdict;
  document.querySelector("#result-score").textContent = pad(result.index);
  document.querySelector("#result-strength").textContent = result.strength;
  document.querySelector("#exposure-title").textContent = copy.exposureTitle(result.hasMaterialGap);
  document.querySelector("#result-exposure").textContent = copy.exposureBody(result.exposure);
  document.querySelector("#result-training").textContent = result.training;
  const circumference = 2 * Math.PI * 92;
  const dial = document.querySelector("#dial-progress");
  dial.style.strokeDasharray = String(circumference);
  requestAnimationFrame(() => { dial.style.strokeDashoffset = String(circumference * (1 - result.index / 100)); });

  const scoreList = document.querySelector("#dimension-scores");
  scoreList.replaceChildren();
  Object.entries(result.dimensions).forEach(([key, value]) => {
    const item = document.createElement("div");
    item.innerHTML = `<span>${dimensionMeta[key].short}</span><strong>${value}</strong>`;
    scoreList.append(item);
  });
  drawRadar(document.querySelector("#radar-canvas"), result.dimensions);
}

function showShareCard() {
  const panel = document.querySelector("#share-panel");
  panel.hidden = false;
  drawShareCard(document.querySelector("#share-canvas"), state.result, activeBundle);
  track("share_generate");
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function downloadCard() {
  const canvas = document.querySelector("#share-canvas");
  const link = document.createElement("a");
  link.download = copy.filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  const actions = {
    home: () => showView("landing-view"),
    start: () => startAssessment(false),
    "show-method": () => document.querySelector(".truth-panel").scrollIntoView({ behavior: "smooth" }),
    previous: previousQuestion,
    next: nextQuestion,
    share: showShareCard,
    "download-card": downloadCard,
    levels: () => openLevelSelector(state.result?.index ?? null, "landing-view"),
    professional: () => openLevelSelector(state.result?.index ?? null, "result-view"),
    "back-result": () => showView(state.result ? "result-view" : "landing-view"),
    restart: () => startAssessment(true),
  };
  actions[action]?.();
});

document.querySelector("[data-locale-switch]")?.addEventListener("click", () => {
  const visible = views.find((view) => !view.hidden)?.id;
  if (!["quiz-view", "result-view"].includes(visible)) return;
  writeLocaleHandoff(globalThis.sessionStorage, {
    view: visible,
    current: state.current,
    answers: state.answers,
  });
});

document.addEventListener("keydown", (event) => {
  if (document.querySelector("#quiz-view").hidden) return;
  const numeric = Number(event.key);
  if (numeric >= 1 && numeric <= 4) {
    const input = elements.options.querySelectorAll("input")[numeric - 1];
    input?.click();
  }
  if (event.key === "Enter" && event.target.tagName !== "BUTTON") nextQuestion();
});

window.addEventListener("resize", () => {
  if (state.result && !document.querySelector("#result-view").hidden) {
    drawRadar(document.querySelector("#radar-canvas"), state.result.dimensions);
  }
});

track("page_view");

const handoff = readLocaleHandoff(globalThis.sessionStorage, questions);
if (handoff) {
  state.current = handoff.current;
  state.answers = handoff.answers;
  if (handoff.view === "result-view" && Object.keys(state.answers).length === questions.length) {
    state.result = scoreAssessment(state.answers, questions, activeBundle.quick);
    renderResult();
  } else {
    showView("quiz-view", false);
    renderQuestion();
  }
}
