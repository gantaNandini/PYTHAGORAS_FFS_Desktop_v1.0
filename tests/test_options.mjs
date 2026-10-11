// EVERY drop-down option of every input sheet: the JavaScript port must reproduce the original Python engine in every
// context that was tried (successes and error messages), in SI and FPS.
import fs from 'fs';
import { buildCase, run, assess } from '../src/atlas/index.js';
import { cmp, expectOf, l3Of, counter } from './_compare.mjs';

const sweep = JSON.parse(fs.readFileSync(new URL('./options_oracle.json', import.meta.url)));
let nFail = 0, nRuns = 0;
const failures = [];
for (const s of sweep) {
  for (const a of s.attempts) {
    nRuns++;
    const out = [];
    try {
      const caseIn = buildCase({ system: a.system, loadType: a.load_type, raw: { ...a.raw }, history: a.history, tests: a.tests, project: {} });
      const res = run(caseIn);
      const l3 = a.l3 ? assess(caseIn, res) : null;
      if (a.expect_error !== undefined) out.push(`expected error "${a.expect_error}" but the port solved it`);
      else { cmp(expectOf(res), a.expect, 'result', out); if (a.expect_l3) cmp(l3Of(l3), a.expect_l3, 'level3', out); }
    } catch (e) {
      if (a.expect_error === undefined) out.push(`unexpected error: ${e.message}`);
      else if (String(e.message) !== a.expect_error) out.push(`error text differs:\n      port   : ${e.message}\n      python : ${a.expect_error}`);
      else counter.checks++;
    }
    if (out.length) { nFail++; failures.push([`${s.sheet} ${s.field}=${s.option} ${a.system} ${a.load_type} [${a.context}]`, out]); }
  }
}
for (const [n, out] of failures.slice(0, 20)) { console.log('FAIL', n); out.slice(0, 5).forEach(o => console.log('   ', o)); }
const solved = sweep.filter(s => s.attempts.some(a => a.expect_error === undefined)).length;
console.log(`\n${sweep.length} option runs (${nRuns} solver calls): ${solved} solved, ${sweep.length - solved} rejected with the same validation message as the Python engine; ` +
  `${nRuns - nFail}/${nRuns} calls match (${counter.checks} comparisons)`);
process.exit(nFail ? 1 : 0);
