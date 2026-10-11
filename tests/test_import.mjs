// End-to-end: import the REAL ATLAS input workbooks (SI as shipped, FPS as produced by ATLAS convert_units.py),
// solve with the JavaScript port and compare with the results of the original Python engine.
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { importWorkbook } from '../src/atlas/importXlsx.js';
import { buildCase, run, assess } from '../src/atlas/index.js';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data') + path.sep;
let fail = 0;
const t = (n, c, x = '') => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + n, x); };
const CASES = [
  ['KPTC_Constant_Input.xlsx', 'SI', 'CONSTANT', 380411.6096520866, 'ATLAS shipped output'],
  ['KPTC_Variable_Input.xlsx', 'SI', 'VARIABLE', 940748.4079347524, 'ATLAS shipped output'],
  ['KPTC_Constant_FPS_Input.xlsx', 'FPS', 'CONSTANT', 380411.60965208785, 'Python engine on the converted workbook'],
  ['KPTC_Variable_FPS_Input.xlsx', 'FPS', 'VARIABLE', 940748.4079347554, 'Python engine on the converted workbook'],
  ['KPSCL_Constant_Input.xlsx', 'SI', 'CONSTANT', 81493.80931597487, 'ATLAS KPSCL engine', 'KPSCL'],
  ['KPSCL_Variable_Input.xlsx', 'SI', 'VARIABLE', 201532.15471172787, 'ATLAS KPSCL engine', 'KPSCL'],
  ['KPSCL_Constant_FPS_Input.xlsx', 'FPS', 'CONSTANT', 81493.80931597533, 'Python engine on the converted workbook', 'KPSCL'],
  ['KPSCL_Variable_FPS_Input.xlsx', 'FPS', 'VARIABLE', 201532.15471172894, 'Python engine on the converted workbook', 'KPSCL'],
];
for (const [file, system, kind, expLife, src, geo = 'KPTC'] of CASES) {
  const tag = `${geo}/${kind}/${system}`;
  const st = importWorkbook(new Uint8Array(fs.readFileSync(dir + file)));
  t(`${tag}: unit system / load type / crack case read`, st.system === system && st.loadType === kind && st.geometry === geo, `${st.system} ${st.loadType} ${st.geometry}`);
  const allowed = kind === 'VARIABLE' ? ['min_scale', 'max_scale'] : [];
  t(`${tag}: every schema field found in the workbook`, st.missingFields.every(m => allowed.includes(m)), st.missingFields.join(','));
  t(`${tag}: project info read`, st.project.project === `ATLAS ${geo} reference case`, st.project.project);
  if (geo === 'KPSCL') {
    t(`${tag}: 11-point stress profile read (x = 0 to t)`, st.profile.length === 11 && st.profile[0].x === 0 && st.profile[0].p > 0, JSON.stringify(st.profile[0]));
    const tt = st.raw.t; t(`${tag}: last profile point at x = t`, Math.abs(st.profile[10].x - tt) < 1e-9, `${st.profile[10].x} vs ${tt}`);
  }
  if (kind === 'VARIABLE') t(`${tag}: 4 load blocks A-D read`, st.history.length === 4 && st.history[3].name === 'D' && st.history[3].hi === 1);
  if (system === 'FPS') t(`${tag}: template defaults taken from the FPS side of the switch formulas`, Math.abs(st.raw.t - 0.78740157480315) < 1e-12 && Math.abs(st.raw.Pm - 17.4045285276251) < 1e-10, `t=${st.raw.t} Pm=${st.raw.Pm}`);
  const caseIn = buildCase(st), res = run(caseIn);
  t(`${tag}: life = ${src}`, Math.abs(res.summary.life - expLife) < 1e-9 * expLife, `${res.summary.life.toFixed(4)} vs ${expLife}`);
  if (geo === 'KPTC') t(`${tag}: limiting 2c = 160.8163 mm`, Math.abs(res.summary.critical_2c_mm - 160.8163320726756) < 1e-9);
  else t(`${tag}: limiting depth = 7.2236 mm`, Math.abs(res.summary.critical_c_mm - 7.223603996551984) < 1e-9);
  if (system === 'SI') {
    const l3 = assess(caseIn, res);
    const exp = geo === 'KPSCL' ? (kind === 'CONSTANT' ? '17 of 17 cases NOT acceptable - review input uncertainty' : '7 of 17 cases NOT acceptable - review input uncertainty')
      : kind === 'CONSTANT' ? '2 of 17 cases NOT acceptable - review input uncertainty' : 'All sensitivity cases acceptable';
    t(`${tag}: Level 3 verdict = ATLAS`, l3.sensitivity.verdict === exp, l3.sensitivity.verdict);
    const fexp = geo === 'KPSCL' ? 2.185940671838792 : 3.0085, tol = geo === 'KPSCL' ? 1e-9 : 5e-4;
    t(`${tag}: Method D load factor ${fexp.toFixed(4)}`, Math.abs(l3.method_d.F_instability - fexp) < tol, l3.method_d.F_instability.toFixed(4));
  }
}
console.log(fail ? `FAILED ${fail}` : 'ALL PASS'); process.exit(fail ? 1 : 0);
