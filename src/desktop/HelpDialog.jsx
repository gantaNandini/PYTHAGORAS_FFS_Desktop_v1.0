import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { HELP as HELP_BASE } from '../help/help.generated.js';
import { EXTRA_TOPICS } from '../help/help.extra.js';
const HELP = { ...HELP_BASE, topics: [...HELP_BASE.topics, ...EXTRA_TOPICS] };

/** Which Help section each screen opens (F1 and the "?" buttons). Keys are sheet ids / 'results' / 'plots'. */
export const HELP_CONTEXT = {
  '1_Geometry_Flaw': ['s4', 's4-1'], '2_Material': ['s3', 's3-2'], '3_Toughness': ['s5', 's5-1'], '4_Crack_Growth': ['s5', 's5-2'],
  '5_Loads': ['s6', 's6-1'], '6_Residual_Stress': ['s6', 's6-3'], '7_Load_History': ['s9', 's9-1'], '8_Controls': ['s10', 's10'],
  '9_Level3': ['s11', 's11-1'], results: ['s12', 's12-1'], plots: ['s12', 's12-2'], life: ['s18', 's18'],
};
/* surface crack (KPSCL1 / KPSCL2): the pages that differ have their own Help section */
const HELP_CONTEXT_SC = { '1_Geometry_Flaw': ['s17', 's17-1'], '5_Loads': ['s17', 's17-2'], '6_Residual_Stress': ['s17', 's17-4'], results: ['s17', 's17-5'] };
export const helpFor = (id, geometry) => { const c = (geometry === 'KPSCL' && HELP_CONTEXT_SC[id]) || HELP_CONTEXT[id]; return c ? { topic: c[0], section: c[1] } : { topic: 'intro' }; };

/* navigation order: follows the user's workflow rather than the numbering of the manual */
const ORDER = ['intro', 's1', 's13', 's3', 's4', 's17', 's5', 's6', 's10', 's12', 's18', 's14', 's2', 's7', 's8', 's9', 's11', 's15', 's16'];
const TOPICS = ORDER.map(id => HELP.topics.find(t => t.id === id)).filter(Boolean).concat(HELP.topics.filter(t => !ORDER.includes(t.id)));
const GROUP_ORDER = ['Start here', 'Entering a case', 'Results', 'Theory and worked examples', 'Reference'];

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const terms = q => q.trim().split(/\s+/).filter(t => t.length >= 2);

const markText = (text, ts) => {
  const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return ts.length ? safe.replace(new RegExp(`(${ts.map(esc).join('|')})`, 'gi'), '<mark>$1</mark>') : safe;
};

function search(q) {
  const ts = terms(q); if (!ts.length) return [];
  const out = [];
  for (const t of HELP.topics) for (const s of t.sections) {
    const low = `${t.title} ${s.title} ${s.text}`.toLowerCase();
    if (!ts.every(w => low.includes(w.toLowerCase()))) continue;
    const i = s.text.toLowerCase().indexOf(ts[0].toLowerCase());
    const a = Math.max(0, i - 70), snippet = i < 0 ? s.text.slice(0, 140) : `${a > 0 ? '… ' : ''}${s.text.slice(a, i + 110)} …`;
    const lw = ts[0].toLowerCase(), hits = Math.min(10, low.split(lw).length - 1);
    const score = (s.title.toLowerCase().includes(lw) ? 20 : 0) + (t.title.toLowerCase().includes(lw) ? 10 : 0) + hits;
    out.push({ topic: t, section: s, snippet, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 40);
}

export default function HelpDialog({ initial, onClose }) {
  const [topicId, setTopicId] = useState((initial && initial.topic) || 'intro');
  const [target, setTarget] = useState((initial && initial.section) || null);
  const [q, setQ] = useState('');
  const body = useRef(null), searchBox = useRef(null);
  const topic = TOPICS.find(t => t.id === topicId) || TOPICS[0];
  const idx = TOPICS.indexOf(topic);
  const results = useMemo(() => search(q), [q]);
  const ts = useMemo(() => terms(q), [q]);
  const groups = useMemo(() => GROUP_ORDER.map(g => [g, TOPICS.filter(t => t.group === g)]).filter(([, l]) => l.length), []);

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { if (q) setQ(''); else onClose(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); searchBox.current && searchBox.current.focus(); }
    };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [onClose, q]);

  /* open a topic (and scroll to a section inside it) */
  const go = useCallback((tid, sid) => { setTopicId(tid); setTarget(sid || null); setQ(''); }, []);
  useEffect(() => {
    if (!body.current) return;
    const el = target && body.current.querySelector(`[data-sec="${target}"]`);
    if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('h-flash'); const t = setTimeout(() => el.classList.remove('h-flash'), 1600); return () => clearTimeout(t); }
    body.current.scrollTop = 0; return undefined;
  }, [topicId, target]);

  const prev = TOPICS[idx - 1], next = TOPICS[idx + 1];
  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog help-dialog fade-in" role="dialog" aria-modal="true" aria-label="Help">
        <div className="dialog-title"><span>Help — {HELP.title}</span><button onClick={onClose} aria-label="Close">×</button></div>
        <div className="help-wrap">
          <nav className="help-nav" aria-label="Help topics">
            <div className="help-search"><input ref={searchBox} type="search" value={q} placeholder="Search Help…  (Ctrl+F)" aria-label="Search Help" onChange={e => setQ(e.target.value)} /></div>
            <div className="help-topics">
              {groups.map(([g, list]) => (
                <div key={g}>
                  <div className="help-group">{g}</div>
                  {list.map(t => (
                    <div key={t.id}>
                      <button className={`help-topic${t.id === topic.id && !q ? ' on' : ''}`} onClick={() => go(t.id)}>
                        <span className="help-num">{t.num || '·'}</span>{t.id === 'intro' ? 'About this Help' : t.title}</button>
                      {t.id === topic.id && !q && t.sections.length > 1 && (
                        <div className="help-subs">{t.sections.map(s => <button key={s.id} className={`help-sub${s.id === target ? ' on' : ''}`} onClick={() => go(t.id, s.id)}>{s.title.replace(/^\d+\.\d+\s*/, '')}</button>)}</div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </nav>
          <div className="help-body" ref={body}>
            {q ? (
              <div>
                <h2 className="help-h1">{results.length ? `${results.length} result${results.length > 1 ? 's' : ''} for “${q}”` : `Nothing found for “${q}”`}</h2>
                {!results.length && <p className="dim">Try a symbol (for example <b>Kmat</b>, <b>Lr</b>, <b>DeltaK</b>) or a word such as <b>threshold</b>, <b>inspection</b> or <b>units</b>.</p>}
                {results.map(r => (
                  <button key={r.section.id} className="help-result" onClick={() => go(r.topic.id, r.section.id)}>
                    <span className="help-result-t">{r.topic.num ? `${r.topic.num}. ` : ''}{r.topic.title}{r.section.title !== 'Overview' && ` › ${r.section.title}`}</span>
                    <span className="help-result-s" dangerouslySetInnerHTML={{ __html: markText(r.snippet, ts) }} />
                  </button>
                ))}
              </div>
            ) : (
              <article>
                <div className="help-kicker">{topic.group}</div>
                <h1 className="help-h1">{topic.num ? `${topic.num}. ` : ''}{topic.id === 'intro' ? 'How to use this Help' : topic.title}</h1>
                {topic.id === 'intro' && <div className="help-credit">{HELP.subtitle}<br />{HELP.preparedBy}<br />{HELP.org}</div>}
                {topic.sections.map(s => (
                  <section key={s.id} data-sec={s.id} className="help-sec">
                    {s.title !== 'Overview' && <h2 className="help-h2">{s.title}</h2>}
                    <div className="help-html" dangerouslySetInnerHTML={{ __html: s.html }} />
                  </section>
                ))}
                <div className="help-pager">
                  {prev ? <button className="btn" onClick={() => go(prev.id)}>← {prev.num ? `${prev.num}. ` : ''}{prev.id === 'intro' ? 'About this Help' : prev.title}</button> : <span />}
                  {next ? <button className="btn primary" onClick={() => go(next.id)}>{next.num}. {next.title} →</button> : <span />}
                </div>
              </article>
            )}
          </div>
        </div>
        <div className="dialog-foot help-foot"><span className="dim">F1 opens Help for the page you are on · Esc closes</span><button className="btn primary" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
