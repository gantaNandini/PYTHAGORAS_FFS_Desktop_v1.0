/**
 * bridge.js — one API for file/print/window actions.
 * Inside Electron it talks to the preload API (window.pfs).
 * In a plain browser (npm start without Electron) it falls back to
 * downloads and a hidden <input type=file>, so the UI can be developed anywhere.
 */
const pfs = typeof window !== 'undefined' ? window.pfs : undefined;
export const isDesktop = !!(pfs && pfs.isDesktop);

export const PROJECT_FILTERS = [{ name: 'PYTHAGORAS FFS Analysis (*.pfs)', extensions: ['pfs'] }];

function browserDownload(name, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

/** → { path, name, content } | null (cancelled) */
export async function openProjectFile() {
  if (isDesktop) return pfs.openFile({ filters: PROJECT_FILTERS });
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.pfs,application/json';
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve({ path: null, name: f.name, content: String(r.result) });
      r.onerror = () => resolve(null);
      r.readAsText(f);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Read a known path (recent files). Throws if it cannot be read. */
export async function readProjectFile(path) {
  if (isDesktop) return pfs.readFile(path);
  throw new Error('Recent files are only available in the desktop app.');
}

/** → { path, name } | null (cancelled). Throws on write failure. */
export async function saveProjectFile({ path, name, content, saveAs }) {
  if (isDesktop) {
    return pfs.saveFile({ path, defaultName: name, content, saveAs: !!saveAs, filters: PROJECT_FILTERS });
  }
  browserDownload(name, content);
  return { path: null, name };
}

export async function printToPDF(defaultName) {
  if (isDesktop) return pfs.printToPDF({ defaultName });
  window.print();
  return { path: null };
}

export function printDialog() {
  if (isDesktop) return pfs.print();
  window.print();
  return Promise.resolve();
}

export function showMessage(opts) {
  if (isDesktop) return pfs.message(opts);
  window.alert(`${opts.title ? opts.title + '\n\n' : ''}${opts.message || ''}`);
  return Promise.resolve({ response: 0 });
}

export const windowCommand = cmd => (isDesktop ? pfs.command(cmd) : Promise.resolve());
export const setDirty = d => { if (isDesktop) pfs.setDirty(d); };
export const onFileOpened = cb => (isDesktop && pfs.onFileOpened ? pfs.onFileOpened(cb) : () => {});
export const appInfo = () => (isDesktop ? pfs.info() : Promise.resolve({ version: 'web', platform: 'browser' }));
