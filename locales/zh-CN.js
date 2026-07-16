import { levelDefinitions } from "../assessment-levels.js";
import { advancedQuestions } from "../advanced-question-data.js";
import { intermediateQuestions } from "../intermediate-question-data.js";
import { juniorQuestions } from "../professional-question-data.js";
import { dimensionMeta, questions } from "../question-data.js";
import { zhCNExamShare, zhCNQuickShare, zhCNUI } from "./zh-CN-ui.js";

const levels = Object.freeze([
  Object.freeze({
    key: "concept-observer",
    min: 0,
    label: "概念观察员",
    verdict: "你能听懂 AI 的热闹，但还没有形成企业落地的判断框架。",
  }),
  Object.freeze({
    key: "ai-operator",
    min: 45,
    label: "AI 工具手",
    verdict: "你会使用工具解决局部任务，但距离独立承担企业交付还有明显断层。",
  }),
  Object.freeze({
    key: "scenario-solver",
    min: 65,
    label: "场景解题者",
    verdict: "你开始用业务问题而不是工具清单思考，具备向 FDE 进阶的扎实基础。",
  }),
  Object.freeze({
    key: "field-deliverer",
    min: 80,
    label: "前线交付者",
    verdict: "你的判断接近成熟 FDE：能识别场景、控制边界，并把方案推向可验收结果。",
  }),
]);

const adviceByDimension = Object.freeze({
  diagnosis: "训练访谈、流程图和痛点证据，把‘客户想要什么’追问到真实工作现场。",
  scenario: "用价值、频次、数据准备度、复杂度和风险给候选场景做一次排序。",
  solution: "把模糊需求拆成输入、节点、人工闸门、输出和可观察的验收标准。",
  safety: "补齐数据授权、脱敏、权限、留痕、低置信度回退和人工确认机制。",
  delivery: "从 Demo 继续走到试用、培训、验收、变更管理和使用反馈闭环。",
});

const copy = Object.freeze({
  evidenceLabel: "潜质判断 · 尚未验证",
  strength: (label, score) => `你的强项是${label}：${score} 分。`,
  exposure({ dimensions, weakest, flags, advice }) {
    if (Math.min(...Object.values(dimensions)) >= 80) {
      return "压力测试结果：未暴露明显短板。快速选择题只能说明判断框架成熟，真实交付能力仍需项目文件、可运行 Demo 与答辩验证。";
    }
    if (flags.includes("safety-gap")) {
      return "最容易露馅的地方：边界意识。高风险动作缺少授权、人工闸门或失败回退，项目越自动化，代价越可能被放大。";
    }
    if (flags.includes("delivery-gap")) {
      return "最容易露馅的地方：落地闭环。你可能能做出 Demo，但还没有把试用、验收、培训和持续使用连成一条线。";
    }
    return `最容易露馅的地方：${weakest.label}。${advice}`;
  },
});

export const zhCN = Object.freeze({
  locale: "zh-CN",
  htmlLang: "zh-CN",
  ui: zhCNUI,
  quick: Object.freeze({ dimensionMeta, questions, levels, adviceByDimension, copy }),
  levels: levelDefinitions,
  questionBanks: Object.freeze({
    junior: juniorQuestions,
    intermediate: intermediateQuestions,
    advanced: advancedQuestions,
  }),
  quickShare: zhCNQuickShare,
  examShare: zhCNExamShare,
});
