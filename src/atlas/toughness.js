/** Annex 9F fracture toughness routes — port of toughness.py. All inputs/outputs SI (°C, MPa, MPa√m, mm, kJ/m², J). */
import D from './data.generated.js';
import { num, up, fmtG } from './util.js';
import { KSI_TO_MPA, KSIRIN_TO_MPARM, INLB_IN2_TO_KJ_M2 } from './units.js';

function f_(tg, key, positive = false, lo = null, hi = null) {
  const v = num(tg[key]);
  if (v === null) throw new Error(`Toughness route requires numeric input: ${key}`);
  if (positive && v <= 0) throw new Error(`${key} must be positive`);
  if (lo !== null && !(lo < v && v < hi)) throw new Error(`${key} must satisfy ${lo} < value < ${hi}`);
  return v;
}

export const kjcFromJ = (J, E, nu) => Math.sqrt(J * E / (1.0 - nu ** 2)) / Math.sqrt(1000.0);
export const masterCurveK = (T, T0, Pf, L) => 20.0 + (11.0 + 77.0 * Math.exp(0.0190 * (T - T0))) * Math.pow(Math.log(1.0 / (1.0 - Pf)) * 25.0 / L, 0.25);

export function equivalentMinOfThree(values) {
  const v = values.filter(x => num(x) !== null).map(Number).sort((a, b) => a - b);
  const n = v.length;
  if (n < 3) throw new Error('PROJECT_TEST_SET requires at least 3 fracture-toughness test results (Table 9F.1)');
  if (n > 30) throw new Error('Table 9F.1 covers up to 30 tests; fit the data to the Master Curve instead (9F.3.3.2(c))');
  const rank = Math.trunc((n - 1) / 5) + 1;
  const avg = v.reduce((a, b) => a + b, 0) / n;
  if (n === 3 && (v[0] < 0.7 * avg || v[n - 1] > 1.4 * avg)) {
    throw new Error('Table 9F.1 Note 2: scatter is excessive for three K results (min < 70% or max > 140% of the average). Additional test data are necessary.');
  }
  return [v[rank - 1], { n_tests: n, rank_used: rank, average: avg, minimum: v[0], maximum: v[n - 1], table: 'Table 9F.1', warning: null }];
}

export function trefEq9F29(smysMPa, curve, materialClass, system = 'SI', smysKsi = null) {
  curve = up(curve);
  const cls = up(materialClass);
  if (!(curve.length === 1 && 'ABCD'.includes(curve))) throw new Error('EQ_9F29 requires ASME exemption curve A, B, C or D (Part 3 Table 3.2)');
  if (cls !== 'CARBON_STEEL' && cls !== 'LOW_ALLOY_STEEL') throw new Error('EQ_9F29 requires material class CARBON_STEEL or LOW_ALLOY_STEEL');
  if (system === 'FPS') {
    const s = smysKsi !== null && smysKsi !== undefined ? smysKsi : smysMPa / KSI_TO_MPA;
    const cvus = (2 * Math.sqrt(3) * s - 27) ** 2 / (5 * s) + s / 20.0;
    const cvls = (27.0 / 15.0) ** 2;
    const Dd = { A: 114.0, B: 76.0, C: 38.0, D: 12.0 }[curve];
    const C = 66.0;
    const cv = cls === 'CARBON_STEEL' ? 15.0 : 20.0;
    if (!(cvls < cv && cv < cvus)) throw new Error('Eq. 9F.29 undefined: required CV-LS < CV < CV-US');
    const tF = Dd + C / 2 * Math.log((cv - cvls) / (cvus - cv));
    return [(tF - 32) / 1.8, { Tref_mode: 'EQ_9F29', Tref_native: tF, native_unit: 'F', CV_US_ftlb: cvus, CV_LS_ftlb: cvls, D_F: Dd, C_F: C, CV_ftlb: cv, equations: '9F.23, 9F.25-9F.29 (US Customary)' }];
  }
  const s = smysMPa;
  const cvus = (0.290 * Math.sqrt(3) * s - 27) ** 2 / (0.535 * s) + s / 101.7;
  const cvls = (29.7 / 14.155) ** 2;
  const Dd = { A: 45.6, B: 24.4, C: 3.3, D: -11.1 }[curve];
  const C = 36.7;
  const cv = cls === 'CARBON_STEEL' ? 20.0 : 27.0;
  if (!(cvls < cv && cv < cvus)) throw new Error('Eq. 9F.29 undefined: required CV-LS < CV < CV-US');
  const t = Dd + C / 2 * Math.log((cv - cvls) / (cvus - cv));
  return [t, { Tref_mode: 'EQ_9F29', Tref_native: t, native_unit: 'C', CV_US_J: cvus, CV_LS_J: cvls, D_C: Dd, C_C: C, CV_J: cv, equations: '9F.22, 9F.24, 9F.26-9F.29 (SI)' }];
}

export function trefTable92(smysNative, curve, materialClass, system = 'SI', conservativeRow = false) {
  curve = up(curve);
  const cls = up(materialClass);
  if (cls !== 'CARBON_STEEL' && cls !== 'LOW_ALLOY_STEEL') throw new Error('Table 9.2 requires material class CARBON_STEEL or LOW_ALLOY_STEEL');
  if (!['A', 'B', 'C', 'D'].includes(curve)) throw new Error('Table 9.2 requires ASME exemption curve A, B, C or D');
  const rows = D.table92.filter(r => r.unit_system === system && r.material_class === cls).sort((a, b) => Number(a.SMYS) - Number(b.SMYS));
  const smys = Number(smysNative);
  const match = rows.filter(r => Math.abs(Number(r.SMYS) - smys) < 1e-9);
  let row, policy;
  if (match.length) { row = match[0]; policy = 'exact tabulated row'; }
  else if (conservativeRow) {
    const below = rows.filter(r => Number(r.SMYS) <= smys);
    if (!below.length) throw new Error(`SMYS ${fmtG(smys)} is below the first Table 9.2 row (${rows[0].SMYS}); no conservative row exists`);
    row = below[below.length - 1];
    policy = `conservative row at SMYS ${row.SMYS} <= actual ${fmtG(smys)} (higher Tref, no interpolation)`;
  } else {
    throw new Error(`SMYS ${fmtG(smys)} is not a tabulated Table 9.2 row for ${cls}. Rows: ${rows.map(r => r.SMYS).join(', ')}. Use TABLE_9_2_CONSERVATIVE or EQ_9F29.`);
  }
  const tNative = Number(row['Curve_' + curve]);
  const t = system === 'SI' ? tNative : (tNative - 32) / 1.8;
  return [t, { Tref_mode: conservativeRow ? 'TABLE_9_2_CONSERVATIVE' : 'TABLE_9_2', table: system === 'SI' ? 'Table 9.2M' : 'Table 9.2',
    row_SMYS: row.SMYS, Tref_native: tNative, policy, transition_basis: row.transition_basis }];
}

export function referenceTemperature(tg, mat, system) {
  const mode = up(tg.tref_mode, 'DIRECT');
  if (mode === 'DIRECT') return [f_(tg, 'tref'), { Tref_mode: 'DIRECT', source: 'approved RTNDT / Tref input (9F.4.2.2 STEP 1)' }];
  const curve = tg.exemption_curve || mat.exemption_curve;
  const cls = tg.material_class || mat.material_class;
  if (mode === 'EQ_9F29') return trefEq9F29(mat.SMYS_MPa, curve, cls, system, mat.SMYS_native);
  if (mode === 'TABLE_9_2' || mode === 'TABLE_9_2_CONSERVATIVE') return trefTable92(mat.SMYS_native, curve, cls, system, mode === 'TABLE_9_2_CONSERVATIVE');
  throw new Error('Tref mode must be DIRECT, EQ_9F29, TABLE_9_2 or TABLE_9_2_CONSERVATIVE');
}

function upperShelfCap(tg, key, system) {
  const raw = num(tg[key + '_native']);
  if (raw === null) throw new Error(`${key} required`);
  const allowed = system === 'SI' ? [110.0, 220.0] : [100.0, 200.0];
  if (!allowed.includes(raw)) throw new Error(`Upper-shelf truncation must be one of (${allowed.map(a => a.toFixed(1)).join(', ')}) in ${system} units (9F.4.2.1(e))`);
  return system === 'SI' ? raw : raw * KSIRIN_TO_MPARM;
}

export function asmeXiLower(tg, mat, system) {
  const T = f_(tg, 'T_assess');
  const [Tref, meta] = referenceTemperature(tg, mat, system);
  const curve = up(tg.xi_curve, 'KIC');
  let raw, eq;
  if (curve === 'KIC') { raw = 36.5 + 3.084 * Math.exp(0.036 * (T - Tref + 56.0)); eq = '9F.44'; }
  else if (curve === 'KIR') { raw = 29.5 + 1.344 * Math.exp(0.0260 * (T - Tref + 89.0)); eq = '9F.46'; }
  else throw new Error('Section XI curve must be KIC or KIR');
  const cap = upperShelfCap(tg, 'xi_cap', system);
  const k = Math.min(raw, cap);
  Object.assign(meta, { method_id: '9F42_ASME_XI_LOWER', clause: '9F.4.2', equation: eq, T_C: T, Tref_C: Tref, raw_K: raw, cap_K: cap, truncated: raw > cap });
  return [k, meta];
}

export function masterCurveT0(tg) {
  const mode = up(tg.t0_mode, 'DIRECT');
  let T0, meta;
  if (mode === 'DIRECT') { T0 = f_(tg, 't0'); meta = { T0_mode: 'DIRECT', source: 'approved T0 (ASTM E1921 / project)' }; }
  else if (mode === 'OPTION_A_EXEMPTION') {
    const curve = up(tg.exemption_curve);
    if (!['A', 'B', 'C', 'D'].includes(curve)) throw new Error('OPTION_A_EXEMPTION requires exemption curve A-D');
    const sy = f_(tg, 'syA', true);
    const sulfur = up(tg.sulfur, 'LOW');
    let eq;
    if (sulfur === 'LOW') { const base = { A: -18.9, B: -40.1, C: -61.2, D: -75.6 }[curve]; T0 = base + 0.0958 * sy; eq = '9F.54/9F.56'; }
    else if (sulfur === 'HIGH') { const base = { A: -14.8, B: -36.0, C: -57.1, D: -71.4 }[curve]; T0 = base + 0.1021 * sy; eq = '9F.57/9F.59'; }
    else throw new Error('Sulfur class must be LOW or HIGH');
    meta = { T0_mode: mode, curve, SyA_MPa: sy, sulfur, equations: eq };
  } else if (mode === 'OPTION_D_J_TEST') {
    const Tt = f_(tg, 'mc_test_T');
    const J = f_(tg, 'mc_test_J', true);
    const E = f_(tg, 'mc_test_E', true);
    const nu = f_(tg, 'mc_test_nu', false, -1e-12, 0.5);
    const B = f_(tg, 'mc_test_B', true);
    const KB = kjcFromJ(J, E, nu);
    const K25 = 20.0 + (KB - 20.0) * Math.pow(B / 25.0, 0.25);
    if (K25 <= 30.0) throw new Error('Option D: Kmat(25 mm) <= 30 MPa sqrt(m); Eq. 9F.81 undefined');
    T0 = Tt - Math.log((K25 - 30.0) / 70.0) / 0.0190;
    meta = { T0_mode: mode, K_B: KB, K_25mm: K25, equations: '9F.76, 9F.79, 9F.81' };
  } else if (mode === 'OPTION_B_CVN' || mode === 'OPTION_C_CVN28') {
    throw new Error(`${mode} is gated: supporting Charpy correlations (9F.4.3.2 Options B/C) are not yet validated in ATLAS. Use DIRECT, OPTION_A_EXEMPTION or OPTION_D_J_TEST.`);
  } else throw new Error('Unknown Master Curve T0 mode');
  const h2 = up(tg.h2_shift, 'NONE');
  let shift = { NONE: 0.0, H2_225CR1MO: 50.0, H2_225CR1MOV: 0.0 }[h2];
  if (h2 === 'USER') shift = f_(tg, 'h2_shift_user');
  if (shift === undefined || shift === null) throw new Error('Hydrogen shift must be NONE, H2_225CR1MO, H2_225CR1MOV or USER');
  Object.assign(meta, { T0_unshifted_C: T0, H2_shift_mode: h2, H2_shift_C: shift, H2_equation: { H2_225CR1MO: '9F.103', H2_225CR1MOV: '9F.105' }[h2] || '-' });
  return [T0 + shift, meta];
}

function crackFrontL(tg, geom) {
  const mode = up(tg.mc_L_mode, 'AUTO');
  if (mode === 'AUTO' || mode === 'AUTO_KPTC_2T') return geom.L_auto || [2.0 * geom.t, '2t for a through-wall crack (Annex 9F nomenclature)'];
  if (mode === 'USER') return [f_(tg, 'mc_L', true), 'user-entered crack-front length'];
  throw new Error('Master Curve L mode must be AUTO or USER');
}

function mcAt(tg, geom, T0, extra) {
  const T = f_(tg, 'T_assess');
  const Pf = f_(tg, 'mc_pf', false, 0.0, 1.0);
  const [L, lsrc] = crackFrontL(tg, geom);
  const raw = masterCurveK(T, T0, Pf, L);
  let k = raw;
  const meta = { clause: '9F.4.3.3', equation: '9F.84', T_C: T, T0_used_C: T0, Pf, L_mm: L, L_source: lsrc, raw_K: raw };
  Object.assign(meta, extra);
  if (up(tg.mc_us_limit, 'NONE') === '9F44') {
    const [us, usm] = upperShelf(tg, tg._system || 'SI');
    k = Math.min(raw, us);
    Object.assign(meta, { upper_shelf_K: us, upper_shelf_limited: raw > us, upper_shelf: usm });
  }
  return [k, meta];
}

export function masterCurve(tg, geom) {
  const [T0, m] = masterCurveT0(tg);
  const [k, meta] = mcAt(tg, geom, T0, m);
  meta.method_id = '9F43_MASTER_CURVE';
  return [k, meta];
}

export function upperShelf(tg, system) {
  const opt = up(tg.us_option, 'B');
  if (opt === 'A') {
    const cvn = f_(tg, 'us_cvn', true);
    const basis = up(tg.us_basis, 'LOWER');
    let J1, eq;
    if (basis === 'MEDIAN') { J1 = 0.74 * Math.pow(cvn, 1.28); eq = '9F.86/9F.90'; }
    else if (basis === 'LOWER') { J1 = 0.53 * Math.pow(cvn, 1.28); eq = '9F.88/9F.90'; }
    else throw new Error('Upper-shelf basis must be MEDIAN or LOWER');
    const E = f_(tg, 'E', true);
    const nu = f_(tg, 'nu', false, -1e-12, 0.5);
    const k = kjcFromJ(0.7 * J1, E, nu);
    return [k, { method_id: '9F44_UPPER_SHELF', option: 'A', basis, CVN_J: cvn, J1mm: J1, Jcrit: 0.7 * J1, equations: eq }];
  }
  if (opt === 'B') {
    const cap = upperShelfCap(tg, 'us_fixed', system);
    return [cap, { method_id: '9F44_UPPER_SHELF', option: 'B', equation: cap < 150 ? '9F.91' : '9F.92' }];
  }
  throw new Error('Upper-shelf option must be A or B');
}

export function dynamic(tg, geom) {
  const [T0, m] = masterCurveT0(tg);
  const sy = f_(tg, 'syA', true);
  const kd = f_(tg, 'krate_dyn', true);
  const ks = num(tg.krate_static, 1.0) || 1.0;
  const gamma = 1.78 * Math.exp(Math.pow((T0 + 273.15) / 194.0, 1.9) + Math.pow(sy / 44.2, 0.37));
  const lnr = Math.log(kd / ks);
  if (gamma - lnr <= 0) throw new Error('Eq. 9F.95 undefined (Gamma <= ln(K_dyn/K_static))');
  const dTs = (T0 + 273.15) * lnr / (gamma - lnr);
  const [k, meta] = mcAt(tg, geom, T0 + dTs, m);
  Object.assign(meta, { method_id: '9F45_DYNAMIC', clause: '9F.4.5.2', Gamma: gamma, dTs_C: dTs, T0D_C: T0 + dTs, Kdot_dyn: kd, Kdot_static: ks });
  return [k, meta];
}

export function arrest(tg, geom) {
  const [T0, m] = masterCurveT0(tg);
  const sy = f_(tg, 'syA', true);
  const ni = num(tg.ni_pct, 0.0) || 0.0;
  let dTs, eq;
  if (ni > 1.0) { dTs = Math.exp(5.48 - (T0 + 273.15) / 172.0 + sy / 27000.0 - ni / 4.3); eq = '9F.100'; }
  else { dTs = Math.exp(5.25 - (T0 + 273.15) / 162.6 + sy / 1897.4); eq = '9F.98'; }
  const [k, meta] = mcAt(tg, geom, T0 + dTs, m);
  Object.assign(meta, { method_id: '9F45_ARREST', clause: '9F.4.5.3', dTs_C: dTs, dTs_equation: eq, T0A_C: T0 + dTs, Ni_pct: ni });
  return [k, meta];
}

export function crmoAging(tg, geom) {
  const route = up(tg.crmo_route, 'CR125_XBAR');
  const [P, Sb, Sn, As] = ['chem_P', 'chem_Sb', 'chem_Sn', 'chem_As'].map(k => num(tg[k], null));
  const known = [P, Sb, Sn, As].every(v => v !== null);
  let fatt, eq, par;
  if (route === 'CR125_XBAR' || route === 'CR225_XBAR_WELD') {
    let X;
    if (known) X = (10 * P + 5 * Sb + 4 * Sn + As) * 100;
    else if (route === 'CR125_XBAR') X = 35.0;
    else throw new Error('CR225_XBAR_WELD requires P, Sb, Sn, As; otherwise use CR225_J_BASE (9F.4.7.3(b)(1)(ii))');
    if (route === 'CR125_XBAR') { fatt = -87.355 + 11.437 * X - 0.14712 * X ** 2; eq = '9F.107, 9F.108, 9F.110'; }
    else { fatt = X <= 10 ? -30.0 : (X >= 23 ? 120.0 : 11.538 * X - 145.385); eq = '9F.117, 9F.118, 9F.120'; }
    par = { Xbar: X, chemistry_known: known };
  } else if (route === 'CR225_J_BASE') {
    const Mn = num(tg.chem_Mn), Si = num(tg.chem_Si);
    let J;
    if ([Mn, Si, P, Sn].every(v => v !== null)) J = (Mn + Si) * (P + Sn) * 10000;
    else {
      const vint = up(tg.crmo_vintage, 'PRE_1975');
      J = { POST_1990: 50.0, '1975_1990': 146.0, PRE_1975: 230.0 }[vint];
      if (J === undefined) throw new Error('Vintage must be POST_1990, 1975_1990 or PRE_1975');
    }
    fatt = J <= 50 ? -30.0 : (J >= 230 ? 120.0 : 0.8333 * J - 71.667);
    eq = '9F.112, 9F.113, 9F.115';
    par = { J_factor: J };
  } else throw new Error('Cr-Mo route must be CR125_XBAR, CR225_J_BASE or CR225_XBAR_WELD');
  const T0Aged = fatt - 50.0;
  const [kAged, meta] = mcAt(tg, geom, T0Aged, { FATT_C: fatt, T0_aged_C: T0Aged, route, aging_equations: eq, ...par });
  const [kBase, mb] = masterCurve(tg, geom);
  const k = Math.min(kAged, kBase);
  Object.assign(meta, { method_id: '9F47_CRMO_AGING', clause: '9F.4.7', K_aged: kAged, K_non_aged: kBase,
    governing: kAged <= kBase ? 'AGED' : 'NON_AGED (9F.4.7.1(a))', non_aged: mb });
  return [k, meta];
}

export function austeniticJc(tg, system) {
  const cond = up(tg.ss_condition, 'WROUGHT');
  const basis = up(tg.ss_basis, 'LOWER');
  const T = f_(tg, 'T_assess');
  const E = f_(tg, 'E', true);
  const nu = f_(tg, 'nu', false, -1e-12, 0.5);
  const rows = {};
  D.table9F2.filter(r => r.condition === cond).forEach(r => { rows[r.temp_band] = r; });
  if (!Object.keys(rows).length) throw new Error('Austenitic condition must be WROUGHT, GTA_WELD or SA_WELD');
  const col = basis === 'LOWER' ? 'Jc_lower_' : 'Jc_mean_';
  if (basis !== 'LOWER' && basis !== 'MEAN') throw new Error('Austenitic basis must be LOWER or MEAN');
  const J = row => (system === 'FPS' ? Number(row[col + 'inlb_in2']) * INLB_IN2_TO_KJ_M2 : Number(row[col + 'kJ_m2']));
  const lo = rows.LOW, hi = rows.HIGH;
  let Jc, how;
  if (Number(lo.T_lo_C) - 1e-9 <= T && T <= Number(lo.T_hi_C) + 1e-9) { Jc = J(lo); how = 'low-temperature band'; }
  else if (hi && Number(hi.T_lo_C) - 1e-9 <= T && T <= Number(hi.T_hi_C) + 1e-9) { Jc = J(hi); how = 'high-temperature band'; }
  else if (hi && Number(lo.T_hi_C) < T && T < Number(hi.T_lo_C)) {
    const f = (T - Number(lo.T_hi_C)) / (Number(hi.T_lo_C) - Number(lo.T_hi_C));
    Jc = J(lo) + f * (J(hi) - J(lo)); how = 'linear interpolation per Table 9F.2 Note 3';
  } else throw new Error(`Assessment temperature ${T.toFixed(1)} C is outside Table 9F.2 coverage for ${cond}`);
  const k = kjcFromJ(Jc, E, nu);
  return [k, { method_id: '9F412_AUSTENITIC_JC', clause: '9F.4.12', condition: cond, basis, Jc_kJ_m2: Jc, temperature_rule: how,
    table: system === 'FPS' ? 'Table 9F.2' : 'Table 9F.2M', equation: '9F.36', note: 'Valid only without significant thermal degradation / transition behaviour' }];
}

export function determineKmat(tg0, mat, geom, system) {
  const method = up(tg0.method, 'PROJECT_KMAT');
  const rec = D.toughnessMethods.find(r => r.method_id === method);
  if (!rec) throw new Error(`Unknown toughness method ${method}`);
  if (rec.status === 'GATED') throw new Error(`${method} (${rec.clause}) is gated: ${rec.summary}`);
  const tg = { ...tg0, _system: system };
  if (method === 'PROJECT_KMAT') {
    if (mat.Kmat_db !== null && mat.Kmat_db !== undefined) return [mat.Kmat_db, { method_id: method, clause: '9.3.5.2', source: 'materials_db.csv record' }];
    const k = num(tg.kmat_project);
    if (k === null || k <= 0 || up(tg.data_status) !== 'APPROVED') throw new Error('PROJECT_KMAT requires a positive Project Kmat and Project data status = APPROVED');
    return [k, { method_id: method, clause: '9.3.5.2', source: 'project-approved Kmat' }];
  }
  if (method === 'PROJECT_TEST_SET') {
    const [k, meta] = equivalentMinOfThree(tg.tests || []);
    Object.assign(meta, { method_id: method, clause: '9F.3.3.2(c)' });
    return [k, meta];
  }
  if (method === '9F412_AUSTENITIC_JC') return austeniticJc(tg, system);
  if (method === '9F42_ASME_XI_LOWER') return asmeXiLower(tg, mat, system);
  if (method === '9F43_MASTER_CURVE') return masterCurve(tg, geom);
  if (method === '9F44_UPPER_SHELF') return upperShelf(tg, system);
  if (method === '9F45_DYNAMIC') return dynamic(tg, geom);
  if (method === '9F45_ARREST') return arrest(tg, geom);
  if (method === '9F47_CRMO_AGING') return crmoAging(tg, geom);
  throw new Error(method);
}
