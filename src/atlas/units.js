/** units.js — port of atlas_part9/units.py. Engine units: mm, MPa, MPa√m, °C, kJ/m², J, mm/cycle. */
export const IN_TO_MM = 25.4;
export const KSI_TO_MPA = 6.894757293168361;
export const KSIRIN_TO_MPARM = KSI_TO_MPA * Math.sqrt(0.0254);
export const INLB_IN2_TO_KJ_M2 = 0.1751268;
export const FTLB_TO_J = 1.3558179483314004;

// kind -> [toSI, fromSI, SI label, FPS label]
export const KINDS = {
  length: [x => x * IN_TO_MM, x => x / IN_TO_MM, 'mm', 'in'],
  stress: [x => x * KSI_TO_MPA, x => x / KSI_TO_MPA, 'MPa', 'ksi'],
  K: [x => x * KSIRIN_TO_MPARM, x => x / KSIRIN_TO_MPARM, 'MPa√m', 'ksi√in'],
  Krate: [x => x * KSIRIN_TO_MPARM, x => x / KSIRIN_TO_MPARM, 'MPa√m/s', 'ksi√in/s'],
  temp: [x => (x - 32.0) / 1.8, x => x * 1.8 + 32.0, '°C', '°F'],
  dtemp: [x => x / 1.8, x => x * 1.8, '°C', '°F'],
  J: [x => x * INLB_IN2_TO_KJ_M2, x => x / INLB_IN2_TO_KJ_M2, 'kJ/m²', 'in-lb/in²'],
  energy: [x => x * FTLB_TO_J, x => x / FTLB_TO_J, 'J', 'ft-lb'],
  rate: [x => x * IN_TO_MM, x => x / IN_TO_MM, 'mm/cycle', 'in/cycle'],
  none: [x => x, x => x, '-', '-'],
};

export function toSI(value, kind, system) {
  if (value === null || value === undefined || system === 'SI' || !(kind in KINDS)) return value;
  return KINDS[kind][0](Number(value));
}
export function fromSI(value, kind, system) {
  if (value === null || value === undefined || system === 'SI' || !(kind in KINDS) || typeof value === 'string') return value;
  return KINDS[kind][1](Number(value));
}
export function label(kind, system) {
  const k = KINDS[kind] || KINDS.none;
  return system === 'SI' ? k[2] : k[3];
}
export const parisCusToSI = (C, n) => C * IN_TO_MM / Math.pow(KSIRIN_TO_MPARM, n);
export const parisCsiToUS = (C, n) => C / IN_TO_MM * Math.pow(KSIRIN_TO_MPARM, n);
export const jrCusToSI = (C, n) => C * INLB_IN2_TO_KJ_M2 / Math.pow(IN_TO_MM, n);
export const jrCsiToUS = (C, n) => C / INLB_IN2_TO_KJ_M2 * Math.pow(IN_TO_MM, n);
