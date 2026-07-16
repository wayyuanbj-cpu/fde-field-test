const TYPES = new Set(["single", "multiple", "judgment"]);

export function validateQuestionBank(questions, contract) {
  if (!Array.isArray(questions)) throw new Error("题库必须是数组");
  if (questions.length !== contract.total) throw new Error(`题量错误：${questions.length}/${contract.total}`);

  const ids = new Set();
  const moduleCounts = Object.fromEntries(contract.modules.map((module) => [module, 0]));

  for (const question of questions) {
    if (!question?.id) throw new Error("题目缺少 ID");
    if (ids.has(question.id)) throw new Error(`题目 ID 重复：${question.id}`);
    ids.add(question.id);
    if (!contract.modules.includes(question.module)) throw new Error(`模块错误：${question.id}`);
    moduleCounts[question.module] += 1;
    if (!TYPES.has(question.type)) throw new Error(`题型错误：${question.id}`);
    if (!Array.isArray(question.options) || question.options.length < 2) throw new Error(`选项不足：${question.id}`);
    if (!Array.isArray(question.answer) || question.answer.length === 0) throw new Error(`答案缺失：${question.id}`);
    if (question.answer.some((index) => !Number.isInteger(index) || index < 0 || index >= question.options.length)) {
      throw new Error(`答案越界：${question.id}`);
    }
    if (new Set(question.answer).size !== question.answer.length) throw new Error(`答案重复：${question.id}`);
    if (question.type !== "multiple" && question.answer.length !== 1) throw new Error(`非多选题答案数量错误：${question.id}`);
    if (typeof question.prompt !== "string" || !question.prompt.trim()) throw new Error(`题干缺失：${question.id}`);
    if (typeof question.context !== "string") throw new Error(`情境格式错误：${question.id}`);
    if (typeof question.explanation !== "string" || !question.explanation.trim()) throw new Error(`解析缺失：${question.id}`);
  }

  if (contract.counts) {
    contract.modules.forEach((module, index) => {
      if (moduleCounts[module] !== contract.counts[index]) {
        throw new Error(`模块题量错误：${module} ${moduleCounts[module]}/${contract.counts[index]}`);
      }
    });
  }
  return true;
}

export function createQuestion({ id, level, module, type = "single", context = "", prompt, options, answer, explanation }) {
  return Object.freeze({
    id,
    level,
    module,
    type,
    context,
    prompt,
    options: Object.freeze([...options]),
    answer: Object.freeze([...answer]),
    explanation,
  });
}
