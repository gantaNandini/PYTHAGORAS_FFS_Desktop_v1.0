import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot, Legend } from 'recharts';
import * as O from '../model/outputs.js';

export const RESULT_TABS = [
  ['dashboard', 'Dashboard'], ['summary', 'Summary'], ['fad', 'FAD'], ['growth', 'Crack Growth'], ['sif', 'SIF vs size'],
  ['material', 'Material & Toughness'], ['residual', 'Residual Stress'], ['trace', 'Calculation Trace'], ['checklist', 'Part 9 Checklist'],
  ['l3sens', 'L3 Sensitivity'], ['l3md', 'L3 Method D'],
];

const num = (v, d = 6) => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (!Number.isFinite(v)) return String(v);
  if (Number.isInteger(v) && Math.abs(v) >= 1000) return v.toLocaleString('en-US');
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e7)) return v.toExponential(4);
  return String(Number(v.toPrecision(d)));
};
const ok = s => /^(PASS|ACCEPTABLE|APPLIED)/.test(String(s));
const bad = s => /NOT ACCEPT|FAIL|ERROR/.test(String(s));

function Table({ cols, rows, small, maxHeight }) {
  return (
    <div className="tbl-wrap" style={maxHeight ? { maxHeight } : undefined}>
      <table className={`tbl${small ? ' small' : ''}`}>
        <thead><tr>{cols.map(c => <th key={c.key || c.label}>{c.label}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}>{cols.map(c => {
            const v = c.get ? c.get(r) : r[c.key];
            const cls = c.status ? (bad(v) ? 'st-bad' : ok(v) ? 'st-ok' : 'st-warn') : c.num ? 'mono r' : '';
            return <td key={c.key || c.label} className={cls}>{c.render ? c.render(v, r) : c.num ? num(v, c.d) : v ?? ''}</td>;
          })}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function KV({ rows, title }) {
  return (
    <div className="kv">
      {title && <div className="kv-title">{title}</div>}
      <table className="tbl small"><tbody>{rows.map((r, i) => <tr key={i}><td className="kv-k">{r.k}</td><td className="mono">{num(r.v, 8)}</td><td className="dim">{r.u}</td></tr>)}</tbody></table>
    </div>
  );
}

function Dashboard({ res, l3, project, l3Busy }) {
  const d = O.dashboard(res, l3, project);
  const Item = ({ r }) => <tr><td className="kv-k">{r.label}</td><td className="mono r">{num(r.value, 8)}</td><td className="dim">{r.unit}</td></tr>;
  const ps = O.plainSummary(res, l3);
  return (
    <div>
      <div className={`plain ${ps.ok ? 'ok' : 'bad'}`}>
        <div className="plain-head"><span className="plain-verdict">{ps.ok ? '✔' : '✖'} {ps.headline}</span><span className="plain-title">The result in plain words</span></div>
        {ps.lines.map((l, i) => <p key={i} className={l.ok ? '' : 'plain-bad'}>{l.text}</p>)}
      </div>
      <div className="dash-banner">{d.banner}</div>
      {d.info && <div className="dash-info">{d.info}</div>}
      <div className="tiles">{d.tiles.map(t => (
        <div key={t.title} className={`tile ${t.ok ? 'ok' : 'bad'}`}><div className="tile-t">{t.title}</div><div className="tile-v" data-testid={`tile-${t.title.split(' ')[0]}`}>{t.value}</div></div>
      ))}</div>
      <div className="two-col">
        <div><div className="kv-title">INITIAL ASSESSMENT POINT (STEPs 6-12)</div><table className="tbl small"><tbody>{d.left.map(r => <Item key={r.label} r={r} />)}</tbody></table></div>
        <div><div className="kv-title">LIMITING FLAW SIZE AND CRACK GROWTH</div><table className="tbl small"><tbody>{d.right.map(r => <Item key={r.label} r={r} />)}</tbody></table></div>
      </div>
      <div className="kv-title" style={{ marginTop: 14 }}>INPUT SNAPSHOT</div>
      <div className="snap">{d.snapshot.map(([k, v, u]) => <div key={k}><span className="kv-k">{k}</span><span className="mono">{num(v, 6)}</span><span className="dim"> {u}</span></div>)}</div>
      <div className="kv-title" style={{ marginTop: 14 }}>WARNINGS / ENGINEERING NOTES</div>
      {d.warnings.map((w, i) => <div key={i} className="note-warn">{w}</div>)}
      <div className="kv-title" style={{ marginTop: 14 }}>LEVEL 3 ASSESSMENT (9.4.4)</div>
      {l3Busy && <div className="dim">Computing Level 3 (17 sensitivity cases + Method D)…</div>}
      {!l3Busy && !d.l3Lines.length && <div className="dim">{l3 && l3.error ? `Level 3 could not run: ${l3.error}` : 'Level 3 not selected (sheet 9_Level3).'}</div>}
      {d.l3Lines.map(l => <div key={l.label} className="l3line"><b>{l.label}</b><span className={l.ok ? 'st-ok pill-s' : 'st-bad pill-s'}>{l.text}</span></div>)}
    </div>
  );
}

function FadView({ res }) {
  const ini = res.initial, s = res.summary, lmax = ini.Lr_max;
  const fad = O.fadXY(lmax).full;
  const loc = O.thin(res.history, 400).map(h => ({ x: h.Lr, y: h.Kr }));
  return (
    <div>
      <div className="chart-box chart-square">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart margin={{ top: 10, right: 24, left: 8, bottom: 26 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="4 3" />
            <XAxis dataKey="x" type="number" domain={[0, Math.max(lmax * 1.1, 0.5)]} tick={{ fontSize: 11, fill: 'var(--muted)' }} label={{ value: 'Load ratio, Lr', position: 'insideBottom', offset: -14, fontSize: 11, fill: 'var(--muted)' }} />
            <YAxis type="number" domain={[0, 1.2]} tick={{ fontSize: 11, fill: 'var(--muted)' }} label={{ value: 'Toughness ratio, Kr', angle: -90, position: 'insideLeft', fontSize: 11, fill: 'var(--muted)' }} />
            <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', fontSize: 11 }} formatter={v => Number(v).toFixed(4)} labelFormatter={v => `Lr = ${Number(v).toFixed(4)}`} />
            <Legend verticalAlign="top" height={50} />
            <Line data={fad} dataKey="y" name={`Level 2 FAD (Eq. 9.22), Lr(max) = ${lmax.toFixed(3)}`} stroke="var(--brand)" strokeWidth={2.4} dot={false} isAnimationActive={false} />
            <Line data={loc} dataKey="y" name="Assessment locus (crack growth)" stroke="var(--orange)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <ReferenceDot x={ini.Lr} y={ini.Kr} r={6} fill="var(--green)" stroke="#fff" />
            <ReferenceDot x={s.final_Lr} y={s.final_Kr} r={6} fill="var(--red)" stroke="#fff" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="dim" style={{ marginTop: 8 }}>● Initial (Lr {ini.Lr.toFixed(4)}, Kr {ini.Kr.toFixed(4)}) &nbsp; ● Limiting (Lr {s.final_Lr.toFixed(4)}, Kr {s.final_Kr.toFixed(4)})</div>
    </div>
  );
}

function colsOf(defs, sys, extra) {
  return defs.map(([key, lbl, kind]) => ({ key, label: kind && kind !== 'none' ? `${lbl} (${O.unitOf(kind, sys)})` : lbl, num: key !== 'status', status: key === 'status',
    get: r => O.cv(r[key], kind, sys), d: key === 'cycles' ? 9 : 6, ...(extra || {}) }));
}

export default function ResultsView({ tab, res, l3, l3Busy, project }) {
  const sys = res.case.system;
  if (tab === 'dashboard') return <Dashboard res={res} l3={l3} project={project.project} l3Busy={l3Busy} />;
  if (tab === 'summary') return <Table small cols={[{ key: 'q', label: 'Quantity' }, { key: 'value', label: 'Value', num: true, d: 8 }, { key: 'unit', label: 'Unit' }, { key: 'comment', label: 'Comment' }]} rows={O.summaryRows(res)} />;
  if (tab === 'fad') return <FadView res={res} />;
  if (tab === 'growth') {
    const all = res.history, rows = O.thin(all, 400);
    return (<><div className="dim" style={{ marginBottom: 6 }}>{all.length.toLocaleString('en-US')} integration steps{all.length > rows.length ? ` — showing ${rows.length} (full history in the Excel / CSV export)` : ''}. {res.case.load_type === 'VARIABLE' ? 'Variable load: Kmax = envelope over blocks, dK = cycle-weighted equivalent, R = max over blocks.' : ''}</div>
      <Table small maxHeight={520} cols={colsOf(O.histCols(res), sys)} rows={rows} /></>);
  }
  if (tab === 'sif') return <Table small maxHeight={560} cols={colsOf(O.sifCols(res), sys)} rows={res.sif} />;
  if (tab === 'material') {
    const m = O.materialToughness(res);
    return (<div><KV title="MATERIAL RECORD (ATLAS material database)" rows={m.rec} /><KV title="TOUGHNESS ROUTE TRACE" rows={m.tough} />
      <KV title="CRACK GROWTH MODEL" rows={m.growth} />{m.sets.map(s => <KV key={s.key} title={`Parameter set [${s.key}]`} rows={s.rows} />)}</div>);
  }
  if (tab === 'residual') {
    const r = O.residualInfo(res);
    return (<div><KV title="ANNEX 9D RESIDUAL STRESS" rows={r.rows} />
      {r.profile && <Table small maxHeight={320} cols={[{ key: 'x', label: `x (${O.unitOf('length', sys)})`, num: true }, { key: 's', label: `sigma(x) (${O.unitOf('stress', sys)})`, num: true }]} rows={r.profile} />}</div>);
  }
  if (tab === 'trace') return <Table small cols={[{ key: 'ref', label: 'API reference' }, { key: 'q', label: 'Quantity' }, { key: 'value', label: 'Value', num: true, d: 8 }, { key: 'unit', label: 'Unit' }, { key: 'basis', label: 'Basis / source' }]} rows={O.traceRows(res)} />;
  if (tab === 'checklist') return <Table cols={[{ key: 'paragraph', label: 'Paragraph' }, { key: 'requirement', label: 'Requirement' }, { key: 'status', label: 'Status', status: true }, { key: 'impl', label: 'ATLAS implementation' }]} rows={O.checklistRows(res, l3)} />;
  if (tab === 'l3sens') {
    if (l3Busy) return <div className="dim">Computing Level 3…</div>;
    const rows = O.sensitivityRows(l3, sys, res);
    if (!rows) return <div className="dim">{l3 && l3.error ? `Level 3 could not run: ${l3.error}` : 'Method A sensitivity analysis is not selected (sheet 9_Level3).'}</div>;
    const lu = O.unitOf('length', sys);
    return (<><div className="kv-title">{l3.sensitivity.verdict}</div><Table small cols={[
      { key: 'tag', label: 'Case' }, { key: 'change', label: 'Change' }, { key: 'factor', label: 'Factor', num: true, d: 4 },
      { label: 'Initial FAD', status: true, get: r => (r.m ? r.m.initial_status : 'ERROR') }, { label: 'FAD margin', num: true, get: r => r.m && r.m.initial_margin },
      { label: 'Lr', num: true, get: r => r.m && r.m.initial_Lr }, { label: 'Kr', num: true, get: r => r.m && r.m.initial_Kr },
      { label: `Limiting ${O.geoOf(res).total || O.geoOf(res).size} (${lu})`, num: true, get: r => r.twoC }, { label: 'Life (cycles)', num: true, get: r => r.m && r.m.life, d: 9 },
      { label: 'Life change', get: r => (r.lifeChange === null ? '' : `${(r.lifeChange * 100).toFixed(1)} %`) },
      { label: 'Life status', status: true, get: r => (r.m ? r.m.life_status : r.err) }, { label: 'Note', get: r => (r.m ? r.m.stop : r.err) }]} rows={rows} /></>);
  }
  if (tab === 'l3md') {
    if (l3Busy) return <div className="dim">Computing Level 3…</div>;
    const M = l3 && !l3.error ? l3.method_d : null;
    if (!M) return <div className="dim">{l3 && l3.error ? `Level 3 could not run: ${l3.error}` : 'Method D ductile tearing is not selected (sheet 9_Level3).'}</div>;
    const lu = O.unitOf('length', sys), ku = O.unitOf('K', sys), ju = sys === 'SI' ? 'kJ/m²' : 'in-lb/in²';
    const kv = [{ k: 'Outcome (Figure 9.20(b))', v: M.outcome, u: '' }, { k: 'J-R source', v: M.jr.source, u: '' }, { k: 'J-R equation', v: M.jr.equation, u: '' },
      ...(M.jr.record ? [{ k: 'Table record', v: `${M.jr.record} (${M.jr.table})`, u: '' }] : []), { k: 'E used', v: O.cv(M.E, 'stress', sys), u: O.unitOf('stress', sys) }, { k: 'Poisson ratio', v: M.nu, u: '' },
      { k: 'Maximum tearing extension', v: O.cv(M.da_max, 'length', sys), u: lu }, { k: 'Load factor at tearing instability', v: M.F_instability, u: M.F_capped ? '(search limit)' : '' },
      { k: 'Tearing at instability point', v: O.cv(M.da_at_instability, 'length', sys), u: lu }, { k: 'Load factor with Level 2 single Kmat', v: M.F_level2_single_Kmat, u: '' },
      { k: 'Level 2 Kmat', v: O.cv(M.Kmat_level2, 'K', sys), u: ku }];
    return (<div><KV rows={kv} />{M.warnings.map((w, i) => <div key={i} className="note-warn">{w}</div>)}
      <Table small maxHeight={420} cols={[{ label: `da (${lu})`, num: true, get: r => O.cv(r.da, 'length', sys) }, { label: `c (${lu})`, num: true, get: r => O.cv(r.c, 'length', sys) },
        { label: `J_R (${ju})`, num: true, get: r => O.cv(r.J, 'J', sys) }, { label: `K_J (${ku})`, num: true, get: r => O.cv(r.K, 'K', sys) }, { key: 'Lr', label: 'Lr', num: true },
        { key: 'Kr', label: 'Kr', num: true }, { key: 'allow', label: 'Kr allow', num: true }, { label: 'Inside FAD', get: r => (r.inside ? 'YES' : 'NO'), status: true }, { key: 'F', label: 'Load factor', num: true }]} rows={M.points} /></div>);
  }
  return null;
}
