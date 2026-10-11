/** project.js — the analysis state, its .pfs file format (v4) and SI <-> FPS conversion of typed values. */
import SC from '../atlas/schema.generated.js';
import { defaultRaw, defaultHistory, defaultProfile, fieldsFor, FIELD } from '../atlas/case.js';
import { KINDS, toSI, fromSI, parisCsiToUS, parisCusToSI, jrCsiToUS, jrCusToSI } from '../atlas/units.js';
import { num } from '../atlas/util.js';

export const FORMAT_VERSION = 4;
export const APP_ID = 'PYTHAGORAS FFS';
/** The crack cases of this release. KPSCL1 / KPSCL2 share one geometry (infinite-length surface crack); the loading drop-down chooses. */
export const CASES = {
  KPTC: { id: 'kptc', geometry: 'KPTC', category: 'Through-Wall Crack', sif: 'KPTC', ref: 'RPTC',
    title: 'Plate with a central through-wall crack', annex: 'API 579-1/ASME FFS-1 2021 · Part 9 · Annex 9B.3.1 (KPTC) / Annex 9C.3.1 (RPTC)',
    short: 'Plate · through-wall crack', sizeSym: 'c', sizeName: 'half-length', ratioLabel: 'c/W', limits: '0 < c/W < 1' },
  KPSCL: { id: 'kpscl', geometry: 'KPSCL', category: 'Surface Crack', sif: 'KPSCL1 / KPSCL2', ref: 'RPSCL',
    title: 'Plate with an infinite-length surface crack', annex: 'API 579-1/ASME FFS-1 2021 · Part 9 · Annex 9B.3.2 / 9B.3.3 (KPSCL1 / KPSCL2) / Annex 9C.3.2 / 9C.3.3 (RPSCL)',
    short: 'Plate · surface crack, infinite length', sizeSym: 'a', sizeName: 'depth', ratioLabel: 'a/t', limits: '0 < a/t ≤ 0.8' },
};
export const CASE = CASES.KPTC;                                           // legacy default
export const caseOf = p => CASES[(p && p.geometry) || 'KPTC'] || CASES.KPTC;
/** 'KPSCL1' or 'KPSCL2' according to the Loads drop-down (surface crack only) */
export const surfaceMethod = raw => (/KPSCL2|ARBITRARY/i.test(String(raw.stress_dist || '')) ? 'KPSCL2' : 'KPSCL1');
export const sifName = p => ((p && p.geometry) === 'KPSCL' ? surfaceMethod(p.raw) : 'KPTC');
export const refName = p => ((p && p.geometry) === 'KPSCL' ? 'RPSCL' : 'RPTC');
export const EMPTY_PROJECT_INFO = () => Object.fromEntries(SC.projectFields.map(([k]) => [k, '']));

export function newProject(system = 'SI', loadType = 'CONSTANT', geometry = 'KPTC') {
  return {
    caseId: CASES[geometry].id, geometry, system, loadType, raw: defaultRaw(system, geometry), history: defaultHistory(), profile: defaultProfile(system),
    tests: Array(SC.nTests).fill(null), project: EMPTY_PROJECT_INFO(),
  };
}

export const serialize = p => JSON.stringify({
  app: APP_ID, format: FORMAT_VERSION, caseId: p.caseId, geometry: p.geometry || 'KPTC', system: p.system, loadType: p.loadType,
  raw: p.raw, history: p.history, profile: p.profile, tests: p.tests, project: p.project,
}, null, 2);

const r15 = x => Number(Number(x).toPrecision(15));

/** Parse + validate a .pfs file. Throws Error with a user-readable message. */
export function parse(text) {
  let d;
  try { d = JSON.parse(text); } catch { throw new Error('The file is not a valid PYTHAGORAS FFS analysis (it could not be read as JSON).'); }
  if (!d || d.app !== APP_ID) throw new Error('This file was not created by PYTHAGORAS FFS.');
  const geometry = d.geometry === 'KPSCL' || d.caseId === 'kpscl' ? 'KPSCL' : (d.caseId === 'kptc' ? 'KPTC' : null);
  if (!geometry) throw new Error(`This file uses crack case "${String(d.caseId).toUpperCase()}", which is not available in this version. Available: KPTC, KPSCL1, KPSCL2.`);
  if (typeof d.format === 'number' && d.format > FORMAT_VERSION) throw new Error('This file was saved by a newer version of PYTHAGORAS FFS. Update the software to open it.');
  if (!d.raw || typeof d.raw !== 'object') {
    throw new Error('This file was saved by an earlier, simplified version of PYTHAGORAS FFS (before the full ATLAS Part 9 inputs). Use File → Import ATLAS Workbook, or enter the inputs again.');
  }
  const system = d.system === 'FPS' ? 'FPS' : 'SI';
  const loadType = d.loadType === 'VARIABLE' ? 'VARIABLE' : 'CONSTANT';
  const raw = defaultRaw(system, geometry);
  Object.keys(raw).forEach(k => {
    if (!(k in d.raw)) return;
    const v = d.raw[k];
    if (v === null || typeof v === 'number' || typeof v === 'string') raw[k] = v;
  });
  const history = Array.isArray(d.history)
    ? d.history.filter(r => r && typeof r === 'object').slice(0, SC.nHist).map(r => ({ name: String(r.name ?? ''), lo: Number(r.lo), hi: Number(r.hi), cycles: Number(r.cycles) }))
    : defaultHistory();
  const profile = defaultProfile(system);
  if (Array.isArray(d.profile)) {
    const pr = d.profile.filter(r => r && typeof r === 'object').slice(0, SC.nProf).map(r => ({ x: num(r.x), p: num(r.p), s: num(r.s), r: num(r.r) }));
    if (pr.length || d.profile.length === 0) profile.splice(0, profile.length, ...pr);
  }
  const tests = Array(SC.nTests).fill(null);
  if (Array.isArray(d.tests)) d.tests.slice(0, SC.nTests).forEach((v, i) => { tests[i] = num(v) !== null ? num(v) : null; });
  const project = EMPTY_PROJECT_INFO();
  if (d.project && typeof d.project === 'object') Object.keys(project).forEach(k => { if (typeof d.project[k] === 'string') project[k] = d.project[k].slice(0, 500); });
  return { caseId: CASES[geometry].id, geometry, system, loadType, raw, history, profile, tests, project };
}

/** Convert every typed value to the other unit system (the Excel workbook cannot do this). */
export function convertSystem(p, to) {
  const from = p.system;
  if (from === to) return p;
  const raw = { ...p.raw };
  const conv = (v, kind) => (num(v) === null ? v : r15(fromSI(toSI(num(v), kind, from), kind, to)));
  for (const f of fieldsFor(p.geometry)) {
    const v = raw[f.name];
    if (num(v) === null) continue;
    if (f.kind === 'rate_C') {
      const n = num(raw.n_user);
      if (n !== null) { const si = from === 'FPS' ? parisCusToSI(num(v), n) : num(v); raw[f.name] = r15(to === 'FPS' ? parisCsiToUS(si, n) : si); }
    } else if (f.kind === 'jrC') {
      const n = num(raw.jr_n);
      if (n !== null) { const si = from === 'FPS' ? jrCusToSI(num(v), n) : num(v); raw[f.name] = r15(to === 'FPS' ? jrCsiToUS(si, n) : si); }
    } else if (f.kind === 'raw') {
      const map = from === 'SI' ? { 110: 100, 220: 200 } : { 100: 110, 200: 220 };
      if (num(v) in map) raw[f.name] = map[num(v)];
    } else if (f.kind in KINDS && f.kind !== 'none') raw[f.name] = conv(v, f.kind);
  }
  const profile = (p.profile || []).map(r => ({ x: conv(r.x, 'length'), p: conv(r.p, 'stress'), s: conv(r.s, 'stress'), r: conv(r.r, 'stress') }));
  return { ...p, system: to, raw, profile, tests: p.tests.map(v => conv(v, 'K')) };
}

export const fromImport = st => ({
  caseId: CASES[st.geometry || 'KPTC'].id, geometry: st.geometry || 'KPTC', profile: st.profile && st.profile.length ? st.profile : defaultProfile(st.system),
  system: st.system, loadType: st.loadType, raw: st.raw,
  history: st.history.length ? st.history : defaultHistory(), tests: st.tests, project: { ...EMPTY_PROJECT_INFO(), ...st.project },
});

export { FIELD };
