export const levelDefinitions = Object.freeze({
  junior: Object.freeze({
    id: "junior",
    code: "L1 / FOUNDATION",
    shortLabel: "初级",
    title: "初级 · 理论基础",
    resultNoun: "初级理论",
    audience: "普通参与者、AI 使用者和 FDE 入门学习者",
    description: "判断你是否具备进入企业 AI 交付现场所需的基础认知、方法和边界意识。",
    fullCount: 100,
    mockCount: 50,
    fullTime: "100–140 分钟",
    mockTime: "45–70 分钟",
    accent: "#39d98a",
    modules: Object.freeze([
      { id: "ai-foundation", code: "AI", label: "AI 与大模型基础", short: "模型基础", mockCount: 10 },
      { id: "prompt-decomposition", code: "PMT", label: "提示词与任务拆解", short: "任务拆解", mockCount: 10 },
      { id: "rag-agent", code: "RAG", label: "RAG、知识库、Agent 与工作流", short: "知识与流程", mockCount: 10 },
      { id: "scenario-design", code: "SCN", label: "企业场景诊断与方案设计", short: "场景方案", mockCount: 10 },
      { id: "delivery-governance", code: "DEL", label: "项目交付、安全合规与客户成功", short: "交付治理", mockCount: 10 },
    ]),
  }),
  intermediate: Object.freeze({
    id: "intermediate",
    code: "L2 / DELIVERY",
    shortLabel: "中级",
    title: "中级 · 情境交付",
    resultNoun: "中级情境",
    audience: "做过企业 AI 方案、PoC、工作流或客户交付的从业者",
    description: "在真实项目压力中检验诊断、取舍、方案、推进和客户成功能力。",
    fullCount: 60,
    mockCount: 30,
    fullTime: "75–100 分钟",
    mockTime: "35–50 分钟",
    accent: "#5d8cff",
    modules: Object.freeze([
      { id: "business-diagnosis", code: "DIA", label: "业务诊断", short: "业务诊断", mockCount: 5 },
      { id: "scenario-priority", code: "PRI", label: "场景优先级", short: "场景排序", mockCount: 5 },
      { id: "solution-architecture", code: "ARC", label: "方案与架构", short: "方案架构", mockCount: 5 },
      { id: "knowledge-engineering", code: "KNO", label: "数据与知识工程", short: "知识工程", mockCount: 5 },
      { id: "project-delivery", code: "PRJ", label: "项目推进", short: "项目推进", mockCount: 5 },
      { id: "customer-success", code: "CS", label: "验收与客户成功", short: "客户成功", mockCount: 5 },
    ]),
  }),
  advanced: Object.freeze({
    id: "advanced",
    code: "L3 / COMMAND",
    shortLabel: "高级",
    title: "高级 · 复杂决策",
    resultNoun: "高级决策",
    audience: "复杂企业 AI 项目、跨部门治理和规模化交付负责人",
    description: "检验你能否在组织冲突、系统约束、商业压力和高风险事件中做负责任的决定。",
    fullCount: 40,
    mockCount: 20,
    fullTime: "60–90 分钟",
    mockTime: "30–45 分钟",
    accent: "#ad7bff",
    modules: Object.freeze([
      { id: "complex-diagnosis", code: "CDX", label: "复杂系统诊断", short: "复杂诊断", mockCount: 4 },
      { id: "enterprise-architecture", code: "ENT", label: "企业级方案取舍", short: "企业架构", mockCount: 4 },
      { id: "org-governance", code: "ORG", label: "组织与治理", short: "组织治理", mockCount: 3 },
      { id: "scaled-delivery", code: "SCL", label: "规模化交付", short: "规模交付", mockCount: 3 },
      { id: "business-value", code: "VAL", label: "商业价值", short: "商业价值", mockCount: 3 },
      { id: "risk-backstop", code: "RSK", label: "风险与兜底", short: "风险兜底", mockCount: 3 },
    ]),
  }),
});

export function recommendLevel(potentialScore) {
  if (!Number.isFinite(potentialScore) || potentialScore < 70) return "junior";
  if (potentialScore < 85) return "intermediate";
  return "advanced";
}

export function moduleDefinition(level, moduleId) {
  return levelDefinitions[level]?.modules.find((module) => module.id === moduleId) ?? null;
}
