export const dimensionMeta = Object.freeze({
  diagnosis: Object.freeze({ label: "Business diagnosis", short: "Diagnosis", code: "DIA" }),
  scenario: Object.freeze({ label: "Use-case judgment", short: "Use case", code: "SCN" }),
  solution: Object.freeze({ label: "Solution design", short: "Solution", code: "SOL" }),
  safety: Object.freeze({ label: "Risk boundaries", short: "Controls", code: "SAFE" }),
  delivery: Object.freeze({ label: "Delivery execution", short: "Delivery", code: "DEL" }),
});

export const questions = Object.freeze([
  {
    id: "q01", dimension: "diagnosis",
    scenario: "The CEO of a manufacturing company says, ‘We need an AI system too. It should make us more efficient.’",
    prompt: "What do you do first?",
    options: [
      { text: "Prepare a comparison of leading agent platforms so the CEO can choose one quickly", score: 1, signal: "Tool first" },
      { text: "Build an impressive demo to show management what AI could do", score: 2, signal: "Demo first" },
      { text: "Interview leaders, frontline staff, and system owners to identify recurring work and supporting evidence", score: 4, signal: "Diagnosis first" },
      { text: "Ask every department to submit problems they want AI to solve, then consolidate the requests", score: 3, signal: "Request collection" },
    ],
  },
  {
    id: "q02", dimension: "diagnosis",
    scenario: "A sales team says it is too busy to follow up properly. Its manager wants an AI sales bot.",
    prompt: "Which response is most like an FDE?",
    options: [
      { text: "The team is resisting new tools, so start with AI training", score: 1, signal: "Surface diagnosis" },
      { text: "Map the current follow-up process and measure time spent searching, drafting, and waiting", score: 4, signal: "Process evidence" },
      { text: "Launch automated outbound calls and validate the idea through conversion rate", score: 0, signal: "High-risk leap" },
      { text: "Use a large language model to generate more sales scripts and increase output first", score: 2, signal: "Local optimization" },
    ],
  },
  {
    id: "q03", dimension: "scenario",
    scenario: "A client proposes four AI use cases at once: product copy, review analysis, inventory forecasting, and automated ad buying.",
    prompt: "Which pair would you recommend for the first pilot?",
    options: [
      { text: "Inventory forecasting and automated ad buying, because they offer the greatest upside", score: 1, signal: "Value illusion" },
      { text: "All four, to avoid rebuilding the foundation later", score: 0, signal: "Scope failure" },
      { text: "Product copy and review analysis, because the data is easier to prepare and the outputs are testable", score: 4, signal: "Viable pilot" },
      { text: "Product copy only, because generative AI is strongest at writing", score: 2, signal: "Single-tool view" },
    ],
  },
  {
    id: "q04", dimension: "scenario",
    scenario: "A company wants a knowledge assistant to answer presales questions from 30 product documents. Two different price lists are still in circulation.",
    prompt: "What is the right sequence?",
    options: [
      { text: "Upload everything and instruct the model to prefer the newest version", score: 1, signal: "Technical patch" },
      { text: "Confirm versions, permissions, and applicability before designing evaluation questions", score: 4, signal: "Content governance" },
      { text: "Let the AI decide which price is more reasonable", score: 0, signal: "Unauthorized judgment" },
      { text: "Exclude price questions and launch the rest of the assistant first", score: 2, signal: "Partial avoidance" },
    ],
  },
  {
    id: "q05", dimension: "scenario",
    scenario: "You must choose the first enterprise AI use case from ten candidates.",
    prompt: "Which criteria are most useful?",
    options: [
      { text: "Model parameters, context window, benchmark rank, and API price", score: 1, signal: "Model centric" },
      { text: "Executive attention, budget, publicity value, and technical novelty", score: 2, signal: "Showcase centric" },
      { text: "Business value, frequency, data readiness, complexity, and risk", score: 4, signal: "Use-case matrix" },
      { text: "Development speed, interface polish, feature count, and vendor brand", score: 0, signal: "Product illusion" },
    ],
  },
  {
    id: "q06", dimension: "solution",
    scenario: "A client wants a workflow that classifies customer feedback and produces a weekly report.",
    prompt: "Which design is closest to something you could actually deliver?",
    options: [
      { text: "Upload data → AI analysis → weekly report", score: 1, signal: "Black-box flow" },
      { text: "Trigger → field validation → classification → low-confidence human review → aggregation → archive", score: 4, signal: "Controlled workflow" },
      { text: "Use the strongest model and let it plan every step autonomously", score: 0, signal: "Autonomy myth" },
      { text: "Write one very long prompt that includes every requirement", score: 2, signal: "Prompt stacking" },
    ],
  },
  {
    id: "q07", dimension: "solution",
    scenario: "You need to turn ‘create an enterprise AI transformation plan’ into a task a model can execute.",
    prompt: "What matters most?",
    options: [
      { text: "Tell the model to act as a world-class strategy consultant", score: 1, signal: "Role dressing" },
      { text: "Add more industry terminology so the output sounds professional", score: 0, signal: "Jargon dressing" },
      { text: "Define the audience, inputs, steps, output format, acceptance criteria, and unknowns", score: 4, signal: "Task engineering" },
      { text: "Provide a competitor's plan and ask the model to rewrite it", score: 2, signal: "Template dependence" },
    ],
  },
  {
    id: "q08", dimension: "safety",
    scenario: "A sales workflow can now draft customer replies. The team wants it to send them automatically next.",
    prompt: "How do you respond?",
    options: [
      { text: "Keep human approval and record risks such as misdelivery, unauthorized commitments, and low confidence", score: 4, signal: "Human approval gate" },
      { text: "Auto-send only to high-intent prospects; the risk is acceptable", score: 1, signal: "Risk gamble" },
      { text: "Lower the temperature and fully automate it", score: 0, signal: "Parameter myth" },
      { text: "Let each salesperson decide whether to enable auto-send", score: 2, signal: "Responsibility transfer" },
    ],
  },
  {
    id: "q09", dimension: "safety",
    scenario: "A client sends raw files containing names, phone numbers, and contract values and asks you to upload them to a public model immediately.",
    prompt: "What should an FDE do?",
    options: [
      { text: "Upload them as long as the conversation link is not shared", score: 0, signal: "Privacy misconception" },
      { text: "Confirm authorization, redaction, data boundaries, audit requirements, and approved tools first", score: 4, signal: "Compliance first" },
      { text: "Upload a small sample to prove the result before discussing security", score: 1, signal: "Act first" },
      { text: "Ask the client to accept all risk in writing", score: 2, signal: "Liability transfer" },
    ],
  },
  {
    id: "q10", dimension: "delivery",
    scenario: "A customer-support knowledge-base demo looks good. The client asks, ‘How do we sign this off?’",
    prompt: "Which answer is the most professional?",
    options: [
      { text: "Acceptance is based on client satisfaction because AI cannot be measured consistently", score: 1, signal: "Subjective acceptance" },
      { text: "Use feature completeness, interface quality, and response speed", score: 2, signal: "Product-only acceptance" },
      { text: "Define accuracy on a reference set, citation rate, escalation rate, response time, and update process", score: 4, signal: "Measurable acceptance" },
      { text: "Launch a trial and let production data tell us whether it works", score: 0, signal: "No acceptance standard" },
    ],
  },
  {
    id: "q11", dimension: "delivery",
    scenario: "Two weeks after a demo launches, almost no one in the business is using it.",
    prompt: "What do you check first?",
    options: [
      { text: "Whether the model should be upgraded to the latest version", score: 1, signal: "Model attribution" },
      { text: "Access point, real workflows, training, trust in outputs, and the feedback loop", score: 4, signal: "Customer success" },
      { text: "Whether points and leaderboards would encourage adoption", score: 2, signal: "Engagement patch" },
      { text: "Users refuse to change, so the project no longer has value", score: 0, signal: "Delivery abandonment" },
    ],
  },
  {
    id: "q12", dimension: "delivery",
    scenario: "Halfway through a pilot, the client asks for two more integrations, automated approval, and an executive dashboard.",
    prompt: "What is the best response?",
    options: [
      { text: "Agree immediately; keeping the client happy matters most", score: 0, signal: "Scope appeasement" },
      { text: "Reject every request and finish only the original scope", score: 2, signal: "Rigid delivery" },
      { text: "Log the change, assess value, dependencies, risk, and schedule, then agree whether it belongs in phase two", score: 4, signal: "Change control" },
      { text: "Build the executive dashboard first so leadership can see progress", score: 1, signal: "Showcase first" },
    ],
  },
]);
