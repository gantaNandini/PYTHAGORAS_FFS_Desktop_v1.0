// UI model layer without React: new projects for every crack case, derived rows, results, outputs, .pfs round trip and SI<->FPS conversion.
import { newProject, serialize, parse, convertSystem, sifName, refName } from '../src/model/project.js';
import { derive } from '../src/model/calc.js';
import { sheetsFor } from '../src/model/layout.js';
import * as O from '../src/model/outputs.js';
import { buildCase, run, assess } from '../src/atlas/index.js';
import SC from '../src/atlas/schema.generated.js';
import { fieldsFor } from '../src/atlas/case.js';
let fail = 0;
const t = (n, c, x = '') => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + n, c ? '' : x); };
const close = (a, b, r = 1e-9) => Math.abs(a - b) <= r * Math.max(1, Math.abs(a), Math.abs(b));
const D2 = SC.dist.KPSCL2;
const variants = [['KPTC', null], ['KPSCL', SC.dist.KPSCL1], ['KPSCL', D2]];
for (const [geo, dist] of variants) for (const lt of ['CONSTANT', 'VARIABLE']) {
  const tag = `${geo}${dist ? (dist === D2 ? '2' : '1') : ''}/${lt}`;
  let p = newProject('SI', lt, geo); if (dist) p.raw.stress_dist = dist;
  const caseIn = buildCase(p), res = run(caseIn);
  t(`${tag}: solves`, res.summary.life > 0 && res.geometry.type === geo, String(res.summary.life));
  const d = derive(p);
  t(`${tag}: derived rows`, geo === 'KPTC' ? d.flaw_cw > 0 : (d.sc_at > 0 && d.sc_applic === 'OK' && d.sc_G0 > 1 && d.sc_sol === (dist === D2 ? 'KPSCL2' : 'KPSCL1')), JSON.stringify([d.sc_at, d.sc_sol]));
  const dash = O.dashboard(res, null, {}), ps = O.plainSummary(res, null);
  t(`${tag}: dashboard/summary/checklist/trace`, dash.left.length > 5 && O.summaryRows(res).length > 15 && O.checklistRows(res, null).length > 15 && O.traceRows(res).length > 10 && ps.lines.length > 1);
  t(`${tag}: ${sifName(p)}/${refName(p)} labels`, dash.banner.includes(res.geometry.gid) && (geo === 'KPSCL' ? !dash.right.some(r => /2c/.test(r.label)) : dash.right.some(r => /2c/.test(r.label))), dash.banner);
  const hc = O.histCols(res).map(c => c[0]), sc = O.sifCols(res).map(c => c[0]);
  t(`${tag}: result columns`, geo === 'KPTC' ? hc.includes('2c') && hc.includes('Mb') && sc.includes('fw') : !hc.includes('2c') && hc.includes('G0') && sc.includes('G1'), hc.join());
  t(`${tag}: history/sif rows carry every column`, res.history.every(r => hc.every(k => k in r)) && res.sif.every(r => sc.every(k => k in r)));
  const l3 = assess(caseIn, res); const sr = O.sensitivityRows(l3, 'SI', res);
  t(`${tag}: level 3 rows`, sr && sr.length > 3 && sr.every(r => r.m ? Number.isFinite(r.twoC) : true));
  // .pfs round trip
  const q = parse(serialize(p));
  t(`${tag}: .pfs round trip`, JSON.stringify(q.raw) === JSON.stringify(p.raw) && q.geometry === geo && JSON.stringify(q.profile) === JSON.stringify(p.profile));
  // SI -> FPS -> SI and the life is unit independent
  const f = convertSystem(p, 'FPS'), resF = run(buildCase(f));
  t(`${tag}: FPS life equals SI life`, close(resF.summary.life, res.summary.life, 1e-7), `${resF.summary.life} vs ${res.summary.life}`);
  const b = convertSystem(f, 'SI');
  t(`${tag}: SI->FPS->SI restores inputs`, fieldsFor(geo).every(fl => typeof p.raw[fl.name] !== 'number' || close(b.raw[fl.name], p.raw[fl.name], 1e-9)) && (p.profile || []).every((r, i) => close(b.profile[i].x, r.x) && close(b.profile[i].p, r.p)));
}
// sheets per geometry
const sk = sheetsFor('KPSCL'), st = sheetsFor('KPTC');
t('KPSCL sheets: 5_Loads has the distribution drop-downs and the profile table', sk.find(s => s.id === '5_Loads').sections.some(s => s.rows.includes('stress_dist')) && JSON.stringify(sk).includes('"table":"profile"'));
t('KPTC sheets unchanged: no KPSCL sections', !JSON.stringify(st).includes('stress_dist') && st.find(s => s.id === '1_Geometry_Flaw').sections.some(s => s.rows.includes('W')));
// profile mode in the UI state
{
  const p = newProject('SI', 'CONSTANT', 'KPSCL'); p.raw.stress_dist = D2; p.raw.stress_input = SC.lists.STRESS_INPUT.find(x => /profile/i.test(x));
  const r = run(buildCase(p)); t('KPSCL2 profile from the UI state solves', r.summary.life > 0, p.raw.stress_input);
  p.profile = p.profile.slice(0, 1);
  let err = ''; try { run(buildCase(p)); } catch (e) { err = e.message; }
  t('profile with one row gives the ATLAS error', /at least two rows/.test(err), err);
}
console.log(fail ? `FAILED ${fail}` : 'ALL PASS'); process.exit(fail ? 1 : 0);
