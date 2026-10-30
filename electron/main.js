// Versión de escritorio: abre la misma app web en una ventana propia.
const { app, BrowserWindow, Menu, dialog, shell, ipcMain, net } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { execFile } = require('child_process');

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

// ---------- Impresora de tickets ----------
ipcMain.handle('impresoras', async (e) => (await e.sender.getPrintersAsync()).map((i) => ({ nombre: i.name, predeterminada: !!i.isDefault })));

// Imprime la página tal como está (el ticket ya está armado) sin abrir la ventana de impresión
ipcMain.handle('imprimir', (e, { impresora }) => new Promise((resolve) => {
  e.sender.print({ silent: true, deviceName: impresora || '', printBackground: false, margins: { marginType: 'none' } },
    (ok, motivo) => resolve({ ok, motivo: ok ? '' : String(motivo || '') }));
}));

// El cajón va conectado a la impresora de tickets: se abre mandándole el pulso ESC/POS (ESC p) en crudo.
// Se manda a los dos conectores (pin 2 y pin 5) porque cada cajón usa uno.
const PULSO_CAJON = [27, 112, 0, 25, 250, 27, 112, 1, 25, 250];
const SCRIPT_CAJON = `
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class Crudo {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public class DocInfo { public string Nombre; public string Salida; public string Tipo; }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] static extern int StartDocPrinter(IntPtr h, int nivel, DocInfo di);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int escritos);
  public static bool Mandar(string impresora, byte[] datos) {
    IntPtr h; if (!OpenPrinter(impresora, out h, IntPtr.Zero)) return false;
    bool ok = false;
    if (StartDocPrinter(h, 1, new DocInfo { Nombre = "Abrir cajon", Tipo = "RAW" }) != 0) {
      if (StartPagePrinter(h)) { int escritos; ok = WritePrinter(h, datos, datos.Length, out escritos); EndPagePrinter(h); }
      EndDocPrinter(h);
    }
    ClosePrinter(h); return ok;
  }
}
"@
if ([Crudo]::Mandar($env:PDV_IMPRESORA, [byte[]](${PULSO_CAJON.join(',')}))) { exit 0 } else { exit 1 }`;

ipcMain.handle('abrir-cajon', async (e, { impresora }) => {
  if (process.platform !== 'win32') return { ok: false, motivo: 'Solo en Windows' };
  // El nombre va por variable de entorno para no meterlo dentro del script
  const existe = (await e.sender.getPrintersAsync()).some((i) => i.name === impresora);
  if (!existe) return { ok: false, motivo: 'No se encontró la impresora' };
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(SCRIPT_CAJON, 'utf16le').toString('base64')],
      { env: { ...process.env, PDV_IMPRESORA: impresora }, windowsHide: true, timeout: 20000 },
      (err) => resolve({ ok: !err, motivo: err ? 'La impresora no aceptó la orden' : '' }));
  });
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
