/** Crack geometries (Annex 9B stress intensity / Annex 9C reference stress) — port of geometry.py.
 *  Every geometry exposes the same interface so FAD, growth, Level 3 and reporting are shared. mm, MPa, MPa*sqrt(m). */
import D from './data.generated.js';
import { kptc, rptc, checkApplicability } from './kptc.js';
import { num } from './util.js';

function interp(x, xs, ys) {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
  return ys[lo] + (x - xs[lo]) / (xs[hi] - xs[lo]) * (ys[hi] - ys[lo]);
}

/** Least squares by Householder QR (A is m x n, y length m) */
function lstsq(A, y) {
  const m = A.length, n = A[0].length;
  const R = A.map(r => r.slice()), b = y.slice();
  for (let k = 0; k < n; k++) {
    let nrm = 0; for (let i = k; i < m; i++) nrm += R[i][k] ** 2; nrm = Math.sqrt(nrm);
    if (nrm === 0) continue;
    const alpha = R[k][k] > 0 ? -nrm : nrm;
    const v = new Array(m).fill(0); for (let i = k; i < m; i++) v[i] = R[i][k]; v[k] -= alpha;
    let vv = 0; for (let i = k; i < m; i++) vv += v[i] ** 2;
    if (vv === 0) continue;
    for (let j = k; j < n; j++) { let d = 0; for (let i = k; i < m; i++) d += v[i] * R[i][j]; d = 2 * d / vv; for (let i = k; i < m; i++) R[i][j] -= d * v[i]; }
    let d = 0; for (let i = k; i < m; i++) d += v[i] * b[i]; d = 2 * d / vv; for (let i = k; i < m; i++) b[i] -= d * v[i];
  }
  const x = new Array(n).fill(0);
  for (let k = n - 1; k >= 0; k--) { let s = b[k]; for (let j = k + 1; j < n; j++) s -= R[k][j] * x[j]; x[k] = s / R[k][k]; }
  return x;
}

/** Gauss-Legendre nodes/weights on [-1, 1] */
function leggauss(n) {
  const x = [], w = [];
  for (let i = 0; i < n; i++) {
    let z = Math.cos(Math.PI * (i + 0.75) / (n + 0.5)), pp = 0;
    for (let it = 0; it < 100; it++) {
      let p1 = 1, p2 = 0;
      for (let j = 0; j < n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j + 1) * z * p2 - j * p3) / (j + 1); }
      pp = n * (z * p1 - p2) / (z * z - 1);
      const dz = p1 / pp; z -= dz; if (Math.abs(dz) < 1e-16) break;
    }
    x.push(z); w.push(2 / ((1 - z * z) * pp * pp));
  }
  return [x.reverse(), w.reverse()];
}
const [GL_U, GL_W] = leggauss(16);

export class StressDist {
  /** kind 'poly': coeffs s0..s4 of Eq. 9B.3 in x/t;  kind 'points': (x_mm, sigma) pairs, linear between points */
  constructor(kind, t, o = {}) {
    this.kind = kind; this.t = Number(t); this.label = o.label || '';
    if (kind === 'poly') {
      const c = [...(o.coeffs || []).map(v => Number(v || 0)), 0, 0, 0, 0, 0];
      this.c = c.slice(0, 5);
    } else if (kind === 'points') {
      const idx = o.x.map((_, i) => i).sort((a, b) => o.x[a] - o.x[b]);
      this.x = idx.map(i => Number(o.x[i])); this.s = idx.map(i => Number(o.s[i]));
      if (this.x.length < 2) throw new Error(`${this.label}: an arbitrary stress profile needs at least 2 points`);
      if (this.x[0] > 1e-9 || this.x[this.x.length - 1] < this.t - 1e-6) {
        throw new Error(`${this.label}: the stress profile must cover x = 0 to x = t (${Number(this.t.toPrecision(6))} mm)`);
      }
    } else throw new Error(kind);
  }
  static membraneBending(t, m, b, label = '') { return new StressDist('poly', t, { coeffs: [m + b, -2.0 * b, 0, 0, 0], label }); }
  value(x) {
    if (this.kind === 'poly') { const z = x / this.t; let s = 0; for (let i = 0; i < 5; i++) s += this.c[i] * z ** i; return s; }
    return interp(x, this.x, this.s);
  }
  /** Equivalent membrane and bending: Eqs. 9B.4/9B.5 (polynomial) or 9B.1/9B.2 (profile) */
  mb() {
    if (this.kind === 'poly') {
      const [s0, s1, s2, s3, s4] = this.c;
      return [s0 + s1 / 2 + s2 / 3 + s3 / 4 + s4 / 5, -s1 / 2 - s2 / 2 - 9 * s3 / 20 - 6 * s4 / 15];
    }
    const { x, s, t } = this;
    let m = 0, b = 0;
    for (let i = 0; i < x.length - 1; i++) {
      const h = x[i + 1] - x[i], xm = 0.5 * (x[i] + x[i + 1]), sm = 0.5 * (s[i] + s[i + 1]);
      m += h / 6 * (s[i] + 4 * sm + s[i + 1]);
      const f = (xx, ss) => ss * (t / 2 - xx);
      b += h / 6 * (f(x[i], s[i]) + 4 * f(xm, sm) + f(x[i + 1], s[i + 1]));
    }
    return [m / t, 6.0 * b / t ** 2];
  }
  /** Fourth-order least-squares fit over the full thickness (9B.2.2.3) -> [coeffs, max abs error] */
  polyFit() {
    if (this.kind === 'poly') return [this.c.slice(), 0.0];
    const n = 401, ys = [], A = [];
    for (let i = 0; i < n; i++) { const xv = this.t * i / (n - 1); ys.push(this.value(xv)); const z = xv / this.t; A.push([1, z, z ** 2, z ** 3, z ** 4]); }
    const c = lstsq(A, ys);
    let err = 0; for (let i = 0; i < n; i++) err = Math.max(err, Math.abs(A[i].reduce((a, v, j) => a + v * c[j], 0) - ys[i]));
    return [c, err];
  }
  breakpoints() { return this.kind === 'poly' ? [] : this.x.slice(); }
  scaled(F, label) {
    return this.kind === 'poly' ? new StressDist('poly', this.t, { coeffs: this.c.map(v => v * F), label: label || this.label })
      : new StressDist('points', this.t, { x: this.x, s: this.s.map(v => v * F), label: label || this.label });
  }
}

// ======================================================================= KPTC
export class PlateThroughWall {
  constructor(t, W) {
    this.t = t; this.W = W; this.gid = 'KPTC'; this.method = null;
    this.name = 'Plate - through-wall crack (KPTC 9B.3.1 / RPTC 9C.3.1)';
    this.size_symbol = 'c'; this.ratio_label = 'c/W'; this.total_label = '2c'; this.size_name = 'half-length'; this.aux_names = ['Mb', 'fw'];
  }
  limit(si) {
    const cw = num(si.cw_stop, 0.99) || 0.99;
    if (!(cw > 0 && cw < 1)) throw new Error('c/W numerical limit must be between 0 and 1');
    return [cw * this.W, `c/W = ${Number(cw.toPrecision(6))} numerical limit`];
  }
  check(c) { checkApplicability(c, this.W); }
  ratio(c) { return c / this.W; }
  total(c) { return 2 * c; }
  K_primary(c, L, s) { const r = kptc(c, this.W, this.t, L.Pm * s, L.Pb * s, L.pc * s); return [r.KI, { Mb: r.Mb, fw: r.fw }]; }
  K_secres(c, L, s) { return [kptc(c, this.W, this.t, L.Sm * s + L.Rm, L.Sb * s + L.Rb).KI, {}]; }
  K_applied(c, L, s) { return kptc(c, this.W, this.t, (L.Pm + L.Sm) * s, (L.Pb + L.Sb) * s, L.pc * s).KI; }
  K_residual(c, L) { return kptc(c, this.W, this.t, L.Rm, L.Rb).KI; }
  sigma_ref(c, L, s, incPc) { return rptc(c, this.W, L.Pm * s + (incPc ? L.pc * s : 0.0), L.Pb * s); }
  L_auto() { return [2.0 * this.t, '2t for a through-wall crack (Annex 9F nomenclature)']; }
  scalePrimary(L, F) { return { ...L, Pm: L.Pm * F, Pb: L.Pb * F, pc: L.pc * F }; }
}

// ======================================================================= KPSCL1 / KPSCL2
export function influence(r) {
  const r2 = r * r, T = D.kpsclInfluence;
  return [0, 1, 2, 3, 4].map(i => { const C = T[`G${i}`]; return C[0] + C[1] * r2 + C[2] * r2 ** 2 + C[3] * r2 ** 3 + C[4] * r2 ** 4; });
}

export class PlateSurfaceInfinite {
  constructor(t, method) {
    this.t = t; this.method = method; this.gid = method; this.W = null;
    this.name = method === 'KPSCL1'
      ? 'Plate - infinite-length surface crack, fourth-order polynomial stress (KPSCL1 9B.3.2 / RPSCL 9C.3.2)'
      : 'Plate - infinite-length surface crack, arbitrary stress, weight function (KPSCL2 9B.3.3 / RPSCL 9C.3.3)';
    this.size_symbol = 'a'; this.ratio_label = 'a/t'; this.total_label = null; this.size_name = 'depth'; this.aux_names = ['G0', 'G1'];
    this.A_T_MAX = 0.8; this._cache = new Map();
  }
  limit() { return [this.A_T_MAX * this.t, 'a/t = 0.8 validity limit (9B.3.2.2(d))']; }
  check(a) {
    const r = a / this.t;
    if (!(r > 0.0 && r <= this.A_T_MAX + 1e-12)) throw new Error(`9B.3.2.2(d): 0 < a/t <= 0.8 required; got a/t = ${Number(r.toPrecision(6))}`);
  }
  ratio(a) { return a / this.t; }
  total() { return null; }
  _Kdist(a, d) {
    let m = this._cache.get(d); if (!m) { m = new Map(); this._cache.set(d, m); }
    if (m.has(a)) return m.get(a);
    const G = influence(a / this.t), q = Math.sqrt(Math.PI * a / 1000.0);
    let K;
    if (this.method === 'KPSCL1') {
      const [c] = d.polyFit(), r = a / this.t;
      K = (G[0] * c[0] + G[1] * c[1] * r + G[2] * c[2] * r ** 2 + G[3] * c[3] * r ** 3 + G[4] * c[4] * r ** 4) * q;   // Eq. 9B.12
    } else K = this._weight(a, d, G);
    if (m.size > 20000) m.clear();
    m.set(a, K);
    return K;
  }
  wfCoefficients(a) {
    const G = influence(a / this.t);
    return { M1: 2 * Math.PI / Math.sqrt(2) * (3 * G[1] - G[0]) - 24.0 / 5.0, M2: 3.0, M3: 6 * Math.PI / Math.sqrt(2) * (G[0] - 2 * G[1]) + 8.0 / 5.0 };
  }
  _weight(a, d, G) {
    const Q = 1.0;
    const M1 = 2 * Math.PI / Math.sqrt(2 * Q) * (3 * G[1] - G[0]) - 24.0 / 5.0, M2 = 3.0, M3 = 6 * Math.PI / Math.sqrt(2 * Q) * (G[0] - 2 * G[1]) + 8.0 / 5.0;
    const cuts = new Set([0.0, 1.0]);
    for (const xb of d.breakpoints()) if (xb > 0.0 && xb < a) cuts.add(Math.sqrt(1.0 - xb / a));
    const cs = [...cuts].sort((p, q) => p - q);
    let total = 0.0;
    for (let k = 0; k < cs.length - 1; k++) {
      const u0 = cs[k], u1 = cs[k + 1];
      for (let j = 0; j < 16; j++) {
        const u = 0.5 * (u1 - u0) * GL_U[j] + 0.5 * (u1 + u0), w = 0.5 * (u1 - u0) * GL_W[j];
        total += w * 2.0 * (1.0 + M1 * u + M2 * u ** 2 + M3 * u ** 3) * d.value(a * (1.0 - u * u));
      }
    }
    return Math.sqrt(2.0 * (a / 1000.0) / Math.PI) * total;
  }
  _aux(a) { const G = influence(a / this.t); return { G0: G[0], G1: G[1] }; }
  K_primary(a, L, s) {
    const G0 = influence(a / this.t)[0];
    const Kpc = G0 * L.pc * s * Math.sqrt(Math.PI * a / 1000.0);
    return [s * this._Kdist(a, L.P) + Kpc, this._aux(a)];
  }
  K_secres(a, L, s) { return [s * this._Kdist(a, L.S) + this._Kdist(a, L.R), {}]; }
  K_applied(a, L, s) { return this.K_primary(a, L, s)[0] + s * this._Kdist(a, L.S); }
  K_residual(a, L) { return this._Kdist(a, L.R); }
  sigma_ref(a, L, s, incPc) {
    let [pm, pb] = L.P_mb;
    pm = pm * s + (incPc ? L.pc * s : 0.0); pb = pb * s;
    const al = a / this.t;
    return (pb + 3 * pm * al + Math.sqrt((pb + 3 * pm * al) ** 2 + 9 * pm ** 2 * (1 - al) ** 2)) / (3 * (1 - al) ** 2);
  }
  L_auto() { return [100.0, 'L = min(2c, 100 mm) with 2c infinite (Eq. 9H.15)']; }
  scalePrimary(L, F) {
    return { ...L, Pm: L.Pm * F, Pb: L.Pb * F, pc: L.pc * F, P: L.P.scaled(F, 'Primary'), P_mb: [L.P_mb[0] * F, L.P_mb[1] * F] };
  }
}
