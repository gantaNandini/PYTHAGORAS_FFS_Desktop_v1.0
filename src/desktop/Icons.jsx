import React from 'react';

const P = {
  new:    <><path d="M4 1.5h5.5L13 5v9.5H4z"/><path d="M9.5 1.5V5H13"/></>,
  open:   <><path d="M1.5 4.5h4l1.5 1.5h7.5v7.5h-13z"/><path d="M1.5 13.5l2-6h12"/></>,
  save:   <><path d="M2 2h9.5L14 4.5V14H2z"/><path d="M4.5 2v4h6V2M4.5 14V9.5h7V14"/></>,
  run:    <><path d="M4.5 2.5l9 5.5-9 5.5z"/></>,
  csv:    <><path d="M8 1.5v8M4.8 6.8L8 10l3.2-3.2M2 12v2.5h12V12"/></>,
  print:  <><path d="M4.5 6V1.5h7V6M4.5 11.5h-3V6h13v5.5h-3"/><path d="M4.5 9.5h7v5h-7z"/></>,
  logo:   null,
};

export function Icon({ name, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      {P[name]}
    </svg>
  );
}

export function LogoMark({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 104" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="lmg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2EC4C4" /><stop offset="1" stopColor="#1BA8A8" />
        </linearGradient>
      </defs>
      <polygon points="60,4 116,100 4,100" fill="url(#lmg)" />
      <polygon points="60,22 72,44 60,38 48,44" fill="#fff" opacity=".95" />
      <polygon points="42,54 54,76 48,68 36,74" fill="#fff" opacity=".92" />
      <polygon points="78,54 84,74 72,68 66,76" fill="#fff" opacity=".92" />
      <polygon points="54,54 60,48 66,54 60,60" fill="#fff" opacity=".88" />
    </svg>
  );
}

/** Schematic of the KPTC geometry: centre through-wall crack in a plate. */
export function KptcDiagram({ width = 200 }) {
  const ink = 'var(--body)';
  return (
    <svg width={width} viewBox="0 0 200 170" role="img" aria-label="Through-wall crack in a flat plate: crack length 2c, plate width 2W, thickness t">
      <rect x="30" y="26" width="140" height="100" fill="var(--surface)" stroke={ink} strokeWidth="1.4" />
      <line x1="70" y1="76" x2="130" y2="76" stroke="var(--red)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M70 76l-3-3M130 76l3-3" stroke="var(--red)" strokeWidth="1.4" fill="none" />
      {/* 2c */}
      <line x1="70" y1="92" x2="130" y2="92" stroke={ink} strokeWidth="1" />
      <path d="M70 89v6M130 89v6" stroke={ink} strokeWidth="1" />
      <text x="100" y="105" textAnchor="middle" fontSize="11" fill={ink} fontFamily="var(--font-mono)">2c</text>
      {/* 2W */}
      <line x1="30" y1="142" x2="170" y2="142" stroke={ink} strokeWidth="1" />
      <path d="M30 138v8M170 138v8" stroke={ink} strokeWidth="1" />
      <text x="100" y="158" textAnchor="middle" fontSize="11" fill={ink} fontFamily="var(--font-mono)">2W</text>
      {/* remote tension arrows (top) */}
      {[50, 80, 110, 140].map(x => (
        <g key={x} stroke="var(--brand)" strokeWidth="1.4" fill="none">
          <path d={`M${x} 24V8M${x - 3} 12l3-4 3 4`} />
        </g>
      ))}
    </svg>
  );
}

/** Schematic of the surface-crack geometry: cross-section of a plate with a surface crack of depth a (infinite length). */
export function KpsclDiagram({ width = 200 }) {
  const ink = 'var(--body)';
  return (
    <svg width={width} viewBox="0 0 200 170" role="img" aria-label="Surface crack of depth a in a plate of thickness t, infinite length">
      <rect x="50" y="30" width="100" height="90" fill="var(--surface)" stroke={ink} strokeWidth="1.4" />
      <path d="M96 30 L100 80 L104 30 Z" fill="var(--red)" stroke="var(--red)" strokeWidth="1" strokeLinejoin="round" />
      {/* a */}
      <line x1="118" y1="30" x2="118" y2="80" stroke={ink} strokeWidth="1" />
      <path d="M114 30h8M114 80h8" stroke={ink} strokeWidth="1" />
      <text x="124" y="59" fontSize="11" fill={ink} fontFamily="var(--font-mono)">a</text>
      {/* t */}
      <line x1="36" y1="30" x2="36" y2="120" stroke={ink} strokeWidth="1" />
      <path d="M32 30h8M32 120h8" stroke={ink} strokeWidth="1" />
      <text x="22" y="78" fontSize="11" fill={ink} fontFamily="var(--font-mono)">t</text>
      {/* remote tension */}
      {[62, 80, 120, 138].map(x => (
        <g key={x} stroke="var(--brand)" strokeWidth="1.4" fill="none"><path d={`M${x} 28V10M${x - 3} 14l3-4 3 4`} /></g>
      ))}
      <text x="100" y="146" textAnchor="middle" fontSize="10" fill="var(--muted)">length 2c → ∞</text>
    </svg>
  );
}
