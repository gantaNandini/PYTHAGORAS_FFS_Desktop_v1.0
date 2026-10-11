import React, { useEffect } from 'react';

export default function Dialog({ title, onClose, children, footer, width = 560 }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog fade-in" role="dialog" aria-modal="true" aria-label={title} style={{ width }}>
        <div className="dialog-title">
          <span>{title}</span>
          <button onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}
