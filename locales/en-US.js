import { advancedQuestions } from "./en-US/advanced-question-data.js";
import { intermediateQuestions } from "./en-US/intermediate-question-data.js";
import { juniorQuestions } from "./en-US/junior-question-data.js";
import { dimensionMeta, questions } from "./en-US/quick-question-data.js";
import { enUSExamShare, enUSQuickShare, enUSUI } from "./en-US/ui.js";

const levels = Object.freeze([
  Object.freeze({ key: "concept-observer", min: 0, label: "Concept Observer", verdict: "You can follow the AI conversation, but you do not yet have a reliable framework for enterprise delivery." }),
  Object.freeze({ key: "ai-operator", min: 45, label: "AI Operator", verdict: "You can use tools to solve local tasks, but there is still a clear gap between tool use and owning an enterprise delivery." }),
  Object.freeze({ key: "scenario-solver", min: 65, label: "Use-Case Solver", verdict: "You are starting from business problems rather than tool lists. That is a strong foundation for growing into an FDE." }),
  Object.freeze({ key: "field-deliverer", min: 80, label: "Field Deliverer", verdict: "Your judgment is close to that of a mature FDE: you can select viable use cases, control risk, and drive toward measurable acceptance." }),
]);

const adviceByDimension = Object.freeze({
  diagnosis: "Practice stakeholder interviews, process mapping, and pain-point evidence until you can trace a request back to the work as it actually happens.",
  scenario: "Rank candidate use cases by value, frequency, data readiness, complexity, and risk.",
  solution: "Turn vague requirements into inputs, workflow steps, human approval gates, outputs, and observable acceptance criteria.",
  safety: "Strengthen authorization, redaction, permissions, audit trails, low-confidence fallback, and human approval controls.",
  delivery: "Move beyond the demo into trials, training, acceptance, change control, adoption, and an operating feedback loop.",
});

const copy = Object.freeze({
  evidenceLabel: "Potential profile · Not yet verified",
  strength: (label, score) => `Your strongest signal is ${label}: ${score}.`,
  exposure({ dimensions, weakest, flags, advice }) {
    if (Math.min(...Object.values(dimensions)) >= 80) {
      return "Pressure-test result: no obvious weakness surfaced. A short scenario test can show mature judgment, but real delivery still requires project evidence, a working solution, and review under challenge.";
    }
    if (flags.includes("safety-gap")) {
      return "Where your judgment breaks down: risk boundaries. High-impact actions are missing authorization, human approval, or failure recovery. The more you automate, the more costly that gap becomes.";
    }
    if (flags.includes("delivery-gap")) {
      return "Where your judgment breaks down: the delivery loop. You may be able to produce a demo, but you have not yet connected trial, acceptance, training, adoption, and sustained use.";
    }
    return `Where your judgment breaks down: ${weakest.label}. ${advice}`;
  },
});

const englishLevelDefinitions = Object.freeze({
  junior: Object.freeze({
    id: "junior", code: "L1 / FOUNDATION", shortLabel: "Foundation", title: "Foundation · Core Knowledge", resultNoun: "Foundation",
    audience: "AI users and people beginning their FDE path",
    description: "Tests the core concepts, methods, and risk boundaries required to enter an enterprise AI delivery environment.",
    fullCount: 100, mockCount: 50, fullTime: "100–140 minutes", mockTime: "45–70 minutes", accent: "#39d98a",
    modules: Object.freeze([
      { id: "ai-foundation", code: "AI", label: "AI and LLM Foundations", short: "AI Foundations", mockCount: 10 },
      { id: "prompt-decomposition", code: "PMT", label: "Prompting and Task Decomposition", short: "Task Design", mockCount: 10 },
      { id: "rag-agent", code: "RAG", label: "RAG, Knowledge, Agents, and Workflows", short: "Knowledge & Flow", mockCount: 10 },
      { id: "scenario-design", code: "SCN", label: "Enterprise Diagnosis and Solution Design", short: "Use-Case Design", mockCount: 10 },
      { id: "delivery-governance", code: "DEL", label: "Delivery, Governance, and Customer Success", short: "Delivery Control", mockCount: 10 },
    ]),
  }),
  intermediate: Object.freeze({
    id: "intermediate", code: "L2 / DELIVERY", shortLabel: "Delivery", title: "Delivery · Applied Scenarios", resultNoun: "Delivery",
    audience: "Practitioners with experience in enterprise AI solutions, pilots, workflows, or client delivery",
    description: "Tests diagnosis, tradeoffs, solution design, execution, and customer success under realistic project pressure.",
    fullCount: 60, mockCount: 30, fullTime: "75–100 minutes", mockTime: "35–50 minutes", accent: "#5d8cff",
    modules: Object.freeze([
      { id: "business-diagnosis", code: "DIA", label: "Business Diagnosis", short: "Diagnosis", mockCount: 5 },
      { id: "scenario-priority", code: "PRI", label: "Use-Case Prioritization", short: "Prioritization", mockCount: 5 },
      { id: "solution-architecture", code: "ARC", label: "Solution and Architecture", short: "Architecture", mockCount: 5 },
      { id: "knowledge-engineering", code: "KNO", label: "Data and Knowledge Engineering", short: "Knowledge", mockCount: 5 },
      { id: "project-delivery", code: "PRJ", label: "Project Delivery", short: "Execution", mockCount: 5 },
      { id: "customer-success", code: "CS", label: "Acceptance and Customer Success", short: "Customer Success", mockCount: 5 },
    ]),
  }),
  advanced: Object.freeze({
    id: "advanced", code: "L3 / COMMAND", shortLabel: "Command", title: "Command · Complex Decisions", resultNoun: "Command",
    audience: "Leaders responsible for complex enterprise AI programs, cross-functional governance, and delivery at scale",
    description: "Tests whether you can make accountable decisions under organizational conflict, system constraints, commercial pressure, and high-impact risk.",
    fullCount: 40, mockCount: 20, fullTime: "60–90 minutes", mockTime: "30–45 minutes", accent: "#ad7bff",
    modules: Object.freeze([
      { id: "complex-diagnosis", code: "CDX", label: "Complex-System Diagnosis", short: "System Diagnosis", mockCount: 4 },
      { id: "enterprise-architecture", code: "ENT", label: "Enterprise Architecture Tradeoffs", short: "Enterprise Design", mockCount: 4 },
      { id: "org-governance", code: "ORG", label: "Organization and Governance", short: "Governance", mockCount: 3 },
      { id: "scaled-delivery", code: "SCL", label: "Delivery at Scale", short: "Scale", mockCount: 3 },
      { id: "business-value", code: "VAL", label: "Business Value", short: "Value", mockCount: 3 },
      { id: "risk-backstop", code: "RSK", label: "Risk and Recovery", short: "Risk Control", mockCount: 3 },
    ]),
  }),
});

export const enUS = Object.freeze({
  locale: "en-US",
  htmlLang: "en",
  ui: enUSUI,
  quick: Object.freeze({ dimensionMeta, questions, levels, adviceByDimension, copy }),
  levels: englishLevelDefinitions,
  questionBanks: Object.freeze({ junior: juniorQuestions, intermediate: intermediateQuestions, advanced: advancedQuestions }),
  quickShare: enUSQuickShare,
  examShare: enUSExamShare,
});
