import { zhCN } from "./locales/zh-CN.js";

export const levels = zhCN.quick.levels;

export function classifyLevel(index, content = zhCN.quick) {
  return [...content.levels].reverse().find((level) => index >= level.min);
}

export function scoreAssessment(answers, questionBank, content = zhCN.quick) {
  const { dimensionMeta, adviceByDimension, copy } = content;
  if (questionBank.some((question) => !Number.isInteger(answers[question.id]))) {
    throw new Error(`请完成全部 ${questionBank.length} 道题后再生成结果`);
  }

  const totals = Object.fromEntries(Object.keys(dimensionMeta).map((key) => [key, { earned: 0, max: 0 }]));
  const signals = [];

  for (const question of questionBank) {
    const choice = question.options[answers[question.id]];
    if (!choice) throw new Error(`题目 ${question.id} 的答案无效`);
    totals[question.dimension].earned += choice.score;
    totals[question.dimension].max += Math.max(...question.options.map((option) => option.score));
    signals.push(choice.signal);
  }

  const dimensions = Object.fromEntries(
    Object.entries(totals).map(([key, value]) => [key, Math.round((value.earned / value.max) * 100)]),
  );
  const earned = Object.values(totals).reduce((sum, value) => sum + value.earned, 0);
  const maximum = Object.values(totals).reduce((sum, value) => sum + value.max, 0);
  const index = Math.round((earned / maximum) * 100);
  const ordered = Object.entries(dimensions).sort((left, right) => right[1] - left[1]);
  const strongest = ordered[0][0];
  const weakest = ordered.at(-1)[0];
  const flags = [];

  if (dimensions.safety < 50) flags.push("safety-gap");
  if (dimensions.delivery < 50) flags.push("delivery-gap");

  const exposure = copy.exposure({
    dimensions,
    weakest: dimensionMeta[weakest],
    flags,
    advice: adviceByDimension[weakest],
  });

  return {
    index,
    level: classifyLevel(index, content),
    dimensions,
    strongest,
    weakest,
    flags,
    signals,
    exposure,
    hasMaterialGap: ordered.at(-1)[1] < 80,
    strength: copy.strength(dimensionMeta[strongest].label, dimensions[strongest]),
    training: adviceByDimension[weakest],
    verified: false,
    evidenceLabel: copy.evidenceLabel,
  };
}
