/**
 * Read an ATLAS KPTC input workbook (KPTC_Constant_Input.xlsx / KPTC_Variable_Input.xlsx) through its named cells and
 * return a project state. Mirrors atlas_part9/inputs.py: cached values are used, and unit-switch template formulas
 * =IF(UNIT_SYSTEM="SI",a,b) are evaluated when a workbook was saved without cached results.
 */
import * as XLSX from 'xlsx';
import SC from './schema.generated.js';
import { num } from './util.js';
import { defaultRaw, fieldsFor } from './case.js';

const SWITCH = /^IF\(UNIT_SYSTEM="SI",(.+?),(.+)\)$/;

function rangeCells(wb, names, name) {
  const dn = names.find(n => n.Name === name);
  if (!dn || !dn.Ref) return null;
  const m = /^'?([^'!]+)'?!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/.exec(dn.Ref);
  if (!m) return null;
  const ws = wb.Sheets[m[1]];
  if (!ws) return null;
  const c1 = XLSX.utils.decode_col(m[2]), r1 = Number(m[3]) - 1;
  const c2 = m[4] ? XLSX.utils.decode_col(m[4]) : c1, r2 = m[5] ? Number(m[5]) - 1 : r1;
  const rows = [];
  for (let r = r1; r <= r2; r++) {
    const row = [];
    for (let c = c1; c <= c2; c++) row.push(ws[XLSX.utils.encode_cell({ r, c })] || null);
    rows.push(row);
  }
  return { rows, single: !m[4] };
}

function cellValue(cell, system) {
  if (!cell) return null;
  let v = cell.t === 'z' ? undefined : cell.v;       // 'z' = stub: a formula with no cached value (SheetJS puts a placeholder 0 in v)
  if ((v === undefined || v === null) && typeof cell.f === 'string') {
    const m = SWITCH.exec(cell.f.replace(/ /g, ''));
    if (m) { const t = (system === 'SI' ? m[1] : m[2]).replace(/^"|"$/g, ''); return num(t) !== null ? num(t) : t; }
    return null;
  }
  if (typeof v === 'string') { v = v.trim(); if (v === '') return null; }
  return v === undefined ? null : v;
}

export function importWorkbook(data) {
  const wb = XLSX.read(data, { type: 'array', cellFormula: true, sheetStubs: true });
  const names = (wb.Workbook && wb.Workbook.Names) || [];
  const one = n => { const r = rangeCells(wb, names, n); return r ? r.rows[0][0] : null; };
  if (!names.some(n => n.Name === 'UNIT_SYSTEM')) throw new Error('This is not an ATLAS input workbook (named cell UNIT_SYSTEM not found).');
  const system = String(cellValue(one('UNIT_SYSTEM'), 'SI') || 'SI').trim().toUpperCase();
  const loadType = String(cellValue(one('LOAD_TYPE'), system) || 'CONSTANT').trim().toUpperCase();
  if (system !== 'SI' && system !== 'FPS') throw new Error('Unit System (Cover sheet) must be SI or FPS');
  const gv = names.some(n => n.Name === 'GEOMETRY') ? cellValue(one('GEOMETRY'), system) : null;
  const geometry = String(gv || 'KPTC').trim().toUpperCase();
  if (!SC.geometries.includes(geometry)) throw new Error('GEOMETRY must be KPTC or KPSCL');
  const raw = defaultRaw(system, geometry);
  const missing = [];
  for (const f of fieldsFor(geometry)) {
    const cell = one('in_' + f.name);
    if (cell === null && !names.some(n => n.Name === 'in_' + f.name)) { missing.push(f.name); continue; }
    raw[f.name] = cellValue(cell, system);
  }
  const tests = [];
  const tr = rangeCells(wb, names, 'in_tests');
  if (tr) tr.rows.forEach(r => { const v = cellValue(r[0], system); tests.push(num(v) !== null ? num(v) : null); });
  while (tests.length < SC.nTests) tests.push(null);
  const history = [];
  const hr = rangeCells(wb, names, 'in_history');
  if (hr) {
    hr.rows.forEach(r => {
      const vals = r.map(c => cellValue(c, system));
      if (vals[0] !== null && vals[0] !== '' && num(vals[3]) !== null) history.push({ name: String(vals[0]), lo: Number(vals[1]), hi: Number(vals[2]), cycles: Number(vals[3]) });
    });
  }
  const profile = [];
  if (geometry === 'KPSCL') {
    const pr = rangeCells(wb, names, 'in_profile');
    if (pr) {
      pr.rows.slice(0, SC.nProf).forEach(r => {
        const v = r.map(c => cellValue(c, system));
        if (num(v[0]) === null) return;
        const n = k => (num(v[k]) !== null ? num(v[k]) : null);
        profile.push({ x: num(v[0]), p: n(1), s: n(2), r: n(3) });
      });
    }
  }
  const project = {};
  SC.projectFields.forEach(([k]) => { const c = one('prj_' + k); const v = cellValue(c, system); project[k] = v === null ? '' : String(v); });
  return { system, loadType, geometry, profile, raw, history: history.length ? history : [], tests, project, missingFields: missing };
}
