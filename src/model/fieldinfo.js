/** Pure helpers about input fields (no React): numeric or text, and the unit text shown next to each input. */
import SC from '../atlas/schema.generated.js';
import { label as unitLabel } from '../atlas/units.js';
import { UNIT_TEXT } from './layout.js';

export function isNumericField(f) {
  if (f.kind !== 'none') return true;
  if (f.list && !SC.suggest.includes(f.list)) return false;
  if (f.list === 'SPEC_TEXT') return false;
  return typeof f.si === 'number' || f.si === null;
}

export function unitFor(f, system) {
  if (UNIT_TEXT[f.name]) return UNIT_TEXT[f.name];
  if (f.kind === 'rate_C') return unitLabel('rate', system);
  if (f.kind === 'jrC') return system === 'SI' ? 'kJ/m² per mmⁿ' : 'in-lb/in² per inⁿ';
  if (f.kind === 'raw') return unitLabel('K', system);
  if (f.kind === 'none') return '-';
  return unitLabel(f.kind, system);
}
