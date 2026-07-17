function shuffledOrder(length, random) {
  const order = Array.from({ length }, (_, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order;
}

function validOptionOrder(order, length) {
  if (!Array.isArray(order) || order.length !== length) return false;
  return order.every((value, index) => Number.isInteger(value)
    && value >= 0
    && value < length
    && order.indexOf(value) === index);
}

export function applyOptionOrder(question, order) {
  if (!validOptionOrder(order, question.options?.length ?? 0)) {
    throw new Error(`Invalid option order for question ${question.id}`);
  }
  const answer = question.answer.map((originalIndex) => order.indexOf(originalIndex)).sort((a, b) => a - b);
  return {
    ...question,
    options: order.map((originalIndex) => question.options[originalIndex]),
    answer,
  };
}

export function prepareAttempt(questions, random = Math.random) {
  const optionOrders = {};
  const prepared = questions.map((question) => {
    const order = shuffledOrder(question.options.length, random);
    optionOrders[question.id] = order;
    return applyOptionOrder(question, order);
  });
  return { questions: prepared, optionOrders };
}

export function restoreAttempt(bank, questionIds, optionOrders) {
  const byId = new Map(bank.map((question) => [question.id, question]));
  return questionIds.map((id) => {
    const question = byId.get(id);
    if (!question) throw new Error(`Question not found: ${id}`);
    const order = optionOrders?.[id];
    if (!validOptionOrder(order, question.options.length)) {
      throw new Error(`Invalid option order for question ${id}`);
    }
    return applyOptionOrder(question, order);
  });
}
