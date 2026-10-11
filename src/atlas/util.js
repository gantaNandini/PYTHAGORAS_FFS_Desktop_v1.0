/** Small helpers shared by the engine modules (Python semantics preserved). */
export function num(v, d = null) {
  if (v === null || v === undefined) return d;
  const s = String(v).trim();
  if (s === '') return d;
  const x = Number(s);
  return Number.isFinite(x) ? x : d;
}
/** Python-style: str(default if v in (None,'') else v).strip().upper() */
export const up = (v, d = '') => String(v === null || v === undefined || v === '' ? d : v).trim().toUpperCase();
/** Python truthiness for numbers/strings/null. */
export const truthy = v => !(v === null || v === undefined || v === '' || v === 0 || Number.isNaN(v));
export const isNone = v => v === null || v === undefined;
/** Python format(x, 'g') approximation (6 significant digits). */
export const fmtG = x => String(Number(Number(x).toPrecision(6)));
/** Python '%.{p}g' formatting (exponent with at least 2 digits, trailing zeros trimmed). */
export function pyG(x, p = 6) {
  x = Number(x);
  if (x === 0) return '0';
  if (!Number.isFinite(x)) return String(x);
  const [m, e] = x.toExponential(p - 1).split('e');
  const exp = Number(e);
  const trim = s => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);
  if (exp < -4 || exp >= p) return `${trim(m)}e${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`;
  return trim(x.toFixed(Math.max(0, p - 1 - exp)));
}
