// Lo único que la página puede pedirle al proceso principal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('escritorio', {
  mercadoPago: (peticion) => ipcRenderer.invoke('mercado-pago', peticion),
});
