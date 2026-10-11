/** Build the solver `case` from the values typed in the UI — port of inputs.read_case (without the workbook). */
import SC from './schema.generated.js';
import { num } from './util.js';
import { toSI, fromSI, label, parisCusToSI, jrCusToSI } from './units.js';

export const GEOMETRIES = SC.geometries;                       // ['KPTC', 'KPSCL']
export const fieldsFor = geo => SC.fields.filter(f => f.geo === 'ALL' || f.geo === (geo || 'KPTC'));
const FMAP = {};
export const fieldMap = geo => (FMAP[geo || 'KPTC'] = FMAP[geo || 'KPTC'] || Object.fromEntries(fieldsFor(geo).map(f => [f.name, f])));
export const fieldOf = (name, geo) => fieldMap(geo)[name];
export const FIELD = fieldMap('KPTC');                         // legacy (KPTC) view

/** Default displayed value of a field in the given unit system (workbook defaults: SI value, FPS value or converted). */
export function defaultValue(f, system) {
  if (system === 'SI') return f.si;
  if (f.fps !== null && f.fps !== undefined) return f.fps;
  if (f.si === null || f.si === undefined || typeof f.si === 'string') return f.si;
  if (['none', 'raw', 'rate_C', 'jrC'].includes(f.kind)) return f.si;
  const v = fromSI(f.si, f.kind, 'FPS');
  return Number(v.toPrecision(15));
}

export function defaultRaw(system, geo = 'KPTC') {
  const raw = {};
  fieldsFor(geo).forEach(f => { raw[f.name] = defaultValue(f, system); });
  return raw;
}

export const defaultProfile = system => SC.defaultProfile.map(r => {
  const o = { x: r[0], p: r[1], s: r[2], r: r[3] };
  if (system === 'FPS') ['x'].forEach(k => { o[k] = Number(fromSI(o[k], 'length', 'FPS').toPrecision(12)); });
  if (system === 'FPS') ['p', 's', 'r'].forEach(k => { o[k] = Number(fromSI(o[k], 'stress', 'FPS').toPrecision(12)); });
  return o;
});
export const defaultHistory = () => SC.defaultHistory.map(([name, lo, hi, cyc]) => ({ name, lo, hi, cycles: cyc }));

const NO_CONVERT = ['none', 'raw', 'rate_C', 'jrC'];
const MODULI = ['E', 'mc_test_E', 'E_ambient', 'E_temp'];
const RANGES = { length: [[0.5, 20000.0], [0.02, 800.0]], stress: [[-2000.0, 2000.0], [-300.0, 300.0]] };

export function plausibility(raw, system, geo = 'KPTC') {
  const w = [];
  const k = system === 'SI' ? 0 : 1;
  for (const f of fieldsFor(geo)) {
    const v = num(raw[f.name]);
    if (v === null || !(f.kind in RANGES) || v === 0) continue;
    const [lo, hi] = RANGES[f.kind][k];
    if (f.name === 'weld_y' || f.name === 'max_dc' || MODULI.includes(f.name)) continue;
    if (!(lo <= Math.abs(v) && Math.abs(v) <= hi) && (f.kind !== 'stress' || Math.abs(v) > hi)) {
      w.push(`${f.label} = ${Number(v.toPrecision(6))} ${label(f.kind, system)} looks unusual for ${system} units - check the Unit System selection.`);
    }
  }
  for (const name of MODULI) {
    const E = num(raw[name]);
    const lbl = fieldOf(name, geo).label;
    if (E && system === 'SI' && E < 60000) w.push(`${lbl} = ${Number(E.toPrecision(6))} MPa looks like a ksi value - the Unit System is SI.`);
    if (E && system === 'FPS' && E > 60000) w.push(`${lbl} = ${Number(E.toPrecision(6))} ksi looks like an MPa value - the Unit System is FPS.`);
  }
  const t = num(raw.T_assess);
  if (t !== null && system === 'SI' && t > 700) w.push(`Assessment temperature ${Number(t.toPrecision(6))} °C looks like a °F value.`);
  return w;
}

/**
 * state = { system, loadType, raw, history:[{name,lo,hi,cycles}], tests:[number|null], project:{} }
 * → solver case { system, load_type, raw, si, history, project, unit_warnings }
 */
export function buildCase(state) {
  const system = state.system, loadType = state.loadType, geometry = state.geometry || 'KPTC';
  const raw = {}, si = {};
  for (const f of fieldsFor(geometry)) {
    let v = state.raw[f.name];
    if (v === undefined || v === '') v = null;
    if (typeof v === 'string' && v.trim() === '') v = null;
    raw[f.name] = v;
    si[f.name] = NO_CONVERT.includes(f.kind) ? v : (num(v) !== null ? toSI(num(v), f.kind, system) : null);
  }
  si.C_user = system === 'FPS' && num(raw.C_user) !== null && num(raw.n_user) !== null
    ? parisCusToSI(num(raw.C_user), num(raw.n_user)) : num(raw.C_user);
  si.jr_C = system === 'FPS' && num(raw.jr_C) !== null && num(raw.jr_n) !== null
    ? jrCusToSI(num(raw.jr_C), num(raw.jr_n)) : num(raw.jr_C);
  si.xi_cap_native = num(raw.xi_cap);
  si.us_fixed_native = num(raw.us_fixed);
  si.tests = (state.tests || []).filter(v => num(v) !== null).map(v => toSI(num(v), 'K', system)).slice(0, SC.nTests);
  const hist = [];
  if (loadType === 'VARIABLE') {
    for (const r of (state.history || []).slice(0, SC.nHist)) {
      if (r && r.name !== '' && r.name !== null && r.name !== undefined && num(r.cycles) !== null) {
        hist.push([String(r.name), Number(r.lo), Number(r.hi), Number(r.cycles)]);
      }
    }
    if (!hist.length) throw new Error('Variable load case has no load blocks (sheet 7_Load_History)');
  }
  const profile = [];
  if (geometry === 'KPSCL') {
    for (const r of (state.profile || []).slice(0, SC.nProf)) {
      if (!r || num(r.x) === null) continue;
      const cv = v => (num(v) !== null ? toSI(num(v), 'stress', system) : null);
      profile.push([toSI(num(r.x), 'length', system), cv(r.p), cv(r.s), cv(r.r)]);
    }
    profile.sort((a, b) => a[0] - b[0]);
  }
  return { system, load_type: loadType, geometry, raw, si, history: hist, profile, project: state.project || {}, unit_warnings: plausibility(raw, system, geometry) };
}
