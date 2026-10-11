// Compares the JavaScript port with results produced by the ORIGINAL ATLAS Python engine (tests/oracle.json).
import fs from 'fs';
import { buildCase, run, assess, defaultRaw } from '../src/atlas/index.js';
import { cmp, expectOf, l3Of, counter } from './_compare.mjs';

const oracle = JSON.parse(fs.readFileSync(new URL('./oracle.json', import.meta.url)));
let nCases = 0, nFail = 0;
const failures = [];
const only = process.argv[2];
let tAll = 0;
for (const c of oracle.cases) {
  if (only && !c.name.includes(only)) continue;
  nCases++;
  const out = [];
  const t0 = performance.now();
  try {
    const caseIn = buildCase({ system: c.system, loadType: c.load_type, geometry: c.geometry || 'KPTC', profile: (c.profile || []).map(r => ({ x: r[0], p: r[1], s: r[2], r: r[3] })), raw: { ...c.raw }, history: c.history, tests: c.tests, project: {} });
    const res = run(caseIn);
    const l3 = c.l3 ? assess(caseIn, res) : null;           // Level 3 can raise too (e.g. unapproved project J-R data)
    if (c.expect_error !== undefined) out.push(`expected error "${c.expect_error}" but the port solved it (life ${res.summary.life})`);
    else {
      cmp(expectOf(res), c.expect, 'result', out);
      if (c.expect_l3) cmp(l3Of(l3), c.expect_l3, 'level3', out);
    }
  } catch (e) {
    if (c.expect_error === undefined) out.push(`unexpected error: ${e.message}`);
    else if (String(e.message) !== c.expect_error) out.push(`error text differs:\n      port   : ${e.message}\n      python : ${c.expect_error}`);
    else counter.checks++;
  }
  tAll += performance.now() - t0;
  if (out.length) { nFail++; failures.push([c.name, out]); }
}
// default values per unit system
for (const key of Object.keys(oracle.defaults)) {
  const [sysm, g] = key.split('_');
  const out = [];
  const mine = defaultRaw(sysm, g || 'KPTC');
  for (const [k, e] of Object.entries(oracle.defaults[key])) cmp(mine[k], e, `defaults.${key}.${k}`, out);
  nCases++;
  if (out.length) { nFail++; failures.push([`default values ${key}`, out]); }
}
for (const [n, out] of failures.slice(0, 25)) { console.log('FAIL', n); out.slice(0, 6).forEach(o => console.log('   ', o)); }
if (failures.length > 25) console.log(`... and ${failures.length - 25} more failing scenarios`);
console.log(`\n${nCases - nFail}/${nCases} scenarios match the Python engine (${counter.checks} value comparisons, ${(tAll / 1000).toFixed(1)} s)`);
process.exit(nFail ? 1 : 0);
