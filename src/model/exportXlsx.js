/** Results workbook (mirrors the ATLAS output workbook sheets) written with SheetJS, in the selected unit system. */
import * as XLSX from 'xlsx';
import * as O from './outputs.js';
import SC from '../atlas/schema.generated.js';
import { fieldOf, fieldsFor } from '../atlas/case.js';
import { unitFor } from './fieldinfo.js';
import { label } from '../atlas/units.js';

const sheet = (rows, widths) => {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (widths) ws['!cols'] = widths.map(w => ({ wch: w }));
  return ws;
};

export function buildResultsWorkbook(project, res, l3, appVersion = '') {
  const sys = res.case.system, wb = XLSX.utils.book_new();
  const d = O.dashboard(res, l3, project.project);
  const dash = [[d.banner], [d.info], [`PYTHAGORAS FFS ${appVersion} · generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`], [],
    d.tiles.map(t => t.title), d.tiles.map(t => t.value), [], ['INITIAL ASSESSMENT POINT (STEPs 6-12)', '', '', '', 'LIMITING FLAW SIZE AND CRACK GROWTH']];
  const n = Math.max(d.left.length, d.right.length);
  for (let i = 0; i < n; i++) {
    const a = d.left[i], b = d.right[i];
    dash.push([a ? a.label : '', a ? a.value : '', a ? a.unit : '', '', b ? b.label : '', b ? b.value : '', b ? b.unit : '']);
  }
  dash.push([], ['INPUT SNAPSHOT'], ...d.snapshot.map(r => [r[0], r[1], r[2]]), [], ['WARNINGS / ENGINEERING NOTES'], ...d.warnings.map(w => [w]));
  if (d.l3Lines.length) dash.push([], ['LEVEL 3 ASSESSMENT (9.4.4)'], ...d.l3Lines.map(l => [l.label, l.text]));
  XLSX.utils.book_append_sheet(wb, sheet(dash, [40, 22, 12, 4, 40, 22, 12]), 'Dashboard');
  XLSX.utils.book_append_sheet(wb, sheet([[`RESULT SUMMARY (${sys} UNITS)`], [], ['Quantity', 'Value', 'Unit', 'Comment'], ...O.summaryRows(res).map(r => [r.q, r.value, r.unit, r.comment])], [46, 20, 12, 64]), 'Summary');
  const fad = O.fadXY(res.initial.Lr_max).full;
  const loc = O.thin(res.history, 300);
  const fadRows = [['LEVEL 2 FAILURE ASSESSMENT DIAGRAM (Figure 9.19, Eq. 9.22)'], [], ['FAD Lr', 'FAD Kr', '', 'Locus Lr', 'Locus Kr', `Locus c (${label('length', sys)})`, '', 'Point', 'Lr', 'Kr']];
  for (let i = 0; i < Math.max(fad.length, loc.length); i++) {
    const f = fad[i], l = loc[i];
    fadRows.push([f ? f.x : '', f ? f.y : '', '', l ? l.Lr : '', l ? l.Kr : '', l ? O.cv(l.c, 'length', sys) : '', '',
      i === 0 ? 'Initial' : i === 1 ? 'Final / limiting' : '', i === 0 ? res.initial.Lr : i === 1 ? res.summary.final_Lr : '', i === 0 ? res.initial.Kr : i === 1 ? res.summary.final_Kr : '']);
  }
  XLSX.utils.book_append_sheet(wb, sheet(fadRows, [10, 10, 3, 10, 10, 14, 3, 18, 10, 10]), 'FAD');
  const histHdr = O.histCols(res).map(([, l, k]) => (k !== 'none' ? `${l} (${O.unitOf(k, sys)})` : l));
  XLSX.utils.book_append_sheet(wb, sheet([[`SUB-CRITICAL CRACK GROWTH HISTORY (9.5.1) - ${res.growth.model_id} / ${res.growth.equation}`], [`${res.history.length} integration steps (full history)`], histHdr,
    ...res.history.map(r => O.histCols(res).map(([k, , kind]) => O.cv(r[k], kind, sys)))], O.histCols(res).map(() => 13)), 'Crack_Growth');
  const sifHdr = O.sifCols(res).map(([, l, k]) => (k !== 'none' ? `${l} (${O.unitOf(k, sys)})` : l));
  XLSX.utils.book_append_sheet(wb, sheet([[`${O.geoOf(res).gid} STRESS INTENSITY AND FAD PARAMETERS vs CRACK SIZE (at maximum load)`], [], sifHdr,
    ...res.sif.map(r => O.sifCols(res).map(([k, , kind]) => O.cv(r[k], kind, sys)))], O.sifCols(res).map(() => 13)), 'SIF_vs_c');
  const mt = O.materialToughness(res);
  const kv = (title, rows) => [[title], ...rows.map(r => [r.k, r.v, r.u]), []];
  XLSX.utils.book_append_sheet(wb, sheet([['MATERIAL, TOUGHNESS (ANNEX 9F.4) AND GROWTH MODEL (ANNEX 9F.5)'], [], ...kv('MATERIAL RECORD', mt.rec), ...kv('TOUGHNESS ROUTE TRACE', mt.tough),
    ...kv('CRACK GROWTH MODEL', mt.growth), ...mt.sets.flatMap(s => kv(`Parameter set [${s.key}]`, s.rows))], [42, 60, 14]), 'Material_Toughness');
  const rs = O.residualInfo(res);
  XLSX.utils.book_append_sheet(wb, sheet([['ANNEX 9D RESIDUAL STRESS'], [], ...rs.rows.map(r => [r.k, r.v, r.u]), [], ...(rs.profile ? [[`x (${O.unitOf('length', sys)})`, `sigma(x) (${O.unitOf('stress', sys)})`], ...rs.profile.map(p => [p.x, p.s])] : [])], [40, 50, 12]), 'Residual_Stress');
  XLSX.utils.book_append_sheet(wb, sheet([['CALCULATION TRACE - PART 9 LEVEL 2 PROCEDURE'], [], ['API reference', 'Quantity', 'Value', 'Unit', 'Basis / source'], ...O.traceRows(res).map(r => [r.ref, r.q, r.value, r.unit, r.basis])], [20, 46, 22, 12, 60]), 'Calculation_Trace');
  XLSX.utils.book_append_sheet(wb, sheet([['PART 9 COMPLIANCE CHECKLIST AND DOCUMENTATION (paragraphs 9.2, 9.4.3, 9.5, 9.8)'], [], ['Paragraph', 'Requirement', 'Status', 'Implementation'], ...O.checklistRows(res, l3).map(r => [r.paragraph, r.requirement, r.status, r.impl])], [26, 64, 20, 60]), 'Part9_Checklist');
  const sr = O.sensitivityRows(l3, sys, res);
  if (sr) {
    XLSX.utils.book_append_sheet(wb, sheet([['LEVEL 3 METHOD A - SENSITIVITY ANALYSIS (9.4.4.2)'], [l3.sensitivity.verdict],
      ['Case', 'Change', 'Factor', 'Initial FAD', 'FAD margin', 'Lr', 'Kr', `Limiting ${O.geoOf(res).total || O.geoOf(res).size} (${label('length', sys)})`, 'Life (cycles)', 'Life change', 'Life status', 'Note'],
      ...sr.map(r => [r.tag, r.change, r.factor, r.m ? r.m.initial_status : 'ERROR', r.m ? r.m.initial_margin : '', r.m ? r.m.initial_Lr : '', r.m ? r.m.initial_Kr : '', r.twoC ?? '',
        r.m ? r.m.life : '', r.lifeChange === null ? '' : r.lifeChange, r.m ? r.m.life_status : '', r.m ? r.m.stop : r.err])], [34, 12, 9, 11, 11, 9, 9, 15, 15, 12, 30, 30]), 'L3_Sensitivity');
  }
  if (l3 && !l3.error && l3.method_d) {
    const M = l3.method_d, lu = label('length', sys), ku = label('K', sys);
    XLSX.utils.book_append_sheet(wb, sheet([['LEVEL 3 METHOD D - DUCTILE TEARING ANALYSIS'], ['Outcome (Figure 9.20(b))', M.outcome], ['J-R source', M.jr.source], ['J-R equation', M.jr.equation],
      ['Load factor at tearing instability', M.F_instability], ['Load factor with Level 2 single Kmat', M.F_level2_single_Kmat], [],
      [`da (${lu})`, `c (${lu})`, `J_R (${sys === 'SI' ? 'kJ/m2' : 'in-lb/in2'})`, `K_J (${ku})`, 'Lr', 'Kr', 'Kr allow', 'Inside FAD', 'Load factor'],
      ...M.points.map(p => [O.cv(p.da, 'length', sys), O.cv(p.c, 'length', sys), O.cv(p.J, 'J', sys), O.cv(p.K, 'K', sys), p.Lr, p.Kr, p.allow, p.inside ? 'YES' : 'NO', p.F])], [14, 14, 14, 14, 10, 10, 10, 11, 12]), 'L3_Method_D');
  }
  // all inputs as entered (so the report is self-contained)
  const inp = [[`INPUTS AS ENTERED (${sys} units, load type ${project.loadType})`], [], ['Sheet', 'Parameter', 'Value', 'Unit']];
  fieldsFor(project.geometry).forEach(f => { const v = project.raw[f.name]; if (v !== null && v !== undefined && v !== '') inp.push([f.sheet, f.label, v, unitFor(f, sys)]); });
  if (project.loadType === 'VARIABLE') { inp.push([], ['7_Load_History', 'Block', 'Min scale', 'Max scale', 'Cycles']); project.history.forEach(r => inp.push(['', r.name, r.lo, r.hi, r.cycles])); }
  if (project.geometry === 'KPSCL' && (project.profile || []).length) {
    inp.push([], ['5B_Stress_Profile', `x (${label('length', sys)})`, `Primary (${label('stress', sys)})`, `Secondary (${label('stress', sys)})`, `Residual (${label('stress', sys)})`]);
    project.profile.forEach(r => inp.push(['', r.x, r.p, r.s, r.r]));
  }
  XLSX.utils.book_append_sheet(wb, sheet(inp, [20, 52, 22, 20, 20]), 'Inputs');
  return wb;
}

export function workbookBytes(wb) { return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }); }

export function downloadBytes(bytes, name, type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 150);
}

export function historyCsv(res, project) {
  const sys = res.case.system;
  const hdr = O.histCols(res).map(([, l, k]) => (k !== 'none' ? `${l} [${O.unitOf(k, sys)}]` : l)).join(',');
  const rows = res.history.map(r => O.histCols(res).map(([k, , kind]) => { const v = O.cv(r[k], kind, sys); return v === null || v === undefined ? '' : v; }).join(','));
  return [`# PYTHAGORAS FFS - ${O.geoOf(res).gid} crack growth history (${sys})`, `# ${(project.project && project.project.project) || ''}`, hdr, ...rows].join('\n');
}
