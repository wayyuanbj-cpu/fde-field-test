import { dimensionMeta } from "./question-data.js";

export const levels = [
  {
    key: "concept-observer",
    min: 0,
    label: "概念观察员",
    verdict: "你能听懂 AI 的热闹，但还没有形成企业落地的判断框架。",
  },
  {
    key: "ai-operator",
    min: 45,
    label: "AI 工具手",
    verdict: "你会使用工具解决局部任务，但距离独立承担企业交付还有明显断层。",
  },
  {
    key: "scenario-solver",
    min: 65,
    label: "场景解题者",
    verdict: "你开始用业务问题而不是工具清单思考，具备向 FDE 进阶的扎实基础。",
  },
  {
    key: "field-deliverer",
    min: 80,
    label: "前线交付者",
    verdict: "你的判断接近成熟 FDE：能识别场景、控制边界，并把方案推向可验收结果。",
  },
];

const adviceByDimension = {
  diagnosis: "训练访谈、流程图和痛点证据，把‘客户想要什么’追问到真实工作现场。",
  scenario: "用价值、频次、数据准备度、复杂度和风险给候选场景做一次排序。",
  solution: "把模糊需求拆成输入、节点、人工闸门、输出和可观察的验收标准。",
  safety: "补齐数据授权、脱敏、权限、留痕、低置信度回退和人工确认机制。",
  delivery: "从 Demo 继续走到试用、培训、验收、变更管理和使用反馈闭环。",
};

export function classifyLevel(index) {
  return [...levels].reverse().find((level) => index >= level.min);
}

export function scoreAssessment(answers, questionBank) {
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

  let exposure = `最容易露馅的地方：${dimensionMeta[weakest].label}。${adviceByDimension[weakest]}`;
  if (ordered.at(-1)[1] >= 80) {
    exposure = "压力测试结果：未暴露明显短板。快速选择题只能说明判断框架成熟，真实交付能力仍需项目文件、可运行 Demo 与答辩验证。";
  } else if (flags.includes("safety-gap")) {
    exposure = "最容易露馅的地方：边界意识。高风险动作缺少授权、人工闸门或失败回退，项目越自动化，代价越可能被放大。";
  } else if (flags.includes("delivery-gap")) {
    exposure = "最容易露馅的地方：落地闭环。你可能能做出 Demo，但还没有把试用、验收、培训和持续使用连成一条线。";
  }

  return {
    index,
    level: classifyLevel(index),
    dimensions,
    strongest,
    weakest,
    flags,
    signals,
    exposure,
    hasMaterialGap: ordered.at(-1)[1] < 80,
    strength: `你的强项是${dimensionMeta[strongest].label}：${dimensions[strongest]} 分。`,
    training: adviceByDimension[weakest],
    verified: false,
    evidenceLabel: "潜质判断 · 尚未验证",
  };
}
