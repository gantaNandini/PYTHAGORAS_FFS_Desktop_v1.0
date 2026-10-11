import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { buildCase, run, assess } from './atlas/index.js';
import { derive } from './model/calc.js';
import { sheetsFor } from './model/layout.js';
import { caseOf, sifName, refName, newProject, serialize, parse, convertSystem, fromImport } from './model/project.js';
import { importWorkbook } from './atlas/importXlsx.js';
import { buildResultsWorkbook, workbookBytes, downloadBytes, historyCsv } from './model/exportXlsx.js';
import SC from './atlas/schema.generated.js';

import MenuBar from './desktop/MenuBar.jsx';
import Dialog from './desktop/Dialog.jsx';
import CaseLibrary from './desktop/CaseLibrary.jsx';
import InfoDialog from './desktop/InfoDialog.jsx';
import GeometryDiagram, { SurfaceDiagram } from './desktop/GeometryDiagram.jsx';
import { Icon, LogoMark } from './desktop/Icons.jsx';
import * as bridge from './desktop/bridge.js';
import SheetPage from './ui/SheetPage.jsx';
import ResultsView, { RESULT_TABS } from './ui/ResultsView.jsx';
import PlotsView from './ui/PlotsView.jsx';
import RemainingLife from './ui/RemainingLife.jsx';
import HelpDialog, { helpFor } from './desktop/HelpDialog.jsx';
import { GUIDE } from './ui/guide.js';

const APP_NAME = 'PYTHAGORAS FFS';
const APP_VERSION = '3.0.0';
const CREDIT = 'Developed by Dr. Ramana Podugu, M.Tech., MISTE, MIE, MIPE, Ph.D.';
const RECENT_KEY = 'pfs-recent';
const RECOVERY_KEY = 'pfs-recovery3';
const RECOVERY_MAX_AGE = 14 * 24 * 3600 * 1000;
const L3_TABS = ['dashboard', 'checklist', 'l3sens', 'l3md'];

const readTheme = () => { try { return localStorage.getItem('pfs-theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; } };
const readUnitPref = () => { try { return localStorage.getItem('pfs-system') === 'FPS' ? 'FPS' : 'SI'; } catch { return 'SI'; } };
const readRecents = () => { try { const r = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(r) ? r.filter(x => x && x.path).slice(0, 6) : []; } catch { return []; } };
const readRecovery = () => {
  try {
    const r = JSON.parse(localStorage.getItem(RECOVERY_KEY) || 'null');
    if (r && typeof r.text === 'string' && Date.now() - r.t < RECOVERY_MAX_AGE) { parse(r.text); return r; }
  } catch { /* unreadable → ignore */ }
  return null;
};
const clearRecovery = () => { try { localStorage.removeItem(RECOVERY_KEY); } catch { /* ignore */ } };
const fmtLife = v => Math.round(v).toLocaleString('en-US');

export default function App() {
  const projectRef = useRef(null);
  const [project, setProject] = useState(null);
  const [saved, setSaved] = useState(null);
  const hist = useRef({ past: [], future: [], lastEdit: 0 });
  const [, bump] = useState(0);
  const [file, setFile] = useState({ path: null, name: null });
  const [tab, setTab] = useState('1_Geometry_Flaw');
  const [rtab, setRtab] = useState('dashboard');
  const [plotN, setPlotN] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [theme, setTheme] = useState(readTheme);
  const [dialog, setDialog] = useState(null);
  const [help, setHelp] = useState(null);
  const [status, setStatus] = useState('Ready');
  const [recents, setRecents] = useState(readRecents);
  const [recovery, setRecovery] = useState(readRecovery);
  const [sysPref, setSysPref] = useState(readUnitPref);
  const statusTimer = useRef(null);
  const xlsxInput = useRef(null);
  const dirty = project !== null && project !== saved;

  const say = useCallback((msg, ms = 4000) => {
    setStatus(msg); clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus('Ready'), ms);
  }, []);

  /* ── editing + undo/redo ── */
  const mutate = useCallback((fn, coalesce = false) => {
    const prev = projectRef.current; if (!prev) return;
    const next = fn(prev); if (next === prev) return;
    const h = hist.current, now = Date.now();
    if (!(coalesce && h.past.length && now - h.lastEdit < 800)) { h.past.push(prev); if (h.past.length > 200) h.past.shift(); }
    h.lastEdit = coalesce ? now : 0; h.future = [];
    projectRef.current = next; setProject(next); bump(v => v + 1);
  }, []);
  const replaceProject = useCallback((p, fileInfo, markDirty = false) => {
    hist.current = { past: [], future: [], lastEdit: 0 };
    projectRef.current = p; setProject(p); setSaved(markDirty ? null : p);
    setFile(fileInfo || { path: null, name: null });
    setTab(p.raw ? '1_Geometry_Flaw' : tab); setRtab('dashboard'); setDialog(null); bump(v => v + 1);
  }, [tab]);
  const undo = useCallback(() => { const h = hist.current; if (!h.past.length) return; h.future.push(projectRef.current); const p = h.past.pop(); h.lastEdit = 0; projectRef.current = p; setProject(p); bump(v => v + 1); say('Undo'); }, [say]);
  const redo = useCallback(() => { const h = hist.current; if (!h.future.length) return; h.past.push(projectRef.current); const p = h.future.pop(); h.lastEdit = 0; projectRef.current = p; setProject(p); bump(v => v + 1); say('Redo'); }, [say]);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); try { localStorage.setItem('pfs-theme', theme); } catch { /* ignore */ } }, [theme]);
  useEffect(() => {
    const name = project ? `${file.name || 'Untitled'}${dirty ? ' •' : ''} — ` : '';
    document.title = `${name}${APP_NAME}`; bridge.setDirty(dirty);
  }, [project, file, dirty]);

  /* ── calculation (debounced so typing stays smooth) ── */
  const [calcProject, setCalcProject] = useState(null);
  useEffect(() => { const id = setTimeout(() => setCalcProject(project), project ? 140 : 0); return () => clearTimeout(id); }, [project]);
  const solved = useMemo(() => {
    if (!calcProject) return null;
    try { const caseIn = buildCase(calcProject); return { caseIn, res: run(caseIn) }; } catch (e) { return { error: String(e.message || e) }; }
  }, [calcProject]);
  const res = solved && solved.res ? solved.res : null;
  const pending = project !== calcProject;
  const derived = useMemo(() => (project ? derive(project) : {}), [project]);

  /* Level 3 is computed only when a screen needs it, after the screen has drawn */
  const needL3 = tab === 'results' ? L3_TABS.includes(rtab) : tab === 'plots' ? plotN >= 11 : false;
  const [l3State, setL3State] = useState(null);
  useEffect(() => {
    if (!needL3 || !res || (l3State && l3State.for === solved)) return undefined;
    const id = setTimeout(() => {
      let data; try { data = assess(solved.caseIn, solved.res); } catch (e) { data = { error: String(e.message || e) }; }
      setL3State({ for: solved, data });
    }, 60);
    return () => clearTimeout(id);
  }, [needL3, solved, res, l3State]);
  const l3 = l3State && l3State.for === solved ? l3State.data : null;
  const l3Busy = needL3 && !!res && !l3;
  const getL3 = useCallback(() => (l3 || (solved && solved.res ? (() => { try { return assess(solved.caseIn, solved.res); } catch (e) { return { error: String(e.message || e) }; } })() : null)), [l3, solved]);

  /* ── actions ── */
  const guard = useCallback(action => {
    if (!dirty) { action(); return; }
    setDialog({ confirm: { message: `"${file.name || 'Untitled'}" has unsaved changes. Discard them?`, yes: 'Discard changes', onYes: action } });
  }, [dirty, file]);
  const pushRecent = useCallback((path, name) => {
    if (!path) return;
    setRecents(r => { const n = [{ path, name }, ...r.filter(x => x.path !== path)].slice(0, 6); try { localStorage.setItem(RECENT_KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  }, []);
  const dropRecent = useCallback(path => setRecents(r => { const n = r.filter(x => x.path !== path); try { localStorage.setItem(RECENT_KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; }), []);

  /* crash recovery: written on every change, removed as soon as the work is saved */
  useEffect(() => {
    if (!project) return;
    if (!dirty) { clearRecovery(); return; }
    try { localStorage.setItem(RECOVERY_KEY, JSON.stringify({ t: Date.now(), name: file.name, path: file.path, text: serialize(project) })); } catch { /* best effort */ }
  }, [project, dirty, file]);

  const createProject = ({ loadType, system, geometry = 'KPTC', dist = null }) => {
    try { localStorage.setItem('pfs-system', system); } catch { /* ignore */ }
    const np = newProject(system, loadType, geometry);
    if (dist) np.raw = { ...np.raw, stress_dist: dist };
    setSysPref(system); replaceProject(np, null); say(`New ${sifName(np)} analysis created`);
  };
  const loadFromText = useCallback((text, name, path) => {
    try { const p = parse(text); replaceProject(p, { path: path || null, name }); pushRecent(path, name); say(`Opened ${name}`); }
    catch (e) { bridge.showMessage({ type: 'error', title: 'Cannot open file', message: e.message }); }
  }, [replaceProject, pushRecent, say]);
  const doOpen = useCallback(async () => { const f = await bridge.openProjectFile(); if (f) guard(() => loadFromText(f.content, f.name, f.path)); }, [loadFromText, guard]);
  const openRecent = useCallback(async r => {
    try { const f = await bridge.readProjectFile(r.path); if (f) guard(() => loadFromText(f.content, f.name, f.path)); }
    catch (e) { dropRecent(r.path); bridge.showMessage({ type: 'error', title: 'Cannot open file', message: `${r.path}\n\n${String(e.message || e)}` }); }
  }, [guard, loadFromText, dropRecent]);
  const doSave = useCallback(async (saveAs = false) => {
    const p = projectRef.current; if (!p) return;
    try {
      const r = await bridge.saveProjectFile({ path: file.path, name: file.name || `${sifName(p)}_${p.loadType === 'CONSTANT' ? 'Constant' : 'Variable'}.pfs`, content: serialize(p), saveAs });
      if (r) { setFile({ path: r.path || null, name: r.name }); setSaved(p); pushRecent(r.path, r.name); say(`Saved ${r.name}`); }
    } catch (e) { bridge.showMessage({ type: 'error', title: 'Cannot save file', message: String(e.message || e) }); }
  }, [file, pushRecent, say]);

  const importXlsx = useCallback(f => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const st = importWorkbook(new Uint8Array(reader.result));
        guard(() => { replaceProject(fromImport(st), { path: null, name: f.name.replace(/\.xlsx$/i, '.pfs') }, true); say(`Imported ${f.name}`); });
      } catch (e) { bridge.showMessage({ type: 'error', title: 'Cannot import workbook', message: String(e.message || e) }); }
    };
    reader.readAsArrayBuffer(f);
  }, [guard, replaceProject, say]);

  const baseName = () => `${sifName(project)}_${project.loadType === 'CONSTANT' ? 'Constant' : 'Variable'}_${project.system}`;
  const doExportXlsx = useCallback(() => {
    if (!res) { say('Nothing to export: fix the input error first'); return; }
    try { downloadBytes(workbookBytes(buildResultsWorkbook(project, res, getL3(), APP_VERSION)), `${baseName()}_Results.xlsx`); say('Results workbook exported (Excel)'); }
    catch (e) { bridge.showMessage({ type: 'error', title: 'Cannot export', message: String(e.message || e) }); }
  }, [res, project, getL3, say]); // eslint-disable-line react-hooks/exhaustive-deps
  const doExportCsv = useCallback(() => {
    if (!res) { say('Nothing to export: fix the input error first'); return; }
    downloadBytes(new TextEncoder().encode('\uFEFF' + historyCsv(res, project.project ? project : project)), `${baseName()}_History.csv`, 'text/csv;charset=utf-8'); say('Crack growth history exported (CSV)');
  }, [res, project, say]); // eslint-disable-line react-hooks/exhaustive-deps
  const doPDF = useCallback(async () => {
    if (!projectRef.current) return;
    setTab('results'); setRtab('dashboard');
    await new Promise(r => setTimeout(r, 500));
    try { const r = await bridge.printToPDF(`${baseName()}_Results.pdf`); if (r && r.path) say(`PDF written to ${r.path}`); }
    catch (e) { bridge.showMessage({ type: 'error', title: 'Cannot create PDF', message: String(e.message || e) }); }
  }, [project, say]); // eslint-disable-line react-hooks/exhaustive-deps
  const doRun = useCallback(() => { if (projectRef.current) { setTab('results'); setRtab('dashboard'); say(solved && solved.res ? 'Analysis complete' : 'Analysis could not run: check the inputs'); } }, [solved, say]);

  /* ── editing handlers ── */
  const setField = useCallback((name, value) => mutate(p => {
    const raw = { ...p.raw, [name]: value };
    if (name === 'material_filter' && value !== 'ALL') { const ids = SC.lists['MAT_' + value] || []; if (!ids.includes(raw.material_id) && ids.length) raw.material_id = ids[0]; }
    return { ...p, raw };
  }, true), [mutate]);
  const setTest = useCallback((i, v) => mutate(p => ({ ...p, tests: p.tests.map((t, j) => (j === i ? v : t)) }), true), [mutate]);
  const setHistory = useCallback(h => mutate(p => ({ ...p, history: h }), true), [mutate]);
  const setProfile = useCallback(pr => mutate(p => ({ ...p, profile: pr }), true), [mutate]);
  const setSystem = useCallback(sys => {
    try { localStorage.setItem('pfs-system', sys); } catch { /* ignore */ }
    setSysPref(sys);
    mutate(p => convertSystem(p, sys)); say(`Units: ${sys === 'SI' ? 'SI (mm · MPa · MPa√m · °C)' : 'FPS (in · ksi · ksi√in · °F)'} — all typed values converted`);
  }, [mutate, say]);
  const setLoadType = useCallback(lt => { mutate(p => (p.loadType === lt ? p : { ...p, loadType: lt })); if (lt === 'CONSTANT' && tab === '7_Load_History') setTab('1_Geometry_Flaw'); }, [mutate, tab]);

  /* ── files from the OS / keyboard ── */
  const openedRef = useRef(); openedRef.current = f => guard(() => loadFromText(f.content, f.name, f.path));
  useEffect(() => bridge.onFileOpened(f => openedRef.current(f)), []);
  const has = !!project;
  const geomId = project ? project.geometry : 'KPTC';
  const sheets = useMemo(() => sheetsFor(geomId).filter(s => !s.onlyFor || (project && project.loadType === s.onlyFor)), [project, geomId]);
  const tabIds = useMemo(() => [...sheets.map(s => s.id), 'results', 'plots', 'life'], [sheets]);
  const keyRef = useRef();
  keyRef.current = e => {
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (e.key === 'F5') { e.preventDefault(); doRun(); return; }
    if (e.key === 'F1') { e.preventDefault(); setHelp(has ? helpFor(tab, project && project.geometry) : { topic: 's1' }); return; }
    if (!mod) return;
    const inText = e.target && (e.target.tagName === 'TEXTAREA' || (e.target.closest && e.target.closest('.dialog')));
    if (k === 'z' && !inText) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (k === 'y' && !inText) { e.preventDefault(); redo(); }
    else if (k === 'n') { e.preventDefault(); setDialog('library'); }
    else if (k === 'o') { e.preventDefault(); doOpen(); }
    else if (k === 's') { e.preventDefault(); doSave(e.shiftKey); }
    else if (k === 'e') { e.preventDefault(); doExportXlsx(); }
    else if (k === 'p') { e.preventDefault(); doPDF(); }
    else if (has && /^[1-9]$/.test(k) && tabIds[Number(k) - 1]) { e.preventDefault(); setTab(tabIds[Number(k) - 1]); }
  };
  useEffect(() => { const h = e => keyRef.current(e); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);

  const restoreRecovery = useCallback(() => {
    if (!recovery) return;
    try { const p = parse(recovery.text); replaceProject(p, { path: recovery.path || null, name: recovery.name || null }, true); setRecovery(null); say('Unsaved analysis restored'); }
    catch (e) { setRecovery(null); clearRecovery(); bridge.showMessage({ type: 'error', title: 'Cannot restore', message: String(e.message || e) }); }
  }, [recovery, replaceProject, say]);
  const discardRecovery = useCallback(() => { setRecovery(null); clearRecovery(); }, []);

  /* ── menus ── */
  const h = hist.current;
  const sys = project ? project.system : sysPref;
  const menus = [
    { label: 'File', items: [
      { label: 'New Analysis…', kbd: 'Ctrl+N', onClick: () => setDialog('library') },
      { label: 'Open…', kbd: 'Ctrl+O', onClick: doOpen },
      ...(recents.length ? ['sep', ...recents.map(r => ({ label: r.name, onClick: () => openRecent(r) }))] : []),
      'sep',
      { label: 'Import ATLAS Input Workbook (.xlsx)…', onClick: () => xlsxInput.current && xlsxInput.current.click() },
      'sep',
      { label: 'Save', kbd: 'Ctrl+S', disabled: !has, onClick: () => doSave(false) },
      { label: 'Save As…', kbd: 'Ctrl+Shift+S', disabled: !has, onClick: () => doSave(true) },
      'sep',
      { label: 'Project Information…', disabled: !has, onClick: () => setDialog('info') },
      'sep',
      { label: 'Export Results (Excel)', kbd: 'Ctrl+E', disabled: !has || !res, onClick: doExportXlsx },
      { label: 'Export Crack Growth History (CSV)', disabled: !has || !res, onClick: doExportCsv },
      { label: 'Print / Save as PDF…', kbd: 'Ctrl+P', disabled: !has, onClick: doPDF },
      'sep',
      { label: 'Exit', onClick: () => bridge.windowCommand('quit') },
    ] },
    { label: 'Edit', items: [
      { label: 'Undo', kbd: 'Ctrl+Z', disabled: !h.past.length, onClick: undo },
      { label: 'Redo', kbd: 'Ctrl+Y', disabled: !h.future.length, onClick: redo },
    ] },
    { label: 'Options', items: [
      { label: 'Units: SI (mm · MPa · MPa√m · °C)', checked: sys === 'SI', onClick: () => (has ? setSystem('SI') : setSysPref('SI')) },
      { label: 'Units: FPS (in · ksi · ksi√in · °F)', checked: sys === 'FPS', onClick: () => (has ? setSystem('FPS') : setSysPref('FPS')) },
      'sep',
      { label: 'Constant Amplitude Load', checked: has && project.loadType === 'CONSTANT', disabled: !has, onClick: () => setLoadType('CONSTANT') },
      { label: 'Variable Amplitude Load (spectrum)', checked: has && project.loadType === 'VARIABLE', disabled: !has, onClick: () => setLoadType('VARIABLE') },
      'sep',
      { label: 'Show Inputs Not Used by the Selected Options', checked: showAll, onClick: () => setShowAll(v => !v) },
    ] },
    { label: 'View', items: [
      { label: 'Light Theme', checked: theme === 'light', onClick: () => setTheme('light') },
      { label: 'Dark Theme', checked: theme === 'dark', onClick: () => setTheme('dark') },
      'sep',
      ...tabIds.map((id, i) => ({ label: id === 'results' ? 'Results' : id === 'plots' ? 'Plots' : id === 'life' ? 'Remaining Life' : sheets.find(s => s.id === id).tab, kbd: i < 9 ? `Ctrl+${i + 1}` : undefined, disabled: !has, checked: has && tab === id, onClick: () => setTab(id) })),
      'sep',
      { label: 'Zoom In', onClick: () => bridge.windowCommand('zoomIn') }, { label: 'Zoom Out', onClick: () => bridge.windowCommand('zoomOut') },
      { label: 'Actual Size', onClick: () => bridge.windowCommand('zoomReset') }, { label: 'Full Screen', kbd: 'F11', onClick: () => bridge.windowCommand('fullscreen') },
    ] },
    { label: 'Tools', items: [{ label: 'Run Analysis (show results)', kbd: 'F5', disabled: !has, onClick: doRun }] },
    { label: 'Help', items: [
      { label: 'Help Contents and Search', kbd: 'F1', onClick: () => setHelp(has ? helpFor(tab, project && project.geometry) : { topic: 's1' }) },
      'sep',
      { label: 'Getting Started', onClick: () => setHelp({ topic: 's1' }) },
      { label: 'Input Tabs (units, geometry, material, loads)', onClick: () => setHelp({ topic: 's3' }) },
      { label: 'KPTC / KPSCL Theory', onClick: () => setHelp({ topic: 's2' }) },
      { label: 'Worked SI Example', onClick: () => setHelp({ topic: 's7' }) },
      { label: 'Constant Crack Growth', onClick: () => setHelp({ topic: 's8' }) },
      { label: 'Variable Load Growth', onClick: () => setHelp({ topic: 's9' }) },
      { label: 'Remaining Life', onClick: () => setHelp({ topic: 's10' }) },
      { label: 'Level 3', onClick: () => setHelp({ topic: 's11' }) },
      { label: 'Results and Plots', onClick: () => setHelp({ topic: 's12' }) },
      { label: 'Troubleshooting', onClick: () => setHelp({ topic: 's14' }) },
      { label: 'Equations and Glossary', onClick: () => setHelp({ topic: 's15' }) },
      { label: 'Checklists', onClick: () => setHelp({ topic: 's16' }) },
      'sep',
      { label: 'Keyboard Shortcuts', onClick: () => setDialog('keys') },
      { label: `About ${APP_NAME}`, onClick: () => setDialog('about') },
    ] },
  ];

  const sheet = sheets.find(s => s.id === tab);
  const stepIdx = sheets.findIndex(s => s.id === tab);
  const stepLabel = s => (GUIDE[s.id] ? GUIDE[s.id].name : s.tab);
  const prevStep = stepIdx > 0 ? { id: sheets[stepIdx - 1].id, label: stepLabel(sheets[stepIdx - 1]) } : null;
  const nextStep = stepIdx >= 0 ? (stepIdx < sheets.length - 1 ? { id: sheets[stepIdx + 1].id, label: stepLabel(sheets[stepIdx + 1]) } : { id: 'results', label: 'See the results' }) : null;
  const goStep = id => { setTab(id); if (id === 'results') setRtab('dashboard'); };
  const info = project ? project.project : null;
  const life = res ? res.summary.life : null;
  const lengthDec = sys === 'FPS' ? 3 : 2;

  return (
    <div className="app">
      <MenuBar menus={menus} />
      <div className="toolbar" role="toolbar" aria-label="Main toolbar">
        <button className="tb-btn" onClick={() => setDialog('library')} title="New analysis (Ctrl+N)"><Icon name="new" /> New</button>
        <button className="tb-btn" onClick={doOpen} title="Open analysis (Ctrl+O)"><Icon name="open" /> Open</button>
        <button className="tb-btn" onClick={() => xlsxInput.current && xlsxInput.current.click()} title="Import an ATLAS input workbook (.xlsx): KPTC or KPSCL"><Icon name="open" /> Import Excel</button>
        <button className="tb-btn" onClick={() => doSave(false)} disabled={!has} title="Save (Ctrl+S)"><Icon name="save" /> Save</button>
        <span className="tb-sep" />
        <button className="tb-btn" onClick={doRun} disabled={!has} title="Run analysis and show results (F5)"><Icon name="run" /> Run</button>
        <span className="tb-sep" />
        <button className="tb-btn" onClick={doExportXlsx} disabled={!has || !res} title="Export results to Excel (Ctrl+E)"><Icon name="csv" /> Export Excel</button>
        <button className="tb-btn" onClick={doPDF} disabled={!has} title="Print or save as PDF (Ctrl+P)"><Icon name="print" /> Print</button>
        <span className="tb-sep" />
        <button className="tb-btn" onClick={() => setHelp(has ? helpFor(tab, project && project.geometry) : { topic: 's1' })} title="Help for this page (F1)"><span className="tb-q" aria-hidden="true">?</span> Help</button>
        <span className="tb-spacer" />
        <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 6 }}>Units</span>
        <div className="seg" role="group" aria-label="Unit system">
          <button className={sys === 'SI' ? 'on' : ''} aria-pressed={sys === 'SI'} onClick={() => (has ? setSystem('SI') : setSysPref('SI'))} title="SI: mm, MPa, MPa√m, °C">SI</button>
          <button className={sys === 'FPS' ? 'on' : ''} aria-pressed={sys === 'FPS'} onClick={() => (has ? setSystem('FPS') : setSysPref('FPS'))} title="FPS: in, ksi, ksi√in, °F">FPS</button>
        </div>
        {has && <><span style={{ width: 10 }} /><span className="pill" style={project.loadType === 'CONSTANT' ? { background: 'var(--brand)', color: '#fff' } : { background: 'var(--orange)', color: '#fff' }}>{project.loadType} LOAD</span></>}
      </div>

      {has ? (
        <>
          <div className="casebar">
            <span className="code">{sifName(project)} / {refName(project)}</span>
            <span className="desc">{info && info.project ? `${info.project} · ` : ''}{caseOf(project).title} · {caseOf(project).annex}</span>
          </div>
          <div className="tabstrip" role="tablist" aria-label="Sheets">
            {sheets.map(s => <button key={s.id} role="tab" aria-selected={tab === s.id} className={`tab${tab === s.id ? ' active' : ''}`} onClick={() => setTab(s.id)}>{s.tab}</button>)}
            <button role="tab" aria-selected={tab === 'results'} className={`tab results${tab === 'results' ? ' active' : ''}`} onClick={() => setTab('results')}>Results{solved && solved.error && <span className="warn" title={solved.error}>!</span>}</button>
            <button role="tab" aria-selected={tab === 'plots'} className={`tab results${tab === 'plots' ? ' active' : ''}`} onClick={() => setTab('plots')}>Plots</button>
            <button role="tab" aria-selected={tab === 'life'} className={`tab results${tab === 'life' ? ' active' : ''}`} onClick={() => setTab('life')}>Remaining Life</button>
          </div>
          <main className="workspace" key={tab} role="tabpanel">
            <div className="print-only">
              <div style={{ fontSize: 18, fontWeight: 700, color: '#000' }}>{info && info.project ? info.project : `${sifName(project)} / ${refName(project)} crack assessment`}</div>
              <div style={{ fontSize: 11, color: '#333', marginTop: 2 }}>{[info && info.component, info && info.location, info && info.analyst && `Analyst: ${info.analyst}`, info && info.revision && `Rev ${info.revision}`,
                `Date: ${new Date().toLocaleDateString()}`, `Units: ${project.system}`, file.name && `File: ${file.name}`].filter(Boolean).join('   ·   ')}</div><hr style={{ margin: '8px 0 0' }} />
            </div>
            {sheet && (
              <div className="page">
                <SheetPage sheet={sheet} project={project} derived={derived} showAll={showAll} error={solved && solved.error} onField={setField} onTests={setTest} onHistory={setHistory} onProfile={setProfile}
                  onHelp={() => setHelp(helpFor(tab, project && project.geometry))} prev={prevStep} next={nextStep} onGo={goStep}>
                  {sheet.id === '1_Geometry_Flaw' && (
                    <div className="sheet-extra"><div className="fsec-title" style={{ background: '#2E75B61F', color: '#2E75B6' }}>GEOMETRY SCHEMATIC</div>
                      {project.geometry === 'KPSCL'
                        ? <SurfaceDiagram a0={Number(project.raw.a_m)} t={Number(project.raw.t)} unit={sys === 'SI' ? 'mm' : 'in'} />
                        : <GeometryDiagram c0={Number(derived.flaw_c0 ?? project.raw.cm)} W={Number(project.raw.W)} t={Number(project.raw.t)} unit={sys === 'SI' ? 'mm' : 'in'} />}</div>)}
                </SheetPage>
              </div>
            )}
            {tab === 'results' && (
              <div className="page">
                <div className="rtabs" role="tablist" aria-label="Result sheets">{RESULT_TABS.map(([id, name]) => <button key={id} role="tab" aria-selected={rtab === id} className={`rtab${rtab === id ? ' on' : ''}`} onClick={() => setRtab(id)}>{name}</button>)}<button className="rtab help-link" onClick={() => setHelp(helpFor('results', project && project.geometry))}>? Help on results</button></div>
                {solved && solved.error && <div role="alert" className="alert-box">⚠ The analysis cannot run: {solved.error}</div>}
                {res && <ResultsView tab={rtab} res={res} l3={l3} l3Busy={l3Busy} project={project} />}
              </div>
            )}
            {tab === 'life' && (
              <div className="page"><RemainingLife project={project} res={res} error={solved && solved.error} onField={setField} /></div>
            )}
            {tab === 'plots' && (
              <div className="page">
                {solved && solved.error && <div role="alert" className="alert-box">⚠ The analysis cannot run: {solved.error}</div>}
                {res && <PlotsView res={res} l3={l3} l3Busy={l3Busy} project={project} active={plotN} onActive={setPlotN} onMsg={say} onHelp={() => setHelp(helpFor('plots'))} />}
              </div>
            )}
          </main>
        </>
      ) : (
        <StartPage recovery={recovery} onRestore={restoreRecovery} onDiscard={discardRecovery} recents={recents} onNew={() => setDialog('library')} onOpen={doOpen} onImport={() => xlsxInput.current && xlsxInput.current.click()} onRecent={openRecent} onHelp={() => setHelp({ topic: 's1' })} onQuick={() => createProject({ loadType: 'CONSTANT', system: sysPref })} />
      )}

      <div className="statusbar" role="status">
        <div className="cell grow">{status}</div>
        {has && solved && solved.error && <div className="cell problems" title={solved.error} role="button" tabIndex={0} onClick={() => setTab('results')}>⚠ Input problem</div>}
        {has && <div className="cell mono">{sifName(project)}</div>}
        {has && <div className="cell">{project.loadType === 'CONSTANT' ? 'Constant load' : 'Variable load'}</div>}
        {has && <div className="cell mono" style={{ opacity: pending ? 0.5 : 1 }}>{res ? `${res.initial.status} · Life ${fmtLife(life)} cycles · ${project.geometry === 'KPSCL' ? 'a' : 'c'}_lim ${Number((sys === 'FPS' ? res.summary.critical_c_mm / 25.4 : res.summary.critical_c_mm).toFixed(lengthDec))} ${sys === 'FPS' ? 'in' : 'mm'}` : 'No result'}</div>}
        <div className="cell">{sys} units</div>
        <div className="cell" style={{ borderRight: 0 }}>{dirty ? 'Modified' : 'Saved'}</div>
      </div>

      <input ref={xlsxInput} type="file" accept=".xlsx,.xlsm" style={{ display: 'none' }} aria-label="Import ATLAS workbook" onChange={e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) importXlsx(f); }} />
      {dialog === 'library' && <CaseLibrary initialLoad={has ? project.loadType : 'CONSTANT'} initialSystem={sys} onClose={() => setDialog(null)} onOpen={o => guard(() => createProject(o))} />}
      {help && <HelpDialog initial={help} onClose={() => setHelp(null)} />}
      {dialog === 'about' && <AboutDialog onClose={() => setDialog(null)} />}
      {dialog === 'keys' && <KeysDialog onClose={() => setDialog(null)} />}
      {dialog === 'info' && project && <InfoDialog info={project.project} onClose={() => setDialog(null)} onOk={v => { mutate(p => ({ ...p, project: v })); setDialog(null); }} />}
      {dialog && dialog.confirm && (
        <Dialog title={APP_NAME} width={420} onClose={() => setDialog(null)}
          footer={<><button className="btn" onClick={() => setDialog(null)}>Cancel</button><button className="btn primary" onClick={() => { const a = dialog.confirm.onYes; setDialog(null); a(); }}>{dialog.confirm.yes}</button></>}>
          <p style={{ margin: 0, color: 'var(--ink)', fontSize: 13 }}>{dialog.confirm.message}</p>
        </Dialog>
      )}
    </div>
  );
}

function StartPage({ recovery, onRestore, onDiscard, recents, onNew, onOpen, onImport, onRecent, onHelp, onQuick }) {
  return (
    <main className="workspace" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 480, padding: 24 }}>
        <LogoMark size={64} />
        <h1 style={{ margin: '14px 0 2px', fontSize: 24, color: 'var(--ink)', fontWeight: 600 }}>{APP_NAME}</h1>
        <div style={{ color: 'var(--body)', fontSize: 13 }}>Fracture mechanics and crack-growth assessment</div>
        <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>API 579-1 / ASME FFS-1 (2021) · Part 9 · plate cracks: KPTC · KPSCL1 · KPSCL2</div>
        {recovery && (
          <div role="alert" style={{ marginTop: 22, padding: '10px 14px', textAlign: 'left', background: 'var(--amber-dim)', border: '1px solid var(--amber-bdr)', borderRadius: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Unsaved work was recovered</div>
            <div style={{ fontSize: 12, color: 'var(--body)', marginTop: 2 }}>{recovery.name || 'Untitled analysis'} · last change {new Date(recovery.t).toLocaleString()}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><button className="btn primary" onClick={onRestore}>Restore</button><button className="btn" onClick={onDiscard}>Discard</button></div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 26, flexWrap: 'wrap' }}>
          <button className="btn primary" style={{ height: 32, minWidth: 130 }} onClick={onNew}>New Analysis…</button>
          <button className="btn" style={{ height: 32, minWidth: 130 }} onClick={onOpen}>Open Analysis…</button>
          <button className="btn" style={{ height: 32, minWidth: 190 }} onClick={onImport}>Import ATLAS Workbook…</button>
        </div>
        <div className="start-guide">
          <div className="start-guide-t">New to this program?</div>
          <div className="start-guide-s">The reference case is already filled in, so you can see a complete result straight away and then change the numbers to your own.</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={onQuick}>Start with the reference example</button>
            <button className="btn" onClick={onHelp}>Read the Getting Started guide</button>
          </div>
        </div>
        {recents.length > 0 && (
          <div style={{ marginTop: 26, textAlign: 'left' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Recent</div>
            {recents.map(r => <button key={r.path} className="recent" title={r.path} onClick={() => onRecent(r)}>{r.name} <span style={{ color: 'var(--faint)', marginLeft: 6 }}>{r.path.length > 54 ? '…' + r.path.slice(-52) : r.path}</span></button>)}
          </div>
        )}
        <div style={{ color: 'var(--faint)', fontSize: 11, marginTop: 30 }}>{CREDIT}</div>
      </div>
    </main>
  );
}

function AboutDialog({ onClose }) {
  const [info, setInfo] = useState(null);
  useEffect(() => { bridge.appInfo().then(setInfo).catch(() => {}); }, []);
  return (
    <Dialog title={`About ${APP_NAME}`} onClose={onClose} width={460} footer={<button className="btn primary" onClick={onClose}>OK</button>}>
      <div style={{ display: 'flex', gap: 16 }}><LogoMark size={52} />
        <div style={{ fontSize: 12, color: 'var(--body)', lineHeight: 1.6 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{APP_NAME}</div>
          <div>Version {info && info.version !== 'web' ? info.version : APP_VERSION}</div>
          <div>Crack cases: KPTC (through-wall) · KPSCL1 / KPSCL2 (surface, infinite length)</div>
          <div>Standard: API 579-1/ASME FFS-1 2021 · Part 9 (Levels 2 and 3)</div>
          <div>Calculation engine: ATLAS R8, ported to JavaScript and verified against the Python original</div>
          <div style={{ marginTop: 8, color: 'var(--muted)' }}>{CREDIT}</div>
        </div></div>
    </Dialog>
  );
}

function KeysDialog({ onClose }) {
  const rows = [['Ctrl+N', 'New analysis'], ['Ctrl+O', 'Open analysis'], ['Ctrl+S', 'Save'], ['Ctrl+Shift+S', 'Save as'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
    ['Ctrl+E', 'Export results (Excel)'], ['Ctrl+P', 'Print / save as PDF'], ['F5', 'Run analysis (show results)'], ['Ctrl+1 … Ctrl+9', 'Go to tab'], ['F1', 'Help for the page you are on'], ['F11', 'Full screen']];
  return (
    <Dialog title="Keyboard Shortcuts" onClose={onClose} width={380} footer={<button className="btn primary" onClick={onClose}>Close</button>}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><tbody>{rows.map(([k, d]) => (
        <tr key={k} style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '5px 0', fontFamily: 'var(--font-mono)', color: 'var(--ink)', width: 150 }}>{k}</td><td style={{ padding: '5px 0', color: 'var(--body)' }}>{d}</td></tr>))}</tbody></table>
    </Dialog>
  );
}
