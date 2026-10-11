/** Paragraph 9.3.6.2 — port of flaw.py. */
export function equivalentHalfLength(cm, option = 'OPTION_1', alphaDeg = 0.0, sigma1 = 1.0, sigma2 = 0.0, plane = 'SIGMA1') {
  option = String(option || 'OPTION_1').toUpperCase();
  if (!(cm > 0)) throw new Error('Measured flaw half-length cm must be positive');
  if (option === 'OPTION_1') return [cm, { option: 'OPTION_1', equation: '9.3.6.2(a): c = cm', ratio: 1.0 }];
  if (option !== 'OPTION_2') throw new Error('Flaw length option must be OPTION_1 or OPTION_2');
  const a = alphaDeg * Math.PI / 180;
  const s1 = Number(sigma1), s2 = Number(sigma2);
  if (s1 <= 0) throw new Error('OPTION_2 requires a positive maximum principal stress sigma1');
  if (s2 > s1) throw new Error('Eq. 9.3 requires sigma1 >= sigma2');
  let B, ratio, eq;
  if (s2 <= 0) {
    B = 0.0;
    ratio = Math.cos(a) ** 2 + Math.sin(a) * Math.cos(a) / 2.0; eq = '9.4'; plane = 'SIGMA1';
  } else {
    B = s2 / s1;
    if (String(plane).toUpperCase() === 'SIGMA2') {
      ratio = Math.cos(a) ** 2 / B ** 2 + (1 - B) * Math.sin(a) * Math.cos(a) / (2 * B ** 2) + Math.sin(a) ** 2; eq = '9.2';
    } else {
      ratio = Math.cos(a) ** 2 + (1 - B) * Math.sin(a) * Math.cos(a) / 2 + B ** 2 * Math.sin(a) ** 2; eq = '9.1';
    }
  }
  return [cm * ratio, { option: 'OPTION_2', equation: eq, B, alpha_deg: alphaDeg, ratio, plane: String(plane).toUpperCase() }];
}
