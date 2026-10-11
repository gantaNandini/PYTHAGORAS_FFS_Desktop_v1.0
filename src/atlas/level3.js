/** Part 9 Level 3 (paragraph 9.4.4) — port of level3.py. */
import D from './data.generated.js';
import SC from './schema.generated.js';
import { num, up, truthy } from './util.js';
import { evaluate } from './fad.js';
import { run } from './solver.js';
import { kjcFromJ } from './toughness.js';
import { jrCusToSI, INLB_IN2_TO_KJ_M2 } from './units.js';

const metrics = res => {
  const s = res.summary;
  return { initial_status: res.initial.status, initial_margin: res.initial.margin, initial_Lr: res.initial.Lr, initial_Kr: res.initial.Kr,
    critical_c: s.critical_c_mm, life: s.life, life_status: s.life_status, stop: s.stop_reason };
};
function runFactors(caseIn, factors) {
  try { return [metrics(run({ ...caseIn, factors, light: true })), null]; }
  catch (e) { return [null, String(e.message || e)]; }
}

export function sensitivity(caseIn, baseRes) {
  const si = caseIn.si;
  const base = metrics(baseRes);
  const out = { base, rows: [], combined: null, psf: null };
  if (up(si.l3_sens, 'YES') === 'YES') {
    const adverse = {};
    for (const [key, label] of SC.sensVars) {
      if (up(si[`s_${key}_on`], 'YES') !== 'YES') continue;
      const row = { key, label };
      for (const side of ['lo', 'hi']) {
        const pct = num(si[`s_${key}_${side}`], 0.0) || 0.0;
        const f = 1.0 + pct / 100.0;
        if (f <= 0) { row[side] = { pct, factor: f, error: 'factor <= 0' }; continue; }
        const [m, err] = runFactors(caseIn, { [key]: f });
        row[side] = { pct, factor: f, metrics: m, error: err };
      }
      const cands = ['lo', 'hi'].filter(s => row[s] && row[s].metrics).map(s => [row[s].metrics.life, row[s].metrics.initial_margin, s, row[s].factor]);
      if (cands.length) {
        const lifeB = base.life, margB = base.initial_margin;
        const score = c => [truthy(lifeB) ? c[0] - lifeB : 0.0, c[1] - margB];
        let worst = cands[0];
        for (const c of cands.slice(1)) {
          const a = score(c), b = score(worst);
          if (a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])) worst = c;
        }
        row.adverse = worst[2];
        adverse[key] = worst[3];
      }
      out.rows.push(row);
    }
    if (Object.keys(adverse).length) {
      const [m, err] = runFactors(caseIn, adverse);
      out.combined = { factors: adverse, metrics: m, error: err };
    }
  }
  if (up(si.psf_on, 'NO') === 'YES') {
    const [ps, pk, pa] = ['psf_stress', 'psf_kmat', 'psf_flaw'].map(k => num(si[k], 1.0) || 1.0);
    const f = { primary: ps, kmat: 1.0 / pk, c0: pa };
    const [m, err] = runFactors(caseIn, f);
    out.psf = { psf_stress: ps, psf_kmat: pk, psf_flaw: pa, factors: f, metrics: m, error: err };
  }
  const cases = [];
  out.rows.forEach(r => ['lo', 'hi'].forEach(s => { if (r[s] && r[s].metrics) cases.push(r[s].metrics); }));
  if (out.combined && out.combined.metrics) cases.push(out.combined.metrics);
  if (out.psf && out.psf.metrics) cases.push(out.psf.metrics);
  const nBad = cases.filter(c => c.initial_status !== 'PASS' || !c.life_status.startsWith('ACCEPTABLE')).length;
  out.n_cases = cases.length; out.n_unacceptable = nBad;
  out.verdict = nBad === 0 ? 'All sensitivity cases acceptable' : `${nBad} of ${cases.length} cases NOT acceptable - review input uncertainty`;
  return out;
}

export function jrCurve(caseIn, baseRes) {
  const si = caseIn.si, system = caseIn.system;
  const src = up(si.jr_source, 'TABLE_9F3');
  if (src === 'TABLE_9F3') {
    const rid = String(si.jr_record || 'GENERIC_CS-1').trim();
    const rec = D.table9F3.find(r => r.jr_id === rid);
    if (!rec) throw new Error(`J-R record ${rid} not in Table 9F.3 database`);
    const n = Number(rec.nR);
    let C, Ji, table;
    if (system === 'FPS') { C = jrCusToSI(Number(rec.CR_US), n); Ji = Number(rec.Ji_inlb_in2) * INLB_IN2_TO_KJ_M2; table = 'Table 9F.3'; }
    else { C = Number(rec.CR_SI); Ji = Number(rec.Ji_kJ_m2); table = 'Table 9F.3M'; }
    return [da => C * Math.pow(da, n), { source: src, record: rec.material, table, C_SI: C, n, Ji_kJ_m2: Ji, record_T_C: Number(rec.T_C),
      record_t_mm: Number(rec.t_mm), equation: 'J_R = C_R (da)^nR' }];
  }
  if (src === 'CVN_9F130') {
    const cvn = num(si.jr_cvn);
    if (!truthy(cvn) || cvn <= 0) throw new Error('CVN_9F130 requires the upper-shelf Charpy energy');
    const basis = up(si.jr_basis, 'LOWER');
    const J1 = (basis === 'MEDIAN' ? 0.74 : 0.53) * Math.pow(cvn, 1.28);
    const sy = baseRes.material.Sy;
    const m = 0.432 * Math.pow(cvn / 100.0, 0.256) - sy / 4664.0 + 0.03;
    if (m <= 0) throw new Error('Eq. 9F.132 gives m <= 0 - J-R estimate not valid for this CVN / yield strength');
    return [da => J1 * Math.pow(da, m), { source: src, CVN_J: cvn, basis, J1mm_kJ_m2: J1, m, Sy_MPa: sy,
      equation: 'J_R = J1mm (da)^m  (Eqs. 9F.130, 9F.86/9F.88, 9F.132)', C_SI: J1, n: m }];
  }
  if (src === 'PROJECT') {
    const C = num(si.jr_C), n = num(si.jr_n);
    if (!truthy(C) || !truthy(n) || up(si.data_status) !== 'APPROVED') throw new Error('PROJECT J-R curve requires C_R, nR and Project data status = APPROVED');
    return [da => C * Math.pow(da, n), { source: src, C_SI: C, n, equation: 'J_R = C_R (da)^nR (project data)' }];
  }
  throw new Error('J-R source must be TABLE_9F3, CVN_9F130 or PROJECT');
}

function loadFactor(c, geo, loads, scale, mat, incPc, fmax) {
  const ok = F => evaluate(c, geo, geo.scalePrimary(loads, F), scale, mat, incPc).status === 'PASS';
  if (ok(fmax)) return fmax;
  if (!ok(1e-6)) return 0.0;
  let a = 1e-6, b = fmax;
  for (let i = 0; i < 50; i++) { const m = 0.5 * (a + b); if (ok(m)) a = m; else b = m; }
  return a;
}

export function methodD(caseIn, baseRes) {
  const si = caseIn.si;
  if (up(si.md_on, 'YES') !== 'YES') return null;
  const [J, jd] = jrCurve(caseIn, baseRes);
  const E = num(si.E), nu = num(si.nu, 0.3);
  const geom = baseRes.geom, geo = baseRes.geo, loads = baseRes.loads, mat = { ...baseRes.material };
  const incPc = baseRes.include_pc_ref, scale = baseRes.scales[1];
  const c0 = geom.c0;
  const [sizeMax, limitText] = geo.limit(si);
  let daMax = num(si.md_da_max, 3.0) || 3.0;
  const n = Math.max(10, Math.trunc(num(si.md_points, 60) || 60));
  const fmax = num(si.md_fmax, 5.0) || 5.0;
  const warnings = [];
  if (c0 + daMax >= sizeMax) { daMax = sizeMax - c0; warnings.push(`Tearing range truncated at the ${limitText}.`); }
  const pts = [];
  for (let j = 1; j <= n; j++) {
    const da = daMax * j / n;
    const Jv = J(da);
    const K = kjcFromJ(Jv, E, nu);
    const mj = { ...mat, Kmat: K };
    const st = evaluate(c0 + da, geo, loads, scale, mj, incPc);
    const F = loadFactor(c0 + da, geo, loads, scale, mj, incPc, fmax);
    pts.push({ da, c: c0 + da, J: Jv, K, Lr: st.Lr, Kr: st.Kr, allow: st.allow, inside: st.status === 'PASS', F });
  }
  const inside = pts.map(p => p.inside);
  let outcome;
  if (inside.every(Boolean)) outcome = 'NO UNSTABLE TEARING - all assessment points inside the FAD';
  else if (!inside.some(Boolean)) outcome = 'DUCTILE INSTABILITY PREDICTED - all assessment points outside the FAD';
  else {
    const firstIn = inside.findIndex(Boolean);
    if (inside.slice(firstIn).every(Boolean)) outcome = `STABLE TEARING of about ${Number(pts[firstIn].da.toPrecision(4))} mm, then arrest (locus enters the FAD)`;
    else outcome = 'MIXED - locus crosses the FAD more than once; review tearing range and J-R validity';
  }
  let kInst = 0;
  pts.forEach((p, i) => { if (p.F > pts[kInst].F) kInst = i; });
  const FInst = pts[kInst].F;
  const FL2 = loadFactor(c0, geo, loads, scale, mat, incPc, fmax);
  if (mat.material_class === 'CARBON_STEEL' || mat.material_class === 'LOW_ALLOY_STEEL') {
    warnings.push('Method D requires upper-shelf (fully ductile) behaviour of the ferritic steel at the assessment temperature - confirm before relying on tearing credit (9.4.4.1(d)).');
  }
  if (jd.record_T_C !== undefined && Math.abs(jd.record_T_C - num(si.T_assess, jd.record_T_C)) > 50) {
    warnings.push(`Table 9F.3 record temperature (${Number(jd.record_T_C.toPrecision(6))} C) differs from the assessment temperature by more than 50 C - use J-R data at the assessment temperature where available.`);
  }
  if (jd.source === 'TABLE_9F3') warnings.push('Table 9F.3 values are typical generic data; actual J-R data should be used when available.');
  return { jr: jd, E, nu, points: pts, outcome, F_instability: FInst, F_capped: FInst >= fmax, da_at_instability: pts[kInst].da,
    F_level2_single_Kmat: FL2, Kmat_level2: mat.Kmat, da_max: daMax, warnings,
    note: (baseRes.geometry.size === 'c' ? 'Tearing increments are added to the half-length c (both tips of the through-wall crack). ' : 'Tearing increments are added to the crack depth a. ') + 'Load factor applies to primary loads; secondary and residual loads unchanged.' };
}

export const assess = (caseIn, baseRes) => ({ sensitivity: sensitivity(caseIn, baseRes), method_d: methodD(caseIn, baseRes) });
