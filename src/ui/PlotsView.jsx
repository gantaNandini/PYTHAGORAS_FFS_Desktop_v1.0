import React, { useRef, useState, useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, ComposedChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot, Legend, Cell, LabelList } from 'recharts';
import * as O from '../model/outputs.js';
import { PLOT_HELP } from './guide.js';
import { exportChartPng } from '../desktop/exportPng.js';

const AX = { fontSize: 11, fill: 'var(--muted)' };
const C = { purple: '#7030A0', blue: '#2E75B6', red: '#C00000', green: '#00A150', orange: '#ED7D31', gold: '#BF8F00', grey: '#7F7F7F', navy: '#1F3864', teal: '#0B7A8C' };
const kfmt = v => (Math.abs(v) >= 1e6 ? `${+(v / 1e6).toPrecision(3)}M` : Math.abs(v) >= 1e3 ? `${+(v / 1e3).toPrecision(3)}k` : String(Number(Number(v).toPrecision(4))));
const tip = { contentStyle: { background: 'var(--panel)', border: '1px solid var(--border)', fontSize: 11 } };

export const PLOTS = [
  [1, 'Crack length vs cycles'], [2, 'Stress intensity vs cycles'], [3, 'Crack growth rate vs ΔK'], [4, 'SIF vs crack size'], [5, 'FAD with assessment locus'],
  [6, 'Lr / Kr vs crack size'], [7, 'FAD margin vs cycles'], [8, 'Remaining life / inspection'], [9, 'Load cycle / spectrum'], [10, 'Residual stress through thickness'],
  [11, 'L3 sensitivity tornado'], [12, 'L3 sensitivity on the FAD'], [13, 'Method D tearing on the FAD'], [14, 'J-R curve and toughness'],
];

/** clean ticks for a log axis: powers of ten (plus 2 and 5 when the range is short) that enclose the data */
function logTicks(vals) {
  const v = vals.filter(x => Number.isFinite(x) && x > 0); if (!v.length) return null;
  const lo = Math.min(...v), hi = Math.max(...v), e0 = Math.floor(Math.log10(lo)), e1 = Math.ceil(Math.log10(hi));
  const mults = e1 - e0 <= 2 ? [1, 2, 5] : [1], t = [];
  for (let e = e0; e <= e1; e++) for (const m of mults) t.push(Number((m * 10 ** e).toPrecision(12)));
  const below = t.filter(x => x <= lo * 1.000001), above = t.filter(x => x >= hi / 1.000001);
  const start = below.length ? below[below.length - 1] : t[0], end = above.length ? above[0] : t[t.length - 1];
  const ticks = t.filter(x => x >= start && x <= end);
  return ticks.length > 1 ? { ticks, domain: [start, end] } : null;
}
/** round-number ticks for a linear axis (about 5 intervals) */
function niceTicks(vals, zeroBased) {
  const v = vals.filter(Number.isFinite); if (v.length < 2) return null;
  let lo = Math.min(...v), hi = Math.max(...v); if (zeroBased && lo > 0) lo = 0; if (hi <= lo) return null;
  const raw = (hi - lo) / 5, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  const first = Math.ceil(lo / step - 1e-9) * step, last = Math.floor(hi / step + 1e-9) * step, ticks = [];
  for (let t = first; t <= last + step * 1e-9; t += step) ticks.push(Number(t.toPrecision(12)));
  return { ticks, step, lo, hi, top: Math.ceil(hi / step - 1e-9) * step, bottom: Math.floor(lo / step + 1e-9) * step };
}
const lfmt = v => (v >= 0.01 && v < 1e5 ? String(Number(v.toPrecision(3))) : Number(v).toExponential(0).replace('e+', 'e'));

/* ResponsiveContainer injects width/height into its direct child, so this wrapper must forward them */
function XY({ width, height, data, x, xl, yl, lines, logX, logY, refs, dots, xDomain, yDomain, xFmt }) {
  const xT = logX && !xDomain ? logTicks(data.map(d => d[x])) : null;
  const yT = logY && !yDomain ? logTicks(lines.flatMap(l => data.map(d => d[l.key]))) : null;
  const xN = !logX && !xDomain ? niceTicks(data.map(d => d[x]), false) : null;
  const yN = !logY && !yDomain ? niceTicks(lines.flatMap(l => data.map(d => d[l.key])).concat(0), true) : null;
  return (
    <LineChart width={width} height={height} data={data} margin={{ top: 10, right: 24, left: 8, bottom: 26 }}>
      <CartesianGrid stroke="var(--border)" strokeDasharray="4 3" />
      <XAxis dataKey={x} type="number" scale={logX ? 'log' : 'auto'} domain={xDomain || (xT ? xT.domain : logX ? ['auto', 'auto'] : ['dataMin', 'dataMax'])} ticks={xT ? xT.ticks : xN ? xN.ticks : undefined} allowDataOverflow={!!logX} tick={AX} tickFormatter={xFmt || (xT ? lfmt : kfmt)} label={{ value: xl, position: 'insideBottom', offset: -14, ...AX }} />
      <YAxis type="number" scale={logY ? 'log' : 'auto'} domain={yDomain || (yT ? yT.domain : logY ? ['auto', 'auto'] : yN ? [yN.bottom, yN.top] : [0, 'auto'])} ticks={yT ? yT.ticks : yN ? Array.from({ length: Math.round((yN.top - yN.bottom) / yN.step) + 1 }, (_, i) => Number((yN.bottom + i * yN.step).toPrecision(12))) : undefined} allowDataOverflow={!!logY} tick={AX} tickFormatter={yT ? lfmt : kfmt} width={64} label={{ value: yl, angle: -90, position: 'insideLeft', offset: 2, ...AX }} />
      <Tooltip {...tip} formatter={v => (typeof v === 'number' ? Number(v.toPrecision(6)) : v)} labelFormatter={v => `${xl.split('(')[0].trim()} = ${Number(Number(v).toPrecision(6))}`} />
      <Legend verticalAlign="top" height={50} />
      {lines.map(l => <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={l.w || 2} strokeDasharray={l.dash} dot={false} isAnimationActive={false} connectNulls />)}
      {(refs || []).map((r, i) => <ReferenceLine key={i} {...r} stroke={r.stroke || C.grey} strokeDasharray="4 3" label={r.text ? { value: r.text, position: 'insideTopRight', fill: r.stroke || C.grey, fontSize: 11 } : undefined} />)}
      {(dots || []).map((d, i) => <ReferenceDot key={i} x={d.x} y={d.y} r={5} fill={d.color || C.red} stroke="#fff" />)}
    </LineChart>
  );
}

/** Returns { chart, legend, subtitle, table? } for plot n */
function build(n, res, l3, sys, project) {
  const s = res.summary, h = O.thin(res.history, 1200), lu = O.unitOf('length', sys), ku = O.unitOf('K', sys), su = O.unitOf('stress', sys);
  const L = v => O.cv(v, 'length', sys), K = v => O.cv(v, 'K', sys);
  const lg = (arr) => arr.map(a => ({ name: a.name, color: a.color, dash: !!a.dash }));
  const isVar = res.case.load_type === 'VARIABLE';
  const g = O.geoOf(res), kp = g.type === 'KPTC';
  if (n === 1) {
    const data = h.map(r => ({ N: r.cycles, c: L(r.c), c2: kp ? L(r['2c']) : null }));
    const lines = [{ key: 'c', name: kp ? 'Half-length c' : 'Crack depth a', color: C.purple }, ...(kp ? [{ key: 'c2', name: 'Total length 2c', color: C.blue, dash: '5 3' }] : [])];
    return { legend: lg(lines), sub: `Integrated crack growth from c0 to the limiting flaw size; N = ${Math.round(s.life).toLocaleString('en-US')} cycles`,
      chart: <XY data={data} x="N" xl="Cycles, N" yl={`Crack ${kp ? 'length' : 'depth'} (${lu})`} lines={lines} refs={[{ y: L(s.critical_c_mm), stroke: C.red, text: `${s.beyond_limit && !kp ? 'Validity limit' : 'Limiting'} ${g.size} = ${Number(L(s.critical_c_mm).toPrecision(5))} ${lu}` }]} dots={[{ x: s.life, y: L(s.critical_c_mm) }]} /> };
  }
  if (n === 2) {
    const data = h.map(r => ({ N: r.cycles, Kmax: K(r.Kmax), dK: K(r.dK), KIP: K(r.KIP), KISR: K(r.KISR), th: r.dKth === null ? null : K(r.dKth) }));
    const lines = [{ key: 'Kmax', name: isVar ? 'Kmax (envelope)' : 'Kmax', color: C.red }, { key: 'dK', name: isVar ? 'ΔK (cycle-weighted)' : 'ΔK', color: C.blue }, { key: 'KIP', name: 'KIP (primary, FAD)', color: C.green, dash: '5 3' },
      { key: 'KISR', name: 'KISR (secondary + residual)', color: C.orange, dash: '2 3' }];
    if (!isVar && h[0] && h[0].dKth !== null) lines.push({ key: 'th', name: 'ΔKth', color: C.grey, dash: '1 3', w: 1 });
    return { legend: lg(lines), sub: 'Kmax, ΔK, KIP and KISR along the growth history', chart: <XY data={data} x="N" xl="Cycles, N" yl={`Stress intensity (${ku})`} lines={lines} /> };
  }
  if (n === 3) {
    const data = res.history.filter(r => r.rate > 0 && r.dK > 0).map(r => ({ dK: K(r.dK), rate: O.cv(r.rate, 'rate', sys) }));
    const lines = [{ key: 'rate', name: `Integrated d${g.size}/dN`, color: C.gold }];
    return { legend: lg(lines), sub: `${res.growth.equation} - ${res.growth.source} (log-log)`, chart: data.length ? <XY data={data} x="dK" xl={`ΔK (${ku})`} yl={`d${g.size}/dN (${O.unitOf('rate', sys)})`} lines={lines} logX logY xFmt={v => String(Number(Number(v).toPrecision(3)))} /> : null };
  }
  if (n === 4) {
    const data = res.sif.map(r => ({ c: L(r.c), KIP: K(r.KIP), KISR: K(r.KISR), Kres: K(r.Kres) }));
    const lines = [{ key: 'KIP', name: 'KIP (primary)', color: C.red }, { key: 'KISR', name: 'KISR (secondary + residual)', color: C.blue }, { key: 'Kres', name: 'K residual', color: C.gold, dash: '5 3' }];
    return { legend: lg(lines), sub: kp ? 'Eq. 9B.8 with Mb (9B.9) and fw (9B.11), at maximum load' : `${g.gid}: ${g.gid === 'KPSCL1' ? 'Eq. 9B.12' : 'weight function, Eqs. 9B.261/9B.262'} with G0, G1 (Table 9B.2), at maximum load`, chart: <XY data={data} x="c" xl={`Crack ${g.size_name} ${g.size} (${lu})`} yl={`Stress intensity (${ku})`} lines={lines} refs={[{ y: K(s.Kmat), text: `Kmat = ${Number(K(s.Kmat).toPrecision(5))} ${ku}` }]} /> };
  }
  if (n === 5) return { legend: [{ name: 'Level 2 FAD (Eq. 9.22)', color: C.navy }, { name: 'Assessment locus', color: C.orange }], sub: 'Figure 9.19 curve + cut-off; point 1 initial, point 2 limiting', chart: fadChart(res, [], null) };
  if (n === 6) {
    const data = res.sif.map(r => ({ c: L(r.c), Lr: r.Lr, Kr: r.Kr, allow: r.allow }));
    const lines = [{ key: 'Lr', name: 'Lr', color: C.purple }, { key: 'Kr', name: 'Kr', color: C.red }, { key: 'allow', name: 'Kr allowable', color: C.green, dash: '5 3' }];
    return { legend: lg(lines), sub: 'Limiting size where Kr meets the FAD (9.4.3.5)', chart: <XY data={data} x="c" xl={`Crack ${g.size_name} ${g.size} (${lu})`} yl="Ratio" lines={lines} refs={[{ x: L(s.critical_c_mm), text: `Limiting ${g.size}` }]} /> };
  }
  if (n === 7) {
    const data = h.map(r => ({ N: r.cycles, margin: r.margin }));
    const lines = [{ key: 'margin', name: 'FAD margin (Kr allowable - Kr)', color: C.green }];
    return { legend: lg(lines), sub: 'Margin reaches zero at the limiting flaw size', chart: <XY data={data} x="N" xl="Cycles, N" yl="FAD margin" lines={lines} yDomain={['auto', 'auto']} /> };
  }
  if (n === 8) {
    const data = [['Calculated remaining life', s.life, C.purple], ['Required life x margin', s.required_life * s.life_margin_factor, C.grey], ['Allowable service life', s.allowable_service_life, C.green], ['Inspection interval', s.inspection_interval, C.orange]]
      .map(([name, v, color]) => ({ name, v: v ?? 0, label: v === null ? 'n/a' : Math.round(v).toLocaleString('en-US'), color }));
    return { legend: [], sub: `${s.life_status} · allowable life = life / ${Number(s.life_margin_factor.toPrecision(6))}; interval = ${Number(s.inspection_fraction.toPrecision(6))} x allowable`,
      chart: (<BarChart data={data} margin={{ top: 24, right: 24, left: 8, bottom: 26 }}><CartesianGrid stroke="var(--border)" strokeDasharray="4 3" /><XAxis dataKey="name" tick={AX} interval={0} />
        <YAxis tick={AX} tickFormatter={kfmt} width={64} label={{ value: 'Cycles', angle: -90, position: 'insideLeft', ...AX }} /><Tooltip {...tip} />
        <Bar dataKey="v" isAnimationActive={false}>{data.map((d, i) => <Cell key={i} fill={d.color} />)}<LabelList dataKey="label" position="top" style={{ fontSize: 11, fontWeight: 700, fill: 'var(--ink)' }} /></Bar></BarChart>) };
  }
  if (n === 9) {
    if (isVar) {
      const data = res.case.history.map(([name, lo, hi, cyc]) => ({ name, lo, hi, cyc }));
      return { legend: [{ name: 'Min scale', color: C.blue }, { name: 'Max scale', color: C.red }, { name: 'Cycles / block', color: C.gold }], sub: 'Applied cyclic load definition (variable amplitude blocks)',
        chart: (<ComposedChart data={data} margin={{ top: 10, right: 24, left: 8, bottom: 26 }}><CartesianGrid stroke="var(--border)" strokeDasharray="4 3" /><XAxis dataKey="name" tick={AX} label={{ value: 'Block', position: 'insideBottom', offset: -14, ...AX }} />
          <YAxis yAxisId="a" tick={AX} width={50} label={{ value: 'Load scale', angle: -90, position: 'insideLeft', ...AX }} /><YAxis yAxisId="b" orientation="right" tick={AX} width={60} tickFormatter={kfmt} label={{ value: 'Cycles per block', angle: 90, position: 'insideRight', ...AX }} />
          <Tooltip {...tip} /><Legend verticalAlign="top" height={50} /><Bar yAxisId="a" dataKey="lo" name="Min scale" fill={C.blue} isAnimationActive={false} /><Bar yAxisId="a" dataKey="hi" name="Max scale" fill={C.red} isAnimationActive={false} />
          <Line yAxisId="b" dataKey="cyc" name="Cycles / block" stroke={C.gold} strokeWidth={2} isAnimationActive={false} /></ComposedChart>) };
    }
    const [lo, hi] = res.scales, Ld = res.loads;
    const data = Array.from({ length: 201 }, (_, i) => { const t = i / 100; const a = (lo + hi) / 2 + (hi - lo) / 2 * Math.sin(2 * Math.PI * t - Math.PI / 2);
      return { t, mem: O.cv((Ld.Pm + Ld.Sm) * a + Ld.Rm, 'stress', sys), bend: O.cv((Ld.Pb + Ld.Sb) * a + Ld.Rb, 'stress', sys) }; });
    const lines = [{ key: 'mem', name: 'Membrane: (Pm+Sm)·scale + Rm', color: C.red }, { key: 'bend', name: 'Bending: (Pb+Sb)·scale + Rb', color: C.blue }];
    return { legend: lg(lines), sub: `Constant-amplitude cycle (scale ${lo} → ${hi})`, chart: <XY data={data} x="t" xl="Cycle (two cycles shown)" yl={`Stress (${su})`} lines={lines} yDomain={['auto', 'auto']} xFmt={v => String(v)} /> };
  }
  if (n === 10) {
    const t = res.geom.t, Ld = res.loads, prof = res.residual.profile;
    const dR = res.dists && res.dists.R;
    const data = Array.from({ length: 101 }, (_, i) => { const x = t * i / 100; return { x: L(x), applied: O.cv(dR ? dR.value(x) : Ld.Rm + Ld.Rb * (1 - 2 * x / t), 'stress', sys) }; });
    const lines = [{ key: 'applied', name: dR ? `Applied in ${g.gid}: residual distribution` : 'Applied in KPTC: Rm + Rb(1 - 2x/t)', color: C.navy, dash: '5 3' }];
    let merged = data;
    if (prof) { merged = [...data, ...prof.x_mm.map((x, i) => ({ x: L(x), profile: O.cv(prof.sigma_MPa[i], 'stress', sys) }))].sort((a, b) => a.x - b.x); lines.unshift({ key: 'profile', name: `Annex 9D profile (${prof.equation})`, color: C.red }); }
    return { legend: lg(lines), sub: res.residual.note || '', chart: <XY data={merged} x="x" xl={`Through-thickness position x (${lu})`} yl={`Residual stress (${su})`} lines={lines} yDomain={['auto', 'auto']} refs={[{ y: 0 }]} /> };
  }
  const S = l3 && !l3.error ? l3.sensitivity : null, M = l3 && !l3.error ? l3.method_d : null;
  if (n === 11) {
    if (!S || !S.n_cases) return { missing: 'Method A sensitivity analysis is not selected (sheet 9_Level3).' };
    const base = S.base.life;
    const rows = S.rows.filter(r => r.lo && r.hi && r.lo.metrics && r.hi.metrics && base).map(r => ({ name: r.label, lo: (r.lo.metrics.life / base - 1) * 100, hi: (r.hi.metrics.life / base - 1) * 100, lop: r.lo.pct, hip: r.hi.pct }))
      .sort((a, b) => Math.max(Math.abs(a.lo), Math.abs(a.hi)) - Math.max(Math.abs(b.lo), Math.abs(b.hi)));
    const span = Math.max(10, ...rows.flatMap(r => [Math.abs(r.lo), Math.abs(r.hi)])) * 1.25;
    const req = (s.required_life * s.life_margin_factor / base - 1) * 100;
    return { legend: [{ name: 'Low value', color: C.blue }, { name: 'High value', color: C.red }, { name: 'Required life x factor', color: C.grey, dash: true }], sub: `Remaining-life change for the low / high value of each input [base = ${Math.round(base).toLocaleString('en-US')} cycles]`,
      chart: (<BarChart data={rows} layout="vertical" margin={{ top: 10, right: 40, left: 150, bottom: 26 }}><CartesianGrid stroke="var(--border)" strokeDasharray="4 3" />
        <XAxis type="number" domain={[-span, span]} tick={AX} tickFormatter={v => `${Math.round(v)}`} label={{ value: 'Change in remaining life (%)', position: 'insideBottom', offset: -14, ...AX }} />
        <YAxis type="category" dataKey="name" tick={AX} width={150} /><Tooltip {...tip} formatter={v => `${Number(v).toFixed(1)} %`} /><Legend verticalAlign="top" height={50} />
        <ReferenceLine x={0} stroke="var(--ink)" /><ReferenceLine x={req} stroke={C.grey} strokeDasharray="5 3" />
        <Bar dataKey="lo" name="Low value" fill={C.blue} isAnimationActive={false} /><Bar dataKey="hi" name="High value" fill={C.red} isAnimationActive={false} /></BarChart>) };
  }
  if (n === 12) {
    if (!S || !S.n_cases) return { missing: 'Method A sensitivity analysis is not selected (sheet 9_Level3).' };
    const pts = [];
    S.rows.forEach(r => ['lo', 'hi'].forEach(sd => { const m = r[sd] && r[sd].metrics; if (m) pts.push({ x: m.initial_Lr, y: m.initial_Kr, name: `${r.label.split(' (')[0]} ${r[sd].pct >= 0 ? '+' : ''}${r[sd].pct}%` }); }));
    const sp = [];
    if (S.combined && S.combined.metrics) sp.push({ x: S.combined.metrics.initial_Lr, y: S.combined.metrics.initial_Kr, name: 'Combined adverse' });
    if (S.psf && S.psf.metrics) sp.push({ x: S.psf.metrics.initial_Lr, y: S.psf.metrics.initial_Kr, name: 'PSF case' });
    return { legend: [{ name: 'Level 2 FAD', color: C.navy }, { name: 'Sensitivity cases', color: C.orange }, { name: 'Base case', color: C.green }, { name: 'Combined / PSF', color: C.red }], sub: 'Initial assessment point of every sensitivity case',
      chart: fadChart(res, pts, { base: { x: S.base.initial_Lr, y: S.base.initial_Kr }, special: sp }) };
  }
  if (n === 13) {
    if (!M) return { missing: 'Method D ductile tearing is not selected (sheet 9_Level3).' };
    const pts = M.points.map(p => ({ x: p.Lr, y: p.Kr, inside: p.inside }));
    return { legend: [{ name: 'FAD (Method A)', color: C.navy }, { name: 'Inside FAD', color: C.green }, { name: 'Outside FAD', color: C.red }, { name: 'Level 2 point', color: C.blue }], sub: `${M.outcome} · load factor at instability = ${M.F_instability.toFixed(3)}`,
      chart: fadChart(res, pts, { tearing: true, level2: { x: res.initial.Lr, y: res.initial.Kr } }) };
  }
  if (n === 14) {
    if (!M) return { missing: 'Method D ductile tearing is not selected (sheet 9_Level3).' };
    const ju = sys === 'SI' ? 'kJ/m²' : 'in-lb/in²';
    const data = M.points.map(p => ({ da: L(p.da), J: O.cv(p.J, 'J', sys), K: K(p.K), k2: K(M.Kmat_level2) }));
    return { legend: [{ name: 'J_R (J-R curve)', color: C.purple }, { name: 'K_J from J_R', color: C.red, dash: true }, { name: 'Level 2 Kmat', color: C.grey, dash: true }], sub: M.jr.equation,
      chart: (<ComposedChart data={data} margin={{ top: 10, right: 24, left: 8, bottom: 26 }}><CartesianGrid stroke="var(--border)" strokeDasharray="4 3" />
        <XAxis dataKey="da" type="number" domain={['dataMin', 'dataMax']} tick={AX} label={{ value: `Ductile tearing extension Δa (${lu})`, position: 'insideBottom', offset: -14, ...AX }} tickFormatter={v => String(Number(Number(v).toPrecision(3)))} />
        <YAxis yAxisId="a" tick={AX} width={60} label={{ value: `J_R (${ju})`, angle: -90, position: 'insideLeft', ...AX }} /><YAxis yAxisId="b" orientation="right" tick={AX} width={60} label={{ value: `Toughness K (${ku})`, angle: 90, position: 'insideRight', ...AX }} />
        <Tooltip {...tip} formatter={v => Number(v).toPrecision(5)} /><Legend verticalAlign="top" height={50} />
        <Line yAxisId="a" dataKey="J" name="J_R (J-R curve)" stroke={C.purple} strokeWidth={2.2} dot={false} isAnimationActive={false} />
        <Line yAxisId="b" dataKey="K" name="K_J from J_R" stroke={C.red} strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
        <Line yAxisId="b" dataKey="k2" name="Level 2 Kmat" stroke={C.grey} strokeWidth={1.4} strokeDasharray="2 3" dot={false} isAnimationActive={false} /></ComposedChart>) };
  }
  return { missing: 'Unknown plot' };
}

function fadChart(res, pts, opt) {
  const ini = res.initial, s = res.summary, lmax = ini.Lr_max, fad = O.fadXY(lmax).full;
  const loc = O.thin(res.history, 400).map(r => ({ x: r.Lr, y: r.Kr }));
  const maxY = opt && opt.tearing ? Math.max(1.2, ...pts.map(p => p.y * 1.05)) : 1.2;
  return (
    <ComposedChart margin={{ top: 10, right: 24, left: 8, bottom: 26 }}>
      <CartesianGrid stroke="var(--border)" strokeDasharray="4 3" />
      <XAxis dataKey="x" type="number" domain={[0, Math.max(lmax * 1.1, 0.5)]} tick={AX} label={{ value: 'Load ratio, Lr', position: 'insideBottom', offset: -14, ...AX }} />
      <YAxis dataKey="y" type="number" domain={[0, maxY]} tick={AX} label={{ value: 'Toughness ratio, Kr', angle: -90, position: 'insideLeft', ...AX }} />
      <Tooltip {...tip} formatter={v => Number(v).toFixed(4)} />
      <Legend verticalAlign="top" height={50} />
      <Line data={fad} dataKey="y" name="Level 2 FAD" stroke={C.navy} strokeWidth={2.4} dot={false} isAnimationActive={false} />
      {!opt && <Line data={loc} dataKey="y" name="Assessment locus" stroke={C.orange} strokeWidth={2} dot={false} isAnimationActive={false} />}
      {!opt && <ReferenceDot x={ini.Lr} y={ini.Kr} r={6} fill={C.green} stroke="#fff" />}
      {!opt && <ReferenceDot x={s.final_Lr} y={s.final_Kr} r={6} fill={C.red} stroke="#fff" />}
      {opt && opt.tearing && <Scatter data={pts.filter(p => p.inside)} dataKey="y" name="Inside FAD" fill={C.green} isAnimationActive={false} />}
      {opt && opt.tearing && <Scatter data={pts.filter(p => !p.inside)} dataKey="y" name="Outside FAD" fill={C.red} isAnimationActive={false} />}
      {opt && opt.tearing && <ReferenceDot x={opt.level2.x} y={opt.level2.y} r={6} fill={C.blue} stroke="#fff" />}
      {opt && opt.base && <Scatter data={pts} dataKey="y" name="Sensitivity cases" fill={C.orange} isAnimationActive={false} />}
      {opt && opt.base && <ReferenceDot x={opt.base.x} y={opt.base.y} r={6} fill={C.green} stroke="#fff" />}
      {opt && opt.special && opt.special.map(p => <ReferenceDot key={p.name} x={p.x} y={p.y} r={6} fill={C.red} stroke="#fff" label={{ value: p.name, position: 'right', fill: C.red, fontSize: 11 }} />)}
    </ComposedChart>
  );
}

export default function PlotsView({ res, l3, l3Busy, project, active, onActive, onMsg, onHelp }) {
  const ref = useRef(null);
  const sys = res.case.system;
  const [msg, setMsg] = useState('');
  const b = useMemo(() => build(active, res, l3, sys, project), [active, res, l3, sys, project]);
  const title = PLOTS.find(p => p[0] === active)[1];
  const needL3 = active >= 11;
  /* a few key numbers beside any line plot: start, middle and end of the curves */
  const keyRows = useMemo(() => {
    const el = b.chart; if (!el || !el.props || !Array.isArray(el.props.data) || !el.props.lines || !el.props.x) return null;
    const { data, x, lines, xl } = el.props; if (data.length < 2) return null;
    const f = v => (v === null || v === undefined || !Number.isFinite(v) ? '—' : kfmt(v));
    const idx = [0, Math.floor((data.length - 1) / 2), data.length - 1];
    return { xname: (xl || x).replace(/\s*\(.*$/, '').trim(), lines: lines.slice(0, 4), rows: idx.map(i => ({ x: f(data[i][x]), v: lines.slice(0, 4).map(l => f(data[i][l.key])) })) };
  }, [b]);
  const save = async () => {
    try {
      const name = `${O.geoOf(res).gid}_P${String(active).padStart(2, '0')}_${title.replace(/[^A-Za-z0-9]+/g, '_')}_${sys}.png`;
      await exportChartPng(ref.current, title, name, `${O.geoOf(res).gid} / ${O.geoOf(res).type === 'KPTC' ? 'RPTC' : 'RPSCL'} · ${res.case.load_type === 'VARIABLE' ? 'Variable' : 'Constant'} load · ${sys} units`, b.legend || []);
      setMsg(`Saved ${name}`); if (onMsg) onMsg(`Saved ${name}`);
    } catch (e) { setMsg(String(e.message || e)); }
    setTimeout(() => setMsg(''), 4000);
  };
  return (
    <div>
      <div className="plot-bar">
        <button className="btn" onClick={() => onActive(Math.max(1, active - 1))} disabled={active <= 1} aria-label="Previous plot">◀</button>
        <select className="plot-select" aria-label="Choose plot" value={active} onChange={e => onActive(Number(e.target.value))}>
          {PLOTS.map(([n, name]) => <option key={n} value={n}>{`P${String(n).padStart(2, '0')}  ${name}`}</option>)}
        </select>
        <button className="btn" onClick={() => onActive(Math.min(PLOTS.length, active + 1))} disabled={active >= PLOTS.length} aria-label="Next plot">▶</button>
        <span className="dim plot-sub">{b.sub || ''}</span>
        <span className="tb-spacer" />
        {msg && <span role="status" className="dim">{msg}</span>}
        <button className="btn" onClick={save} disabled={!b.chart}>Save as PNG</button>
      </div>
      <div className="plot-row">
        <div className="chart-box chart-square" ref={ref}>
          {needL3 && l3Busy ? <div className="chart-msg">Computing Level 3…</div>
            : b.missing ? <div className="chart-msg">{b.missing}{l3 && l3.error ? ` (${l3.error})` : ''}</div>
            : b.chart ? <ResponsiveContainer key={active} width="100%" height="100%">{b.chart}</ResponsiveContainer> : <div className="chart-msg">No data to plot (no crack growth).</div>}
        </div>
        <aside className="plot-help">
          <div className="plot-help-t">About this plot</div>
          <div className="plot-help-n">P{String(active).padStart(2, '0')} · {title}</div>
          <p>{PLOT_HELP[active]}</p>
          {keyRows && (
            <table className="plot-vals"><thead><tr><th>{keyRows.xname}</th>{keyRows.lines.map(l => <th key={l.key} style={{ color: l.color }}>{l.name}</th>)}</tr></thead>
              <tbody>{keyRows.rows.map((r, i) => <tr key={i}><td>{r.x}</td>{r.v.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody></table>
          )}
          <button className="btn" onClick={onHelp}>Plots explained in Help</button>
        </aside>
      </div>
    </div>
  );
}
