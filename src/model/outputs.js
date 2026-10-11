/**
 * outputs.js — data for every result sheet of the ATLAS output workbook (Dashboard, Summary, FAD, Crack_Growth, SIF_vs_c,
 * Material_Toughness, Residual_Stress, Calculation_Trace, Part9_Checklist, L3_Sensitivity, L3_Method_D),
 * converted to the displayed unit system. Port of the data logic in atlas_part9/report.py.
 */
import { fromSI, label } from '../atlas/units.js';
import { fadCurve } from '../atlas/fad.js';
import { parisCsiToUS } from '../atlas/units.js';
import { pyG } from '../atlas/util.js';

const geoOf = res => (res && res.geometry) || { size: 'c', size_name: 'half-length', ratio: 'c/W', total: '2c', aux: ['Mb', 'fw'], gid: 'KPTC', type: 'KPTC' };
const REF_OF = g => (g.type === 'KPTC' ? 'RPTC' : 'RPSCL');
export { geoOf };
const AUX_LABEL = { Mb: 'Mb', fw: 'fw', G0: 'G0', G1: 'G1' };
/** Result-table columns of the crack growth history / SIF vs size, labelled for the geometry that was solved */
export function histCols(res) {
  const g = geoOf(res);
  return [['cycles', 'Cycles N', 'none'], ['c', g.size, 'length'], ...(g.total ? [['2c', g.total, 'length']] : []), ['c/W', g.ratio, 'none'],
    ['Kmin', 'Kmin', 'K'], ['Kmax', 'Kmax (envelope)', 'K'], ['dK', 'dK (equiv.)', 'K'], ['R', 'R', 'none'], ['dKth', 'dKth', 'K'],
    ['rate', `d${g.size}/dN`, 'rate'], ['KIP', 'KIP', 'K'], ['KISR', 'KISR', 'K'], ...g.aux.map(k => [k, AUX_LABEL[k] || k, 'none']),
    ['sigma_ref', 'sigma_ref', 'stress'], ['Phi', 'Phi', 'none'], ['Lr', 'Lr', 'none'], ['Kr', 'Kr', 'none'], ['allow', 'Kr allowable', 'none'],
    ['margin', 'FAD margin', 'none'], ['status', 'Status', 'none']];
}
export function sifCols(res) {
  const g = geoOf(res);
  return [['c', g.size, 'length'], ['c/W', g.ratio, 'none'], ['KIP', 'KIP', 'K'], ['KISR', 'KISR', 'K'], ['Kres', 'K residual', 'K'],
    ...g.aux.map(k => [k, AUX_LABEL[k] || k, 'none']), ['sigma_ref', 'sigma_ref', 'stress'], ['Lr', 'Lr', 'none'], ['Kr', 'Kr', 'none'], ['allow', 'Kr allowable', 'none']];
}
export const HIST_COLS = histCols(null), SIF_COLS = sifCols(null);

export const cv = (v, kind, sys) => (v === null || v === undefined || typeof v === 'string' || !kind || kind === 'none' || kind === 'cycles' || kind === 'years' ? v : fromSI(v, kind, sys));
export const unitOf = (kind, sys) => (!kind || kind === 'none' ? '' : kind === 'cycles' || kind === 'years' ? kind : label(kind, sys));

export function thin(rows, n = 1500) {
  if (rows.length <= n) return rows;
  const step = Math.ceil(rows.length / n);
  const out = rows.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== rows[rows.length - 1]) out.push(rows[rows.length - 1]);
  return out;
}

const NOTE_9511G = 'Part 9.5.1.1(g): sub-critical crack growth assessments should be reviewed by an engineer knowledgeable in crack growth (Level 3 context); monitor growth per 9.5.1.2 STEP 6(2)-(4).';
const isOk = s => String(s).startsWith('ACCEPTABLE');

export function dashboard(res, l3, project) {
  const sys = res.case.system, s = res.summary, ini = res.initial, m = res.material, L = res.loads, g = geoOf(res), kp = g.type === 'KPTC';
  const initOk = ini.status === 'PASS', lifeOk = isOk(s.life_status);
  const item = (lbl, v, kind) => ({ label: lbl, value: cv(v, kind, sys), unit: unitOf(kind, sys) });
  const left = [item(`Assessment ${g.size_name} ${g.size}0`, res.geom.c0, 'length'), item('Primary SIF KIP', ini.KIP, 'K'), item('Secondary/residual SIF KISR', ini.KISR, 'K'),
    item(`Reference stress (${REF_OF(g)})`, ini.sigma_ref, 'stress'), item('Plasticity factor Phi', ini.Phi), item('Lr', ini.Lr), item('Kr', ini.Kr),
    item('Kr allowable (Eq. 9.22)', ini.allow), item('Lr(max) cut-off', ini.Lr_max), item('FAD margin (allow - Kr)', ini.margin), item('Kmat', s.Kmat, 'K')];
  const right = [item(`${s.beyond_limit && !kp ? 'Validity limit' : 'Limiting'} ${g.size_name} ${g.size} (9.4.3.5)`, s.critical_c_mm, 'length'),
    ...(kp ? [item('Limiting total length 2c (CLL, 9.5.2)', s.critical_2c_mm, 'length')] : []),
    item(`${s.beyond_limit && !kp ? 'Validity limit' : 'Limiting'} ${g.ratio}`, s.critical_ratio), { label: 'Life to limiting size', value: s.life, unit: 'cycles' },
    { label: 'Required life', value: s.required_life, unit: 'cycles' }, { label: 'Life margin factor', value: s.life_margin_factor, unit: '' },
    { label: 'Life / required life', value: s.required_life ? s.life / s.required_life : null, unit: '' },
    { label: 'Allowable service life (life / factor)', value: s.allowable_service_life, unit: 'cycles' },
    { label: 'Recommended inspection interval', value: s.inspection_interval, unit: 'cycles' },
    { label: 'Life (years)', value: s.life_years, unit: 'years' }, { label: 'Stop reason', value: s.stop_reason, unit: '' },
    item('Final Lr', s.final_Lr), item('Final Kr', s.final_Kr)];
  if (res.case.load_type === 'VARIABLE') right.push({ label: 'Load blocks to limiting size', value: s.blocks_to_failure, unit: '' });
  const snapshot = [['Material', m.id, ''], ['Material class', m.material_class, ''], ['Sy used', cv(m.Sy, 'stress', sys), unitOf('stress', sys)], ['Su used', cv(m.Su, 'stress', sys), unitOf('stress', sys)],
    ['Toughness route', res.toughness.method_id, ''], ['Growth model', res.growth.model_id, ''], ['Growth equation', res.growth.equation, ''],
    ['Crack case', g.name, ''], ['Thickness t', cv(res.geom.t, 'length', sys), unitOf('length', sys)], ...(kp ? [['Half-width W', cv(res.geom.W, 'length', sys), unitOf('length', sys)]] : []),
    ...['Pm', 'Pb', 'pc', 'Sm', 'Sb', 'Rm', 'Rb'].map(k => [k, cv(L[k], 'stress', sys), unitOf('stress', sys)]),
    ['Residual method', res.residual.method, ''], ['Load scales (min / max)', `${Number(res.scales[0].toPrecision(6))} / ${Number(res.scales[1].toPrecision(6))}`, '']];
  const l3Lines = [];
  if (l3 && !l3.error) {
    const S = l3.sensitivity, M = l3.method_d;
    if (S.n_cases) {
      l3Lines.push({ label: 'Method A sensitivity (9.4.4.2)', text: S.verdict, ok: S.n_unacceptable === 0 });
      for (const [lbl, x] of [['Combined adverse case', S.combined], ['Partial safety factor case', S.psf]]) {
        if (x && x.metrics) l3Lines.push({ label: lbl, text: `${x.metrics.initial_status} | life ${Math.round(x.metrics.life).toLocaleString('en-US')} cycles | ${x.metrics.life_status}`,
          ok: x.metrics.initial_status === 'PASS' && isOk(x.metrics.life_status) });
      }
    }
    if (M) {
      l3Lines.push({ label: 'Method D ductile tearing', text: M.outcome, ok: !M.outcome.startsWith('DUCTILE INSTAB') });
      l3Lines.push({ label: 'Load factor at tearing instability', text: `${M.F_instability.toFixed(3)}${M.F_capped ? ' (search limit)' : ''}  vs  ${M.F_level2_single_Kmat.toFixed(3)} with Level 2 Kmat`, ok: M.F_instability >= 1.0 });
    }
  }
  const p = project || {};
  return { banner: `ATLAS API 579 PART 9 - ${g.gid}/${REF_OF(g)} ${res.case.load_type} LOAD RESULTS (${sys})`,
    info: [p.project, p.component, p.location, `Analyst: ${p.analyst || '-'}`, `Rev ${p.revision || '-'}`].filter(Boolean).join('  |  '),
    tiles: [{ title: 'INITIAL FLAW - LEVEL 2 FAD', value: ini.status, ok: initOk }, { title: 'REMAINING LIFE (9.5.1.2)', value: s.life_status, ok: lifeOk }],
    left, right, snapshot, warnings: [...res.warnings, NOTE_9511G], l3Lines };
}

/** "In plain words" — the result explained in a few sentences for a reader who has not seen the tables */
export function plainSummary(res, l3) {
  const sys = res.case.system, s = res.summary, ini = res.initial, g = res.geom, gi = geoOf(res), kp = gi.type === 'KPTC';
  const crackTxt = v => (kp ? `half-length c = ${len(v)}, total length 2c = ${len(2 * v)}` : `depth a = ${len(v)}`);
  const len = v => `${Number(cv(v, 'length', sys).toPrecision(5))} ${unitOf('length', sys)}`;
  const cyc = v => `${Math.round(v).toLocaleString('en-US')} cycles`;
  const initOk = ini.status === 'PASS', lifeOk = isOk(s.life_status), lines = [];
  lines.push({ ok: initOk, text: initOk
    ? `Today the crack (${crackTxt(g.c0)}) is acceptable on the Level 2 failure assessment diagram: the assessment point has Kr = ${Number(ini.Kr.toPrecision(4))} against an allowable ${Number(ini.allow.toPrecision(4))} (margin ${Number(ini.margin.toPrecision(4))}).`
    : `Today the crack (${crackTxt(g.c0)}) is NOT acceptable on the Level 2 failure assessment diagram: Kr = ${Number(ini.Kr.toPrecision(4))} exceeds the allowable ${Number(ini.allow.toPrecision(4))}. Check the flaw size, the loads, the toughness and the units.` });
  if (s.life != null && Number.isFinite(s.life)) {
    lines.push({ ok: lifeOk, text: `Fatigue growth would extend the crack to the ${s.beyond_limit && !kp ? 'validity limit' : 'limiting'} ${gi.size_name} ${gi.size} = ${len(s.critical_c_mm)}${kp ? ` (total ${len(s.critical_2c_mm)})` : ''} after about ${cyc(s.life)}. The limit is set by: ${s.stop_reason}.` });
    if (s.required_life) {
      const need = s.required_life * (s.life_margin_factor || 1);
      lines.push({ ok: lifeOk, text: `The criterion needs at least ${cyc(need)} (required life ${Math.round(s.required_life).toLocaleString('en-US')} × life margin ${s.life_margin_factor}). The calculated life is ${lifeOk ? 'above' : 'below'} it, so the remaining-life check is ${lifeOk ? 'met' : 'NOT met'}.` });
    }
    if (s.allowable_service_life != null && s.inspection_interval != null) {
      lines.push({ ok: true, text: `Allowable service life ${cyc(s.allowable_service_life)}; recommended inspection interval ${cyc(s.inspection_interval)}. Both depend on the project's life margin and inspection fraction, which are engineering choices.` });
    }
  }
  if (res.case.load_type === 'VARIABLE') lines.push({ ok: true, text: 'Variable-load method used: Equivalent Spectrum / cycle-weighted growth (the cycle-weighted equivalent growth rate of the whole spectrum is applied; the crack is not advanced block by block).' });
  if (l3 && !l3.error && l3.sensitivity && l3.sensitivity.n_cases) {
    const S = l3.sensitivity;
    lines.push({ ok: S.n_unacceptable === 0, text: S.n_unacceptable === 0 ? `Level 3 sensitivity: all ${S.n_cases} varied cases are acceptable.` : `Level 3 sensitivity: ${S.n_unacceptable} of ${S.n_cases} varied cases are NOT acceptable. This is a warning about input uncertainty — review it before relying on the base-case result.` });
  }
  const l3Warn = !!(l3 && !l3.error && l3.sensitivity && l3.sensitivity.n_cases && l3.sensitivity.n_unacceptable > 0);
  return { ok: initOk && lifeOk, headline: initOk && lifeOk ? (l3Warn ? 'ACCEPTABLE — WITH A LEVEL 3 WARNING' : 'ACCEPTABLE') : !initOk ? 'NOT ACCEPTABLE NOW' : 'LIFE CRITERION NOT MET', lines };
}

export function summaryRows(res) {
  const sys = res.case.system, s = res.summary, ini = res.initial, g = res.geom, M = res.material;
  const r = (q, v, kind, comment = '') => ({ q, value: cv(v, kind, sys), unit: unitOf(kind, sys), comment });
  const gi = geoOf(res), kp = gi.type === 'KPTC';
  return [r('Plate thickness t', g.t, 'length'), ...(kp ? [r('Plate half-width W', g.W, 'length')] : []), r(`Current crack ${gi.size_name} ${gi.size}0`, g.c0, 'length', s.flaw_basis),
    ...(kp ? [r('Current total length 2c0', 2 * g.c0, 'length')] : [r('Current a0/t', g.c0 / g.t)]), r('Yield strength Sy', M.Sy, 'stress', M.strength_source), r('Tensile strength Su', M.Su, 'stress'),
    r('Kmat', s.Kmat, 'K', res.toughness.method_id || ''), r('Initial KIP', ini.KIP, 'K', kp ? 'Eq. 9B.8' : gi.gid), r('Initial KISR', ini.KISR, 'K', kp ? 'Eq. 9B.8' : gi.gid),
    r('Initial reference stress', ini.sigma_ref, 'stress', kp ? 'Eq. 9C.27' : 'Eq. 9C.31'), r('Initial Lr', ini.Lr), r('Initial Kr', ini.Kr), r('Initial FAD status', ini.status),
    r(`Limiting crack ${gi.size_name} ${gi.size}`, s.critical_c_mm, 'length', s.beyond_limit && !kp ? gi.limit : '9.4.3.5'),
    ...(kp ? [r('Limiting total crack length 2c', s.critical_2c_mm, 'length', 'Critical through-wall length')] : [r(`Limiting ${gi.ratio}`, s.critical_ratio)]),
    r(`Crack extension (${gi.size})`, s.crack_extension_mm, 'length'), r('Calculated remaining life', s.life, 'cycles', s.stop_reason),
    r('Required life x margin factor', s.required_life * s.life_margin_factor, 'cycles', '9.5.1.2 STEP 6(1)'),
    r('Allowable service life', s.allowable_service_life, 'cycles', `life / ${Number(s.life_margin_factor.toPrecision(6))}`),
    r('Recommended inspection interval', s.inspection_interval, 'cycles', `${Number(s.inspection_fraction.toPrecision(6))} x allowable life (project basis)`),
    r('Remaining life (years)', s.life_years, 'years', 'if cycles/year entered'), r('Inspection interval (years)', s.inspection_interval_years, 'years'),
    r('Remaining-life status', s.life_status)];
}

export function checklistRows(res, l3) {
  const s = res.summary, ini = res.initial, m = res.material, T = res.toughness, gi = geoOf(res), kp = gi.type === 'KPTC';
  const S = l3 && !l3.error ? l3.sensitivity : null, M = l3 && !l3.error ? l3.method_d : null;
  const l3chk = !S || !S.n_cases ? ['9.4.4.2', 'Level 3 uncertainty evaluation (sensitivity / PSF)', 'NOT SELECTED', 'Select on 9_Level3']
    : ['9.4.4.2', 'Level 3 Method A uncertainty evaluation (sensitivity / PSF)', S.n_unacceptable === 0 ? 'APPLIED' : 'REVIEW', S.verdict];
  return [
    ['9.3.6.2', 'Flaw length characterization', 'APPLIED', `${res.flaw.option} - Eq. ${res.flaw.equation}`],
    ['9.4.3.2 STEP 1-2', 'Loads and stress categorization (primary / secondary / residual)', 'APPLIED', 'Pm, Pb, pc primary; Sm, Sb secondary; Rm, Rb residual'],
    ['9.4.3.2 STEP 3', 'Yield and tensile strength at assessment condition', 'APPLIED', m.strength_source],
    ['9.4.3.2 STEP 4', 'Fracture toughness Kmat', 'APPLIED', `${T.method_id} (${T.clause || ''})`],
    ['9.4.3.2 STEP 4(1)', 'In-service degradation considered (9F.4.6 / 9F.4.7)', 'ENGINEER TO CONFIRM', 'H2 shift / arrest / Cr-Mo aging routes available; strain-age, 885, sigma embrittlement need test data'],
    ['9.4.3.2 STEP 6-7', 'Reference stress and Lr', 'APPLIED', (kp ? 'RPTC Eq. 9C.27' : 'RPSCL Eq. 9C.31') + '; Lr = sigma_ref/Sy (Eq. 9.11)'],
    ['9.4.3.2 STEP 8-9', 'KIP and KISR (negative values set to zero)', 'APPLIED', kp ? 'KPTC Eq. 9B.8' : (gi.gid === 'KPSCL1' ? 'KPSCL1 Eq. 9B.12' : 'KPSCL2 weight function Eqs. 9B.261/9B.262')],
    ['9.4.3.2 STEP 10', 'Plasticity interaction factor Phi', 'APPLIED', 'Eqs. 9.12-9.17, Table 9.3; Phi = Phi0 when KIP = 0'],
    ['9.4.3.2 STEP 11-12', 'Kr and FAD evaluation with cut-off', 'APPLIED', `Eq. 9.18, Eq. 9.22, Lr(max) = ${ini.Lr_max.toFixed(4)} (${m.lrmax_category})`],
    ['9.4.3.3 / 9.4.3.4', 'Annex 9H constraint / Annex 9I KI modification', 'NOT APPLICABLE', kp ? 'Surface-flaw procedures; KPTC is through-wall' : 'Optional constraint adjustment / KI modification not applied to the surface crack'],
    ['9.4.3.5', 'Limiting flaw size', 'APPLIED', `Bisection on ${gi.size} at maximum load`],
    ['9.5.1.2 STEP 3-5', 'Crack growth integration with FAD check at each step', 'APPLIED', `${res.growth.equation} - ${res.growth.source}`],
    ['9.5.1.2 STEP 6(1)', 'Life >= required period x margin', s.life_status, `${pyG(s.life, 4)} cycles vs ${pyG(s.life_margin_factor)} x ${pyG(s.required_life, 4)}`],
    ['9.5.1.2 STEP 6(2)-(4)', 'Monitoring, observed growth rate, avoidable upsets', 'ENGINEER TO CONFIRM', 'Outside the calculation'],
    ['9.5.2', 'Leak-before-break / critical leak length', kp ? 'INFORMATION' : 'NOT APPLICABLE', kp ? 'Limiting through-wall length 2c reported on Dashboard' : 'Infinite-length surface crack'],
    ['Annex 9D', 'Residual stress', 'APPLIED', res.residual.note || res.residual.method],
    ['Annex 9E', 'Crack opening area', 'NOT APPLIED', kp ? 'Closed-form COA solutions are for cylinders/spheres' : 'Infinite-length crack (no leak-before-break)'],
    l3chk,
    ['9.4.4.1(d)', 'Level 3 Method D - ductile tearing', M ? 'APPLIED' : 'NOT SELECTED', M ? M.outcome : 'Select on 9_Level3'],
    ['9.8', 'Documentation', 'APPLIED', 'This report (screen, Excel and PDF export) and the plot images'],
  ].map(([paragraph, requirement, status, impl]) => ({ paragraph, requirement, status, impl }));
}

export function traceRows(res) {
  const sys = res.case.system;
  return res.trace.map(([ref, q, v, kind, basis]) => ({ ref, q, value: cv(v, kind, sys), unit: kind === 'none' ? '-' : label(kind, sys), basis }));
}

const TK = { Kmat: 'K', raw_K: 'K', cap_K: 'K', K_B: 'K', K_25mm: 'K', upper_shelf_K: 'K', K_aged: 'K', K_non_aged: 'K', T_C: 'temp', Tref_C: 'temp', T0_used_C: 'temp',
  T0_unshifted_C: 'temp', T0D_C: 'temp', T0A_C: 'temp', T0_aged_C: 'temp', FATT_C: 'temp', dTs_C: 'dtemp', H2_shift_C: 'dtemp', L_mm: 'length', Jc_kJ_m2: 'J',
  average: 'K', minimum: 'K', maximum: 'K' };
const niceName = k => { for (const suf of ['_kJ_m2', '_mm', '_C']) if (k.endsWith(suf) && TK[k]) return k.slice(0, -suf.length); return k; };

export function materialToughness(res) {
  const sys = res.case.system, s = res.summary;
  const other = sys === 'SI' ? ['_ksi', '_ksi_sqrt_in', '_in_cycle'] : ['_MPa', '_MPa_sqrt_m', '_mm_cycle'];
  const rec = Object.entries(res.material_record).filter(([k, v]) => v !== '' && v !== null && !other.some(o => k.endsWith(o))).map(([k, v]) => ({ k, v, u: '' }));
  const tough = [{ k: 'Kmat used', v: cv(s.Kmat, 'K', sys), u: unitOf('K', sys) }, ...Object.entries(res.toughness).filter(([, v]) => typeof v !== 'object' || v === null)
    .map(([k, v]) => ({ k: niceName(k), v: cv(v, TK[k], sys), u: unitOf(TK[k], sys) }))];
  const g = { ...res.growth }; const ps = g.parameter_sets; delete g.parameter_sets;
  const growth = Object.entries(g).map(([k, v]) => ({ k, v, u: '' }));
  const sets = Object.entries(ps).map(([key, p]) => ({ key, rows: Object.entries(p).filter(([k]) => k !== 'thr_scale').map(([k, v]) => {
    if (v === null || v === undefined || typeof v === 'string') return { k, v, u: '' };
    if (k === 'C1' || k === 'C2') { const n = p[k === 'C1' ? 'n1' : 'n2']; return { k: `${k} (da/dN ${label('rate', sys)}, dK ${label('K', sys)})`, v: sys === 'FPS' ? parisCsiToUS(v, n) : v, u: '' }; }
    if (k === 'dKtran' || k === 'dKth') return { k, v: cv(v, 'K', sys), u: unitOf('K', sys) };
    return { k, v, u: '' };
  }) }));
  return { rec, tough, growth, sets };
}

export function residualInfo(res) {
  const sys = res.case.system, L = res.loads;
  const kinds = { sigma_ys_r: 'stress', Rm: 'stress', Rb: 'stress', linearized_Rm_info: 'stress', linearized_Rb_info: 'stress' };
  const rm = { ...res.residual }; const prof = rm.profile; delete rm.profile;
  const rows = [{ k: 'Rm applied', v: cv(L.Rm, 'stress', sys), u: unitOf('stress', sys) }, { k: 'Rb applied', v: cv(L.Rb, 'stress', sys), u: unitOf('stress', sys) },
    ...Object.entries(rm).map(([k, v]) => ({ k, v: cv(v, kinds[k], sys), u: unitOf(kinds[k], sys) }))];
  return { rows, profile: prof ? prof.x_mm.map((x, i) => ({ x: cv(x, 'length', sys), s: cv(prof.sigma_MPa[i], 'stress', sys) })) : null, profileEq: prof ? prof.equation : null };
}

export function sensitivityRows(l3, sys, res) {
  const fac = geoOf(res).total ? 2 : 1;
  if (!l3 || l3.error || !l3.sensitivity.n_cases) return null;
  const S = l3.sensitivity, b = S.base;
  const rows = [{ tag: 'BASE CASE', change: '-', factor: 1.0, m: b, err: null, kind: 'base' }];
  for (const row of S.rows) for (const side of ['lo', 'hi']) {
    const d = row[side]; if (!d) continue;
    rows.push({ tag: row.label + (row.adverse === side ? ' (adverse)' : ''), change: `${d.pct >= 0 ? '+' : ''}${Number(d.pct.toPrecision(6))} %`, factor: d.factor, m: d.metrics, err: d.error, kind: 'row' });
  }
  if (S.combined) rows.push({ tag: 'COMBINED ADVERSE CASE', change: 'all adverse', factor: null, m: S.combined.metrics, err: S.combined.error, kind: 'special' });
  if (S.psf) { const p = S.psf; rows.push({ tag: `PSF CASE (stress x${p.psf_stress}, Kmat / ${p.psf_kmat}, flaw x${p.psf_flaw})`, change: 'PSF', factor: null, m: p.metrics, err: p.error, kind: 'special' }); }
  return rows.map(r => ({ ...r, lifeChange: r.m && b.life ? r.m.life / b.life - 1 : null, twoC: r.m ? cv(fac * r.m.critical_c, 'length', sys) : null }));
}

export function fadXY(lmax) {
  const xs = Array.from({ length: 201 }, (_, i) => i * lmax / 200);
  return { xs, curve: xs.map(fadCurve), full: [...xs.map((x, i) => ({ x, y: fadCurve(x) })), { x: lmax, y: fadCurve(lmax) }, { x: lmax, y: 0 }] };
}
