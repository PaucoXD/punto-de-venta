// Punto de venta: todo se guarda en localStorage de este navegador.
'use strict';

const CLAVE = 'pdv-datos-v1';

const vacio = () => ({
  ajustes: { negocio: 'Mi Negocio', direccion: '', telefono: '', pie: '¡Gracias por su compra!', stockMinDefault: 3 },
  productos: [],
  clientes: [],
  ventas: [],
  abonos: [],
  movimientos: [], // entradas y salidas de efectivo
  cortes: [],
  folio: 0,
});

let db = cargar();
let carrito = []; // { productoId, cant, precioManual }

function cargar() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE));
    if (d) return Object.assign(vacio(), d, { ajustes: Object.assign(vacio().ajustes, d.ajustes) });
  } catch (e) { /* datos dañados o sin acceso: empezamos vacío */ }
  return vacio();
}

function guardar() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(db));
  } catch (e) {
    aviso('No se pudo guardar. Descarga un respaldo en Ajustes.');
  }
}

// ---------- Utilidades ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = (v) => { const n = parseFloat(String(v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; };
const redondear = (n) => Math.round(n * 100) / 100;
const dinero = (n) => '$' + redondear(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sinAcentos = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fecha = (t) => new Date(t).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
const hora = (t) => new Date(t).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

const producto = (pid) => db.productos.find((p) => p.id === pid);
const cliente = (cid) => db.clientes.find((c) => c.id === cid);
const stockMin = (p) => (p.stockMin === '' || p.stockMin == null ? num(db.ajustes.stockMinDefault) : num(p.stockMin));

let avisoTimer;
function aviso(texto) {
  const el = $('#aviso');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => (el.hidden = true), 2600);
}

// ---------- Navegación ----------
function mostrarVista(nombre) {
  $$('#tabs button').forEach((b) => b.classList.toggle('activa', b.dataset.vista === nombre));
  $$('.vista').forEach((v) => v.classList.toggle('activa', v.id === 'vista-' + nombre));
  ({ vender: pintarVender, productos: pintarProductos, clientes: pintarClientes, caja: pintarCaja, ajustes: pintarAjustes })[nombre]();
  if (nombre === 'vender') $('#buscar').focus();
}
$('#tabs').addEventListener('click', (e) => { if (e.target.dataset.vista) mostrarVista(e.target.dataset.vista); });

// ---------- Ventana de formulario ----------
// campos: [{ nombre, etiqueta, tipo, valor, opciones, requerido, ancho }]
function formulario(titulo, campos, textoOk = 'Guardar', textoCancelar = 'Cancelar') {
  const modal = $('#modal');
  $('#modal-titulo').textContent = titulo;
  $('#modal-ok').textContent = textoOk;
  $('#modal-cancelar').textContent = textoCancelar;
  const cuerpo = $('#modal-cuerpo');
  cuerpo.innerHTML = '';
  let fila = null;
  campos.forEach((c) => {
    if (c.tipo === 'texto') {
      const p = document.createElement('p');
      p.className = 'muted';
      p.innerHTML = c.valor;
      cuerpo.appendChild(p);
      fila = null;
      return;
    }
    const label = document.createElement('label');
    label.textContent = c.etiqueta;
    let input;
    if (c.opciones) {
      input = document.createElement('select');
      c.opciones.forEach(([v, t]) => input.add(new Option(t, v, false, v === c.valor)));
    } else {
      input = document.createElement('input');
      input.type = c.tipo || 'text';
      if (c.tipo === 'number') { input.step = c.paso || '0.01'; input.inputMode = 'decimal'; }
      input.value = c.valor ?? '';
    }
    input.name = c.nombre;
    input.required = !!c.requerido;
    label.appendChild(input);
    if (c.ancho === 'medio') {
      if (!fila) { fila = document.createElement('div'); fila.className = 'dos'; cuerpo.appendChild(fila); }
      fila.appendChild(label);
      if (fila.children.length === 2) fila = null;
    } else {
      fila = null;
      cuerpo.appendChild(label);
    }
  });
  modal.returnValue = '';
  modal.showModal();
  const primero = cuerpo.querySelector('input, select');
  if (primero) primero.focus();
  return new Promise((resolver) => {
    modal.addEventListener('close', () => {
      if (modal.returnValue !== 'ok') return resolver(null);
      const datos = {};
      $$('input, select', cuerpo).forEach((i) => (datos[i.name] = i.value.trim()));
      resolver(datos);
    }, { once: true });
  });
}

// ---------- Vender ----------
const buscar = $('#buscar');
let selSugerencia = -1;

function buscarProductos(q, limite = 12) {
  const t = sinAcentos(q).split(/\s+/).filter(Boolean);
  if (!t.length) return [];
  return db.productos
    .filter((p) => {
      const texto = sinAcentos([p.codigo, p.nombre, p.marca, p.categoria].join(' '));
      return t.every((x) => texto.includes(x));
    })
    .slice(0, limite);
}

// "3*7501234" agrega 3 piezas del código 7501234
function leerCantidad(q) {
  const m = q.match(/^(\d+(?:\.\d+)?)\s*[*xX]\s*(.+)$/);
  return m ? { cant: num(m[1]), q: m[2].trim() } : { cant: 1, q: q.trim() };
}

function pintarSugerencias() {
  const { q } = leerCantidad(buscar.value);
  const lista = $('#sugerencias');
  const res = q.length >= 2 ? buscarProductos(q) : [];
  selSugerencia = res.length ? 0 : -1;
  lista.innerHTML = res.map((p, i) => `
    <li data-id="${p.id}" class="${i === 0 ? 'sel' : ''}">
      <span>${esc(p.nombre)} <small>${esc(p.marca || '')} · ${esc(p.codigo || 's/código')}</small></span>
      <span>${dinero(p.precio)} <small>(${num(p.stock)})</small></span>
    </li>`).join('');
}

function agregarAlCarrito(p, cant = 1) {
  const linea = carrito.find((l) => l.productoId === p.id);
  if (linea) linea.cant = redondear(linea.cant + cant);
  else carrito.push({ productoId: p.id, cant });
  const total = linea ? linea.cant : cant;
  if (total > num(p.stock)) aviso(`Ojo: solo hay ${num(p.stock)} de "${p.nombre}" en inventario`);
  buscar.value = '';
  $('#sugerencias').innerHTML = '';
  pintarVender();
}

buscar.addEventListener('input', pintarSugerencias);
buscar.addEventListener('keydown', (e) => {
  const items = $$('#sugerencias li');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!items.length) return;
    e.preventDefault();
    selSugerencia = (selSugerencia + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach((li, i) => li.classList.toggle('sel', i === selSugerencia));
    items[selSugerencia].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Escape') {
    $('#sugerencias').innerHTML = '';
  }
});

$('#form-buscar').addEventListener('submit', (e) => {
  e.preventDefault();
  const { cant, q } = leerCantidad(buscar.value);
  if (!q) return;
  // Primero el código exacto (lector de código de barras), luego la sugerencia elegida
  const exacto = db.productos.find((p) => p.codigo && sinAcentos(p.codigo) === sinAcentos(q));
  if (exacto) return agregarAlCarrito(exacto, cant);
  const li = $$('#sugerencias li')[selSugerencia];
  if (li) return agregarAlCarrito(producto(li.dataset.id), cant);
  aviso(`No encontré "${q}"`);
  buscar.select();
});

$('#sugerencias').addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  agregarAlCarrito(producto(li.dataset.id), leerCantidad(buscar.value).cant);
  buscar.focus();
});

// Precio de la línea: manual si lo cambiaron, si no mayoreo cuando llega a la cantidad mínima
function precioLinea(l) {
  const p = producto(l.productoId);
  if (l.precioManual != null) return l.precioManual;
  if (num(p.mayoreo) > 0 && num(p.minMayoreo) > 0 && l.cant >= num(p.minMayoreo)) return num(p.mayoreo);
  return num(p.precio);
}
const esMayoreo = (l) => l.precioManual == null && precioLinea(l) !== num(producto(l.productoId).precio);
const totalCarrito = () => redondear(carrito.reduce((s, l) => s + precioLinea(l) * l.cant, 0));

function pintarVender() {
  carrito = carrito.filter((l) => producto(l.productoId));
  const tbody = $('#carrito tbody');
  tbody.innerHTML = carrito.map((l, i) => {
    const p = producto(l.productoId);
    const precio = precioLinea(l);
    return `<tr>
      <td>${esc(p.nombre)}${esMayoreo(l) ? '<span class="tag">mayoreo</span>' : ''}<br><small class="muted">${esc(p.codigo || '')}</small></td>
      <td class="num"><input class="cant" type="number" min="0" step="any" value="${l.cant}" data-i="${i}"></td>
      <td class="num"><button class="link" data-precio="${i}" title="Cambiar precio">${dinero(precio)}</button></td>
      <td class="num">${dinero(precio * l.cant)}</td>
      <td><button class="link peligro" data-quitar="${i}" title="Quitar">✕</button></td>
    </tr>`;
  }).join('');
  $('#carrito-vacio').hidden = carrito.length > 0;
  $('#total').textContent = dinero(totalCarrito());
  const piezas = redondear(carrito.reduce((s, l) => s + l.cant, 0));
  $('#piezas').textContent = `${piezas} pieza${piezas === 1 ? '' : 's'}`;

  const sel = $('#venta-cliente');
  const actual = sel.value;
  sel.innerHTML = '<option value="">Elige un cliente…</option>' +
    db.clientes.map((c) => `<option value="${c.id}">${esc(c.nombre)} (debe ${dinero(c.saldo)})</option>`).join('');
  sel.value = actual;
  pintarCambio();
}

$('#carrito').addEventListener('change', (e) => {
  if (!e.target.classList.contains('cant')) return;
  const l = carrito[e.target.dataset.i];
  l.cant = Math.max(0, num(e.target.value));
  if (l.cant === 0) carrito.splice(e.target.dataset.i, 1);
  pintarVender();
});

$('#carrito').addEventListener('click', async (e) => {
  const quitar = e.target.dataset.quitar;
  if (quitar != null) { carrito.splice(quitar, 1); pintarVender(); return; }
  const i = e.target.dataset.precio;
  if (i == null) return;
  const l = carrito[i];
  const r = await formulario('Cambiar precio', [
    { nombre: 'precio', etiqueta: `Precio para "${producto(l.productoId).nombre}"`, tipo: 'number', valor: precioLinea(l), requerido: true },
  ]);
  if (r) { l.precioManual = num(r.precio); pintarVender(); }
  buscar.focus();
});

const pago = $('#pago');
pago.addEventListener('change', () => {
  $('#campo-cliente').hidden = pago.value !== 'credito';
  $('#campo-recibido').hidden = pago.value !== 'efectivo';
  pintarCambio();
});
$('#recibido').addEventListener('input', pintarCambio);

function pintarCambio() {
  const el = $('#cambio');
  el.className = 'cambio';
  el.textContent = '';
  if (pago.value !== 'efectivo' || $('#recibido').value === '') return;
  const dif = num($('#recibido').value) - totalCarrito();
  el.textContent = dif >= 0 ? `Cambio: ${dinero(dif)}` : `Faltan: ${dinero(-dif)}`;
  el.classList.add(dif >= 0 ? 'ok' : 'falta');
}

$('#btn-vaciar').addEventListener('click', () => {
  if (carrito.length && !confirm('¿Cancelar esta venta?')) return;
  limpiarVenta();
});

function limpiarVenta() {
  carrito = [];
  $('#recibido').value = '';
  pago.value = 'efectivo';
  pago.dispatchEvent(new Event('change'));
  $('#venta-cliente').value = '';
  pintarVender();
  buscar.focus();
}

async function cobrar() {
  if (!carrito.length) return aviso('No hay productos en la venta');
  const total = totalCarrito();
  const forma = pago.value;
  let recibido = total;
  let clienteId = null;

  if (forma === 'efectivo') {
    recibido = $('#recibido').value === '' ? total : num($('#recibido').value);
    if (recibido < total) { aviso('El pago es menor al total'); $('#recibido').focus(); return; }
  }
  if (forma === 'credito') {
    clienteId = $('#venta-cliente').value;
    if (!clienteId) { aviso('Elige el cliente para el crédito'); $('#venta-cliente').focus(); return; }
    const c = cliente(clienteId);
    if (num(c.limite) > 0 && c.saldo + total > num(c.limite) &&
        !confirm(`${c.nombre} pasaría su límite de crédito (${dinero(c.limite)}). ¿Vender de todos modos?`)) return;
  }

  const venta = {
    id: id(),
    folio: ++db.folio,
    fecha: Date.now(),
    items: carrito.map((l) => {
      const p = producto(l.productoId);
      return { productoId: p.id, codigo: p.codigo, nombre: p.nombre, cant: l.cant, precio: precioLinea(l), costo: num(p.costo) };
    }),
    total,
    pago: forma,
    recibido: redondear(recibido),
    cambio: redondear(recibido - total),
    clienteId,
    cancelada: false,
  };
  venta.items.forEach((it) => { const p = producto(it.productoId); p.stock = redondear(num(p.stock) - it.cant); });
  if (clienteId) { const c = cliente(clienteId); c.saldo = redondear(c.saldo + total); }
  db.ventas.push(venta);
  guardar();
  limpiarVenta();

  const r = await formulario(`Venta #${venta.folio} registrada`, [
    { tipo: 'texto', valor: `Total <b>${dinero(total)}</b>` + (forma === 'efectivo' ? ` · Cambio <b>${dinero(venta.cambio)}</b>` : '') },
  ], 'Imprimir ticket', 'Listo');
  if (r) imprimirTicket(venta);
  buscar.focus();
}
$('#btn-cobrar').addEventListener('click', cobrar);

document.addEventListener('keydown', (e) => {
  if (e.key === 'F2' && $('#vista-vender').classList.contains('activa')) { e.preventDefault(); cobrar(); }
});

// ---------- Ticket ----------
const NOMBRE_PAGO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta / transferencia', credito: 'Crédito' };

function imprimirTicket(v) {
  const a = db.ajustes;
  const c = v.clienteId ? cliente(v.clienteId) : null;
  $('#ticket').innerHTML = `
    <h4>${esc(a.negocio)}</h4>
    ${a.direccion ? `<div class="c">${esc(a.direccion)}</div>` : ''}
    ${a.telefono ? `<div class="c">Tel. ${esc(a.telefono)}</div>` : ''}
    <hr>
    <div>Folio: ${v.folio}${v.cancelada ? ' (CANCELADA)' : ''}</div>
    <div>${fecha(v.fecha)}</div>
    ${c ? `<div>Cliente: ${esc(c.nombre)}</div>` : ''}
    <hr>
    <table>${v.items.map((it) => `
      <tr><td colspan="2">${esc(it.nombre)}</td></tr>
      <tr><td>${it.cant} x ${dinero(it.precio)}</td><td class="r">${dinero(it.cant * it.precio)}</td></tr>`).join('')}
    </table>
    <hr>
    <table>
      <tr><td><b>TOTAL</b></td><td class="r"><b>${dinero(v.total)}</b></td></tr>
      <tr><td>${NOMBRE_PAGO[v.pago]}</td><td class="r">${dinero(v.recibido)}</td></tr>
      ${v.pago === 'efectivo' ? `<tr><td>Cambio</td><td class="r">${dinero(v.cambio)}</td></tr>` : ''}
      ${c ? `<tr><td>Saldo pendiente</td><td class="r">${dinero(c.saldo)}</td></tr>` : ''}
    </table>
    <hr>
    <div class="c">${esc(a.pie)}</div>`;
  window.print();
}

// ---------- Cámara (lector de códigos del navegador, Chrome/Android) ----------
let flujo = null;
$('#btn-camara').addEventListener('click', async () => {
  if (!('BarcodeDetector' in window)) return aviso('Este navegador no puede leer códigos con la cámara. Usa Chrome en Android o un lector USB.');
  try {
    flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (e) {
    return aviso('No se pudo abrir la cámara');
  }
  const video = $('#video');
  video.srcObject = flujo;
  await video.play();
  $('#modal-camara').showModal();
  const detector = new BarcodeDetector();
  const leer = async () => {
    if (!flujo) return;
    try {
      const codigos = await detector.detect(video);
      if (codigos.length) {
        cerrarCamara();
        buscar.value = codigos[0].rawValue;
        $('#form-buscar').requestSubmit();
        return;
      }
    } catch (e) { /* cuadro sin imagen todavía */ }
    requestAnimationFrame(leer);
  };
  leer();
});
function cerrarCamara() {
  if (flujo) flujo.getTracks().forEach((t) => t.stop());
  flujo = null;
  $('#modal-camara').close();
}
$('#btn-cerrar-camara').addEventListener('click', cerrarCamara);
$('#modal-camara').addEventListener('cancel', cerrarCamara);

// ---------- Productos ----------
const CAMPOS_PRODUCTO = [
  ['codigo', 'Código de barras o clave'],
  ['nombre', 'Nombre'],
  ['marca', 'Marca'],
  ['categoria', 'Categoría'],
  ['costo', 'Costo'],
  ['precio', 'Precio'],
  ['mayoreo', 'Precio mayoreo'],
  ['minMayoreo', 'Mayoreo desde (piezas)'],
  ['stock', 'Existencia'],
  ['stockMin', 'Stock mínimo'],
];
const NUMERICOS = ['costo', 'precio', 'mayoreo', 'minMayoreo', 'stock', 'stockMin'];

function pintarProductos() {
  const q = $('#filtro-productos').value;
  const soloBajos = $('#solo-bajos').checked;
  let lista = q ? buscarProductos(q, Infinity) : [...db.productos].sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (soloBajos) lista = lista.filter((p) => num(p.stock) <= stockMin(p));
  const tbody = $('#tabla-productos tbody');
  tbody.innerHTML = lista.slice(0, 500).map((p) => {
    const s = num(p.stock);
    const clase = s <= 0 ? 'agotado' : s <= stockMin(p) ? 'bajo' : '';
    return `<tr>
      <td>${esc(p.codigo)}</td>
      <td>${esc(p.nombre)}${p.categoria ? ` <small class="muted">· ${esc(p.categoria)}</small>` : ''}</td>
      <td>${esc(p.marca)}</td>
      <td class="num">${dinero(p.precio)}</td>
      <td class="num">${num(p.mayoreo) ? `${dinero(p.mayoreo)} <small class="muted">≥${num(p.minMayoreo)}</small>` : '—'}</td>
      <td class="num ${clase}">${s}</td>
      <td>
        <button class="link" data-surtir="${p.id}">+ Surtir</button>
        <button class="link" data-editar="${p.id}">Editar</button>
        <button class="link peligro" data-borrar="${p.id}">Borrar</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="7" class="vacio">${db.productos.length ? 'Sin resultados' : 'Aún no hay productos. Agrega uno o importa un CSV.'}</td></tr>`;

  const bajos = db.productos.filter((p) => num(p.stock) <= stockMin(p)).length;
  const valor = db.productos.reduce((s, p) => s + Math.max(0, num(p.stock)) * num(p.costo), 0);
  $('#resumen-inventario').textContent =
    `${db.productos.length} productos · ${bajos} con poco stock · inventario a costo ${dinero(valor)}` +
    (lista.length > 500 ? ' · mostrando 500, usa el buscador' : '');
}
$('#filtro-productos').addEventListener('input', pintarProductos);
$('#solo-bajos').addEventListener('change', pintarProductos);

async function editarProducto(p) {
  const r = await formulario(p ? 'Editar producto' : 'Nuevo producto', CAMPOS_PRODUCTO.map(([k, etiqueta]) => ({
    nombre: k,
    etiqueta,
    tipo: NUMERICOS.includes(k) ? 'number' : 'text',
    paso: k === 'minMayoreo' ? '1' : 'any',
    valor: p ? p[k] : '',
    requerido: k === 'nombre' || k === 'precio',
    ancho: k === 'nombre' || k === 'codigo' ? null : 'medio',
  })));
  if (!r) return;
  if (r.codigo && db.productos.some((o) => o !== p && sinAcentos(o.codigo) === sinAcentos(r.codigo))) {
    return aviso(`Ya existe otro producto con el código ${r.codigo}`);
  }
  NUMERICOS.forEach((k) => { if (k !== 'stockMin' || r[k] !== '') r[k] = num(r[k]); });
  if (p) Object.assign(p, r);
  else db.productos.push(Object.assign({ id: id() }, r));
  guardar();
  pintarProductos();
}

$('#btn-nuevo-producto').addEventListener('click', () => editarProducto(null));
$('#tabla-productos').addEventListener('click', async (e) => {
  const d = e.target.dataset;
  if (d.editar) editarProducto(producto(d.editar));
  if (d.borrar) {
    const p = producto(d.borrar);
    if (confirm(`¿Borrar "${p.nombre}"?`)) { db.productos = db.productos.filter((x) => x !== p); guardar(); pintarProductos(); }
  }
  if (d.surtir) {
    const p = producto(d.surtir);
    const r = await formulario(`Surtir "${p.nombre}"`, [
      { tipo: 'texto', valor: `Existencia actual: <b>${num(p.stock)}</b>` },
      { nombre: 'cant', etiqueta: 'Piezas que llegaron', tipo: 'number', paso: 'any', requerido: true, ancho: 'medio' },
      { nombre: 'costo', etiqueta: 'Nuevo costo (opcional)', tipo: 'number', valor: '', ancho: 'medio' },
    ]);
    if (!r) return;
    p.stock = redondear(num(p.stock) + num(r.cant));
    if (r.costo !== '') p.costo = num(r.costo);
    guardar();
    pintarProductos();
  }
});

// CSV: una fila de encabezados con las columnas de CAMPOS_PRODUCTO (o sus nombres en español)
function leerCSV(texto) {
  const sep = (texto.split('\n')[0].match(/;/g) || []).length > (texto.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const filas = [];
  let fila = [], celda = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') { celda += '"'; i++; }
      else if (ch === '"') comillas = false;
      else celda += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(celda); celda = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      fila.push(celda); filas.push(fila); fila = []; celda = '';
    } else celda += ch;
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila); }
  return filas.filter((f) => f.some((c) => c.trim()));
}

const ALIAS = {
  codigo: ['codigo', 'clave', 'sku', 'codigo de barras', 'codigo de barras o clave'],
  nombre: ['nombre', 'producto', 'descripcion'],
  marca: ['marca'],
  categoria: ['categoria', 'linea', 'departamento'],
  costo: ['costo', 'precio compra'],
  precio: ['precio', 'precio venta', 'menudeo'],
  mayoreo: ['mayoreo', 'precio mayoreo'],
  minMayoreo: ['minmayoreo', 'min mayoreo', 'mayoreo desde', 'mayoreo desde (piezas)'],
  stock: ['stock', 'existencia', 'existencias', 'cantidad'],
  stockMin: ['stockmin', 'stock min', 'stock minimo', 'minimo'],
};

function importarCSV(texto) {
  const filas = leerCSV(texto.replace(/^﻿/, ''));
  if (filas.length < 2) return aviso('El archivo no tiene productos');
  const enc = filas[0].map((h) => sinAcentos(h).replace(/_/g, ' ').trim());
  const col = {};
  Object.entries(ALIAS).forEach(([k, nombres]) => { const i = enc.findIndex((h) => nombres.includes(h)); if (i >= 0) col[k] = i; });
  if (col.nombre == null) return aviso('Falta la columna "nombre" en el CSV');
  let nuevos = 0, actualizados = 0;
  filas.slice(1).forEach((f) => {
    const datos = {};
    Object.entries(col).forEach(([k, i]) => {
      const v = (f[i] ?? '').trim();
      datos[k] = NUMERICOS.includes(k) ? (k === 'stockMin' && v === '' ? '' : num(v)) : v;
    });
    if (!datos.nombre) return;
    const existente = datos.codigo && db.productos.find((p) => sinAcentos(p.codigo) === sinAcentos(datos.codigo));
    if (existente) { Object.assign(existente, datos); actualizados++; }
    else { db.productos.push(Object.assign({ id: id(), codigo: '', marca: '', categoria: '', costo: 0, precio: 0, mayoreo: 0, minMayoreo: 0, stock: 0, stockMin: '' }, datos)); nuevos++; }
  });
  guardar();
  pintarProductos();
  aviso(`${nuevos} productos nuevos, ${actualizados} actualizados`);
}

$('#btn-importar').addEventListener('click', () => $('#archivo-csv').click());
$('#archivo-csv').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (f) importarCSV(await f.text());
  e.target.value = '';
});

function descargar(nombre, contenido, tipo) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csvCelda = (v) => /[",\n;]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');

$('#btn-exportar-productos').addEventListener('click', () => {
  const filas = [CAMPOS_PRODUCTO.map(([k]) => k)].concat(db.productos.map((p) => CAMPOS_PRODUCTO.map(([k]) => p[k])));
  descargar('productos.csv', '﻿' + filas.map((f) => f.map(csvCelda).join(',')).join('\n'), 'text/csv');
});

// ---------- Clientes ----------
function pintarClientes() {
  const q = sinAcentos($('#filtro-clientes').value);
  const lista = db.clientes
    .filter((c) => !q || sinAcentos(c.nombre + ' ' + c.telefono).includes(q))
    .sort((a, b) => b.saldo - a.saldo || a.nombre.localeCompare(b.nombre));
  $('#tabla-clientes tbody').innerHTML = lista.map((c) => `<tr>
      <td>${esc(c.nombre)}</td>
      <td>${esc(c.telefono)}</td>
      <td class="num">${num(c.limite) ? dinero(c.limite) : 'Sin límite'}</td>
      <td class="num ${c.saldo > 0 ? 'debe' : ''}">${dinero(c.saldo)}</td>
      <td>
        <button class="link" data-abonar="${c.id}">Abonar</button>
        <button class="link" data-cuenta="${c.id}">Estado de cuenta</button>
        <button class="link" data-editar="${c.id}">Editar</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="5" class="vacio">${db.clientes.length ? 'Sin resultados' : 'Agrega a los clientes a los que les fías.'}</td></tr>`;
  const deuda = db.clientes.reduce((s, c) => s + Math.max(0, c.saldo), 0);
  $('#resumen-clientes').textContent = `${db.clientes.length} clientes · te deben ${dinero(deuda)} en total`;
}
$('#filtro-clientes').addEventListener('input', pintarClientes);

async function editarCliente(c) {
  const r = await formulario(c ? 'Editar cliente' : 'Nuevo cliente', [
    { nombre: 'nombre', etiqueta: 'Nombre o negocio', valor: c?.nombre, requerido: true },
    { nombre: 'telefono', etiqueta: 'Teléfono', tipo: 'tel', valor: c?.telefono, ancho: 'medio' },
    { nombre: 'limite', etiqueta: 'Límite de crédito (0 = sin límite)', tipo: 'number', valor: c?.limite ?? 0, ancho: 'medio' },
  ]);
  if (!r) return;
  r.limite = num(r.limite);
  if (c) Object.assign(c, r);
  else db.clientes.push(Object.assign({ id: id(), saldo: 0 }, r));
  guardar();
  pintarClientes();
}
$('#btn-nuevo-cliente').addEventListener('click', () => editarCliente(null));

$('#tabla-clientes').addEventListener('click', async (e) => {
  const d = e.target.dataset;
  if (d.editar) editarCliente(cliente(d.editar));
  if (d.abonar) {
    const c = cliente(d.abonar);
    const r = await formulario(`Abono de ${c.nombre}`, [
      { tipo: 'texto', valor: `Debe <b>${dinero(c.saldo)}</b>` },
      { nombre: 'monto', etiqueta: 'Monto', tipo: 'number', requerido: true, ancho: 'medio' },
      { nombre: 'forma', etiqueta: 'Forma de pago', opciones: [['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta / transferencia']], valor: 'efectivo', ancho: 'medio' },
    ], 'Registrar abono');
    if (!r || num(r.monto) <= 0) return;
    db.abonos.push({ id: id(), fecha: Date.now(), clienteId: c.id, monto: num(r.monto), forma: r.forma });
    c.saldo = redondear(c.saldo - num(r.monto));
    guardar();
    pintarClientes();
    aviso(`Abono registrado. Ahora debe ${dinero(c.saldo)}`);
  }
  if (d.cuenta) {
    const c = cliente(d.cuenta);
    const movs = [
      ...db.ventas.filter((v) => v.clienteId === c.id && v.pago === 'credito')
        .map((v) => ({ fecha: v.fecha, texto: `Venta #${v.folio}${v.cancelada ? ' (cancelada)' : ''}`, cargo: v.cancelada ? 0 : v.total })),
      ...db.abonos.filter((a) => a.clienteId === c.id).map((a) => ({ fecha: a.fecha, texto: 'Abono', abono: a.monto })),
    ].sort((a, b) => b.fecha - a.fecha).slice(0, 30);
    const tabla = movs.length
      ? '<table class="tabla">' + movs.map((m) => `<tr><td>${fecha(m.fecha)}</td><td>${m.texto}</td><td class="num">${m.cargo ? '+' + dinero(m.cargo) : m.abono ? '−' + dinero(m.abono) : ''}</td></tr>`).join('') + '</table>'
      : 'Sin movimientos todavía.';
    await formulario(`Estado de cuenta: ${c.nombre}`, [{ tipo: 'texto', valor: `Debe <b>${dinero(c.saldo)}</b>` }, { tipo: 'texto', valor: tabla }], 'Cerrar', 'Cerrar');
  }
});

// ---------- Caja ----------
const ultimoCorte = () => (db.cortes.length ? db.cortes[db.cortes.length - 1].fecha : 0);

function resumenCaja() {
  const desde = ultimoCorte();
  const ventas = db.ventas.filter((v) => v.fecha > desde);
  const validas = ventas.filter((v) => !v.cancelada);
  const suma = (arr, f) => redondear(arr.reduce((s, x) => s + f(x), 0));
  const r = {
    desde,
    ventas,
    numVentas: validas.length,
    total: suma(validas, (v) => v.total),
    efectivo: suma(validas.filter((v) => v.pago === 'efectivo'), (v) => v.total),
    tarjeta: suma(validas.filter((v) => v.pago === 'tarjeta'), (v) => v.total),
    credito: suma(validas.filter((v) => v.pago === 'credito'), (v) => v.total),
    abonos: suma(db.abonos.filter((a) => a.fecha > desde && a.forma === 'efectivo'), (a) => a.monto),
    entradas: suma(db.movimientos.filter((m) => m.fecha > desde && m.tipo === 'entrada'), (m) => m.monto),
    salidas: suma(db.movimientos.filter((m) => m.fecha > desde && m.tipo === 'salida'), (m) => m.monto),
    ganancia: suma(validas, (v) => v.items.reduce((s, it) => s + (it.precio - it.costo) * it.cant, 0)),
  };
  r.esperado = redondear(r.efectivo + r.abonos + r.entradas - r.salidas);
  return r;
}

function pintarCaja() {
  const r = resumenCaja();
  const tarjetas = [
    ['Vendido', r.total], ['Efectivo', r.efectivo], ['Tarjeta / transf.', r.tarjeta], ['A crédito', r.credito],
    ['Abonos en efectivo', r.abonos], ['Entradas', r.entradas], ['Salidas', r.salidas], ['Ganancia estimada', r.ganancia],
    ['Efectivo en caja', r.esperado],
  ];
  $('#tarjetas-caja').innerHTML = tarjetas.map(([t, v]) => `<div class="tarjeta"><span>${t}</span><strong>${dinero(v)}</strong></div>`).join('') +
    `<div class="tarjeta"><span>Ventas</span><strong>${r.numVentas}</strong></div>`;

  $('#tabla-ventas tbody').innerHTML = [...r.ventas].reverse().map((v) => `<tr class="${v.cancelada ? 'cancelada' : ''}">
      <td>#${v.folio}</td><td>${hora(v.fecha)}</td><td>${NOMBRE_PAGO[v.pago]}</td>
      <td>${esc(v.clienteId ? cliente(v.clienteId)?.nombre : '')}</td>
      <td class="num">${dinero(v.total)}</td>
      <td>
        <button class="link" data-reimprimir="${v.id}">Ticket</button>
        ${v.cancelada ? '' : `<button class="link peligro" data-cancelar="${v.id}">Cancelar</button>`}
      </td>
    </tr>`).join('') || '<tr><td colspan="6" class="vacio">Sin ventas desde el último corte</td></tr>';

  $('#tabla-cortes tbody').innerHTML = [...db.cortes].reverse().slice(0, 30).map((c) => `<tr>
      <td>${fecha(c.fecha)}</td><td class="num">${dinero(c.total)}</td><td class="num">${dinero(c.esperado)}</td>
      <td class="num">${dinero(c.contado)}</td>
      <td class="num ${c.contado - c.esperado < 0 ? 'debe' : ''}">${dinero(c.contado - c.esperado)}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="vacio">Aún no hay cortes</td></tr>';
}

$('#tabla-ventas').addEventListener('click', (e) => {
  const d = e.target.dataset;
  if (d.reimprimir) imprimirTicket(db.ventas.find((v) => v.id === d.reimprimir));
  if (d.cancelar) {
    const v = db.ventas.find((x) => x.id === d.cancelar);
    if (!confirm(`¿Cancelar la venta #${v.folio}? Los productos regresan al inventario.`)) return;
    v.cancelada = true;
    v.items.forEach((it) => { const p = producto(it.productoId); if (p) p.stock = redondear(num(p.stock) + it.cant); });
    if (v.clienteId && v.pago === 'credito') { const c = cliente(v.clienteId); if (c) c.saldo = redondear(c.saldo - v.total); }
    guardar();
    pintarCaja();
  }
});

async function movimiento(tipo) {
  const r = await formulario(tipo === 'entrada' ? 'Entrada de efectivo' : 'Salida de efectivo', [
    { nombre: 'monto', etiqueta: 'Monto', tipo: 'number', requerido: true },
    { nombre: 'concepto', etiqueta: tipo === 'entrada' ? 'Concepto (ej. fondo de caja)' : 'Concepto (ej. pago a proveedor)' },
  ]);
  if (!r || num(r.monto) <= 0) return;
  db.movimientos.push({ id: id(), fecha: Date.now(), tipo, monto: num(r.monto), concepto: r.concepto });
  guardar();
  pintarCaja();
}
$('#btn-entrada').addEventListener('click', () => movimiento('entrada'));
$('#btn-salida').addEventListener('click', () => movimiento('salida'));

$('#btn-corte').addEventListener('click', async () => {
  const r = resumenCaja();
  const f = await formulario('Corte de caja', [
    { tipo: 'texto', valor: `Debe haber <b>${dinero(r.esperado)}</b> en efectivo.` },
    { nombre: 'contado', etiqueta: '¿Cuánto efectivo contaste?', tipo: 'number', valor: r.esperado, requerido: true },
  ], 'Cerrar corte');
  if (!f) return;
  const { ventas, ...datos } = r;
  db.cortes.push(Object.assign(datos, { id: id(), fecha: Date.now(), contado: num(f.contado) }));
  guardar();
  pintarCaja();
  const dif = num(f.contado) - r.esperado;
  aviso(dif === 0 ? 'Corte cerrado. La caja cuadra.' : `Corte cerrado. ${dif > 0 ? 'Sobran' : 'Faltan'} ${dinero(Math.abs(dif))}`);
});

// ---------- Ajustes ----------
function pintarAjustes() {
  const f = $('#form-ajustes');
  Object.entries(db.ajustes).forEach(([k, v]) => { if (f.elements[k]) f.elements[k].value = v; });
}
$('#form-ajustes').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  Object.keys(db.ajustes).forEach((k) => { if (f.elements[k]) db.ajustes[k] = f.elements[k].value.trim(); });
  db.ajustes.stockMinDefault = num(db.ajustes.stockMinDefault);
  guardar();
  pintarMarca();
  aviso('Guardado');
});

$('#btn-respaldo').addEventListener('click', () => {
  const hoy = new Date().toISOString().slice(0, 10);
  descargar(`respaldo-punto-de-venta-${hoy}.json`, JSON.stringify(db), 'application/json');
});
$('#btn-restaurar').addEventListener('click', () => $('#archivo-respaldo').click());
$('#archivo-respaldo').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const datos = JSON.parse(await f.text());
    if (!Array.isArray(datos.productos)) throw new Error();
    if (!confirm('Esto reemplaza todos los datos actuales por los del respaldo. ¿Continuar?')) return;
    db = Object.assign(vacio(), datos);
    guardar();
    pintarMarca();
    aviso('Respaldo restaurado');
    mostrarVista('ajustes');
  } catch (err) {
    aviso('Ese archivo no es un respaldo válido');
  }
});

function pintarMarca() {
  $('#marca').textContent = db.ajustes.negocio || 'Punto de Venta';
  document.title = (db.ajustes.negocio ? db.ajustes.negocio + ' · ' : '') + 'Punto de Venta';
}

// ---------- Instalar como app (Chrome/Edge) y uso sin internet ----------
let instalacion = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  instalacion = e;
  $('#btn-instalar').hidden = false;
});
$('#btn-instalar').addEventListener('click', async () => {
  if (!instalacion) return;
  instalacion.prompt();
  await instalacion.userChoice;
  instalacion = null;
  $('#btn-instalar').hidden = true;
});
window.addEventListener('appinstalled', () => { $('#btn-instalar').hidden = true; aviso('App instalada'); });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

pintarMarca();
pintarVender();
