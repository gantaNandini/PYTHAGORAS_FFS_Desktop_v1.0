/**
 * exportPng.js — save the chart inside `container` as a PNG with a white background and a title,
 * always in the LIGHT palette so it prints and pastes into reports cleanly (even from dark theme).
 * Recharts draws with CSS variables, which a stand-alone SVG image cannot see, so they are resolved here.
 */
function lightVars() {
  const probe = document.createElement('div');
  probe.setAttribute('data-theme', 'light');
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const get = name => cs.getPropertyValue(name).trim();
  return { get, done: () => document.body.removeChild(probe) };
}

const resolve = (str, get) => str.replace(/var\((--[\w-]+)\)/g, (_m, n) => get(n) || 'currentColor');

function inlineVars(svg, get) {
  const all = [svg, ...svg.querySelectorAll('*')];
  all.forEach(el => {
    Array.from(el.attributes).forEach(a => {
      if (a.value.includes('var(')) el.setAttribute(a.name, resolve(a.value, get));
    });
  });
}

export async function exportChartPng(container, title, fileName, subtitle = '', legend = []) {
  const svg = container && container.querySelector('svg.recharts-surface');
  if (!svg) throw new Error('No chart to export.');
  const rect = svg.getBoundingClientRect();
  const w = Math.round(rect.width), h = Math.round(rect.height);
  const { get, done } = lightVars();
  let xml;
  const bg = get('--card') || '#ffffff', ink = get('--ink') || '#111', muted = get('--muted') || '#555';
  try {
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', w); clone.setAttribute('height', h);
    clone.setAttribute('font-family', '"Segoe UI", Arial, Helvetica, sans-serif');   // axis titles inherit this; the page CSS is not available in a stand-alone SVG
    if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
    inlineVars(clone, get);
    xml = new XMLSerializer().serializeToString(clone);
  } finally { done(); }

  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i); i.onerror = () => rej(new Error('The chart could not be rendered to an image.'));
      i.src = url;
    });
    // legend entries are HTML in the live chart, so they are drawn here
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = '12px "Segoe UI", Arial, sans-serif';
    const items = (legend || []).map(l => ({ ...l, w: measure.measureText(l.name).width + 30 }));
    let lx = 0, lines = items.length ? 1 : 0;
    items.forEach(it => { if (lx + it.w > w) { lines++; lx = 0; } it.line = lines - 1; it.x = lx; lx += it.w; });
    const scale = 2, pad = 16, head = (subtitle ? 56 : 40) + lines * 18;
    const canvas = document.createElement('canvas');
    // square image: the side is the larger of the content width/height, content is centred horizontally
    const side = Math.max(w + pad * 2, h + head + pad);
    canvas.width = side * scale;
    canvas.height = side * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = bg === '' ? '#fff' : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = ink;
    ctx.font = '700 15px "Segoe UI", Arial, sans-serif';
    ctx.fillText(title, pad, 26);
    if (subtitle) {
      ctx.fillStyle = muted;
      ctx.font = '12px "Segoe UI", Arial, sans-serif';
      ctx.fillText(subtitle, pad, 46);
    }
    const legendTop = subtitle ? 62 : 46;
    items.forEach(it => {
      const y = legendTop + it.line * 18;
      ctx.fillStyle = it.color; ctx.fillRect(pad + it.x, y - 9, 14, 3 + (it.dash ? 0 : 2));
      ctx.fillStyle = ink; ctx.font = '12px "Segoe UI", Arial, sans-serif'; ctx.fillText(it.name, pad + it.x + 20, y);
    });
    ctx.drawImage(img, Math.round((side - w) / 2), head, w, h);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('Could not create the image.');
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href; a.download = fileName;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(href); }, 200);
    return { width: canvas.width, height: canvas.height };
  } finally { URL.revokeObjectURL(url); }
}
