import React, { useState } from 'react';
import { FieldRow, CalcRow, TestsEditor, SensEditor } from './Fields.jsx';
import HistoryEditor from './HistoryEditor.jsx';
import ProfileEditor from './ProfileEditor.jsx';
import { GUIDE, GUIDE_SC } from './guide.js';

/** Renders one input sheet from model/layout.js */
/** Friendly introduction to a step: what it is for, what to enter, and a link to the matching Help topic */
function StepBanner({ sheet, onHelp, geometry }) {
  const g = (geometry === 'KPSCL' && GUIDE_SC[sheet.id]) || GUIDE[sheet.id];
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('pfs-tips') === 'open'; } catch { return false; } });
  const toggle = () => setOpen(v => { try { localStorage.setItem('pfs-tips', v ? 'closed' : 'open'); } catch { /* ignore */ } return !v; });
  if (!g) return null;
  const n = sheet.id.split('_')[0];
  return (
    <div className="step-bar" style={{ borderLeftColor: sheet.color }}>
      <div className="step-top">
        <span className="step-badge" style={{ background: sheet.color }}>STEP {n}</span>
        <span className="step-name">{g.name}</span>
        <span className="step-ref" title={sheet.subtitle}>{sheet.subtitle}</span>
        <button className="btn" onClick={toggle} aria-expanded={open} title="Show or hide a short explanation of this step">{open ? 'Hide tips' : 'Show tips'}</button>
        <button className="btn help-btn" onClick={onHelp} title="Open Help for this step (F1)"><span aria-hidden="true">?</span> Help</button>
      </div>
      {open && (
        <div className="step-tips">
          <p className="step-what">{g.what}</p>
          <ul className="step-todo">{g.todo.map((t, i) => <li key={i}>{t}</li>)}</ul>
          {g.tip && <div className="step-tip"><b>Good to know:</b> {g.tip}</div>}
          <div className="step-legend"><span className="lg lg-in" />Yellow = you type or choose <span className="lg lg-calc" />Green = calculated by the program, nothing to enter</div>
        </div>
      )}
    </div>
  );
}

function StepNav({ prev, next, onGo }) {
  return (
    <div className="step-nav">
      {prev ? <button className="btn" onClick={() => onGo(prev.id)}>← Back: {prev.label}</button> : <span />}
      {next ? <button className="btn primary" onClick={() => onGo(next.id)}>Next: {next.label} →</button> : <span />}
    </div>
  );
}

export default function SheetPage({ sheet, project, derived, showAll, error, onField, onTests, onHistory, onProfile, onHelp, prev, next, onGo, children }) {
  const ctx = { ...project, raw: { ...project.raw, loadType: project.loadType }, derived };
  const vis = (spec, parent) => showAll || ((!spec.when || spec.when(ctx)) && (!parent || !parent.when || parent.when(ctx)));
  return (
    <div className="sheet fade-in">
      <StepBanner sheet={sheet} onHelp={onHelp} geometry={project.geometry} />
      {error && <div role="alert" className="alert-box">⚠ The analysis cannot run: {error}</div>}
      <div className="frow fhead"><div>Parameter</div><div>Value</div><div>Unit</div><div>API 579 reference / note</div><div>Status</div></div>
      {sheet.sections.map(sec => {
        if (!vis(sec)) return null;
        const rows = sec.rows.map((r, i) => {
          const spec = typeof r === 'string' ? { f: r } : r;
          if (!vis(spec)) return null;
          if (spec.table === 'tests') return <TestsEditor key={i} project={project} onTests={onTests} />;
          if (spec.table === 'history') return <HistoryEditor key={i} history={project.history} onChange={onHistory} />;
          if (spec.table === 'profile') return <ProfileEditor key={i} project={project} onChange={onProfile} only={spec.only} />;
          if (spec.table === 'sens') return <SensEditor key={i} project={project} onChange={onField} />;
          if (spec.calc) {
            const v = derived[spec.calc];
            if (!showAll && (v === null || v === undefined || v === '')) return null;
            return <CalcRow key={spec.calc} spec={spec} value={v} system={project.system} />;
          }
          return <FieldRow key={spec.f} spec={spec} project={project} onChange={onField} />;
        }).filter(Boolean);
        if (!rows.length) return null;
        return (
          <section key={sec.title} className="fsec">
            <div className="fsec-title" style={{ background: `${sheet.color}1F`, color: sheet.color }}>{sec.title}</div>
            {rows}
          </section>
        );
      })}
      {children}
      <StepNav prev={prev} next={next} onGo={onGo} />
    </div>
  );
}
