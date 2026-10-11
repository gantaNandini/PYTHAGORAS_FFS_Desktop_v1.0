import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { FieldRow } from './Fields.jsx';
import * as O from '../model/outputs.js';

const C = { red: '#C00000', green: '#2E7D32', orange: '#E07B00', grey: '#6B7280', purple: '#6B3FA0' };
const cyc = v => (v === null || v === undefined || !Number.isFinite(v) ? '—' : Math.round(v).toLocaleString('en-US'));
const yrs = v => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${Number(v.toPrecision(4)).toLocaleString('en-US')} years`);
const kfmt = v => (Math.abs(v) >= 1e6 ? `${+(v / 1e6).toFixed(2)}M` : Math.abs(v) >= 1e3 ? `${+(v / 1e3).toFixed(1)}k` : String(v));

/** The remaining-life page (paragraph 9.5.1.2 STEP 6): inputs, the verdict, the three lives, an inspection plan and the growth curve. */
export default function RemainingLife({ project, res, error, onField }) {
  const inputs = ['flaw_basis', 'required_life', 'life_margin', 'insp_fraction', 'insp_cap', 'cycles_per_year'];
  const sys = project.system, lu = O.unitOf('length', sys);
  const g = res ? O.geoOf(res) : null;
  const s = res ? res.summary : null;
  const cpy = s && s.cycles_per_year;
  const okInit = res && res.initial.status === 'PASS';
  const okLife = res && String(s.life_status).startsWith('ACCEPTABLE');
  const need = res ? s.required_life * s.life_margin_factor : null;
  const finite = res && s.allowable_service_life !== null;
  const ratio = res && need ? s.life / need : null;
  const nInsp = res && s.inspection_interval && s.required_life ? Math.max(0, Math.ceil(s.required_life / s.inspection_interval) - 1) : null;
  const data = res ? O.thin(res.history, 600).map(r => ({ N: r.cycles, c: O.cv(r.c, 'length', sys) })) : [];
  const refs = res ? [
    need ? { x: need, color: C.grey, text: 'Required × margin' } : null,
    finite ? { x: s.allowable_service_life, color: C.green, text: 'Allowable life' } : null,
    s.inspection_interval ? { x: s.inspection_interval, color: C.orange, text: 'Inspection' } : null,
    finite ? { x: s.life, color: C.red, text: 'Calculated life' } : null].filter(Boolean) : [];
  const xmax = res ? Math.max(s.life || 0, need || 0) * 1.05 || 1 : 1;
  return (
    <div className="sheet fade-in">
      <div className="step-bar" style={{ borderLeftColor: '#0E7C7B' }}>
        <div className="step-top">
          <span className="step-badge" style={{ background: '#0E7C7B' }}>LIFE</span>
          <span className="step-name">Remaining life</span>
          <span className="step-ref">Paragraph 9.5.1.2 STEP 6 · calculated life ≥ required life × margin factor</span>
        </div>
      </div>
      {error && <div role="alert" className="alert-box">⚠ The analysis cannot run: {error}</div>}
      <div className="fsec-title" style={{ background: '#0E7C7B1F', color: '#0E7C7B' }}>REMAINING-LIFE CRITERIA (same inputs as step 8)</div>
      {inputs.map(n => <FieldRow key={n} spec={n} project={project} onChange={onField} />)}
      {res && (
        <>
          <div className="fsec-title" style={{ background: '#0E7C7B1F', color: '#0E7C7B', marginTop: 14 }}>RESULT</div>
          <div className={`life-verdict ${okInit && okLife ? 'ok' : 'bad'}`} role="status">
            <b>{!okInit ? 'NOT ACCEPTABLE NOW' : okLife ? 'ACCEPTABLE' : 'LIFE CRITERION NOT MET'}</b>
            <span>{s.life_status}</span>
          </div>
          <div className="life-grid">
            <div className="life-card"><div className="life-k">Calculated remaining life</div><div className="life-v">{cyc(s.life)}</div><div className="life-u">cycles{cpy ? ` · ${yrs(s.life_years)}` : ''}</div></div>
            <div className="life-card"><div className="life-k">Required life × margin</div><div className="life-v">{cyc(need)}</div><div className="life-u">cycles · {cyc(s.required_life)} × {Number(s.life_margin_factor.toPrecision(6))}{cpy && need ? ` · ${yrs(need / cpy)}` : ''}</div></div>
            <div className="life-card"><div className="life-k">Calculated ÷ required</div><div className={`life-v ${ratio !== null && ratio >= 1 ? 'good' : 'warn'}`}>{ratio === null ? '—' : Number(ratio.toPrecision(4))}</div><div className="life-u">must be ≥ 1 to accept</div></div>
            <div className="life-card"><div className="life-k">Allowable service life</div><div className="life-v">{cyc(s.allowable_service_life)}</div><div className="life-u">cycles{cpy && finite ? ` · ${yrs(s.allowable_life_years)}` : ''} · life ÷ margin</div></div>
            <div className="life-card"><div className="life-k">Inspection interval</div><div className="life-v">{cyc(s.inspection_interval)}</div><div className="life-u">cycles{cpy && s.inspection_interval ? ` · ${yrs(s.inspection_interval_years)}` : ''} · {Number(s.inspection_fraction.toPrecision(6))} × allowable</div></div>
            <div className="life-card"><div className="life-k">Inspections within required life</div><div className="life-v">{nInsp === null ? '—' : nInsp}</div><div className="life-u">at the interval shown, after today's</div></div>
          </div>
          <p className="life-text">
            The crack ({g.size_name} {g.size}<sub>0</sub> = {Number(O.cv(res.geom.c0, 'length', sys).toPrecision(5))} {lu}) grows to the {s.beyond_limit && g.type !== 'KPTC' ? 'validity limit' : 'limiting'} {g.size_name} {Number(O.cv(s.critical_c_mm, 'length', sys).toPrecision(5))} {lu} after about {cyc(s.life)} cycles.
            {' '}The stop reason is: <i>{s.stop_reason}</i>. Basis: {s.flaw_basis.replace(/_/g, ' ').toLowerCase()}.
            {' '}The margin factor and inspection fraction are project / engineering choices, not API 579 constants.
          </p>
          <div className="special-sub">Crack {g.size_name} against cycles, with the life limits</div>
          <div className="chart-square">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 22, right: 22, left: 4, bottom: 18 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="4 3" />
                <XAxis dataKey="N" type="number" domain={[0, xmax]} tick={{ fontSize: 10, fill: 'var(--muted)' }} tickFormatter={kfmt} label={{ value: 'Cycles, N', position: 'insideBottom', offset: -8, fontSize: 11, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} width={46} domain={['auto', 'auto']} label={{ value: `${g.size} (${lu})`, angle: -90, position: 'insideLeft', fontSize: 11, fill: 'var(--muted)' }} />
                <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', fontSize: 11 }} formatter={(v, n) => [Number(Number(v).toPrecision(5)), n]} labelFormatter={v => `N = ${cyc(v)}`} />
                <Line type="monotone" dataKey="c" name={g.size_name} stroke={C.purple} strokeWidth={2} dot={false} isAnimationActive={false} />
                {refs.map((r, i) => <ReferenceLine key={i} x={r.x} stroke={r.color} strokeDasharray="5 3" label={{ value: r.text, position: i % 2 ? 'insideTopLeft' : 'insideTopRight', fill: r.color, fontSize: 10 }} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="dim" style={{ marginTop: 6, fontSize: 11 }}>
            <span style={{ color: C.grey }}>▬</span> required × margin &nbsp; <span style={{ color: C.green }}>▬</span> allowable service life &nbsp; <span style={{ color: C.orange }}>▬</span> inspection interval &nbsp; <span style={{ color: C.red }}>▬</span> calculated life
          </div>
        </>
      )}
    </div>
  );
}
