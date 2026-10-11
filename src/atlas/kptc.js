/** Annex 9B.3.1 (KPTC) and 9C.3.1 (RPTC) — port of kptc_rptc.py. Inputs mm, MPa; K in MPa√m. */
import D from './data.generated.js';
const k = D.kptc;

export function checkApplicability(c, W) {
  if (W <= 0 || c <= 0) throw new Error('KPTC/RPTC requires positive c and W');
  const alpha = c / W;
  if (!(alpha > 0.0 && alpha < 1.0)) throw new Error(`9B.3.1.2(b): 0 < c/W < 1 required; got c/W = ${Number(alpha.toPrecision(6))}`);
  return alpha;
}

export function kptc(c, W, t, mem, bend, pcPressure = 0.0) {
  checkApplicability(c, W);
  const psi = t / (c * Math.sqrt(k.psi_sqrt_constant));
  const Mb = (k.Mb_num_0 + k.Mb_num_1 * psi + k.Mb_num_2 * psi ** 2) /
    (k.Mb_den_0 + k.Mb_den_1 * psi + k.Mb_den_2 * psi ** 2 + k.Mb_den_3 * psi ** 3);
  const fw = Math.sqrt(1 / Math.cos(Math.PI * c / (k.fw_denominator * W)));
  const q = Math.sqrt(Math.PI * c / 1000.0);
  const km = (mem + pcPressure) * q * fw;
  const kb = Mb * bend * q * fw;
  return { KI: km + kb, Kmem: km, Kbend: kb, psi, Mb, fw };
}

export function rptc(c, W, pm, pb) {
  const alpha = checkApplicability(c, W);
  return (pb + Math.sqrt(pb ** 2 + k.RPTC_sqrt_factor * pm ** 2)) / (k.RPTC_denominator_factor * (1 - alpha));
}

export function polynomialToMembraneBending(P0, P1, P2, P3, P4) {
  return [P0 + P1 / 2 + P2 / 3 + P3 / 4 + P4 / 5, -P1 / 2 - P2 / 2 - 9 * P3 / 20 - 6 * P4 / 15];
}
