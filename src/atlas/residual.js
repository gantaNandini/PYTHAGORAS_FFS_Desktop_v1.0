/** Annex 9D residual stress for KPTC — port of residual.py (SI: MPa, mm). */
import { up, truthy } from './util.js';

export function residualYieldStrength(smys, actual, basis, add = 69.0) {
  basis = up(basis, 'ESTIMATED_FROM_SMYS');
  if (basis === 'ACTUAL') {
    if (!truthy(actual) || Number(actual) <= 0) throw new Error('Annex 9D ACTUAL yield basis requires actual yield strength > 0');
    return [Number(actual), 'ACTUAL (9D.3.3)'];
  }
  if (basis === 'ESTIMATED_FROM_SMYS') {
    if (!truthy(smys) || Number(smys) <= 0) throw new Error('Annex 9D requires base-material SMYS > 0');
    return [Number(smys) + Number(add), 'Eq. 9D.1: SMYS + 69 MPa (10 ksi)'];
  }
  throw new Error(`Unknown yield basis ${basis}`);
}

export function pwhtUniformStress(sigR, direction) {
  const d = up(direction, 'PERPENDICULAR');
  if (d === 'PERPENDICULAR') return [0.2 * sigR, 'Eq. 9D.3'];
  if (d === 'PARALLEL') return [0.3 * sigR, 'Eq. 9D.4'];
  throw new Error('Stress direction must be PERPENDICULAR or PARALLEL');
}

export function longitudinalSeamPerpendicularProfile(z, sigR) {
  if (!(z >= 0.0 && z <= 1.0)) throw new Error('Eq. 9D.22 requires 0 <= x/t <= 1');
  return sigR * (1.230 - 9.269 * z + 17.641 * z * z - 8.660 * z ** 3);
}

export function longitudinalSeamAttenuation(y, w) {
  y = Math.abs(Number(y)); w = Number(w);
  if (w <= 0) throw new Error('weld width must be > 0');
  if (y <= w) return 1.0;
  if (y < 2 * w) return (2 * w - y) / w;
  return 0.0;
}

export function teeMainPlateProfile(z, sigR, t) {
  if (!(z >= 0.0 && z <= 1.0)) throw new Error('9D.11.1 requires 0 <= x/t <= 1');
  const si = sigR;
  let sm, so;
  if (t <= 6.35) { sm = so = sigR; }
  else if (t <= 25.0) { sm = sigR * (1.340 - 0.0536 * t); so = sigR * (1.170 - 0.0268 * t); }
  else { sm = 0.0; so = 0.5 * sigR; }
  if (z <= 0.275) return si - 3.636 * (si - sm) * z;
  return sm + (so - sm) * (1.379 * z - 0.379);
}

const trapz = (v, x) => { let s = 0; for (let i = 0; i < x.length - 1; i++) s += 0.5 * (v[i] + v[i + 1]) * (x[i + 1] - x[i]); return s; };

export function linearizeProfile(x, s, t) {
  const m = trapz(s, x) / t;
  const b = 6.0 * trapz(s.map((si, i) => si * (t / 2 - x[i])), x) / t ** 2;
  return [m, b];
}

export function asWeldedProfile(profileId, t, sigR, points = 101, y = 0.0, w = null) {
  const pid = up(profileId);
  const n = Math.max(11, Math.trunc(points));
  const xs = Array.from({ length: n }, (_, i) => t * i / (n - 1));
  let att, ss, eq;
  if (pid === 'LONGITUDINAL_SEAM_PERPENDICULAR') {
    if (!truthy(w)) throw new Error('LONGITUDINAL_SEAM_PERPENDICULAR requires weld width w');
    att = longitudinalSeamAttenuation(y, w);
    ss = xs.map(x => att * longitudinalSeamPerpendicularProfile(x / t, sigR));
    eq = '9D.22 + 9D.23/9D.24';
  } else if (pid === 'TEE_MAIN_PLATE_PERPENDICULAR') {
    att = 1.0;
    ss = xs.map(x => teeMainPlateProfile(x / t, sigR, t));
    eq = '9D.49 - 9D.57';
  } else throw new Error(`Unknown Annex 9D as-welded profile ${profileId}`);
  const [rm, rb] = linearizeProfile(xs, ss, t);
  return { profile_id: pid, equation: eq, x_mm: xs, sigma_MPa: ss, attenuation: att, linearized_Rm: rm, linearized_Rb: rb,
    peak: Math.max(...ss), minimum: Math.min(...ss) };
}

export function residualComponents(method, rm, rb, cfg, t) {
  method = up(method, 'USER_DEFINED');
  if (method === 'NONE') return [0.0, 0.0, { method: 'NONE', note: 'No residual stress included' }];
  if (method === 'USER_DEFINED') {
    const a = Number(rm || 0.0), b = Number(rb || 0.0);
    return [a, b, { method: 'USER_DEFINED', Rm: a, Rb: b, note: 'Project-defined residual membrane / bending stress' }];
  }
  if (method !== 'ANNEX_9D') throw new Error(`Unknown residual stress method ${method}`);
  for (const key of ['material_spec', 'weld_type', 'joint']) {
    if (!String(cfg[key] || '').trim()) throw new Error(`Annex 9D traceability input missing: ${key} (9D.3.1 required data)`);
  }
  if (up(cfg.pt_credit, 'NONE') !== 'NONE') throw new Error('Pressure-test credit (9D.4.2) requires case-specific quantification and is not applied');
  const [sigR, ysrc] = residualYieldStrength(cfg.smys, cfg.actual_ys, cfg.ys_basis, cfg.ys_add !== undefined ? cfg.ys_add : 69.0);
  const cond = up(cfg.weld_condition, 'PWHT_UNIFORM');
  const meta = { method: 'ANNEX_9D', weld_condition: cond, sigma_ys_r: sigR, yield_source: ysrc, material_spec: cfg.material_spec,
    weld_type: cfg.weld_type, joint: cfg.joint };
  if (cond === 'PWHT_UNIFORM') {
    const [s, eq] = pwhtUniformStress(sigR, cfg.direction);
    Object.assign(meta, { equation: eq, direction: up(cfg.direction, 'PERPENDICULAR'), note: 'Uniform PWHT stress maps exactly to KPTC membrane residual stress (Rb = 0)' });
    return [s, 0.0, meta];
  }
  if (cond === 'UNIFORM_YIELD') {
    Object.assign(meta, { equation: '9D.1', note: 'Uniform yield-magnitude residual stress (user-selected bound)' });
    return [sigR, 0.0, meta];
  }
  if (cond === 'AS_WELDED') {
    const p = asWeldedProfile(cfg.profile_id, t, sigR, cfg.points || 101, cfg.weld_y || 0.0, cfg.weld_w);
    Object.assign(meta, { equation: p.equation, profile: p, linearized_Rm_info: p.linearized_Rm, linearized_Rb_info: p.linearized_Rb,
      note: 'Non-linear Annex 9D profile applied as a conservative uniform envelope Rm = max sigma(x); linearized values are for information only (Annex 9G.2.2).' });
    return [Math.max(p.peak, 0.0), 0.0, meta];
  }
  throw new Error('Weld condition must be PWHT_UNIFORM, AS_WELDED or UNIFORM_YIELD');
}
