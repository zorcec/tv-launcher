const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload loaded');

contextBridge.exposeInMainWorld('api', {
  openUrl: (url) => ipcRenderer.send('openUrl', url),
  toggleLights: () => ipcRenderer.send('toggleLights')
});
