import React, { useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import SC from '../atlas/schema.generated.js';
import Dialog from '../desktop/Dialog.jsx';
import { NumInput } from './Fields.jsx';
import { num } from '../atlas/util.js';

const MAXB = SC.nHist;

export function historyErrors(h) {
  const rows = h.map(r => {
    const e = {};
    if (!String(r.name ?? '').trim()) e.name = 'Name required';
    if (!Number.isFinite(r.lo) || r.lo < 0) e.lo = 'Must be ≥ 0';
    if (!Number.isFinite(r.hi) || r.hi <= 0) e.hi = 'Must be > 0';
    else if (Number.isFinite(r.lo) && r.lo > r.hi) e.lo = 'Must be ≤ max scale';
    if (!Number.isFinite(r.cycles) || r.cycles < 1) e.cycles = 'Must be ≥ 1';
    return e;
  });
  const names = h.map(r => String(r.name ?? '').trim().toLowerCase());
  names.forEach((n, i) => { if (n && names.indexOf(n) !== i) rows[i].name = rows[i].name || 'Duplicate name'; });
  const bad = rows.filter(r => Object.keys(r).length).length;
  return { rows, general: !h.length ? 'Add at least one block.' : bad ? `${bad} block${bad > 1 ? 's have' : ' has'} invalid values.` : null };
}

function parseText(text) {
  const rows = [], problems = [];
  text.split(/\r?\n/).forEach((line, idx) => {
    const l = line.trim(); if (!l) return;
    const cols = l.split(/\t|,|;/).map(c => c.trim());
    const n = cols.map(c => (c === '' ? NaN : Number(c)));
    let name, a, b, c;
    if (cols.length >= 4) [name, a, b, c] = [cols[0], n[1], n[2], n[3]];
    else if (cols.length === 3) [name, a, b, c] = [String.fromCharCode(65 + (rows.length % 26)), n[0], n[1], n[2]];
    else { problems.push(`Line ${idx + 1}: expected 3 or 4 columns`); return; }
    if ([a, b, c].some(Number.isNaN)) { if (rows.length === 0 && idx === 0) return; problems.push(`Line ${idx + 1}: min, max and cycles must be numbers`); return; }
    rows.push({ name, lo: a, hi: b, cycles: c });
  });
  return { rows, problems };
}

export default function HistoryEditor({ history, onChange }) {
  const [paste, setPaste] = useState(null);
  const fileRef = useRef(null);
  const err = historyErrors(history);
  const valid = history.filter(r => Number.isFinite(r.hi) && Number.isFinite(r.cycles));
  const total = valid.reduce((s, r) => s + (r.cycles > 0 ? r.cycles : 0), 0);
  const maxScale = valid.length ? Math.max(...valid.map(r => r.hi)) : null;
  const set = fn => onChange(fn(history));
  const update = (i, k, v) => set(h => h.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const nextName = h => { const used = new Set(h.map(r => String(r.name))); for (let i = 0; i < 26; i++) { const n = String.fromCharCode(65 + i); if (!used.has(n)) return n; } return `B${h.length + 1}`; };
  const add = () => set(h => (h.length >= MAXB ? h : [...h, { name: nextName(h), lo: 0, hi: 1, cycles: 1000 }]));
  const csv = () => ['Block,Min Scale,Max Scale,Cycles/Block', ...history.map(r => `${String(r.name).replace(/,/g, ' ')},${r.lo},${r.hi},${r.cycles}`)].join('\n');
  const apply = mode => {
    const { rows, problems } = parseText(paste.text);
    if (problems.length || !rows.length) { setPaste({ ...paste, problems: problems.length ? problems : ['No data rows found.'] }); return; }
    set(h => (mode === 'replace' ? rows : [...h, ...rows]).slice(0, MAXB)); setPaste(null);
  };
  const pts = []; let x = 0;
  history.forEach(r => { const c = Number.isFinite(r.cycles) && r.cycles > 0 ? r.cycles : 0; pts.push({ x, max: r.hi, min: r.lo, block: r.name }); x += c; pts.push({ x, max: r.hi, min: r.lo, block: r.name }); });
  const GRID = '28px minmax(90px,1.2fr) 1fr 1fr 1.1fr 70px 90px 130px';
  return (
    <div className="special">
      <div className="special-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>{history.length} of {MAXB} blocks · total {total.toLocaleString('en-US')} cycles per repeat{maxScale !== null ? ` · controlling max scale ${Number(maxScale.toPrecision(6))}` : ''}</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button className="btn" onClick={() => setPaste({ text: '', problems: [] })}>Paste / Import…</button>
          <button className="btn" onClick={() => {
            const u = URL.createObjectURL(new Blob(['\uFEFF' + csv()], { type: 'text/csv;charset=utf-8;' })); const a = document.createElement('a');
            a.href = u; a.download = 'KPTC_load_blocks.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(u); }, 100);
          }}>Export CSV</button>
          <button className="btn primary" onClick={add} disabled={history.length >= MAXB}>+ Add block</button>
        </span>
      </div>
      <div className="hist-grid hist-head" style={{ gridTemplateColumns: GRID }}>
        {['#', 'Block', 'Min scale', 'Max scale', 'Cycles / block', 'Range', 'Fraction', ''].map(h => <div key={h}>{h}</div>)}
      </div>
      {history.map((r, i) => {
        const e = err.rows[i] || {};
        const range = Number.isFinite(r.hi) && Number.isFinite(r.lo) ? r.hi - r.lo : null;
        const frac = total > 0 && Number.isFinite(r.cycles) ? r.cycles / total : null;
        return (
          <div key={i} className="hist-grid" style={{ gridTemplateColumns: GRID }}>
            <div className="mono dim">{i + 1}</div>
            <div><input className={`cell-in${e.name ? ' bad' : ''}`} aria-label={`Block ${i + 1} name`} value={r.name} title={e.name} onChange={ev => update(i, 'name', ev.target.value)} />{e.name && <small className="ferr">{e.name}</small>}</div>
            <div><NumInput value={r.lo} invalid={!!e.lo} ariaLabel={`Block ${i + 1} min scale`} onChange={v => update(i, 'lo', typeof v === 'number' ? v : NaN)} />{e.lo && <small className="ferr">{e.lo}</small>}</div>
            <div><NumInput value={r.hi} invalid={!!e.hi} ariaLabel={`Block ${i + 1} max scale`} onChange={v => update(i, 'hi', typeof v === 'number' ? v : NaN)} />{e.hi && <small className="ferr">{e.hi}</small>}</div>
            <div><NumInput value={r.cycles} invalid={!!e.cycles} ariaLabel={`Block ${i + 1} cycles`} onChange={v => update(i, 'cycles', typeof v === 'number' ? v : NaN)} />{e.cycles && <small className="ferr">{e.cycles}</small>}</div>
            <div className="calc-out mono">{range === null ? '—' : Number(range.toPrecision(6))}</div>
            <div className="calc-out mono">{frac === null ? '—' : frac.toFixed(4)}</div>
            <div className="row-actions">
              <button title="Move up" aria-label="Move up" disabled={i === 0} onClick={() => set(h => { const c = [...h]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; return c; })}>↑</button>
              <button title="Move down" aria-label="Move down" disabled={i === history.length - 1} onClick={() => set(h => { const c = [...h]; [c[i + 1], c[i]] = [c[i], c[i + 1]]; return c; })}>↓</button>
              <button title="Duplicate block" aria-label="Duplicate block" disabled={history.length >= MAXB} onClick={() => set(h => [...h.slice(0, i + 1), { ...h[i], name: nextName(h) }, ...h.slice(i + 1)])}>⧉</button>
              <button title="Delete block" aria-label="Delete block" onClick={() => set(h => h.filter((_, j) => j !== i))}>×</button>
            </div>
          </div>
        );
      })}
      {err.general && <div role="alert" className="alert-box">⚠ {err.general}</div>}
      {!err.general && (
        <div style={{ marginTop: 14 }}>
          <div className="special-sub">Load history — one repeat of the spectrum (scale factor vs cumulative cycles)</div>
          <div className="chart-square chart-square-sm">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pts} margin={{ top: 4, right: 16, left: 0, bottom: 14 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="4 3" />
              <XAxis dataKey="x" type="number" domain={[0, total || 1]} tick={{ fontSize: 10, fill: 'var(--muted)' }} tickFormatter={v => (v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v)} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} domain={[0, 'auto']} width={36} />
              <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', fontSize: 11 }} formatter={(v, n, q) => [Number(v.toPrecision(5)), `${n === 'max' ? 'Max' : 'Min'} · block ${q.payload.block}`]} />
              <Line type="stepAfter" dataKey="max" stroke="var(--orange)" strokeWidth={2} dot={false} isAnimationActive={false} name="max" />
              <Line type="stepAfter" dataKey="min" stroke="var(--teal)" strokeWidth={2} dot={false} isAnimationActive={false} name="min" />
            </LineChart>
          </ResponsiveContainer>
          </div>
        </div>
      )}
      <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return; const r = new FileReader(); r.onload = () => setPaste({ text: String(r.result).replace(/^\uFEFF/, ''), problems: [] }); r.readAsText(f); }} />
      {paste && (
        <Dialog title="Paste or import load blocks" width={560} onClose={() => setPaste(null)}
          footer={<><button className="btn" onClick={() => setPaste(null)}>Cancel</button>
            <button className="btn" disabled={!paste.text.trim()} onClick={() => apply('append')}>Append blocks</button>
            <button className="btn primary" disabled={!paste.text.trim()} onClick={() => apply('replace')}>Replace blocks</button></>}>
          <div style={{ fontSize: 12, marginBottom: 8 }}>One block per line: <b className="mono">name, min scale, max scale, cycles</b> (name optional). Paste from Excel (tab-separated) or CSV. A header line is skipped.</div>
          <textarea autoFocus aria-label="Block data" value={paste.text} onChange={e => setPaste({ text: e.target.value, problems: [] })} placeholder={'A\t0\t0.7\t500\nB\t0.07\t0.8\t300'}
            style={{ width: '100%', height: 160, fontFamily: 'var(--font-mono)', fontSize: 12, padding: 8, background: 'var(--input)', color: 'var(--ink)', border: '1px solid var(--border-light)' }} />
          <div style={{ marginTop: 8 }}><button className="btn" onClick={() => fileRef.current && fileRef.current.click()}>Choose CSV file…</button></div>
          {paste.problems.length > 0 && <ul role="alert" style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--red)' }}>{paste.problems.slice(0, 6).map(p => <li key={p}>{p}</li>)}</ul>}
        </Dialog>
      )}
    </div>
  );
}
export { num };
