import React from 'react';

/** Live schematic of the KPTC geometry. Crack and plate are drawn in proportion to c₀/W; thickness is symbolic. */
/** Surface-crack section: plate thickness t with a crack of depth a (infinite length), drawn in proportion to a/t */
export function SurfaceDiagram({ a0, t, unit = 'mm' }) {
  const valid = [a0, t].every(v => Number.isFinite(v) && v > 0);
  const ratio = valid ? a0 / t : 0;
  const bad = valid && ratio > 0.8;
  const pw = 200, ph = 150, x0 = 120, y0 = 40;
  const ad = Math.min(ratio, 1) * ph;
  const dec = unit === 'in' ? 3 : 1;
  const fmtL = v => (Number.isFinite(v) ? `${+v.toFixed(dec)} ${unit}` : '—');
  const ink = 'var(--body)', dim = 'var(--muted)', cx = x0 + pw / 2;
  return (
    <svg viewBox="0 0 440 250" width="100%" style={{ maxWidth: 480, display: 'block' }} role="img"
      aria-label={valid ? `Plate thickness ${fmtL(t)}, surface crack depth ${fmtL(a0)}` : 'Geometry incomplete'}>
      {[0.15, 0.4, 0.6, 0.85].map(f => (
        <g key={f} stroke="var(--brand)" strokeWidth="1.6" fill="none">
          <path d={`M${x0 + pw * f} ${y0 - 4}V${y0 - 26}M${x0 + pw * f - 4} ${y0 - 21}l4 -5 4 5`} />
          <path d={`M${x0 + pw * f} ${y0 + ph + 4}V${y0 + ph + 26}M${x0 + pw * f - 4} ${y0 + ph + 21}l4 5 4 -5`} />
        </g>
      ))}
      <rect x={x0} y={y0} width={pw} height={ph} fill="var(--surface)" stroke={ink} strokeWidth="1.4" />
      {valid && <path d={`M${cx - 3} ${y0} L${cx} ${y0 + ad} L${cx + 3} ${y0} Z`} fill="var(--red)" stroke="var(--red)" strokeWidth="1.2" strokeLinejoin="round" />}
      {valid && (<>
        <line x1={cx + 36} y1={y0} x2={cx + 36} y2={y0 + ad} stroke={ink} strokeWidth="1" />
        <path d={`M${cx + 32} ${y0}h8M${cx + 32} ${y0 + ad}h8`} stroke={ink} strokeWidth="1" />
        <text x={cx + 46} y={y0 + ad / 2 + 4} fontSize="11" fill={ink} fontFamily="var(--font-mono)" stroke="var(--surface)" strokeWidth="4" paintOrder="stroke">a₀ = {fmtL(a0)}</text>
      </>)}
      <line x1={x0 - 30} y1={y0} x2={x0 - 30} y2={y0 + ph} stroke={ink} strokeWidth="1" />
      <path d={`M${x0 - 34} ${y0}h8M${x0 - 34} ${y0 + ph}h8`} stroke={ink} strokeWidth="1" />
      <text x={x0 - 40} y={y0 + ph / 2 + 4} textAnchor="end" fontSize="11" fill={ink} fontFamily="var(--font-mono)">t = {fmtL(t)}</text>
      <text x={x0 + pw + 12} y={y0 + 12} fontSize="9" fill={dim}>cracked surface</text>
      <text x={cx} y={y0 + ph + 52} textAnchor="middle" fontSize="10" fill={dim}>crack length 2c → ∞ (conservative bound)</text>
      {valid && <text x={x0} y={246} fontSize="11" fill={bad ? 'var(--red)' : dim} fontFamily="var(--font-mono)">{bad ? 'a₀/t must not exceed 0.8' : `a₀ / t = ${ratio.toFixed(4)}`}</text>}
    </svg>
  );
}

export default function GeometryDiagram({ c0, W, t, unit = 'mm' }) {
  const valid = [c0, W, t].every(v => Number.isFinite(v) && v > 0);
  const ratio = valid ? c0 / W : 0;
  const tooBig = valid && ratio >= 1;
  const pw = 330, ph = 150, x0 = 56, y0 = 46, cx = x0 + pw / 2, cy = y0 + ph / 2;
  const cl = Math.max(2, Math.min(ratio, 1) * pw);          // crack length in px = (2c0 / 2W) · plate width
  const dec = unit === 'in' ? 3 : 1;
  const fmtL = v => (Number.isFinite(v) ? `${+v.toFixed(dec)} ${unit}` : '—');
  const ink = 'var(--body)', dim = 'var(--muted)';
  const sx = x0 + pw + 56;                                   // side section x
  return (
    <svg viewBox="0 0 520 276" width="100%" style={{ maxWidth: 560, display: 'block' }} role="img"
      aria-label={valid ? `Plate half-width ${fmtL(W)}, crack half-length ${fmtL(c0)}, thickness ${fmtL(t)}` : 'Geometry incomplete'}>
      {/* tension arrows */}
      {[0.14, 0.38, 0.62, 0.86].map(f => (
        <g key={f} stroke="var(--brand)" strokeWidth="1.6" fill="none">
          <path d={`M${x0 + pw * f} ${y0 - 4}V${y0 - 26}M${x0 + pw * f - 4} ${y0 - 21}l4 -5 4 5`} />
          <path d={`M${x0 + pw * f} ${y0 + ph + 4}V${y0 + ph + 26}M${x0 + pw * f - 4} ${y0 + ph + 21}l4 5 4 -5`} />
        </g>
      ))}
      <text x={x0 - 8} y={y0 - 12} textAnchor="end" fontSize="11" fill="var(--brand)" fontFamily="var(--font-mono)">σ</text>

      {/* plate */}
      <rect x={x0} y={y0} width={pw} height={ph} fill="var(--surface)" stroke={ink} strokeWidth="1.4" />
      {/* centre lines */}
      <line x1={cx} y1={y0 - 2} x2={cx} y2={y0 + ph + 2} stroke={dim} strokeWidth="0.8" strokeDasharray="6 3 1.5 3" />

      {/* crack */}
      {valid && (
        <>
          <line x1={cx - cl / 2} y1={cy} x2={cx + cl / 2} y2={cy}
            stroke={tooBig ? 'var(--red)' : 'var(--red)'} strokeWidth={tooBig ? 3 : 2.8} strokeLinecap="round"
            strokeDasharray={tooBig ? '5 3' : undefined} />
          {/* 2c0 */}
          <line x1={cx - cl / 2} y1={cy + 22} x2={cx + cl / 2} y2={cy + 22} stroke={ink} strokeWidth="1" />
          <path d={`M${cx - cl / 2} ${cy + 18}v8M${cx + cl / 2} ${cy + 18}v8`} stroke={ink} strokeWidth="1" />
          <text x={cx} y={cy + 38} textAnchor="middle" fontSize="11" fill={ink} fontFamily="var(--font-mono)" stroke="var(--surface)" strokeWidth="4" paintOrder="stroke">2c₀ = {fmtL(2 * c0)}</text>
        </>
      )}

      {/* 2W */}
      <line x1={x0} y1={y0 + ph + 38} x2={x0 + pw} y2={y0 + ph + 38} stroke={ink} strokeWidth="1" />
      <path d={`M${x0} ${y0 + ph + 34}v8M${x0 + pw} ${y0 + ph + 34}v8`} stroke={ink} strokeWidth="1" />
      <text x={cx} y={y0 + ph + 54} textAnchor="middle" fontSize="11" fill={ink} fontFamily="var(--font-mono)">
        2W = {valid || Number.isFinite(W) ? fmtL(2 * W) : '—'}
      </text>

      {/* side section: thickness */}
      <text x={sx + 15} y={y0 - 12} textAnchor="middle" fontSize="10" fill={dim}>Section</text>
      <rect x={sx} y={y0} width="30" height={ph} fill="var(--surface-2)" stroke={ink} strokeWidth="1.2" />
      <line x1={sx} y1={y0 + ph + 38} x2={sx + 30} y2={y0 + ph + 38} stroke={ink} strokeWidth="1" />
      <path d={`M${sx} ${y0 + ph + 34}v8M${sx + 30} ${y0 + ph + 34}v8`} stroke={ink} strokeWidth="1" />
      <text x={sx + 15} y={y0 + ph + 54} textAnchor="middle" fontSize="11" fill={ink} fontFamily="var(--font-mono)">t = {fmtL(t)}</text>
      <text x={sx + 15} y={y0 + ph / 2 + 4} textAnchor="middle" fontSize="9" fill={dim} transform={`rotate(-90 ${sx + 15} ${y0 + ph / 2})`}>through-wall</text>

      {valid && (
        <text x={x0} y={270} fontSize="11" fill={tooBig ? 'var(--red)' : dim} fontFamily="var(--font-mono)">
          {tooBig ? 'c₀ must be smaller than W' : `c₀ / W = ${ratio.toFixed(4)}`}
        </text>
      )}
      <text x={x0 + pw} y={270} textAnchor="end" fontSize="9" fill={dim}>schematic · thickness not to scale</text>
    </svg>
  );
}
