/**
 * calc.js — the green "CALC" rows of the ATLAS input sheets (values derived from the inputs and the databases),
 * returned in the DISPLAYED unit system. Every entry is computed defensively: invalid inputs give null, never an exception.
 */
import D from '../atlas/data.generated.js';
import SC from '../atlas/schema.generated.js';
import { buildCase } from '../atlas/case.js';
import { equivalentHalfLength } from '../atlas/flaw.js';
import { influence } from '../atlas/geometry.js';
import { surfaceChoice } from '../atlas/solver.js';
import { lrMax } from '../atlas/fad.js';
import { GrowthModel } from '../atlas/growth.js';
import { buildMaterial } from '../atlas/solver.js';
import { polynomialToMembraneBending } from '../atlas/kptc.js';
import { pwhtUniformStress, residualYieldStrength } from '../atlas/residual.js';
import { fromSI, parisCsiToUS, jrCsiToUS, INLB_IN2_TO_KJ_M2, KSIRIN_TO_MPARM } from '../atlas/units.js';
import { num, up } from '../atlas/util.js';

const safe = fn => { try { return fn(); } catch { return null; } };

export function matRecord(id) { return D.materials.find(r => r.material_id === id) || null; }

export function derive(p) {
  const out = {};
  const sys = p.system;
  const kc = safe(() => buildCase(p));
  const si = kc ? kc.si : null;
  const cvt = (v, kind) => (v === null || v === undefined || typeof v === 'string' ? v : fromSI(v, kind, sys));

  // ---- 1 Geometry / flaw
  if (si && p.geometry === 'KPSCL') {
    const a0 = num(si.a_m), t = num(si.t);
    out.sc_a0 = a0 !== null ? cvt(a0, 'length') : null;
    if (a0 !== null && t) {
      const r = a0 / t;
      out.sc_at = r;
      out.sc_applic = r > 0 && r <= 0.8 ? 'OK' : 'OUT OF RANGE';
      const G = influence(r); out.sc_G0 = G[0]; out.sc_G1 = G[1];
    }
  } else if (si) {
    const f = safe(() => equivalentHalfLength(si.cm, si.flaw_option, num(si.alpha, 0.0), num(si.sigma1, 1.0), num(si.sigma2, 0.0), si.plane));
    if (f) {
      const [c0, meta] = f;
      out.flaw_B = meta.option === 'OPTION_1' ? '-' : meta.B;
      out.flaw_ratio = meta.ratio;
      out.flaw_c0 = cvt(c0, 'length');
      out.flaw_2c0 = cvt(2 * c0, 'length');
      const cw = si.W ? c0 / si.W : null;
      out.flaw_cw = cw;
      out.flaw_applic = cw !== null && cw > 0 && cw < 1 ? 'OK' : 'OUT OF RANGE';
    }
  }
  // ---- 2 Material
  const rec = matRecord(p.raw.material_id);
  if (rec) {
    out.mat_spec = rec.specification; out.mat_grade = rec.grade; out.mat_form = rec.product_form; out.mat_cond = rec.condition;
    out.mat_class = rec.material_class;
    out.mat_smys = Number(sys === 'SI' ? rec.SMYS_MPa : rec.SMYS_ksi); out.mat_smts = Number(sys === 'SI' ? rec.SMTS_MPa : rec.SMTS_ksi);
    out.mat_E = Number(sys === 'SI' ? rec.E_MPa : rec.E_ksi);
    out.mat_curve = rec.exemption_curve; out.mat_lrcat = rec.lrmax_category; out.mat_growth = rec.default_growth_model;
    out.mat_tough = rec.default_toughness_method; out.mat_note = rec.note;
    out.mat_kmat = num(sys === 'SI' ? rec.Kmat_MPa_sqrt_m : rec.Kmat_ksi_sqrt_in);
  }
  const filt = p.raw.material_filter;
  out.mat_in_class = filt === 'ALL' || (SC.lists['MAT_' + filt] || []).includes(p.raw.material_id) ? 'OK' : 'NOT IN CLASS - reselect ID';
  if (si && rec) {
    const m = safe(() => buildMaterial(si, sys, []));
    if (m) {
      out.sy_used = cvt(m.Sy, 'stress'); out.su_used = cvt(m.Su, 'stress');
      out.lr_cat_used = m.lrmax_category; out.lr_max = m.lrmax;
    }
  }
  // ---- 3 Toughness
  const tm = D.toughnessMethods.find(r => r.method_id === p.raw.method);
  if (tm) { out.t_clause = tm.clause; out.t_summary = tm.summary; out.t_status = tm.status; }
  const curveMode = up(p.raw.curve_mode, 'FROM_DATABASE');
  out.t_curve_used = curveMode === 'FROM_DATABASE' ? (rec ? rec.exemption_curve : null) : curveMode;
  const tests = (p.tests || []).map(v => num(v)).filter(v => v !== null);
  out.t_n = tests.length;
  if (tests.length >= 3) {
    const s = [...tests].sort((a, b) => a - b);
    out.t_equiv = s[Math.trunc((s.length - 1) / 5)];
    out.t_scatter = tests.length !== 3 ? '-' : (Math.min(...tests) < 0.7 * (tests.reduce((a, b) => a + b, 0) / 3) || Math.max(...tests) > 1.4 * (tests.reduce((a, b) => a + b, 0) / 3) ? 'EXCESSIVE' : 'OK');
  } else { out.t_equiv = 'n < 3'; out.t_scatter = '-'; }
  // ---- 4 Crack growth
  if (si && rec) {
    const mat = safe(() => buildMaterial(si, sys, []));
    const gid = String(p.raw.growth_model || 'FROM_MATERIAL_DB') === 'FROM_MATERIAL_DB' ? rec.default_growth_model : p.raw.growth_model;
    out.g_used = gid;
    const rows = D.growth.filter(r => r.model_id === gid);
    if (rows.length) { out.g_table = rows[0].api_table || 'Material DB'; out.g_eq = rows[0].equation; out.g_desc = rows[0].description; out.g_appl = rows[0].applicability; }
    if (gid === 'PROJECT_MATERIAL_DATA') { out.g_table = 'Material DB'; }
    const gm = mat ? safe(() => new GrowthModel(gid, sys, mat, { ...si })) : null;
    if (gm) {
      const sets = Object.entries(gm.sets);
      const [, a] = sets[0] || [];
      const b = sets.length > 1 ? sets[1][1] : null;
      const Cdisp = (C, n) => (C === null || C === undefined ? null : (sys === 'FPS' ? parisCsiToUS(C, n) : C));
      if (a) { out.g_C1 = Cdisp(a.C1, a.n1); out.g_n1 = a.n1; out.g_C2 = a.C2 ? Cdisp(a.C2, a.n2) : null; out.g_n2 = a.n2 ?? null;
        out.g_trans = a.dKtran ? cvt(a.dKtran, 'K') : null;
        out.g_th = a.dKth !== undefined ? cvt(a.dKth, 'K') : (a.dKth_expr ? `${a.dKth_expr}` : null); }
      if (b) out.g_second = `R >= 0.5: C1 = ${Number(Cdisp(b.C1, b.n1).toPrecision(5))}, n1 = ${b.n1}`;
      out.g_RE = gm.RE;
    }
  }
  // ---- 5 Loads
  if (si && p.geometry === 'KPSCL') {
    const ch = safe(() => surfaceChoice(si));
    const raw = p.raw;
    const m = ch ? ch[0] : /KPSCL2|ARBITRARY/i.test(String(raw.stress_dist || '')) ? 'KPSCL2' : 'KPSCL1';
    out.sc_sol = m;
    out.sc_sif = m === 'KPSCL2' ? 'KPSCL2 - weight function, Eqs. 9B.261/9B.262 (9B.3.3)' : 'KPSCL1 - fourth-order polynomial, Eq. 9B.12 (9B.3.2)';
    out.sc_ref = m === 'KPSCL2' ? 'RPSCL (9C.3.3 -> 9C.3.2), Eq. 9C.31' : 'RPSCL (9C.3.2), Eq. 9C.31';
    const inp = String(raw.stress_input || '');
    out.sc_enter = /MEMBRANE/i.test(inp) ? 'Section MEMBRANE + BENDING' : /POLYNOMIAL/i.test(inp) ? 'Section FOURTH-ORDER POLYNOMIAL' : /PROFILE|POINT/i.test(inp) ? 'Table POINT-BY-POINT PROFILE' : '-';
    out.sc_check = m === 'KPSCL1' && /PROFILE|POINT/i.test(inp) ? 'Profile input needs the arbitrary distribution (KPSCL2)' : 'OK';
  }
  if (si) {
    const [pm, pb] = polynomialToMembraneBending(...['P0', 'P1', 'P2', 'P3', 'P4'].map(k => num(si[k], 0.0)));
    const [sm, sb] = polynomialToMembraneBending(...['Q0', 'Q1', 'Q2', 'Q3', 'Q4'].map(k => num(si[k], 0.0)));
    out.poly_Pm = cvt(pm, 'stress'); out.poly_Pb = cvt(pb, 'stress'); out.poly_Sm = cvt(sm, 'stress'); out.poly_Sb = cvt(sb, 'stress');
  }
  // ---- 6 Residual stress
  if (si && rec) {
    const add = sys === 'SI' ? 69.0 : 10.0 * 6.894757293168361;
    const smys = si.smys_9d || Number(rec.SMYS_MPa);
    const ys = safe(() => residualYieldStrength(smys, si.actual_ys, si.ys_basis, add));
    if (ys) {
      out.rs_ys = cvt(ys[0], 'stress');
      const u = safe(() => pwhtUniformStress(ys[0], si.direction));
      if (u) out.rs_uniform = cvt(u[0], 'stress');
    }
  }
  // ---- 8 Controls
  const rq = num(p.raw.required_life), mg = num(p.raw.life_margin);
  out.min_life = rq !== null && mg !== null ? rq * mg : null;
  // ---- 9 Level 3
  const jr = D.table9F3.find(r => r.jr_id === p.raw.jr_record);
  if (jr) {
    out.jr_material = jr.material;
    out.jr_T = sys === 'SI' ? Number(jr.T_C) : Number(jr.T_F);
    out.jr_t = sys === 'SI' ? Number(jr.t_mm) : Number(jr.t_in);
    out.jr_Ji = sys === 'SI' ? Number(jr.Ji_kJ_m2) : Number(jr.Ji_inlb_in2);
    out.jr_CR = sys === 'SI' ? Number(jr.CR_SI) : Number(jr.CR_US);
    out.jr_nR = Number(jr.nR);
  }
  return out;
}
export { lrMax, jrCsiToUS, INLB_IN2_TO_KJ_M2, KSIRIN_TO_MPARM };
