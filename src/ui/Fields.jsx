import React, { useState, useId } from 'react';
import SC from '../atlas/schema.generated.js';
import { fieldOf } from '../atlas/case.js';
import { label as unitLabel } from '../atlas/units.js';
import { isNumericField, unitFor } from '../model/fieldinfo.js';
import { num } from '../atlas/util.js';

const fmtNum = v => (typeof v === 'number' && Number.isFinite(v) ? String(Number(v.toPrecision(10))) : v ?? '');

export { isNumericField, unitFor };

export function NumInput({ value, onChange, invalid, ariaLabel, list, disabled, width }) {
  const [draft, setDraft] = useState(null);
  const shown = draft !== null ? draft : fmtNum(value);
  return (
    <input
      className={`cell-in${invalid ? ' bad' : ''}`} type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
      aria-label={ariaLabel} aria-invalid={!!invalid} disabled={disabled} list={list} value={shown} style={width ? { width } : undefined}
      onFocus={e => { setDraft(typeof value === 'number' ? String(value) : value ?? ''); const el = e.target; setTimeout(() => { try { el.select(); } catch { /* ignore */ } }, 0); }}
      onBlur={() => setDraft(null)}
      onChange={e => {
        const s = e.target.value; setDraft(s);
        const t = s.trim();
        if (t === '') onChange(null);
        else if (Number.isFinite(Number(t))) onChange(Number(t));
        else onChange(s);                                                  // keep the text so the error is visible
      }}
    />
  );
}

export function TextInput({ value, onChange, ariaLabel, list }) {
  return <input className="cell-in" type="text" aria-label={ariaLabel} list={list} value={value ?? ''} spellCheck={false}
    onChange={e => onChange(e.target.value === '' ? null : e.target.value)} />;
}

export function Select({ value, onChange, options, ariaLabel }) {
  const opts = options.map(String);
  const cur = value === null || value === undefined ? '' : String(value);
  return (
    <select className="cell-in" aria-label={ariaLabel} value={cur} onChange={e => onChange(e.target.value)}>
      {!opts.includes(cur) && <option value={cur}>{cur === '' ? '—' : cur}</option>}
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function listOptions(f, p) {
  if (f.name === 'material_id') {
    const flt = p.raw.material_filter;
    return flt && flt !== 'ALL' && SC.lists['MAT_' + flt] ? SC.lists['MAT_' + flt] : SC.lists.MATERIAL_IDS;
  }
  if (f.list === 'XI_CAP') return p.system === 'SI' ? SC.lists.XI_CAP_SI : SC.lists.XI_CAP_FPS;
  return SC.lists[f.list] || [];
}

/** One input row: label | control | unit | note */
export function FieldRow({ spec, project, onChange }) {
  const name = typeof spec === 'string' ? spec : spec.f;
  const f = fieldOf(name, project.geometry);
  const id = useId();
  if (!f) return null;
  const v = project.raw[name];
  const numeric = isNumericField(f);
  const opts = f.list ? listOptions(f, project) : null;
  const set = x => onChange(name, x);
  const bad = numeric && typeof v === 'string' && v.trim() !== '' && !Number.isFinite(Number(v));
  let control;
  if (f.list && SC.suggest.includes(f.list)) {
    control = <><NumInput value={v} onChange={set} invalid={bad} ariaLabel={f.label} list={id} />
      <datalist id={id}>{opts.map(o => <option key={o} value={o} />)}</datalist></>;
  } else if (f.list === 'XI_CAP') {
    control = <Select value={v} onChange={x => set(Number(x))} options={opts} ariaLabel={f.label} />;
  } else if (f.list && !numeric) {
    control = <Select value={v} onChange={set} options={opts} ariaLabel={f.label} />;
  } else if (numeric) control = <NumInput value={v} onChange={set} invalid={bad} ariaLabel={f.label} />;
  else control = <TextInput value={v} onChange={set} ariaLabel={f.label} />;
  if (f.list === 'SPEC_TEXT') {
    control = <><TextInput value={v} onChange={set} ariaLabel={f.label} list={id} /><datalist id={id}>{opts.map(o => <option key={o} value={o} />)}</datalist></>;
  }
  const unit = (spec.unit !== undefined ? spec.unit : unitFor(f, project.system));
  return (
    <div className="frow">
      <label className="flabel">{spec.label || f.label}</label>
      <div className="fctl">{control}</div>
      <div className="funit">{unit}</div>
      <div className="fnote">{spec.note !== undefined ? spec.note : f.note}{bad && <span className="ferr"> Enter a number.</span>}</div>
      <div className="fstat"><span className="badge in">INPUT</span></div>
    </div>
  );
}

const fmtCalc = v => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return Number.isInteger(v) && Math.abs(v) < 1e15 ? v.toLocaleString('en-US') : String(Number(v.toPrecision(7)));
  return String(v);
};

/** One calculated (green) row */
export function CalcRow({ spec, value, system }) {
  const unit = spec.unit === 'jr' ? (system === 'SI' ? 'kJ/m² per mmⁿ' : 'in-lb/in² per inⁿ') : spec.unit !== undefined ? spec.unit : unitLabel(spec.kind, system);
  const warn = value === 'OUT OF RANGE' || (typeof value === 'string' && value.startsWith('NOT IN CLASS')) || value === 'EXCESSIVE' || (typeof value === 'string' && value.startsWith('Profile input needs'));
  return (
    <div className="frow">
      <div className="flabel">{spec.label}</div>
      <div className="fctl"><div className={`calc-out${warn ? ' warn' : ''}`}>{fmtCalc(value)}</div></div>
      <div className="funit">{unit}</div>
      <div className="fnote">{spec.note || ''}</div>
      <div className="fstat"><span className="badge calc">CALC</span></div>
    </div>
  );
}

/* ───────────────────────── special editors ───────────────────────── */

export function TestsEditor({ project, onTests }) {
  const t = project.tests;
  const ku = unitLabel('K', project.system);
  return (
    <div className="special">
      <div className="special-head">Fracture-toughness test results, K ({ku}) — enter 3 to 30 values</div>
      <div className="tests-grid">
        {t.map((v, i) => (
          <label key={i} className="test-cell"><span>{i + 1}</span>
            <NumInput value={v} ariaLabel={`Test ${i + 1}`} onChange={x => onTests(i, x)} />
          </label>
        ))}
      </div>
    </div>
  );
}

export function SensEditor({ project, onChange }) {
  return (
    <div className="special">
      <table className="sens-table">
        <thead><tr><th>Input varied (one at a time)</th><th>Include</th><th>Low change (%)</th><th>High change (%)</th></tr></thead>
        <tbody>
          {SC.sensVars.map(([key, lbl]) => (
            <tr key={key}>
              <td>{lbl}</td>
              <td><Select value={project.raw[`s_${key}_on`]} onChange={x => onChange(`s_${key}_on`, x)} options={['YES', 'NO']} ariaLabel={`${lbl} include`} /></td>
              <td><NumInput value={project.raw[`s_${key}_lo`]} ariaLabel={`${lbl} low change`} onChange={x => onChange(`s_${key}_lo`, x)} /></td>
              <td><NumInput value={project.raw[`s_${key}_hi`]} ariaLabel={`${lbl} high change`} onChange={x => onChange(`s_${key}_hi`, x)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="special-foot">Each case repeats the full Level 2 assessment, crack growth and remaining-life check. A combined adverse case (all inputs at their adverse end) is added automatically.</div>
    </div>
  );
}

export { num };
