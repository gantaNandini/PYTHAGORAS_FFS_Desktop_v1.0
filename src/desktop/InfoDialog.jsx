import React, { useState } from 'react';
import Dialog from './Dialog.jsx';
import SC from '../atlas/schema.generated.js';

/** Case identification (Cover sheet of the ATLAS workbook). */
export default function InfoDialog({ info, onOk, onClose }) {
  const [v, setV] = useState(info);
  const inp = { width: '100%', padding: '6px 8px', fontSize: 12, background: 'var(--input)', color: 'var(--ink)', border: '1px solid var(--border-light)', borderRadius: 3, marginTop: 3 };
  return (
    <Dialog title="Project Information (case identification)" onClose={onClose} width={520}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => onOk(v)}>OK</button></>}>
      <div style={{ display: 'grid', gap: 10 }}>
        {SC.projectFields.map(([k, lbl], i) => (
          <label key={k} style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{lbl}
            <input style={inp} value={v[k] || ''} maxLength={200} autoFocus={i === 0} onChange={e => setV(s => ({ ...s, [k]: e.target.value }))} />
          </label>
        ))}
        <div style={{ fontSize: 11, color: 'var(--faint)' }}>Shown on the Dashboard, in the printed report and in the Excel results; saved with the analysis file.</div>
      </div>
    </Dialog>
  );
}
