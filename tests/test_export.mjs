import { newProject } from '../src/model/project.js';
import { buildCase, run, assess } from '../src/atlas/index.js';
import { buildResultsWorkbook, workbookBytes } from '../src/model/exportXlsx.js';
import * as XLSX from 'xlsx';
const p = newProject('FPS', 'VARIABLE'); const c = buildCase(p); const res = run(c); const l3 = assess(c, res);
const wb = buildResultsWorkbook(p, res, l3, '1.0');
const bytes = workbookBytes(wb);
const back = XLSX.read(bytes, { type: 'array' });
console.log('sheets:', back.SheetNames.join(', '), '| bytes', bytes.byteLength);
const ws = back.Sheets.Crack_Growth; console.log('growth rows', XLSX.utils.sheet_to_json(ws, { header: 1 }).length, '| header', XLSX.utils.sheet_to_json(ws, { header: 1 })[2].slice(0, 4).join(' | '));
console.log('Summary life row:', XLSX.utils.sheet_to_json(back.Sheets.Summary, { header: 1 }).find(r => r[0] === 'Calculated remaining life').slice(0, 3).join(' | '));

// ---- derived rows (calc.js): blank test cells must not be counted
import { derive } from '../src/model/calc.js';
{
  const q = newProject('SI', 'CONSTANT');
  q.raw.method = 'PROJECT_TEST_SET'; q.tests[0] = 90; q.tests[1] = 100; q.tests[2] = 110;
  const d = derive(q);
  const okT = d.t_n === 3 && d.t_equiv === 90 && d.t_scatter === 'OK';
  console.log((okT ? 'PASS' : 'FAIL') + ' derived test-set rows (n=3, minimum 90, scatter OK)', d.t_n, d.t_equiv, d.t_scatter);
  if (!okT) process.exit(1);
}
