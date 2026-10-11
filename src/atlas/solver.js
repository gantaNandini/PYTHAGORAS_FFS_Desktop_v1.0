/** Part 9 assessment driver for the plate geometries KPTC, KPSCL1, KPSCL2 — port of solver.py (paragraphs 9.3.6, 9.4.3, 9.5.1). All computations in SI. */
import D from './data.generated.js';
import { num, up, truthy, isNone } from './util.js';
import { polynomialToMembraneBending } from './kptc.js';
import { PlateThroughWall, PlateSurfaceInfinite, StressDist } from './geometry.js';
import { equivalentHalfLength } from './flaw.js';
import { evaluate, criticalC, lrMax } from './fad.js';
import { determineKmat } from './toughness.js';
import { residualComponents } from './residual.js';
import { GrowthModel } from './growth.js';
import { pyG } from './util.js';
import { KSI_TO_MPA, KSIRIN_TO_MPARM, parisCusToSI } from './units.js';

export function dbMaterial(mid) {
  const m = D.materials.find(r => r.material_id === mid);
  if (!m) throw new Error(`Material ID '${mid}' not found in materials_db.csv`);
  return m;
}

export function buildMaterial(si, system, warnings) {
  const rec = dbMaterial(String(si.material_id).trim());
  const m = { id: rec.material_id, record: rec, material_class: rec.material_class, exemption_curve: rec.exemption_curve,
    SMYS_MPa: Number(rec.SMYS_MPa), SMTS_MPa: Number(rec.SMTS_MPa) };
  m.SMYS_native = system === 'SI' ? Number(rec.SMYS_MPa) : Number(rec.SMYS_ksi);
  if (system === 'FPS') { m.SMYS_MPa = Number(rec.SMYS_ksi) * KSI_TO_MPA; m.SMTS_MPa = Number(rec.SMTS_ksi) * KSI_TO_MPA; }
  const src = up(si.strength_source, 'DATABASE_SPEC_MIN');
  if (src === 'PROJECT_AT_TEMPERATURE') {
    if (up(si.data_status) !== 'APPROVED' || !truthy(si.sy_project) || !truthy(si.su_project)) {
      throw new Error('PROJECT_AT_TEMPERATURE strengths require Sy, Su and Project data status = APPROVED');
    }
    m.Sy = si.sy_project; m.Su = si.su_project; m.strength_source = 'Project values at assessment temperature';
  } else {
    m.Sy = m.SMYS_MPa; m.Su = m.SMTS_MPa; m.strength_source = 'Specified minimum (materials_db.csv)';
    const T = si.T_assess;
    if (!isNone(T) && T > 40 && rec.material_class !== 'REFERENCE') {
      warnings.push('Specified-minimum ambient strengths are used at an elevated assessment temperature; 9.4.3.2 STEP 3 requires strength at the assessment condition - consider PROJECT_AT_TEMPERATURE.');
    }
  }
  if (m.Su <= m.Sy) warnings.push('Su <= Sy: check strength inputs.');
  const mode = up(si.lrmax_mode, 'FROM_DATABASE');
  const cat = mode === 'FROM_DATABASE' ? rec.lrmax_category : mode;
  m.lrmax_category = cat;
  m.lrmax = lrMax(cat, m.Sy, m.Su);
  m.constraint = String(si.constraint || rec.constraint || 'plane_strain').trim();
  if (system === 'FPS') {
    const k = num(rec.Kmat_ksi_sqrt_in); m.Kmat_db = k !== null ? k * KSIRIN_TO_MPARM : null;
    const n = num(rec.paris_n), c = num(rec.paris_C_in_cycle);
    m.C_db = c !== null && truthy(n) ? parisCusToSI(c, n) : null;
    const th = num(rec.dKth_ksi_sqrt_in); m.dKth_db = th !== null ? th * KSIRIN_TO_MPARM : null;
  } else {
    m.Kmat_db = num(rec.Kmat_MPa_sqrt_m); m.C_db = num(rec.paris_C_mm_cycle); m.dKth_db = num(rec.dKth_MPa_sqrt_m);
  }
  m.n_db = num(rec.paris_n);
  return m;
}

const pyG3 = x => pyG(x, 3), pyG4 = x => pyG(x, 4), pyG5 = x => pyG(x, 5), pyG6 = x => pyG(x, 6);

/** (method, input mode) from the 5_Loads drop-downs */
export function surfaceChoice(si) {
  const dist = up(si.stress_dist), inp = up(si.stress_input);
  if (!dist) {
    const mode = up(si.stress_mode, 'POLYNOMIAL_4TH');
    const m = up(si.sif_solution, 'AUTO');
    const method = (m === 'KPSCL1' || m === 'KPSCL2') ? m : (mode === 'POINT_PROFILE' ? 'KPSCL2' : 'KPSCL1');
    return [method, mode];
  }
  const method = (dist.includes('KPSCL2') || dist.includes('ARBITRARY')) ? 'KPSCL2' : 'KPSCL1';
  let mode;
  if (inp.includes('MEMBRANE')) mode = 'MEMBRANE_BENDING';
  else if (inp.includes('POLYNOMIAL')) mode = 'POLYNOMIAL_4TH';
  else if (inp.includes('PROFILE') || inp.includes('POINT')) mode = 'POINT_PROFILE';
  else throw new Error('Select the stress input format on 5_Loads');
  if (method === 'KPSCL1' && mode === 'POINT_PROFILE') {
    throw new Error('A point-by-point profile is a Through-Wall Arbitrary Stress Distribution - select KPSCL2 (9B.3.3) on 5_Loads, or enter polynomial coefficients for KPSCL1');
  }
  return [method, mode];
}

function surfaceLoads(si, caseIn, t, fac, Rm, Rb, rmeta, mode) {
  const fp = fac('primary'), fs = fac('secondary'), fr = fac('residual');
  const prof = caseIn.profile || [];
  const n0 = k => num(si[k], 0.0);
  let P, S, R;
  if (mode === 'MEMBRANE_BENDING') {
    P = StressDist.membraneBending(t, n0('Pm') * fp, n0('Pb') * fp, 'Primary');
    S = StressDist.membraneBending(t, n0('Sm') * fs, n0('Sb') * fs, 'Secondary');
  } else if (mode === 'POLYNOMIAL_4TH') {
    P = new StressDist('poly', t, { coeffs: ['P0', 'P1', 'P2', 'P3', 'P4'].map(k => n0(k) * fp), label: 'Primary' });
    S = new StressDist('poly', t, { coeffs: ['Q0', 'Q1', 'Q2', 'Q3', 'Q4'].map(k => n0(k) * fs), label: 'Secondary' });
  } else if (mode === 'POINT_PROFILE') {
    if (prof.length < 2) throw new Error('POINT_PROFILE needs at least two rows in the 5B_Stress_Profile sheet');
    const xs = prof.map(r => r[0]);
    P = new StressDist('points', t, { x: xs, s: prof.map(r => (r[1] || 0.0) * fp), label: 'Primary' });
    S = new StressDist('points', t, { x: xs, s: prof.map(r => (r[2] || 0.0) * fs), label: 'Secondary' });
  } else throw new Error('Stress mode must be MEMBRANE_BENDING, POLYNOMIAL_4TH or POINT_PROFILE');
  if (up(si.rs_method, 'USER_DEFINED') === 'USER_PROFILE') {
    if (prof.length < 2) throw new Error('USER_PROFILE residual stress needs the residual column of 5B_Stress_Profile');
    R = new StressDist('points', t, { x: prof.map(r => r[0]), s: prof.map(r => (r[3] || 0.0) * fr), label: 'Residual' });
    Object.assign(rmeta, { method: 'USER_PROFILE', note: 'Residual stress profile from 5B_Stress_Profile used directly' });
  } else if (rmeta.profile) {
    const pr = rmeta.profile;
    R = new StressDist('points', t, { x: pr.x_mm, s: pr.sigma_MPa.map(v => v * fr), label: 'Residual' });
    rmeta.note = 'Annex 9D as-welded profile applied as the actual through-wall distribution (KPSCL1: fourth-order fit; KPSCL2: weight function).';
  } else R = StressDist.membraneBending(t, Rm, Rb, 'Residual');
  return [P, S, R, mode];
}

const g6 = x => Number(Number(x).toPrecision(6));

export function run(caseIn) {
  const si = caseIn.si, system = caseIn.system, loadType = caseIn.load_type;
  const gtype = String(caseIn.geometry || 'KPTC').toUpperCase();
  const factors = caseIn.factors || {};
  const fac = k => (k in factors ? Number(factors[k]) : 1.0);
  const warnings = [...(caseIn.unit_warnings || [])];
  const trace = [];
  const t = si.t;
  if (!t || t <= 0) throw new Error('Plate thickness t must be positive');
  // ---- STEP 5 flaw characterisation
  let W, c0, flawMeta, geoTmp;
  if (gtype === 'KPTC') {
    W = si.W;
    [c0, flawMeta] = equivalentHalfLength(si.cm, si.flaw_option, num(si.alpha, 0.0), num(si.sigma1, 1.0), num(si.sigma2, 0.0), si.plane);
    c0 *= fac('c0');
    geoTmp = new PlateThroughWall(t, W);
    trace.push(['9.3.6.2', 'Flaw half-length for assessment c0', c0, 'length', flawMeta.equation]);
  } else {
    W = null;
    c0 = num(si.a_m);
    if (!c0 || c0 <= 0) throw new Error('Measured flaw depth a must be positive');
    c0 *= fac('c0');
    flawMeta = { option: 'MEASURED_DEPTH', equation: '9.3.6.3: measured depth a; infinite length assumed (conservative bound)', length_2c_measured: num(si.len_2c) };
    geoTmp = new PlateSurfaceInfinite(t, 'KPSCL1');
    trace.push(['9.3.6.3', 'Flaw depth for assessment a0', c0, 'length', flawMeta.equation]);
  }
  if (gtype === 'KPTC' && ![t, W, c0].every(v => Number.isFinite(v)) ) throw new Error('t, W and c0 must be positive');
  geoTmp.check(c0);
  const geom = { t, W, c0, L_auto: geoTmp.L_auto() };
  // ---- STEP 3 material
  const mat = buildMaterial(si, system, warnings);
  if (fac('strength') !== 1.0) {
    mat.Sy *= fac('strength'); mat.Su *= fac('strength');
    mat.lrmax = lrMax(mat.lrmax_category, mat.Sy, mat.Su);
  }
  trace.push(['9.4.3.2 STEP 3', 'Yield strength Sy', mat.Sy, 'stress', mat.strength_source]);
  trace.push(['9.4.3.2 STEP 3', 'Tensile strength Su', mat.Su, 'stress', mat.strength_source]);
  trace.push(['Fig. 9.19 Note 2', 'Lr(max) cut-off', mat.lrmax, 'none', mat.lrmax_category]);
  // ---- STEP 4 toughness
  const tg = { ...si };
  tg.exemption_curve = up(si.curve_mode, 'FROM_DATABASE') === 'FROM_DATABASE' ? mat.exemption_curve : up(si.curve_mode);
  tg.material_class = mat.material_class;
  tg.xi_cap_native = si.xi_cap_native;
  tg.us_fixed_native = si.us_fixed_native;
  let [kmat, tmeta] = determineKmat(tg, mat, geom, system);
  kmat *= fac('kmat');
  mat.Kmat = kmat;
  trace.push(['9.4.3.2 STEP 4', 'Fracture toughness Kmat', kmat, 'K', `${tmeta.method_id} (${tmeta.clause || ''})`]);
  if (['9F42_ASME_XI_LOWER', '9F43_MASTER_CURVE', '9F45_DYNAMIC', '9F45_ARREST'].includes(tmeta.method_id) && mat.material_class === 'AUSTENITIC_SS') {
    warnings.push('Ferritic toughness route selected for an austenitic material: 9.4.3.2 STEP 4(2) requires 9F.4.12.');
  }
  if (tmeta.method_id === '9F412_AUSTENITIC_JC' && mat.material_class !== 'AUSTENITIC_SS') {
    warnings.push('9F.4.12 austenitic route selected for a non-austenitic material.');
  }
  // ---- residual stress
  const cfg = {};
  ['material_spec', 'weld_type', 'joint', 'pt_credit', 'ys_basis', 'actual_ys', 'weld_condition', 'direction', 'profile_id', 'weld_y', 'weld_w', 'points']
    .forEach(k => { cfg[k] = si[k]; });
  cfg.smys = si.smys_9d || mat.SMYS_MPa;
  cfg.ys_add = system === 'SI' ? 69.0 : 10.0 * KSI_TO_MPA;
  const rsm = up(si.rs_method, 'USER_DEFINED');
  let Rm, Rb, rmeta;
  if (rsm === 'USER_PROFILE') {
    if (gtype === 'KPTC') throw new Error('USER_PROFILE residual stress is available for the surface-crack geometry only');
    Rm = 0.0; Rb = 0.0; rmeta = { method: 'USER_PROFILE' };
  } else [Rm, Rb, rmeta] = residualComponents(rsm, si.Rm, si.Rb, cfg, t);
  Rm *= fac('residual'); Rb *= fac('residual');
  // ---- STEP 2 stresses
  const incPc = up(si.include_pc_ref, 'YES') === 'YES';
  const pc = num(si.pc, 0.0) * fac('primary');
  let loads, geo, dists = null;
  if (gtype === 'KPTC') {
    let Pm, Pb, Sm, Sb;
    const sm = up(si.stress_mode, 'MEMBRANE_BENDING');
    if (sm === 'POLYNOMIAL_4TH') {
      [Pm, Pb] = polynomialToMembraneBending(...['P0', 'P1', 'P2', 'P3', 'P4'].map(k => num(si[k], 0.0)));
      [Sm, Sb] = polynomialToMembraneBending(...['Q0', 'Q1', 'Q2', 'Q3', 'Q4'].map(k => num(si[k], 0.0)));
      trace.push(['9C.2.2.3', 'Pm, Pb from polynomial', `${g6(Pm)}, ${g6(Pb)}`, 'stress', 'Eqs. 9C.4/9C.5']);
    } else if (sm === 'POINT_PROFILE') {
      throw new Error('POINT_PROFILE stresses are available for the surface-crack geometry only');
    } else [Pm, Pb, Sm, Sb] = ['Pm', 'Pb', 'Sm', 'Sb'].map(k => num(si[k], 0.0));
    Pm *= fac('primary'); Pb *= fac('primary'); Sm *= fac('secondary'); Sb *= fac('secondary');
    loads = { Pm, Pb, pc, Sm, Sb, Rm, Rb };
    geo = geoTmp;
  } else {
    const [method, mode0] = surfaceChoice(si);
    const [P, S, R, mode] = surfaceLoads(si, caseIn, t, fac, Rm, Rb, rmeta, mode0);
    geo = new PlateSurfaceInfinite(t, method);
    if (method === 'KPSCL1') {
      for (const d of [P, S, R]) {
        if (d.kind === 'points') {
          const [cfit, err] = d.polyFit();
          const span = Math.max(...d.s.map(v => Math.abs(v))) || 1.0;
          trace.push(['9B.2.2.3', `${d.label} profile fitted to 4th-order polynomial`, cfit.map(v => pyG4(v)).join(', '), 'stress', `max fit error ${pyG3(err)} MPa`]);
          if (err > 0.05 * span) warnings.push(`${d.label} stress profile is not well represented by a fourth-order polynomial (max error ${pyG3(err)} MPa = ${(100 * err / span).toFixed(0)} % of peak) - use KPSCL2 (weight function).`);
        }
      }
    }
    const Pmb = P.mb(), Smb = S.mb(), Rmb = R.mb();
    loads = { P, S, R, pc, P_mb: Pmb, Pm: Pmb[0], Pb: Pmb[1], Sm: Smb[0], Sb: Smb[1], Rm: Rmb[0], Rb: Rmb[1], stress_mode: mode };
    [Rm, Rb] = Rmb;
    dists = { P, S, R };
    trace.push(['9C.2.2.3 / 9B.4-9B.5', 'Primary Pm, Pb for reference stress', `${pyG6(Pmb[0])}, ${pyG6(Pmb[1])}`, 'stress', 'Eqs. 9B.4/9B.5 (polynomial) or 9B.1/9B.2 (profile)']);
  }
  trace.push(['Annex 9D', 'Residual membrane Rm (equivalent)', Rm, 'stress', rmeta.equation || rmeta.method]);
  trace.push(['Annex 9D', 'Residual bending Rb (equivalent)', Rb, 'stress', rmeta.method]);
  // ---- load scales
  let minScale, maxScale;
  const history = caseIn.history || [];
  if (loadType === 'VARIABLE') {
    maxScale = Math.max(...history.map(r => r[2]));
    minScale = Math.min(...history.map(r => r[1]));
    for (const r of history) if (r[2] < r[1]) throw new Error(`Load block ${r[0]}: max scale < min scale`);
  } else {
    minScale = num(si.min_scale, 0.0); maxScale = num(si.max_scale, 1.0);
    if (maxScale < minScale) throw new Error('Maximum load scale < minimum load scale');
  }
  // ---- growth model
  let gid = String(si.growth_model || 'FROM_MATERIAL_DB').trim();
  if (gid === 'FROM_MATERIAL_DB') gid = mat.record.default_growth_model;
  const gm = new GrowthModel(gid, system, mat, { ...si });
  gm.rateFactor = fac('rateC'); gm.thFactor = fac('dkth');
  trace.push(['Annex 9F.5', 'Crack growth model', gid, 'none', `${gm.equation} - ${gm.source}`]);

  const state = (c, s) => evaluate(c, geo, loads, s, mat, incPc);
  const kApplied = (c, s) => geo.K_applied(c, loads, s);
  const kRes = c => geo.K_residual(c, loads);

  // ---- STEPs 6-12
  const init = state(c0, maxScale);
  if (gtype === 'KPTC') {
    trace.push(['Eq. 9B.8', 'Primary SIF KIP (initial)', init.KIP, 'K', 'KPTC 9B.3.1'],
      ['Eq. 9B.8', 'Secondary + residual SIF KISR (initial)', init.KISR, 'K', 'KPTC 9B.3.1'],
      ['Eq. 9B.9', 'Bending factor Mb', init.Mb, 'none', ''], ['Eq. 9B.11', 'Width factor fw', init.fw, 'none', ''],
      ['Eq. 9C.27', 'Reference stress', init.sigma_ref, 'stress', 'RPTC 9C.3.1']);
  } else {
    const eq = geo.method === 'KPSCL1' ? 'Eq. 9B.12 (KPSCL1)' : 'Eqs. 9B.261/9B.262 weight function (KPSCL2)';
    trace.push([eq, 'Primary SIF KIP (initial)', init.KIP, 'K', geo.name],
      [eq, 'Secondary + residual SIF KISR (initial)', init.KISR, 'K', geo.name],
      ['Eq. 9B.13 / Table 9B.2', 'Influence coefficient G0', init.G0, 'none', `a/t = ${(c0 / t).toFixed(4)}`],
      ['Eq. 9B.13 / Table 9B.2', 'Influence coefficient G1', init.G1, 'none', '']);
    if (geo.method === 'KPSCL2') {
      const wf = geo.wfCoefficients(c0);
      trace.push(['Eqs. 9B.267-9B.269', 'Weight function M1, M2, M3', `${pyG5(wf.M1)}, ${pyG5(wf.M2)}, ${pyG5(wf.M3)}`, 'none', 'Q = 1.0 (infinite length)']);
    }
    trace.push(['Eq. 9C.31', 'Reference stress', init.sigma_ref, 'stress', 'RPSCL 9C.3.2, alpha = a/t (Eq. 9C.29)']);
  }
  trace.push(['Eq. 9.11', 'Lr', init.Lr, 'none', ''], ['Eq. 9.12', 'Phi0', init.phi0, 'none', ''],
    ['Eq. 9.16', 'X', init.X, 'none', ''], ['Table 9.3', 'xi', init.xi, 'none', ''],
    ['Eq. 9.17', 'Phi', init.Phi, 'none', ''], ['Eq. 9.18', 'Kr', init.Kr, 'none', ''],
    ['Eq. 9.22', 'Kr allowable', init.allow, 'none', ''], ['9.4.3.2 STEP 12', 'Initial FAD status', init.status, 'none', '']);
  // ---- 9.4.3.5 limiting flaw size
  const iters = Math.trunc(num(si.bisection, 100));
  const [sizeMax, limitText] = geo.limit(si);
  if (c0 >= sizeMax) throw new Error(`Initial flaw is at or beyond the ${limitText}`);
  const [ccrit, crit, beyond] = criticalC(c0, sizeMax, state, maxScale, iters);
  if (beyond) warnings.push(`No limiting flaw size found within the ${limitText}; growth stopped at that limit (it is a solution/numerical limit, not a critical size).`);
  if (init.status !== 'PASS') warnings.push('Initial flaw FAILS the Level 2 FAD - the component is not acceptable at the current flaw size.');
  // ---- 9.5.1 crack growth
  const maxcycles = num(si.max_cycles, 5e6);
  const maxdc = num(si.max_dc, 0.02);
  const hist = [];
  let c = c0, cycles = 0.0, stop = '';
  const totalBlock = loadType === 'VARIABLE' ? history.reduce((a, r) => a + r[3], 0) : 1.0;

  const growthPoint = cc => {
    const kr = kRes(cc);
    if (loadType === 'VARIABLE') {
      let kenv = 0.0, moment = 0.0, rate = 0.0;
      const Rs = [];
      for (const [, lo, hi, cyc] of history) {
        const klo = kApplied(cc, lo), khi = kApplied(cc, hi);
        const dk = Math.max(0.0, khi - klo);
        const w = cyc / totalBlock;
        kenv = Math.max(kenv, khi);
        const R = gm.effectiveR(klo, khi, kr);
        Rs.push(R);
        const [ri] = gm.rate(dk, R);
        if (ri > 0) {
          rate += w * ri;
          const n1 = gm.params(R).n1 || 1.0;
          moment += w * Math.pow(dk, n1);
        }
      }
      const n1 = gm.params(Math.max(...Rs)).n1 || 1.0;
      const deq = moment > 0 ? Math.pow(moment, 1 / n1) : 0.0;
      return { Kmin: null, Kmax: kenv, dK: deq, R: Math.max(...Rs), rate, dKth: null };
    }
    const kmin = kApplied(cc, minScale), kmax = kApplied(cc, maxScale);
    const dk = Math.max(0.0, kmax - kmin);
    const R = gm.effectiveR(kmin, kmax, kr);
    const [rate, th] = gm.rate(dk, R);
    return { Kmin: kmin, Kmax: kmax, dK: dk, R, rate, dKth: th };
  };
  const row = (cc, cyc, g, st, status) => {
    const r = { cycles: cyc, c: cc, '2c': geo.total(cc), 'c/W': geo.ratio(cc) };
    for (const k of ['Kmin', 'Kmax', 'dK', 'R', 'dKth', 'rate']) r[k] = g[k];
    r.KIP = st.KIP; r.KISR = st.KISR;
    for (const k of geo.aux_names) r[k] = st[k];
    Object.assign(r, { sigma_ref: st.sigma_ref, Phi: st.Phi, Lr: st.Lr, Kr: st.Kr, allow: st.allow, margin: st.margin, status });
    return r;
  };

  let st = init;
  while (c < ccrit - 1e-12 && cycles < maxcycles) {
    const g = growthPoint(c);
    st = state(c, maxScale);
    hist.push(row(c, cycles, g, st, st.status));
    if (st.status !== 'PASS') { stop = 'FAD boundary exceeded'; break; }
    if (g.rate <= 0) { stop = 'No crack growth: dK at/below threshold'; break; }
    const dc = Math.min(maxdc, ccrit - c);
    cycles += dc / g.rate;
    c += dc;
  }
  if (c >= ccrit - 1e-10) {
    c = ccrit;
    st = state(c, maxScale);
    const g = growthPoint(c);
    hist.push(row(c, cycles, g, st, 'STOP'));
    stop = !beyond ? 'Limiting flaw size reached (FAD boundary)' : `${limitText[0].toUpperCase()}${limitText.slice(1)} reached`;
  }
  if (cycles >= maxcycles && !stop) stop = 'Maximum cycle guard reached';
  const infinite = stop.startsWith('No crack growth');
  // ---- remaining-life acceptance 9.5.1.2 STEP 6
  const req = num(si.required_life, 0.0) || 0.0;
  const margin = num(si.life_margin, 1.0) || 1.0;
  let lifeStatus;
  if (init.status !== 'PASS') lifeStatus = 'NOT ACCEPTABLE (initial flaw outside FAD)';
  else if (infinite) lifeStatus = 'ACCEPTABLE (no growth: dK at/below threshold)';
  else if (stop === 'Maximum cycle guard reached') lifeStatus = maxcycles >= margin * req ? 'ACCEPTABLE (life exceeds cycle guard)' : 'INDETERMINATE';
  else lifeStatus = cycles >= margin * req ? 'ACCEPTABLE' : 'NOT ACCEPTABLE';
  const cpy = num(si.cycles_per_year);
  const frac = num(si.insp_fraction, 0.5) || 0.5;
  const cap = num(si.insp_cap);
  if (!(frac > 0 && frac <= 1)) throw new Error('Inspection fraction must satisfy 0 < fraction <= 1');
  if (margin < 1) warnings.push('Life margin factor < 1 reduces conservatism; a project factor >= 1 is normally used.');
  const finite = init.status === 'PASS' && !infinite && stop !== 'Maximum cycle guard reached';
  const allowLife = finite ? cycles / margin : null;
  let insp = null;
  if (allowLife !== null) { insp = frac * allowLife; if (truthy(cap) && cap > 0) insp = Math.min(insp, cap); }
  else if (truthy(cap) && cap > 0 && init.status === 'PASS') insp = cap;
  // ---- SIF vs crack size
  const npts = caseIn.light ? 10 : Math.max(10, Math.trunc(num(si.sif_points, 250)));
  const sif = [];
  for (let i = 0; i < npts; i++) {
    const cc = c0 + (ccrit - c0) * i / (npts - 1);
    const s = state(cc, maxScale);
    const r = { c: cc, 'c/W': geo.ratio(cc), KIP: s.KIP, KISR: s.KISR, Kres: kRes(cc) };
    for (const k of geo.aux_names) r[k] = s[k];
    Object.assign(r, { sigma_ref: s.sigma_ref, Lr: s.Lr, Kr: s.Kr, allow: s.allow });
    sif.push(r);
  }
  const final = st;
  const summary = { life: cycles, final_c_mm: c, final_c_over_W: geo.ratio(c), final_Lr: final.Lr, final_Kr: final.Kr, final_Kr_allow: final.allow,
    final_FAD_margin: final.margin, stop_reason: stop, critical_c_mm: ccrit, critical_2c_mm: geo.total(ccrit), critical_ratio: geo.ratio(ccrit),
    initial_status: init.status, beyond_limit: beyond,
    initial_margin: init.margin, Kmat: kmat, Sy: mat.Sy, Su: mat.Su, Lr_max: mat.lrmax, required_life: req, life_margin_factor: margin,
    life_status: lifeStatus, life_years: truthy(cpy) ? cycles / cpy : null, flaw_basis: String(si.flaw_basis || 'CURRENT_INSPECTED_FLAW'),
    current_c_mm: c0, crack_extension_mm: c - c0, allowable_service_life: allowLife, inspection_fraction: frac, inspection_cap: cap,
    inspection_interval: insp, allowable_life_years: truthy(cpy) && allowLife !== null ? allowLife / cpy : null,
    inspection_interval_years: truthy(cpy) && insp !== null ? insp / cpy : null, cycles_per_year: cpy,
    blocks_to_failure: loadType === 'VARIABLE' ? cycles / totalBlock : null };
  if (loadType === 'VARIABLE') summary.critical_block = history.reduce((a, r) => (r[2] > a[2] ? r : a))[0];
  const ginfo = { gid: geo.gid, name: geo.name, size: geo.size_symbol, size_name: geo.size_name, ratio: geo.ratio_label,
    total: geo.total_label, aux: [...geo.aux_names], limit: limitText, type: gtype };
  const screen = gtype === 'KPTC'
    ? { geometry: 'Plate - central through-wall crack (Figure 9B.1)', sif: 'Annex 9B.3.1 KPTC', reference_stress: 'Annex 9C.3.1 RPTC',
      level: 'Level 2 FAD (9.4.3) + crack growth (9.5.1)', annex9E: 'Not applied - COA solutions are for cylinders/spheres',
      annex9H: 'Not applicable - through-wall flaw', annex9I: 'Not applicable - through-wall flaw' }
    : { geometry: 'Plate - surface crack, infinite length (Figure 9B.2(b))',
      sif: geo.method === 'KPSCL1' ? 'Annex 9B.3.2 KPSCL1' : 'Annex 9B.3.3 KPSCL2 (weight function 9B.14)',
      reference_stress: 'Annex 9C.3.2 RPSCL (Eq. 9C.31, no bending restraint)', level: 'Level 2 FAD (9.4.3) + crack growth (9.5.1)',
      annex9E: 'Not applicable - infinite-length crack (no leak-before-break)', annex9H: 'Not applied (optional constraint adjustment)', annex9I: 'Not applied' };
  const material = {}; Object.entries(mat).forEach(([k, v]) => { if (k !== 'record') material[k] = v; });
  return { case: caseIn, summary, initial: init, critical: crit, history: hist, sif, geom, geo, geometry: ginfo, dists, flaw: flawMeta, material,
    material_record: mat.record, toughness: tmeta, residual: rmeta, loads, growth: gm.summary(), scales: [minScale, maxScale], trace, warnings,
    include_pc_ref: incPc, factors: { ...factors }, screen };
}
