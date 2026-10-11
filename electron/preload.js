/**
 * Preload — the only bridge between the web UI and the operating system.
 * The renderer has no Node.js access; it can call exactly these functions.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pfs', {
  isDesktop: true,
  info:       ()     => ipcRenderer.invoke('app:info'),
  openFile:   (o)    => ipcRenderer.invoke('file:open', o),
  readFile:   (p)    => ipcRenderer.invoke('file:read', p),
  saveFile:   (o)    => ipcRenderer.invoke('file:save', o),
  printToPDF: (o)    => ipcRenderer.invoke('print:pdf', o),
  print:      ()     => ipcRenderer.invoke('print:dialog'),
  message:    (o)    => ipcRenderer.invoke('dialog:message', o),
  command:    (cmd)  => ipcRenderer.invoke('window:command', cmd),
  setDirty:   (d)    => ipcRenderer.send('doc:dirty', !!d),
  onFileOpened: (cb) => {
    const h = (_e, f) => cb(f);
    ipcRenderer.on('file:opened', h);
    return () => ipcRenderer.removeListener('file:opened', h);
  },
});
