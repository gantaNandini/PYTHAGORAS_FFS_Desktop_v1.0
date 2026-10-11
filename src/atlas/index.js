import { run } from './solver.js';
import { assess } from './level3.js';
import { buildCase } from './case.js';
export { run, assess, buildCase };
export * from './units.js';
export { default as SC } from './schema.generated.js';
export { default as DB } from './data.generated.js';
export { FIELD, GEOMETRIES, fieldsFor, fieldOf, fieldMap, defaultProfile, defaultRaw, defaultValue, defaultHistory, plausibility } from './case.js';

/** Level 2 + crack growth for a UI state (throws on invalid input). */
export function runState(state) {
  const caseIn = buildCase(state);
  return { caseIn, res: run(caseIn) };
}
