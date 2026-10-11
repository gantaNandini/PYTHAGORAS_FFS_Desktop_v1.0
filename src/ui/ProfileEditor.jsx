import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import SC from '../atlas/schema.generated.js';
import Dialog from '../desktop/Dialog.jsx';
import { NumInput } from './Fields.jsx';
import { label as unitLabel } from '../atlas/units.js';
import { num } from '../atlas/util.js';

const MAXP = SC.nProf;

export function profileErrors(profile, t) {
  const rows = profile.map(r => (num(r.x) === null ? (profile.length > 1 ? { x: 'x required' } : {}) : (r.x < 0 ? { x: 'x must be ≥ 0' } : {})));
  const used = profile.filter(r => num(r.x) !== null);
  let general = null;
  if (used.length < 2) general = 'Enter at least two rows (x = 0 and x = t).';
  else {
    const xs = used.map(r => r.x);
    if (Math.min(...xs) > 1e-9) general = 'The profile must start at x = 0 (the cracked surface).';
    else if (num(t) !== null && Math.max(...xs) < t - 1e-6) general = `The profile must reach x = t (${Number(Number(t).toPrecision(6))}).`;
  }
  return { rows, general };
}

function parseText(text) {
  const rows = [], problems = [];
  text.split(/\r?\n/).forEach((line, idx) => {
    const l = line.trim(); if (!l) return;
    const cols = l.split(/\t|,|;/).map(c => c.trim());
    const n = cols.map(c => (c === '' ? null : Number(c)));
    if (n.length < 2 || n.slice(0, 4).some(v => v !== null && Number.isNaN(v))) { if (idx === 0) return; problems.push(`Line ${idx + 1}: expected  x, primary, secondary, residual  as numbers`); return; }
    rows.push({ x: n[0], p: n[1] ?? 0, s: n[2] ?? 0, r: n[3] ?? 0 });
  });
  return { rows, problems };
}

/** The 5B_Stress_Profile sheet: x (distance from the cracked surface) with primary / secondary / residual stress. `only='r'` shows just the residual column. */
export default function ProfileEditor({ project, onChange, only }) {
  const [paste, setPaste] = useState(null);
  const sys = project.system, prof = project.profile || [];
  const t = num(project.raw.t);
  const lu = unitLabel('length', sys), su = unitLabel('stress', sys);
  const err = profileErrors(prof, t);
  const set = fn => onChange(fn(prof));
  const update = (i, k, v) => set(h => h.map((r, j) => (j === i ? { ...r, [k]: typeof v === 'number' ? v : null } : r)));
  const add = () => set(h => (h.length >= MAXP ? h : [...h, { x: null, p: 0, s: 0, r: 0 }]));
  const cols = only === 'r' ? [['x', `x (${lu})`], ['r', `Residual (${su})`]] : [['x', `x (${lu})`], ['p', `Primary (${su})`], ['s', `Secondary (${su})`], ['r', `Residual (${su})`]];
  const GRID = `28px repeat(${cols.length}, 1fr) 70px 70px`;
  const data = prof.filter(r => num(r.x) !== null).sort((a, b) => a.x - b.x);
  const apply = mode => {
    const { rows, problems } = parseText(paste.text);
    if (problems.length || !rows.length) { setPaste({ ...paste, problems: problems.length ? problems : ['No data rows found.'] }); return; }
    set(h => (mode === 'replace' ? rows : [...h, ...rows]).slice(0, MAXP)); setPaste(null);
  };
  return (
    <div className="special">
      <div className="special-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>{prof.length} of {MAXP} points · stress normal to the crack plane in the uncracked plate, x from the cracked surface (x = 0) to x = t</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button className="btn" onClick={() => setPaste({ text: '', problems: [] })}>Paste / Import…</button>
          <button className="btn primary" onClick={add} disabled={prof.length >= MAXP}>+ Add point</button>
        </span>
      </div>
      <div className="hist-grid hist-head" style={{ gridTemplateColumns: GRID }}>
        {['#', ...cols.map(c => c[1]), 'x/t', ''].map((h, i) => <div key={i}>{h}</div>)}
      </div>
      {prof.map((r, i) => {
        const e = err.rows[i] || {};
        return (
          <div key={i} className="hist-grid" style={{ gridTemplateColumns: GRID }}>
            <div className="mono dim">{i + 1}</div>
            {cols.map(([k, lbl]) => (
              <div key={k}><NumInput value={r[k]} invalid={!!e[k]} ariaLabel={`Point ${i + 1} ${lbl}`} onChange={v => update(i, k, v)} />{e[k] && <small className="ferr">{e[k]}</small>}</div>
            ))}
            <div className="calc-out mono">{num(r.x) !== null && t ? Number((r.x / t).toPrecision(4)) : '—'}</div>
            <div className="row-actions">
              <button title="Delete point" aria-label="Delete point" onClick={() => set(h => h.filter((_, j) => j !== i))}>×</button>
            </div>
          </div>
        );
      })}
      {err.general && <div role="alert" className="alert-box">⚠ {err.general}</div>}
      {!err.general && data.length > 1 && (
        <div style={{ marginTop: 14 }}>
          <div className="special-sub">Stress profile through the thickness</div>
          <div className="chart-square chart-square-sm">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 14 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="4 3" />
                <XAxis dataKey="x" type="number" domain={[0, 'dataMax']} tick={{ fontSize: 10, fill: 'var(--muted)' }} label={{ value: `x (${lu})`, position: 'insideBottom', offset: -6, fontSize: 10, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} width={40} />
                <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {only !== 'r' && <Line type="linear" dataKey="p" name="Primary" stroke="var(--orange)" strokeWidth={2} dot={false} isAnimationActive={false} />}
                {only !== 'r' && <Line type="linear" dataKey="s" name="Secondary" stroke="var(--teal)" strokeWidth={2} dot={false} isAnimationActive={false} />}
                <Line type="linear" dataKey="r" name="Residual" stroke="var(--red)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {paste && (
        <Dialog title="Paste or import the stress profile" width={560} onClose={() => setPaste(null)}
          footer={<><button className="btn" onClick={() => setPaste(null)}>Cancel</button>
            <button className="btn" disabled={!paste.text.trim()} onClick={() => apply('append')}>Append points</button>
            <button className="btn primary" disabled={!paste.text.trim()} onClick={() => apply('replace')}>Replace points</button></>}>
          <div style={{ fontSize: 12, marginBottom: 8 }}>One point per line: <b className="mono">x, primary, secondary, residual</b> in the units shown in the table headings. Paste from Excel (tab-separated) or CSV. A header line is skipped.</div>
          <textarea autoFocus aria-label="Profile data" value={paste.text} onChange={e => setPaste({ text: e.target.value, problems: [] })} placeholder={'0\t150\t30\t20\n20\t90\t10\t10'}
            style={{ width: '100%', height: 160, fontFamily: 'var(--font-mono)', fontSize: 12, padding: 8, background: 'var(--input)', color: 'var(--ink)', border: '1px solid var(--border-light)' }} />
          {paste.problems.length > 0 && <ul role="alert" style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--red)' }}>{paste.problems.slice(0, 6).map(p => <li key={p}>{p}</li>)}</ul>}
        </Dialog>
      )}
    </div>
  );
}
