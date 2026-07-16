import { levelDefinitions } from "./assessment-levels.js";
import { juniorQuestions } from "./professional-question-data.js";
import { intermediateQuestions } from "./intermediate-question-data.js";
import { advancedQuestions } from "./advanced-question-data.js";

const banks = Object.freeze({
  junior: juniorQuestions,
  intermediate: intermediateQuestions,
  advanced: advancedQuestions,
});

function normalized(values = []) {
  return [...new Set(Array.isArray(values) ? values : [])].sort((a, b) => a - b);
}

export function scoreQuestion(question, selected = []) {
  const chosen = normalized(selected);
  const answer = normalized(question.answer);
  if (chosen.length === 0) return 0;
  if (chosen.some((index) => !answer.includes(index))) return 0;
  if (chosen.length === answer.length && chosen.every((index, offset) => index === answer[offset])) return 1;
  return question.type === "multiple" ? 0.5 : 0;
}

export function classifyExamScore(score) {
  if (score >= 85) return { status: "excellent", label: "优秀" };
  if (score >= 70) return { status: "passed", label: "达标" };
  return { status: "not-passed", label: "未达标" };
}

function shuffled(items, random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function buildExam(level, mode, random = Math.random) {
  const definition = levelDefinitions[level];
  const bank = banks[level];
  if (!definition || !bank) throw new Error(`未知等级：${level}`);
  if (mode === "full") return [...bank];
  if (mode !== "mock") throw new Error(`未知模式：${mode}`);
  return definition.modules.flatMap((module) => {
    const candidates = bank.filter((question) => question.module === module.id);
    return shuffled(candidates, random).slice(0, module.mockCount);
  });
}

export function getQuestionBank(level) {
  const bank = banks[level];
  if (!bank) throw new Error(`未知等级：${level}`);
  return bank;
}

export function scoreExam(questions, answers = {}) {
  const moduleTotals = {};
  const moduleEarned = {};
  const review = [];
  let earned = 0;
  let correct = 0;
  let partial = 0;
  let incorrect = 0;
  let unanswered = 0;

  for (const question of questions) {
    const selected = normalized(answers[question.id]);
    const points = scoreQuestion(question, selected);
    earned += points;
    moduleTotals[question.module] = (moduleTotals[question.module] ?? 0) + 1;
    moduleEarned[question.module] = (moduleEarned[question.module] ?? 0) + points;
    if (selected.length === 0) unanswered += 1;
    else if (points === 1) correct += 1;
    else if (points === 0.5) partial += 1;
    else incorrect += 1;
    if (points < 1) review.push({ question, selected, points });
  }

  const score = questions.length ? Math.round((earned / questions.length) * 100) : 0;
  const moduleScores = Object.fromEntries(
    Object.keys(moduleTotals).map((module) => [module, Math.round((moduleEarned[module] / moduleTotals[module]) * 100)]),
  );
  return {
    score,
    earned,
    correct,
    partial,
    incorrect,
    unanswered,
    moduleScores,
    review,
    classification: classifyExamScore(score),
  };
}
