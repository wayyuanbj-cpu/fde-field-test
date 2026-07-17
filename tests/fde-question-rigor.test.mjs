import assert from "node:assert/strict";
import { bundleFor } from "../locales/index.js";
import {
  analyzeBank,
  analyzeQuick,
  validateRigorContract,
} from "../question-rigor.js";

const expected = {
  junior: { total: 100, types: { single: 60, multiple: 30, judgment: 10 }, critical: 10 },
  intermediate: { total: 60, types: { single: 48, multiple: 12, judgment: 0 }, critical: 8 },
  advanced: { total: 40, types: { single: 30, multiple: 10, judgment: 0 }, critical: 6 },
};

for (const locale of ["zh-CN", "en-US"]) {
  const bundle = bundleFor(locale);
  assert.equal(validateRigorContract(bundle, locale), true, `${locale} rigor contract`);
  assert.equal(bundle.quick.questions.length, 12, `${locale} quick count`);
  const quick = analyzeQuick(bundle.quick.questions, locale);
  assert.equal(quick.optionCountViolations.length, 0, `${locale} quick options`);

  for (const [level, contract] of Object.entries(expected)) {
    const analysis = analyzeBank(bundle.questionBanks[level], locale);
    assert.equal(analysis.total, contract.total, `${locale} ${level} total`);
    assert.deepEqual(analysis.types, contract.types, `${locale} ${level} types`);
    assert.equal(analysis.criticalCount, contract.critical, `${locale} ${level} critical count`);
  }
}

console.log("FDE bilingual question rigor checks passed");
