import React, { useState, useEffect, useRef } from 'react';
import { LogoMark } from './Icons';

/**
 * Menu bar with the usual desktop behaviour: click to open, hover to switch while open,
 * Esc / click outside to close, Left/Right arrows move between menus.
 * `menus`: [{ label, items: [{ label, onClick, kbd, disabled, checked } | 'sep'] }]
 */
export default function MenuBar({ menus }) {
  const [open, setOpen] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (open === null) return undefined;
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(null); };
    const onKey = e => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen(o => (o + 1) % menus.length);
      if (e.key === 'ArrowLeft') setOpen(o => (o - 1 + menus.length) % menus.length);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, menus.length]);

  const offsets = useRef([]);

  return (
    <div className="menubar" ref={ref} role="menubar">
      <div className="brand"><LogoMark size={15} /> PYTHAGORAS FFS</div>
      {menus.map((m, i) => (
        <button
          key={m.label}
          ref={el => { offsets.current[i] = el; }}
          role="menuitem" aria-haspopup="true" aria-expanded={open === i}
          className={`menu-btn${open === i ? ' open' : ''}`}
          onClick={() => setOpen(open === i ? null : i)}
          onMouseEnter={() => { if (open !== null) setOpen(i); }}
        >
          {m.label}
        </button>
      ))}
      {open !== null && (
        <div className="menu-pop" role="menu"
          style={{ left: offsets.current[open] ? offsets.current[open].offsetLeft : 0 }}>
          {menus[open].items.map((it, k) => it === 'sep'
            ? <div key={k} className="menu-sep" />
            : (
              <button key={`${k}-${it.label}`} role="menuitem" className="menu-item" disabled={it.disabled}
                onClick={() => { setOpen(null); it.onClick && it.onClick(); }}>
                {it.checked && <span className="tick">✓</span>}
                {it.label}
                {it.kbd && <span className="kbd">{it.kbd}</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
