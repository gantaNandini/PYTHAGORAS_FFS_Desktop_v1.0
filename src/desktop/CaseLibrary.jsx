import React, { useState } from 'react';
import Dialog from './Dialog';
import { KptcDiagram, KpsclDiagram } from './Icons';
import SC from '../atlas/schema.generated.js';

/**
 * Crack Case Library — same layout as NASGRO's dialog:
 * "Show crack case selections by" (three radios) → category list → case list.
 * Cases of this release (body type Plate): KPTC (through-wall crack) and the infinite-length surface crack KPSCL1 / KPSCL2.
 * KPSCL1 and KPSCL2 are one geometry; the "Through-wall stress distribution" drop-down on the Loads page chooses (this list presets it).
 */
const CASES = [
  { id: 'KPTC', geometry: 'KPTC', body: 'Plate', crack: 'Through Cracks', isNew: false, code: 'KPTC / RPTC', title: 'Through-Wall Crack (Annex 9B.3.1 / 9C.3.1)', limits: '0 < c/W < 1.0',
    ref: 'Annex 9B.3.1 (KPTC) / Annex 9C.3.1 (RPTC)', Diagram: KptcDiagram },
  { id: 'KPSCL1', geometry: 'KPSCL', dist: SC.dist.KPSCL1, body: 'Plate', crack: 'Surface Cracks', isNew: true, code: 'KPSCL1 / RPSCL', title: 'Surface Crack, Infinite Length — polynomial stress (9B.3.2 / 9C.3.2)', limits: '0 < a/t ≤ 0.8',
    ref: 'Annex 9B.3.2 (KPSCL1) / Annex 9C.3.2 (RPSCL)', Diagram: KpsclDiagram },
  { id: 'KPSCL2', geometry: 'KPSCL', dist: SC.dist.KPSCL2, body: 'Plate', crack: 'Surface Cracks', isNew: true, code: 'KPSCL2 / RPSCL', title: 'Surface Crack, Infinite Length — arbitrary stress (9B.3.3 / 9C.3.3)', limits: '0 < a/t ≤ 0.8',
    ref: 'Annex 9B.3.3 (KPSCL2) / Annex 9C.3.3 (RPSCL)', Diagram: KpsclDiagram },
];
const MODES = [
  { id: 'crack', label: 'Crack type' },
  { id: 'body',  label: 'Cracked body type' },
  { id: 'new',   label: 'New crack cases only' },
];

export default function CaseLibrary({ initialLoad = 'CONSTANT', initialSystem = 'SI', onOpen, onClose }) {
  const [mode, setMode] = useState('body');
  const [cat, setCat] = useState(null);
  const [sel, setSel] = useState(null);
  const [load, setLoad] = useState(initialLoad);
  const [system, setSystem] = useState(initialSystem);

  const categories = mode === 'crack' ? ['Through Cracks', 'Surface Cracks'] : mode === 'body' ? ['Plate'] : [];
  const list = mode === 'new' ? CASES.filter(c => c.isNew) : cat === null ? [] : CASES.filter(c => (mode === 'crack' ? c.crack : c.body) === cat);
  const chosen = CASES.find(c => c.id === sel) || null;
  const canOpen = !!chosen && list.includes(chosen);
  const go = c => onOpen({ loadType: load, system, geometry: c.geometry, dist: c.dist || null });

  const changeMode = m => { setMode(m); setCat(null); setSel(null); };

  return (
    <Dialog
      title="Crack Case Library" onClose={onClose} width={860}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!canOpen} onClick={() => go(chosen)}>OK</button>
      </>}
    >
      <fieldset className="fieldset">
        <legend>Show crack case selections by</legend>
        <div className="radio-row" role="radiogroup" aria-label="Show crack case selections by">
          {MODES.map(m => (
            <label key={m.id}>
              <input type="radio" name="mode" checked={mode === m.id} onChange={() => changeMode(m.id)} />
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 190px', gap: 12, marginTop: 12 }}>
        <div>
          <div className="list-label">Select a crack category:</div>
          <div className="listbox" role="listbox" aria-label="Crack category">
            {categories.length === 0 && <div className="empty">—</div>}
            {categories.map(c => (
              <div key={c} role="option" aria-selected={cat === c} tabIndex={0}
                className={`row${cat === c ? ' sel' : ''}`}
                onClick={() => { setCat(c); setSel(null); }}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { setCat(c); setSel(null); } }}>
                {c}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="list-label">Select a crack case:</div>
          <div className="listbox" role="listbox" aria-label="Crack case">
            {mode !== 'new' && cat === null && <div className="empty">Select a category first.</div>}
            {list.map(c => (
              <div key={c.id} role="option" aria-selected={sel === c.id} tabIndex={0}
                className={`row${sel === c.id ? ' sel' : ''}`}
                onClick={() => setSel(c.id)}
                onDoubleClick={() => go(c)}
                onKeyDown={e => { if (e.key === ' ') setSel(c.id); if (e.key === 'Enter') { setSel(c.id); go(c); } }}>
                <span className="code">{c.id}</span>
                <span>{c.title}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div className="list-label" style={{ textAlign: 'left' }}>Geometry</div>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border-light)', height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {chosen ? <chosen.Diagram width={170} /> : <span style={{ color: 'var(--faint)', fontSize: 11 }}>Select a case</span>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, marginTop: 12, alignItems: 'stretch' }}>
        <fieldset className="fieldset" style={{ flex: '0 0 auto' }}>
          <legend>Load history</legend>
          <div className="radio-row" role="radiogroup" aria-label="Load history">
            <label><input type="radio" name="load" checked={load === 'CONSTANT'} onChange={() => setLoad('CONSTANT')} /> Constant amplitude</label>
            <label><input type="radio" name="load" checked={load === 'VARIABLE'} onChange={() => setLoad('VARIABLE')} /> Variable amplitude (spectrum)</label>
          </div>
        </fieldset>
        <fieldset className="fieldset" style={{ flex: '0 0 auto' }}>
          <legend>Unit system</legend>
          <div className="radio-row" role="radiogroup" aria-label="Unit system">
            <label><input type="radio" name="sys" checked={system === 'SI'} onChange={() => setSystem('SI')} /> SI (mm, MPa, MPa√m)</label>
            <label><input type="radio" name="sys" checked={system === 'FPS'} onChange={() => setSystem('FPS')} /> FPS (in, ksi, ksi√in)</label>
          </div>
        </fieldset>
        <div style={{ flex: 1, fontSize: 11, color: 'var(--muted)', alignSelf: 'center', lineHeight: 1.5 }}>
          {chosen
            ? <><b style={{ color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>{chosen.code}</b> · {chosen.ref}<br />Validity: {chosen.limits}{chosen.geometry === 'KPSCL' ? ' · KPSCL1 / KPSCL2 can also be switched on the Loads page' : ''}</>
            : 'Select a crack case to see its reference and limits.'}
        </div>
      </div>
    </Dialog>
  );
}
