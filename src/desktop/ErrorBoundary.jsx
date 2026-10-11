import React from 'react';

/** Shows a readable error screen instead of a blank window. Unsaved work is kept by the auto-recovery copy. */
export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null, copied: false }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { this.info = info && info.componentStack; }

  render() {
    const { error, copied } = this.state;
    if (!error) return this.props.children;
    const details = `PYTHAGORAS FFS — unexpected error\n${new Date().toISOString()}\n\n${String(error && error.stack ? error.stack : error)}\n${this.info || ''}`;
    return (
      <div role="alert" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg, #E9EDF3)', fontFamily: 'var(--font-sans, Segoe UI, sans-serif)' }}>
        <div style={{ maxWidth: 520, padding: 28, background: 'var(--card, #fff)', border: '1px solid var(--border-light, #ccc)', borderLeft: '4px solid var(--red, #BE2A2A)', borderRadius: 4, userSelect: 'text' }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 18, color: 'var(--ink, #111)' }}>Something went wrong</h1>
          <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--body, #333)' }}>
            PYTHAGORAS FFS hit an unexpected error. Your calculations are not affected, and any unsaved work was copied aside automatically:
            after reloading, the start page offers to restore it.
          </p>
          <pre style={{ margin: '12px 0', padding: 10, maxHeight: 130, overflow: 'auto', fontSize: 11, background: 'var(--surface, #eee)', border: '1px solid var(--border, #ddd)', borderRadius: 3, color: 'var(--body, #333)', whiteSpace: 'pre-wrap' }}>
            {String(error && error.message ? error.message : error)}
          </pre>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" onClick={() => window.location.reload()}>Reload</button>
            <button className="btn" onClick={() => { try { navigator.clipboard.writeText(details); this.setState({ copied: true }); } catch { /* clipboard unavailable */ } }}>
              {copied ? 'Copied' : 'Copy details'}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
