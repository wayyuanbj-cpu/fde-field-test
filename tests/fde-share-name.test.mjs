import assert from "node:assert/strict";
import { sanitizeShareName, shareFilename } from "../share-name.js";

assert.equal(sanitizeShareName("  袁\n伟  "), "袁伟");
assert.equal(sanitizeShareName(""), "匿名挑战者");
assert.equal(sanitizeShareName("\u0000\u0007"), "匿名挑战者");
assert.equal(Array.from(sanitizeShareName("一".repeat(25))).length, 20);
assert.equal(sanitizeShareName("A\tB\rC"), "ABC");

const unsafe = shareFilename("../A/B:C*D?E\"F<G>H|I");
assert.ok(unsafe.endsWith(".png"));
assert.ok(!/[\\/:*?"<>|]/.test(unsafe));
assert.match(shareFilename(""), /^FDE-三级挑战-匿名挑战者\.png$/);
assert.match(shareFilename("袁伟"), /^FDE-三级挑战-袁伟\.png$/);

console.log("FDE share-name checks passed");
