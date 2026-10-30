// Versión de escritorio: abre la misma app web en una ventana propia.
const { app, BrowserWindow, Menu, dialog, shell, ipcMain, net } = require('electron');
const { autoUpdater } = require('electron-updater');
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
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.js') },
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

// ---------- Mercado Pago Point ----------
// La API de Mercado Pago no acepta llamadas desde una página, así que pasan por aquí.
// Solo se permiten las rutas de órdenes y terminales.
const API_MP = process.env.PDV_API_MP || 'https://api.mercadopago.com';
ipcMain.handle('mercado-pago', async (_e, { metodo = 'GET', ruta, token, cuerpo, idempotencia }) => {
  if (!/^\/(v1\/orders|terminals\/v1)(\/|\?|$)/.test(String(ruta))) throw new Error('Ruta no permitida');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (idempotencia) headers['X-Idempotency-Key'] = idempotencia;
  try {
    const r = await net.fetch(API_MP + ruta, { method: metodo, headers, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const texto = await r.text();
    let datos = null;
    try { datos = JSON.parse(texto); } catch (e) { datos = { message: texto }; }
    return { ok: r.ok, estado: r.status, datos };
  } catch (err) {
    return { ok: false, estado: 0, datos: { message: 'Sin conexión con Mercado Pago' } };
  }
});

// ---------- Actualizaciones ----------
// Revisa las Releases del repo en GitHub. Si hay versión nueva la baja en segundo plano
// (electron-updater comprueba el sha512 del archivo) y pregunta si reiniciar para instalarla.
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
let buscandoAMano = false;

autoUpdater.on('update-downloaded', async (info) => {
  const { response } = await dialog.showMessageBox(ventana, {
    type: 'info',
    title: 'Actualización lista',
    message: `Ya se descargó la versión ${info.version} de Punto de Venta.`,
    detail: 'Se instala al reiniciar la app. Tus datos no se borran.',
    buttons: ['Reiniciar ahora', 'Más tarde'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) autoUpdater.quitAndInstall();
});

autoUpdater.on('update-not-available', () => {
  if (!buscandoAMano) return;
  buscandoAMano = false;
  dialog.showMessageBox(ventana, { type: 'info', title: 'Sin actualizaciones', message: `Tienes la versión más reciente (${app.getVersion()}).` });
});

autoUpdater.on('update-available', (info) => {
  if (!buscandoAMano) return;
  buscandoAMano = false;
  dialog.showMessageBox(ventana, { type: 'info', title: 'Descargando actualización', message: `Se está descargando la versión ${info.version}. Te aviso cuando esté lista.` });
});

autoUpdater.on('error', (err) => {
  if (!buscandoAMano) return; // sin internet al revisar solo, no molestamos
  buscandoAMano = false;
  // Un 404 quiere decir que alcanzó la versión nueva a medio publicar, no que falte internet
  const subiendo = /404/.test(String(err?.message || err));
  dialog.showMessageBox(ventana, subiendo
    ? { type: 'info', title: 'Versión nueva en camino', message: 'Se está publicando una versión nueva. Vuelve a buscar en unos minutos.' }
    : { type: 'warning', title: 'No se pudo revisar', message: 'No se pudo buscar actualizaciones. Revisa tu conexión a internet.', detail: String(err?.message || err) });
});

function buscarActualizaciones(aMano = false) {
  if (!app.isPackaged) {
    if (aMano) dialog.showMessageBox(ventana, { message: 'Las actualizaciones solo funcionan en la app instalada.' });
    return;
  }
  buscandoAMano = aMano;
  autoUpdater.checkForUpdates().catch(() => {});
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
  {
    label: 'Ayuda',
    submenu: [
      { label: 'Buscar actualizaciones', click: () => buscarActualizaciones(true) },
      {
        label: 'Acerca de',
        click: () => dialog.showMessageBox(ventana, { title: 'Punto de Venta', message: `Punto de Venta ${app.getVersion()}`, detail: 'Hecho por PaucoXD.' }),
      },
    ],
  },
]));

app.on('second-instance', () => {
  if (ventana) { if (ventana.isMinimized()) ventana.restore(); ventana.focus(); }
});
app.whenReady().then(() => {
  crearVentana();
  // Al abrir y luego cada 4 horas
  setTimeout(() => buscarActualizaciones(), 5000);
  setInterval(() => buscarActualizaciones(), 4 * 60 * 60 * 1000);
});
app.on('window-all-closed', () => app.quit());
