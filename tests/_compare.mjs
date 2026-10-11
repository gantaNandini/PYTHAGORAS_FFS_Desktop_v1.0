// Shared helpers: compare a JavaScript result with the one produced by the original ATLAS Python engine.
import { pick } from './_util.mjs';
const RTOL = 1e-9, ATOL = 1e-12;
export const counter = { checks: 0 };

/** least-squares round-off noise (|x| < 1e-10, e.g. a fitted 'zero' coefficient) is not a difference */
const scrub = t => t.replace(/-?\d+(?:\.\d+)?e-(?:1[0-9]|[2-9][0-9])/g, '0');

export function cmp(a, e, path, out) {
  counter.checks++;
  if (e === null || e === undefined) { if (!(a === null || a === undefined || (typeof a === 'number' && !Number.isFinite(a)))) out.push(`${path}: expected null, got ${JSON.stringify(a)}`); return; }
  if (typeof e === 'number') {
    if (typeof a !== 'number') { out.push(`${path}: expected number ${e}, got ${JSON.stringify(a)}`); return; }
    if (Math.abs(a - e) > ATOL + RTOL * Math.max(Math.abs(a), Math.abs(e))) out.push(`${path}: ${a} vs ${e} (rel ${(Math.abs(a - e) / Math.max(Math.abs(e), 1e-300)).toExponential(2)})`);
    return;
  }
  if (typeof e === 'string' && typeof a === 'string') { if (scrub(a) === scrub(e)) return; }
  if (typeof e === 'string' || typeof e === 'boolean') { if (a !== e) out.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(e)}`); return; }
  if (Array.isArray(e)) {
    if (!Array.isArray(a) || a.length !== e.length) { out.push(`${path}: array length ${a && a.length} vs ${e.length}`); return; }
    e.forEach((v, i) => cmp(a[i], v, `${path}[${i}]`, out)); return;
  }
  if (typeof e === 'object') {
    if (typeof a !== 'object' || a === null) { out.push(`${path}: expected object, got ${JSON.stringify(a)}`); return; }
    for (const k of Object.keys(e)) cmp(a[k], e[k], `${path}.${k}`, out);
  }
}

export const HK = ['cycles', 'c', 'Kmin', 'Kmax', 'dK', 'R', 'dKth', 'rate', 'KIP', 'KISR', 'Lr', 'Kr', 'allow', 'margin', 'status'];
const nonObj = o => Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v !== 'object' || v === null));

export function expectOf(res) {
  const h = res.history, mid = Math.floor(h.length / 2);
  return { summary: res.summary, initial: res.initial, n_history: h.length, hist: { first: pick(h[0], HK), mid: pick(h[mid], HK), last: pick(h[h.length - 1], HK) },
    n_sif: res.sif.length, sif_mid: res.sif[Math.floor(res.sif.length / 2)],
    material: pick(res.material, ['Sy', 'Su', 'lrmax', 'lrmax_category', 'constraint', 'Kmat']),
    toughness_method: res.toughness.method_id, toughness: nonObj(res.toughness), growth: res.growth,
    residual: Object.fromEntries(Object.entries(res.residual).filter(([k]) => k !== 'profile')), loads: Object.fromEntries(Object.entries(res.loads).filter(([, v]) => !(v && v.kind))), geometry: res.geometry, flaw: res.flaw,
    warnings: res.warnings, trace: res.trace };
}
const mm = m => (m ? pick(m, ['initial_status', 'initial_margin', 'initial_Lr', 'initial_Kr', 'critical_c', 'life', 'life_status', 'stop']) : null);
export function l3Of(l3) {
  const S = l3.sensitivity, M = l3.method_d;
  const rows = S.rows.map(r => {
    const o = { key: r.key, adverse: r.adverse ?? null };
    ['lo', 'hi'].forEach(s => { if (r[s]) o[s] = { factor: r[s].factor, metrics: mm(r[s].metrics), error: r[s].error ?? null }; });
    return o;
  });
  const out = { sens: { base: mm(S.base), rows, n_cases: S.n_cases, n_unacceptable: S.n_unacceptable, verdict: S.verdict,
    combined: S.combined ? { factors: S.combined.factors, metrics: mm(S.combined.metrics), error: S.combined.error ?? null } : null,
    psf: S.psf ? { factors: S.psf.factors, metrics: mm(S.psf.metrics), error: S.psf.error ?? null } : null } };
  if (M) {
    const p = M.points;
    out.md = { outcome: M.outcome, F_instability: M.F_instability, F_capped: M.F_capped, da_at_instability: M.da_at_instability, F_level2: M.F_level2_single_Kmat,
      n_points: p.length, p0: p[0], pmid: p[Math.floor(p.length / 2)], plast: p[p.length - 1], jr: M.jr, warnings: M.warnings, da_max: M.da_max };
  } else out.md = null;
  return out;
}

