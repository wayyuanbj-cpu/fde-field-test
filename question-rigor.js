const BANK_CONTRACTS = Object.freeze({
  junior: Object.freeze({ total: 100, types: Object.freeze({ single: 60, multiple: 30, judgment: 10 }), critical: 10, absoluteCueMax: 0.20 }),
  intermediate: Object.freeze({ total: 60, types: Object.freeze({ single: 48, multiple: 12, judgment: 0 }), critical: 8, absoluteCueMax: 0.12 }),
  advanced: Object.freeze({ total: 40, types: Object.freeze({ single: 30, multiple: 10, judgment: 0 }), critical: 6, absoluteCueMax: 0.12 }),
});

const BANNED_CUES = Object.freeze({
  "zh-CN": [
    /永远保证/u,
    /全部交给(?:模型|AI|Agent)/u,
    /隐藏(?:问题|风险|异议)/u,
    /绕过(?:审批|权限|评审)/u,
    /删除(?:证据|日志|记录)/u,
    /承担全部风险/u,
  ],
  "en-US": [
    /guarantee(?:s|d)? forever/iu,
    /hand everything to (?:the )?(?:model|AI|agent)/iu,
    /hide (?:the )?(?:issue|risk|objection)/iu,
    /bypass (?:approval|access control|review)/iu,
    /delete (?:the )?(?:evidence|logs?|records?)/iu,
    /assume all (?:the )?risk/iu,
  ],
});

const ABSOLUTE_CUES = Object.freeze({
  "zh-CN": /只|所有|全部|完全|无限|任意|自然|不要|无需|不提供|随机|最大|最贵|最小|直接|统一|永不|不发生|忽略|关闭监控|凭经验|现场印象|自行判断|等.+再|简单/u,
  "en-US": /\bonly\b|\bevery\b|\ball\b|\balways\b|\bnever\b|\bunlimited\b|\bimmediately\b|\bmaximum\b|\blargest\b|\bsmallest\b|\bwithout\b|\bwait for\b|\bautomatically\b/iu,
});

export function optionLength(copy, locale) {
  if (locale === "en-US") return String(copy).trim().split(/\s+/u).filter(Boolean).length;
  return [...String(copy).replace(/[\s，。、“”‘’：；,.!?()（）/+-]/gu, "")].length;
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function rounded(value) {
  return Math.round(value * 1000) / 1000;
}

function bannedCueMatches(questions, locale, optionCopy) {
  const patterns = BANNED_CUES[locale] ?? [];
  const matches = [];
  for (const question of questions) {
    optionCopy(question).forEach((copy, optionIndex) => {
      const pattern = patterns.find((candidate) => candidate.test(copy));
      if (pattern) matches.push({ id: question.id, optionIndex, copy });
    });
  }
  return matches;
}

function optionMetrics(questions, locale, answerIndexes, optionCopy) {
  let correctLength = 0;
  let correctCount = 0;
  let distractorLength = 0;
  let distractorCount = 0;
  let uniqueLongestCorrect = 0;
  let singleCount = 0;
  let maxWithinQuestionLengthRatio = 0;
  let distractorAbsoluteCues = 0;
  const lengthRatioViolations = [];

  for (const question of questions) {
    const options = optionCopy(question);
    const answers = answerIndexes(question);
    const lengths = options.map((option) => optionLength(option, locale));
    const shortest = Math.min(...lengths);
    const longest = Math.max(...lengths);
    const within = shortest ? longest / shortest : Number.POSITIVE_INFINITY;
    maxWithinQuestionLengthRatio = Math.max(maxWithinQuestionLengthRatio, within);
    if (within > 1.6) lengthRatioViolations.push({ id: question.id, ratio: rounded(within) });

    options.forEach((_, index) => {
      if (answers.includes(index)) {
        correctLength += lengths[index];
        correctCount += 1;
      } else {
        distractorLength += lengths[index];
        distractorCount += 1;
        if (ABSOLUTE_CUES[locale]?.test(options[index])) distractorAbsoluteCues += 1;
      }
    });

    if (answers.length === 1 && options.length === 4) {
      singleCount += 1;
      const max = Math.max(...lengths);
      if (lengths.filter((value) => value === max).length === 1 && lengths[answers[0]] === max) {
        uniqueLongestCorrect += 1;
      }
    }
  }

  return {
    correctDistractorLengthRatio: rounded(ratio(correctLength, correctCount) / ratio(distractorLength, distractorCount)),
    uniqueLongestCorrectRate: rounded(ratio(uniqueLongestCorrect, singleCount)),
    maxWithinQuestionLengthRatio: rounded(maxWithinQuestionLengthRatio),
    distractorAbsoluteCueRate: rounded(ratio(distractorAbsoluteCues, distractorCount)),
    lengthRatioViolations,
  };
}

export function analyzeQuick(questions, locale) {
  const optionCopy = (question) => question.options.map((option) => option.text);
  const answerIndexes = (question) => {
    const best = Math.max(...question.options.map((option) => option.score));
    return question.options.map((option, index) => (option.score === best ? index : -1)).filter((index) => index >= 0);
  };
  return {
    total: questions.length,
    optionCountViolations: questions.filter((question) => question.options?.length !== 4).map((question) => question.id),
    scoreLadderViolations: questions.filter((question) => {
      const scores = question.options.map((option) => option.score).sort((a, b) => a - b);
      return JSON.stringify(scores) !== JSON.stringify([1, 2, 3, 4]);
    }).map((question) => question.id),
    bannedCueMatches: bannedCueMatches(questions, locale, optionCopy),
    ...optionMetrics(questions, locale, answerIndexes, optionCopy),
  };
}

export function analyzeBank(questions, locale) {
  const types = { single: 0, multiple: 0, judgment: 0 };
  const singleAnswerPositions = [0, 0, 0, 0];
  const judgmentAnswerPositions = [0, 0];
  const nonJudgment = [];
  const optionCountViolations = [];
  const multipleAnswerViolations = [];

  for (const question of questions) {
    if (Object.hasOwn(types, question.type)) types[question.type] += 1;
    if (question.type !== "judgment") {
      nonJudgment.push(question);
      if (question.options?.length !== 4) optionCountViolations.push(question.id);
    }
    if (question.type === "single" && question.answer?.length === 1 && question.answer[0] < 4) {
      singleAnswerPositions[question.answer[0]] += 1;
    }
    if (question.type === "judgment" && question.answer?.length === 1 && question.answer[0] < 2) {
      judgmentAnswerPositions[question.answer[0]] += 1;
    }
    if (question.type === "multiple" && ![2, 3].includes(question.answer?.length)) {
      multipleAnswerViolations.push(question.id);
    }
  }

  return {
    total: questions.length,
    types,
    criticalCount: questions.filter((question) => question.critical === true).length,
    criticalTypeViolations: questions.filter((question) => typeof question.critical !== "boolean").map((question) => question.id),
    singleAnswerPositions,
    judgmentAnswerPositions,
    optionCountViolations,
    multipleAnswerViolations,
    bannedCueMatches: bannedCueMatches(nonJudgment, locale, (question) => question.options),
    ...optionMetrics(nonJudgment, locale, (question) => question.answer, (question) => question.options),
  };
}

function sameCounts(actual, expected) {
  return Object.keys(expected).every((key) => actual[key] === expected[key]);
}

function validateMetrics(label, analysis, errors) {
  if (analysis.optionCountViolations.length) errors.push(`${label}: non-four-option items ${analysis.optionCountViolations.join(",")}`);
  if (analysis.lengthRatioViolations.length) errors.push(`${label}: option length ratio exceeds 1.6 in ${analysis.lengthRatioViolations.length} items`);
  if (analysis.correctDistractorLengthRatio < 0.9 || analysis.correctDistractorLengthRatio > 1.1) {
    errors.push(`${label}: correct/distractor length ratio ${analysis.correctDistractorLengthRatio} outside 0.90-1.10`);
  }
  if (analysis.uniqueLongestCorrectRate > 0.35) {
    errors.push(`${label}: unique-longest best-answer rate ${analysis.uniqueLongestCorrectRate} exceeds 0.35`);
  }
  if (analysis.bannedCueMatches.length) errors.push(`${label}: caricature cue phrases in ${analysis.bannedCueMatches.length} options`);
}

export function validateRigorContract(bundle, locale) {
  const errors = [];
  const quick = analyzeQuick(bundle.quick.questions, locale);
  if (quick.total !== 12) errors.push(`${locale} quick: total ${quick.total}/12`);
  if (quick.scoreLadderViolations.length) errors.push(`${locale} quick: invalid 1/2/3/4 score ladders`);
  validateMetrics(`${locale} quick`, quick, errors);

  for (const [level, contract] of Object.entries(BANK_CONTRACTS)) {
    const analysis = analyzeBank(bundle.questionBanks[level], locale);
    const label = `${locale} ${level}`;
    if (analysis.total !== contract.total) errors.push(`${label}: total ${analysis.total}/${contract.total}`);
    if (!sameCounts(analysis.types, contract.types)) errors.push(`${label}: type counts ${JSON.stringify(analysis.types)}`);
    if (analysis.criticalCount !== contract.critical) errors.push(`${label}: critical count ${analysis.criticalCount}/${contract.critical}`);
    if (analysis.distractorAbsoluteCueRate > contract.absoluteCueMax) {
      errors.push(`${label}: absolute distractor cue rate ${analysis.distractorAbsoluteCueRate} exceeds ${contract.absoluteCueMax}`);
    }
    if (analysis.criticalTypeViolations.length) errors.push(`${label}: missing boolean critical flags in ${analysis.criticalTypeViolations.length} items`);
    if (analysis.multipleAnswerViolations.length) errors.push(`${label}: invalid multi-answer counts in ${analysis.multipleAnswerViolations.length} items`);
    if (analysis.types.single) {
      analysis.singleAnswerPositions.forEach((count, index) => {
        const share = count / analysis.types.single;
        if (share < 0.2 || share > 0.3) errors.push(`${label}: answer position ${index} share ${rounded(share)} outside 0.20-0.30`);
      });
    }
    if (analysis.types.judgment && analysis.judgmentAnswerPositions.some((count) => count !== analysis.types.judgment / 2)) {
      errors.push(`${label}: judgment answers ${analysis.judgmentAnswerPositions.join("/")} are not balanced`);
    }
    validateMetrics(label, analysis, errors);
  }

  if (errors.length) throw new Error(errors.join("\n"));
  return true;
}
