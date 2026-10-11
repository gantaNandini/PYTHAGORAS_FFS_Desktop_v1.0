/** Level 2 FAD (9.4.3.2, Figure 9.19, Table 9.3) — port of fad.py. */
import D from './data.generated.js';

/** numpy.interp with edge clipping */
function interp(x, xs, ys) {
  if (x <= xs[0]) return ys[0];
  const n = xs.length;
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
  const f = (x - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] + f * (ys[hi] - ys[lo]);
}
const clip = (v, a, b) => Math.min(Math.max(v, a), b);

export function xiInterp(Lr, X) {
  const xs = D.xi.X, lrs = D.xi.Lr, grid = D.xi.grid;
  const xx = clip(X, xs[0], xs[xs.length - 1]);
  const vals = grid.map(row => interp(xx, xs, row));
  return interp(clip(Lr, lrs[0], lrs[lrs.length - 1]), lrs, vals);
}

export const fadCurve = Lr => (1 - 0.14 * Lr ** 2) * (0.3 + 0.7 * Math.exp(-0.65 * Lr ** 6));

export function lrMax(category, Sy, Su) {
  const cat = String(category || 'FLOW_STRESS').toUpperCase();
  const row = D.lrmax.find(r => r.category === cat);
  if (!row) throw new Error(`Unknown Lr(max) category '${category}'`);
  if (cat === 'FLOW_STRESS') return (Sy + Su) / (2 * Sy);
  return Number(row.Lr_max);
}

export function evaluate(size, geo, loads, scale, mat, includePcInRef = true) {
  const [KP, aux] = geo.K_primary(size, loads, scale);
  const [KSR] = geo.K_secres(size, loads, scale);
  const sigmaRef = geo.sigma_ref(size, loads, scale, includePcInRef);
  const Lr = sigmaRef / mat.Sy;
  const KIP = Math.max(0.0, KP);
  const KISR = Math.max(0.0, KSR);
  let phi0 = 1.0, X = 0.0, xi = 1.0, Phi;
  if (KISR > 0) {
    const cm = size / 1000.0;
    const q = mat.constraint === 'plane_strain' ? 1 / 6 : 1 / 2;
    const ae = cm * (1 + q * (KISR / (mat.Sy * Math.sqrt(Math.PI * cm))) ** 2);
    phi0 = Math.sqrt(ae / cm);
    if (KIP > 0) {
      X = Lr * (phi0 * KISR / KIP);
      xi = xiInterp(Lr, X);
      Phi = phi0 * xi;
    } else Phi = phi0;
  } else Phi = 1.0;
  const Kr = (KIP + Phi * KISR) / mat.Kmat;
  const Lmax = mat.lrmax;
  const allow = Lr <= Lmax ? fadCurve(Lr) : 0.0;
  const ok = Lr <= Lmax && Kr <= allow;
  return { ...aux, KI: KP, KIP, KISR, sigma_ref: sigmaRef, phi0, xi, Phi, X, Lr, Kr,
    Lr_max: Lmax, allow, margin: allow - Kr, status: ok ? 'PASS' : 'FAIL' };
}

export function criticalC(c0, sizeMax, state, maxScale, iterations) {
  let a = c0, b = sizeMax;
  if (state(b, maxScale).status === 'PASS') return [b, state(b, maxScale), true];
  for (let i = 0; i < iterations; i++) {
    const mid = (a + b) / 2;
    if (state(mid, maxScale).status === 'PASS') a = mid; else b = mid;
  }
  return [a, state(a, maxScale), false];
}
