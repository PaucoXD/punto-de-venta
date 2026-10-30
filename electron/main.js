// Versión de escritorio: abre la misma app web en una ventana propia.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

if (!app.requestSingleInstanceLock()) app.quit();

let ventana;

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Punto de Venta',
    icon: path.join(__dirname, '..', 'iconos', 'icono-512.png'),
    backgroundColor: '#f3f5fa',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  ventana.maximize();
  ventana.once('ready-to-show', () => ventana.show());
  ventana.loadFile(path.join(__dirname, '..', 'index.html'));

  // Los enlaces externos se abren en el navegador normal
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

Menu.setApplicationMenu(Menu.buildFromTemplate([
  {
    label: 'Archivo',
    submenu: [
      { label: 'Recargar', accelerator: 'F5', role: 'reload' },
      { label: 'Pantalla completa', accelerator: 'F11', role: 'togglefullscreen' },
      { type: 'separator' },
      { label: 'Salir', role: 'quit' },
    ],
  },
  {
    label: 'Ver',
    submenu: [
      { label: 'Acercar', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
      { label: 'Alejar', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
      { label: 'Tamaño normal', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
    ],
  },
]));

app.on('second-instance', () => {
  if (ventana) { if (ventana.isMinimized()) ventana.restore(); ventana.focus(); }
});
app.whenReady().then(crearVentana);
app.on('window-all-closed', () => app.quit());
