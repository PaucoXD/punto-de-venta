// Punto de venta: todo se guarda en localStorage de este navegador.
'use strict';

const CLAVE = 'pdv-datos-v1';

const vacio = () => ({
  ajustes: { negocio: 'Mi Negocio', direccion: '', telefono: '', pie: '¡Gracias por su compra!', stockMinDefault: 3, comisionTarjeta: 0 },
  productos: [],
  clientes: [],
  ventas: [],
  abonos: [],
  movimientos: [], // entradas y salidas de efectivo
  cortes: [],
  usuarios: [], // { id, nombre, rol: 'dueno' | 'cajero', pin (hash), sal }
  folio: 0,
  siguienteCodigo: 1, // para los códigos de barras que genera la app
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
const ic = (nombre) => `<svg class="ic"><use href="#i-${nombre}"/></svg>`;
const boton = (e) => e.target.closest('button')?.dataset || {};
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
  if (!esDueno() && SOLO_DUENO.includes(nombre)) nombre = 'vender';
  $$('#tabs button').forEach((b) => b.classList.toggle('activa', b.dataset.vista === nombre));
  $$('.vista').forEach((v) => v.classList.toggle('activa', v.id === 'vista-' + nombre));
  ({ vender: pintarVender, productos: pintarProductos, clientes: pintarClientes, caja: pintarCaja, reportes: pintarReportes, ajustes: pintarAjustes })[nombre]();
  if (nombre === 'vender') $('#buscar').focus();
}
$('#tabs').addEventListener('click', (e) => { const v = boton(e).vista; if (v) mostrarVista(v); });

// ---------- Ventana de formulario ----------
// campos: [{ nombre, etiqueta, tipo, valor, opciones, requerido, ancho, boton: { texto, alHacerClic(input) } }]
// tipo 'archivo' devuelve el File elegido (o null)
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
    } else if (c.tipo === 'archivo') {
      input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
    } else {
      input = document.createElement('input');
      input.type = c.tipo || 'text';
      if (c.tipo === 'number') { input.step = c.paso || '0.01'; input.inputMode = 'decimal'; }
      if (c.tipo === 'password') { input.inputMode = 'numeric'; input.autocomplete = 'off'; }
      input.value = c.valor ?? '';
    }
    input.name = c.nombre;
    input.required = !!c.requerido;
    if (c.boton) {
      const caja = document.createElement('span');
      caja.className = 'con-boton';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sec';
      b.innerHTML = c.boton.texto;
      b.addEventListener('click', () => c.boton.alHacerClic(input));
      caja.append(input, b);
      label.appendChild(caja);
    } else {
      label.appendChild(input);
    }
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
      $$('input, select', cuerpo).forEach((i) => (datos[i.name] = i.type === 'file' ? i.files[0] || null : i.value.trim()));
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
      <span><b>${dinero(p.precio)}</b> <small>${num(p.stock)} pzs</small></span>
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
  $('#carrito').innerHTML = carrito.map((l, i) => {
    const p = producto(l.productoId);
    const precio = precioLinea(l);
    return `<li class="linea">
      <div class="nombre">${esc(p.nombre)}${esMayoreo(l) ? '<span class="tag">mayoreo</span>' : ''}</div>
      <div class="importe">${dinero(precio * l.cant)}</div>
      <div class="detalle">
        <span class="paso">
          <button type="button" data-menos="${i}" title="Quitar una">${ic('minus')}</button>
          <input class="cant" type="number" min="0" step="any" value="${l.cant}" data-i="${i}" aria-label="Cantidad">
          <button type="button" data-mas="${i}" title="Agregar una">${ic('plus')}</button>
        </span>
        <button type="button" class="precio-btn" data-precio="${i}" title="Cambiar precio">× ${dinero(precio)}</button>
      </div>
      <div class="fin"><button type="button" class="btn-icono peligro" data-quitar="${i}" title="Quitar">${ic('x')}</button></div>
    </li>`;
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
  pintarMosaico();
}

// Color fijo para cada categoría
const tono = (texto) => [...String(texto || '')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 222);

// Botones de productos para tocar: los más vendidos primero, filtrados por categoría
let categoriaSel = '';
function pintarMosaico() {
  const categorias = [...new Set(db.productos.map((p) => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (!categorias.includes(categoriaSel)) categoriaSel = '';
  $('#categorias').innerHTML = categorias.length
    ? [['', 'Todos'], ...categorias.map((c) => [c, c])].map(([v, t]) =>
      `<button type="button" data-categoria="${esc(v)}" class="${v === categoriaSel ? 'activa' : ''}">${esc(t)}</button>`).join('')
    : '';
  const vendidos = {};
  db.ventas.slice(-300).forEach((v) => v.items.forEach((it) => (vendidos[it.productoId] = (vendidos[it.productoId] || 0) + it.cant)));
  const lista = db.productos
    .filter((p) => !categoriaSel || p.categoria === categoriaSel)
    .sort((a, b) => (vendidos[b.id] || 0) - (vendidos[a.id] || 0) || a.nombre.localeCompare(b.nombre))
    .slice(0, 48);
  // Si algún producto tiene foto, todos los botones usan el mismo alto para que se vean parejos
  $('#mosaico').classList.toggle('con-fotos', lista.some((p) => fotos[p.id]));
  $('#mosaico').innerHTML = lista.map((p) => {
    const s = num(p.stock);
    const clase = s <= 0 ? 'agotado' : s <= stockMin(p) ? 'bajo' : '';
    return `<button type="button" class="prod" data-producto="${p.id}">
      ${fotos[p.id]
        ? `<img class="foto" src="${fotos[p.id]}" alt="">`
        : `<span class="inicial" style="--h:${tono(p.categoria)}">${esc((p.nombre.trim()[0] || '?').toUpperCase())}</span>`}
      <span class="nombre">${esc(p.nombre)}</span>
      <span class="pie"><span class="precio">${dinero(p.precio)}</span><span class="stock ${clase}">${s} pzs</span></span>
    </button>`;
  }).join('') || `<div class="mosaico-vacio">${ic('package-plus')}<p>Aún no hay productos. Agrégalos en <b>Productos</b> o impórtalos desde Excel.</p></div>`;
}

$('#categorias').addEventListener('click', (e) => {
  const d = boton(e);
  if (d.categoria == null) return;
  categoriaSel = d.categoria;
  pintarMosaico();
});
$('#mosaico').addEventListener('click', (e) => {
  const d = boton(e);
  if (d.producto) agregarAlCarrito(producto(d.producto));
});

$('#carrito').addEventListener('change', (e) => {
  if (!e.target.classList.contains('cant')) return;
  const l = carrito[e.target.dataset.i];
  l.cant = Math.max(0, num(e.target.value));
  if (l.cant === 0) carrito.splice(e.target.dataset.i, 1);
  pintarVender();
});

$('#carrito').addEventListener('click', async (e) => {
  const d = boton(e);
  if (d.quitar != null) { carrito.splice(d.quitar, 1); pintarVender(); return; }
  if (d.mas != null || d.menos != null) {
    const i = d.mas ?? d.menos;
    const l = carrito[i];
    l.cant = redondear(l.cant + (d.mas != null ? 1 : -1));
    if (l.cant <= 0) carrito.splice(i, 1);
    pintarVender();
    return;
  }
  if (d.precio == null) return;
  if (!(await autorizar('cambiar el precio'))) return;
  const l = carrito[d.precio];
  const r = await formulario('Cambiar precio', [
    { nombre: 'precio', etiqueta: `Precio para "${producto(l.productoId).nombre}"`, tipo: 'number', valor: precioLinea(l), requerido: true },
  ]);
  if (r) { l.precioManual = num(r.precio); pintarVender(); }
  buscar.focus();
});

const pago = $('#pago');
pago.addEventListener('change', () => {
  $$('#formas-pago button').forEach((b) => b.classList.toggle('activa', b.dataset.pago === pago.value));
  $('#campo-cliente').hidden = pago.value !== 'credito';
  $('#campo-recibido').hidden = pago.value !== 'efectivo';
  $('#campo-referencia').hidden = pago.value !== 'tarjeta';
  pintarCambio();
});
$('#recibido').addEventListener('input', pintarCambio);
$('#formas-pago').addEventListener('click', (e) => {
  const d = boton(e);
  if (!d.pago) return;
  pago.value = d.pago;
  pago.dispatchEvent(new Event('change'));
});
$('#billetes').addEventListener('click', (e) => {
  const d = boton(e);
  if (!d.billete) return;
  $('#recibido').value = d.billete === 'exacto' ? totalCarrito() : d.billete;
  pintarCambio();
});

function pintarCambio() {
  const el = $('#cambio');
  el.className = 'cambio';
  el.textContent = '';
  if (pago.value !== 'efectivo' || $('#recibido').value === '') return;
  const dif = num($('#recibido').value) - totalCarrito();
  el.innerHTML = dif >= 0 ? `<span>Cambio</span><span>${dinero(dif)}</span>` : `<span>Faltan</span><span>${dinero(-dif)}</span>`;
  el.classList.add(dif >= 0 ? 'ok' : 'falta');
}

$('#btn-vaciar').addEventListener('click', () => {
  if (carrito.length && !confirm('¿Cancelar esta venta?')) return;
  limpiarVenta();
});

function limpiarVenta() {
  carrito = [];
  $('#recibido').value = '';
  $('#referencia').value = '';
  pago.value = 'efectivo';
  pago.dispatchEvent(new Event('change'));
  $('#venta-cliente').value = '';
  pintarVender();
  buscar.focus();
}

async function cobrar() {
  if (!carrito.length) return aviso('No hay productos en la venta');
  if (!estadoLicencia().ok) {
    aviso(esDueno() ? 'Activa tu licencia para seguir cobrando' : 'La licencia venció: avisa al dueño');
    if (esDueno()) mostrarVista('ajustes');
    return;
  }
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
    referencia: forma === 'tarjeta' ? $('#referencia').value.trim() : '',
    cancelada: false,
    usuario: usuarioActual()?.nombre || '',
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
  if (e.key === 'F2' && $('#vista-vender').classList.contains('activa') && $('#bloqueo').hidden) { e.preventDefault(); cobrar(); }
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
    ${v.usuario ? `<div>Le atendió: ${esc(v.usuario)}</div>` : ''}
    <hr>
    <table>${v.items.map((it) => `
      <tr><td colspan="2">${esc(it.nombre)}</td></tr>
      <tr><td>${it.cant} x ${dinero(it.precio)}</td><td class="r">${dinero(it.cant * it.precio)}</td></tr>`).join('')}
    </table>
    <hr>
    <table>
      <tr><td><b>TOTAL</b></td><td class="r"><b>${dinero(v.total)}</b></td></tr>
      <tr><td>${NOMBRE_PAGO[v.pago]}</td><td class="r">${dinero(v.recibido)}</td></tr>
      ${v.referencia ? `<tr><td>Ref.</td><td class="r">${esc(v.referencia)}</td></tr>` : ''}
      ${v.pago === 'efectivo' ? `<tr><td>Cambio</td><td class="r">${dinero(v.cambio)}</td></tr>` : ''}
      ${c ? `<tr><td>Saldo pendiente</td><td class="r">${dinero(c.saldo)}</td></tr>` : ''}
    </table>
    <hr>
    <div class="c">${esc(a.pie)}</div>`;
  imprimir('ticket');
}

// Imprime el ticket o las etiquetas (solo se muestra uno de los dos al imprimir)
function imprimir(que, tamanoPagina = '') {
  document.body.dataset.imprimir = que;
  let estilo = null;
  if (tamanoPagina) {
    estilo = document.createElement('style');
    estilo.textContent = `@page { size: ${tamanoPagina}; margin: 0; }`;
    document.head.appendChild(estilo);
  }
  window.print();
  delete document.body.dataset.imprimir;
  if (estilo) estilo.remove();
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

function productosFiltrados() {
  const q = $('#filtro-productos').value;
  let lista = q ? buscarProductos(q, Infinity) : [...db.productos].sort((a, b) => a.nombre.localeCompare(b.nombre));
  if ($('#solo-bajos').checked) lista = lista.filter((p) => num(p.stock) <= stockMin(p));
  return lista;
}

function pintarProductos() {
  const lista = productosFiltrados();
  const tbody = $('#tabla-productos tbody');
  tbody.innerHTML = lista.slice(0, 500).map((p) => {
    const s = num(p.stock);
    const clase = s <= 0 ? 'agotado' : s <= stockMin(p) ? 'bajo' : 'ok';
    return `<tr>
      <td><code>${esc(p.codigo)}</code></td>
      <td><span class="con-foto">${fotos[p.id] ? `<img class="mini" src="${fotos[p.id]}" alt="">` : `<span class="mini">${ic('image')}</span>`}<span>${esc(p.nombre)}${p.categoria ? ` <small class="muted">· ${esc(p.categoria)}</small>` : ''}</span></span></td>
      <td>${esc(p.marca)}</td>
      <td class="num">${dinero(p.precio)}</td>
      <td class="num">${num(p.mayoreo) ? `${dinero(p.mayoreo)} <small class="muted">≥${num(p.minMayoreo)}</small>` : '—'}</td>
      <td class="num"><span class="badge ${clase}">${s}</span></td>
      <td class="acc">
        <button class="link" data-surtir="${p.id}">${ic('package-plus')}Surtir</button>
        <button class="btn-icono" data-etiqueta="${p.id}" title="Imprimir etiqueta">${ic('barcode')}</button>
        <button class="btn-icono" data-editar="${p.id}" title="Editar">${ic('pencil')}</button>
        <button class="btn-icono peligro" data-borrar="${p.id}" title="Borrar">${ic('trash-2')}</button>
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
  const campos = CAMPOS_PRODUCTO.map(([k, etiqueta]) => ({
    nombre: k,
    etiqueta,
    tipo: NUMERICOS.includes(k) ? 'number' : 'text',
    paso: k === 'minMayoreo' ? '1' : 'any',
    valor: p ? p[k] : '',
    requerido: k === 'nombre' || k === 'precio',
    ancho: k === 'nombre' || k === 'codigo' ? null : 'medio',
    boton: k === 'codigo' ? { texto: `${ic('barcode')}Generar`, alHacerClic: (input) => { input.value = nuevoCodigo(); } } : null,
  }));
  campos.push({ nombre: 'foto', etiqueta: p && fotos[p.id] ? 'Cambiar foto' : 'Foto (opcional)', tipo: 'archivo' });
  if (p && fotos[p.id]) {
    campos.push({ nombre: 'quitarFoto', etiqueta: 'Foto actual', opciones: [['', 'Conservar'], ['si', 'Quitar foto']], valor: '' });
  }
  const r = await formulario(p ? 'Editar producto' : 'Nuevo producto', campos);
  if (!r) return;
  if (r.codigo && db.productos.some((o) => o !== p && sinAcentos(o.codigo) === sinAcentos(r.codigo))) {
    return aviso(`Ya existe otro producto con el código ${r.codigo}`);
  }
  const { foto, quitarFoto, ...datos } = r;
  NUMERICOS.forEach((k) => { if (k !== 'stockMin' || datos[k] !== '') datos[k] = num(datos[k]); });
  if (p) Object.assign(p, datos);
  else db.productos.push((p = Object.assign({ id: id() }, datos)));
  guardar();
  try {
    if (foto) await guardarFoto(p.id, await achicarImagen(foto));
    else if (quitarFoto) await borrarFoto(p.id);
  } catch (e) {
    aviso('No se pudo guardar la foto');
  }
  pintarProductos();
}

$('#btn-nuevo-producto').addEventListener('click', () => editarProducto(null));
$('#tabla-productos').addEventListener('click', async (e) => {
  const d = boton(e);
  if (d.editar) editarProducto(producto(d.editar));
  if (d.borrar) {
    const p = producto(d.borrar);
    if (confirm(`¿Borrar "${p.nombre}"?`)) { db.productos = db.productos.filter((x) => x !== p); guardar(); borrarFoto(p.id); pintarProductos(); }
  }
  if (d.etiqueta) imprimirEtiquetas([producto(d.etiqueta)]);
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
      <td><b>${esc(c.nombre)}</b></td>
      <td class="muted">${esc(c.telefono)}</td>
      <td class="num">${num(c.limite) ? dinero(c.limite) : '<span class="badge neutro">Sin límite</span>'}</td>
      <td class="num">${c.saldo > 0 ? `<span class="debe">${dinero(c.saldo)}</span>` : '<span class="badge ok">Al corriente</span>'}</td>
      <td class="acc">
        <button class="link" data-abonar="${c.id}">${ic('hand-coins')}Abonar</button>
        <button class="btn-icono" data-cuenta="${c.id}" title="Estado de cuenta">${ic('receipt')}</button>
        <button class="btn-icono" data-editar="${c.id}" title="Editar">${ic('pencil')}</button>
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
  const d = boton(e);
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
  r.comision = redondear(r.tarjeta * num(db.ajustes.comisionTarjeta) / 100);
  r.ganancia = redondear(r.ganancia - r.comision);
  return r;
}

function pintarCaja() {
  const r = resumenCaja();
  const tarjetas = [
    ['Efectivo en caja', dinero(r.esperado), 'wallet', 'destacada'],
    ['Vendido', dinero(r.total), 'shopping-cart', ''],
    ['Ventas', r.numVentas, 'receipt', ''],
    ...(esDueno() ? [['Ganancia estimada', dinero(r.ganancia), 'trending-up', 'verde']] : []),
    ['Efectivo', dinero(r.efectivo), 'banknote', 'verde'],
    ['Tarjeta / transf.', dinero(r.tarjeta), 'credit-card', ''],
    ...(num(db.ajustes.comisionTarjeta) ? [[`Comisión tarjeta (${num(db.ajustes.comisionTarjeta)}%)`, dinero(r.comision), 'credit-card', 'rojo']] : []),
    ['Fiado', dinero(r.credito), 'notebook-pen', 'ambar'],
    ['Abonos en efectivo', dinero(r.abonos), 'hand-coins', 'verde'],
    ['Entradas', dinero(r.entradas), 'circle-arrow-down', ''],
    ['Salidas', dinero(r.salidas), 'circle-arrow-up', 'rojo'],
  ];
  $('#tarjetas-caja').innerHTML = tarjetas.map(([t, v, icono, clase]) =>
    `<div class="tarjeta ${clase}"><div class="ico">${ic(icono)}</div><div><span>${t}</span><strong>${v}</strong></div></div>`).join('');

  $('#tabla-ventas tbody').innerHTML = [...r.ventas].reverse().map((v) => `<tr class="${v.cancelada ? 'cancelada' : ''}">
      <td><b>#${v.folio}</b></td><td class="muted">${hora(v.fecha)}</td><td><span class="badge ${v.pago === 'credito' ? 'bajo' : v.pago === 'efectivo' ? 'ok' : 'neutro'}">${NOMBRE_PAGO[v.pago]}</span>${v.referencia ? ` <small class="muted">Ref. ${esc(v.referencia)}</small>` : ''}</td>
      <td>${esc(v.clienteId ? cliente(v.clienteId)?.nombre : '')}</td>
      <td class="muted">${esc(v.usuario || '')}</td>
      <td class="num">${dinero(v.total)}</td>
      <td class="acc">
        <button class="btn-icono" data-reimprimir="${v.id}" title="Imprimir ticket">${ic('printer')}</button>
        ${v.cancelada ? '' : `<button class="btn-icono peligro" data-cancelar="${v.id}" title="Cancelar venta">${ic('x')}</button>`}
      </td>
    </tr>`).join('') || '<tr><td colspan="7" class="vacio">Sin ventas desde el último corte</td></tr>';

  $('#tabla-cortes tbody').innerHTML = [...db.cortes].reverse().slice(0, 30).map((c) => `<tr>
      <td>${fecha(c.fecha)}</td><td class="num">${dinero(c.total)}</td><td class="num">${dinero(c.esperado)}</td>
      <td class="num">${dinero(c.contado)}</td>
      <td class="num ${c.contado - c.esperado < 0 ? 'debe' : ''}">${dinero(c.contado - c.esperado)}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="vacio">Aún no hay cortes</td></tr>';
}

$('#tabla-ventas').addEventListener('click', async (e) => {
  const d = boton(e);
  if (d.reimprimir) imprimirTicket(db.ventas.find((v) => v.id === d.reimprimir));
  if (d.cancelar) {
    const v = db.ventas.find((x) => x.id === d.cancelar);
    if (!(await autorizar('cancelar una venta'))) return;
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
  db.cortes.push(Object.assign(datos, { id: id(), fecha: Date.now(), contado: num(f.contado), usuario: usuarioActual()?.nombre || '' }));
  guardar();
  pintarCaja();
  const dif = num(f.contado) - r.esperado;
  aviso(dif === 0 ? 'Corte cerrado. La caja cuadra.' : `Corte cerrado. ${dif > 0 ? 'Sobran' : 'Faltan'} ${dinero(Math.abs(dif))}`);
});

// ---------- Reportes (solo dueño) ----------
let periodo = 'mes';
let ordenTop = 'cant';
const inicioDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const isoDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fechaCorta = (d) => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

// [desde, hasta) en milisegundos
function rangoPeriodo() {
  const hoy = inicioDia(new Date());
  const dias = (n) => new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + n);
  switch (periodo) {
    case 'hoy': return [hoy, dias(1)];
    case 'ayer': return [dias(-1), hoy];
    case '7': return [dias(-6), dias(1)];
    case '30': return [dias(-29), dias(1)];
    case 'mes-pasado': return [new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1), new Date(hoy.getFullYear(), hoy.getMonth(), 1)];
    case 'rango': {
      const d = $('#desde').value ? new Date($('#desde').value + 'T00:00') : dias(-29);
      const h = $('#hasta').value ? new Date($('#hasta').value + 'T00:00') : hoy;
      return d <= h ? [d, new Date(h.getFullYear(), h.getMonth(), h.getDate() + 1)] : [h, new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)];
    }
    default: return [new Date(hoy.getFullYear(), hoy.getMonth(), 1), dias(1)];
  }
}

const gananciaVenta = (v) => v.items.reduce((s, it) => s + (it.precio - it.costo) * it.cant, 0) -
  (v.pago === 'tarjeta' ? v.total * num(db.ajustes.comisionTarjeta) / 100 : 0);

function datosReporte() {
  const [desde, hasta] = rangoPeriodo();
  const enRango = db.ventas.filter((v) => v.fecha >= desde.getTime() && v.fecha < hasta.getTime());
  const ventas = enRango.filter((v) => !v.cancelada);
  const total = redondear(ventas.reduce((s, v) => s + v.total, 0));
  const ganancia = redondear(ventas.reduce((s, v) => s + gananciaVenta(v), 0));
  const piezas = ventas.reduce((s, v) => s + v.items.reduce((t, it) => t + it.cant, 0), 0);

  // Por día, o por mes si el periodo pasa de 2 meses
  const porMes = (hasta - desde) / DIA > 62;
  const llave = (t) => { const d = new Date(t); return porMes ? `${d.getFullYear()}-${d.getMonth()}` : isoDia(d); };
  const cubetas = [];
  for (let d = new Date(desde); d < hasta; d = porMes ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    cubetas.push({ llave: llave(d), fecha: new Date(d), total: 0, ventas: 0 });
  }
  const indice = Object.fromEntries(cubetas.map((c) => [c.llave, c]));
  ventas.forEach((v) => { const c = indice[llave(v.fecha)]; if (c) { c.total += v.total; c.ventas++; } });

  const pagos = ['efectivo', 'tarjeta', 'credito'].map((f) => {
    const vs = ventas.filter((v) => v.pago === f);
    return { forma: f, ventas: vs.length, total: redondear(vs.reduce((s, v) => s + v.total, 0)) };
  });

  const cajeros = {};
  enRango.forEach((v) => {
    const c = (cajeros[v.usuario || ''] ??= { nombre: v.usuario || 'Sin usuario', ventas: 0, total: 0, canceladas: 0 });
    if (v.cancelada) c.canceladas++;
    else { c.ventas++; c.total += v.total; }
  });

  const prods = {};
  ventas.forEach((v) => v.items.forEach((it) => {
    const p = (prods[it.productoId] ??= { id: it.productoId, nombre: it.nombre, cant: 0, vendido: 0, ganancia: 0 });
    p.cant += it.cant;
    p.vendido += it.precio * it.cant;
    p.ganancia += (it.precio - it.costo) * it.cant;
  }));
  const quietos = db.productos
    .filter((p) => num(p.stock) > 0 && !prods[p.id])
    .map((p) => ({ nombre: p.nombre, stock: num(p.stock), valor: num(p.stock) * num(p.costo) }))
    .sort((a, b) => b.valor - a.valor);

  return { desde, hasta, ventas, enRango, total, ganancia, piezas, porMes, cubetas, pagos, cajeros: Object.values(cajeros), prods: Object.values(prods), quietos };
}

function pintarReportes() {
  const r = datosReporte();
  const ultimo = new Date(r.hasta.getTime() - 1);
  $('#resumen-reportes').textContent = isoDia(r.desde) === isoDia(ultimo)
    ? r.desde.toLocaleDateString('es-MX', { dateStyle: 'full' })
    : `Del ${r.desde.toLocaleDateString('es-MX', { dateStyle: 'medium' })} al ${ultimo.toLocaleDateString('es-MX', { dateStyle: 'medium' })}`;
  $$('#periodos button').forEach((b) => b.classList.toggle('activa', b.dataset.periodo === periodo));
  $('#rango').hidden = periodo !== 'rango';

  const margen = r.total ? Math.round(r.ganancia / r.total * 100) : 0;
  const tarjetas = [
    ['Vendido', dinero(r.total), 'shopping-cart', 'destacada'],
    [`Ganancia · ${margen}% de lo vendido`, dinero(r.ganancia), 'trending-up', 'verde'],
    ['Ventas', r.ventas.length, 'receipt', ''],
    ['Ticket promedio', dinero(r.ventas.length ? r.total / r.ventas.length : 0), 'wallet', ''],
    ['Piezas vendidas', redondear(r.piezas), 'package', ''],
  ];
  $('#tarjetas-reportes').innerHTML = tarjetas.map(([t, v, icono, clase]) =>
    `<div class="tarjeta ${clase}"><div class="ico">${ic(icono)}</div><div><span>${t}</span><strong>${v}</strong></div></div>`).join('');

  // Gráfica de barras: una sola serie, sin leyenda; el valor sale al pasar el mouse
  $('#titulo-grafica').textContent = r.porMes ? 'Vendido por mes' : 'Vendido por día';
  const max = Math.max(...r.cubetas.map((c) => c.total), 0);
  const pocas = r.cubetas.length <= 14;
  const cada = Math.ceil(r.cubetas.length / 10);
  const etiqueta = (c) => r.porMes ? c.fecha.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }) : pocas ? fechaCorta(c.fecha) : String(c.fecha.getDate());
  $('#grafica').setAttribute('aria-label', `Vendido por ${r.porMes ? 'mes' : 'día'}, máximo ${dinero(max)}`);
  $('#grafica').innerHTML = max
    ? `<div class="eje-max">${dinero(max)}</div><div class="barras">` + r.cubetas.map((c, i) => `
        <div class="col" tabindex="0">
          <div class="barra" style="height:${c.total ? Math.max(2, c.total / max * 100) : 0}%"></div>
          <div class="punta"><b>${dinero(c.total)}</b>${c.ventas} venta${c.ventas === 1 ? '' : 's'} · ${r.porMes ? etiqueta(c) : fechaCorta(c.fecha)}</div>
          <span class="dia">${i % cada === 0 ? etiqueta(c) : ''}</span>
        </div>`).join('') + '</div>'
    : '<p class="vacio">Sin ventas en este periodo</p>';

  const maxPago = Math.max(...r.pagos.map((p) => p.total), 1);
  $('#por-pago').innerHTML = r.pagos.map((p) => `
    <div class="fila-barra">
      <span>${NOMBRE_PAGO[p.forma]}</span>
      <div class="pista"><div style="width:${p.total / maxPago * 100}%"></div></div>
      <b>${dinero(p.total)}</b>
      <small class="muted">${r.total ? Math.round(p.total / r.total * 100) : 0}%</small>
    </div>`).join('');

  // Pagos con tarjeta: para cuadrar contra lo que deposita la terminal
  const conTarjeta = r.ventas.filter((v) => v.pago === 'tarjeta').sort((a, b) => b.fecha - a.fecha);
  const pct = num(db.ajustes.comisionTarjeta);
  const sumaTarjeta = conTarjeta.reduce((s, v) => s + v.total, 0);
  $('#resumen-tarjeta').textContent = conTarjeta.length
    ? `${conTarjeta.length} cobro${conTarjeta.length === 1 ? '' : 's'} · ${dinero(sumaTarjeta)}` +
      (pct ? ` · comisión ${pct}%: ${dinero(sumaTarjeta * pct / 100)} · te depositan ${dinero(sumaTarjeta * (1 - pct / 100))}` : ' · pon la comisión de tu terminal en Ajustes para ver cuánto te depositan')
    : '';
  $('#tabla-tarjeta tbody').innerHTML = conTarjeta.map((v) => `<tr>
      <td><b>#${v.folio}</b></td><td class="muted">${fecha(v.fecha)}</td>
      <td>${v.referencia ? `<code>${esc(v.referencia)}</code>` : '<span class="muted">Sin referencia</span>'}</td>
      <td>${esc(v.usuario || '')}</td>
      <td class="num">${dinero(v.total)}</td>
      ${pct ? `<td class="num muted">−${dinero(v.total * pct / 100)}</td>` : ''}
    </tr>`).join('') || '<tr><td colspan="6" class="vacio">Sin pagos con tarjeta en este periodo</td></tr>';
  $('#th-comision').hidden = !pct;

  $('#tabla-cajeros tbody').innerHTML = r.cajeros.sort((a, b) => b.total - a.total).map((c) => `<tr>
      <td>${esc(c.nombre)}</td><td class="num">${c.ventas}</td><td class="num">${dinero(c.total)}</td>
      <td class="num">${c.canceladas ? `<span class="badge agotado">${c.canceladas}</span>` : '0'}</td></tr>`).join('') ||
    '<tr><td colspan="4" class="vacio">Sin ventas</td></tr>';

  const top = [...r.prods].sort((a, b) => b[ordenTop] - a[ordenTop]).slice(0, 20);
  $$('#orden-productos button').forEach((b) => b.classList.toggle('activa', b.dataset.orden === ordenTop));
  $('#tabla-top tbody').innerHTML = top.map((p, i) => `<tr>
      <td class="muted">${i + 1}</td><td>${esc(p.nombre)}</td><td class="num">${redondear(p.cant)}</td>
      <td class="num">${dinero(p.vendido)}</td><td class="num">${dinero(p.ganancia)}</td>
      <td class="num">${p.vendido ? Math.round(p.ganancia / p.vendido * 100) : 0}%</td></tr>`).join('') ||
    '<tr><td colspan="6" class="vacio">Sin ventas en este periodo</td></tr>';

  $('#tabla-quietos tbody').innerHTML = r.quietos.slice(0, 20).map((p) => `<tr>
      <td>${esc(p.nombre)}</td><td class="num">${p.stock}</td><td class="num">${dinero(p.valor)}</td></tr>`).join('') +
    (r.quietos.length > 20 ? `<tr><td colspan="3" class="muted">y ${r.quietos.length - 20} más</td></tr>` : '') ||
    '<tr><td colspan="3" class="vacio">Todo lo que tiene existencia se vendió</td></tr>';
}

$('#periodos').addEventListener('click', (e) => {
  const d = boton(e);
  if (!d.periodo) return;
  periodo = d.periodo;
  if (periodo === 'rango' && !$('#desde').value) {
    const [desde, hasta] = rangoPeriodo();
    $('#desde').value = isoDia(desde);
    $('#hasta').value = isoDia(new Date(hasta - 1));
  }
  pintarReportes();
});
$('#desde').addEventListener('change', pintarReportes);
$('#hasta').addEventListener('change', pintarReportes);
$('#orden-productos').addEventListener('click', (e) => {
  const d = boton(e);
  if (!d.orden) return;
  ordenTop = d.orden;
  pintarReportes();
});
$('#btn-exportar-reporte').addEventListener('click', () => {
  const r = datosReporte();
  const filas = [['Folio', 'Fecha', 'Forma de pago', 'Referencia', 'Cliente', 'Atendió', 'Producto', 'Código', 'Piezas', 'Precio', 'Costo', 'Importe', 'Cancelada']];
  r.enRango.forEach((v) => v.items.forEach((it) => filas.push([
    v.folio, fecha(v.fecha), NOMBRE_PAGO[v.pago], v.referencia || '', v.clienteId ? cliente(v.clienteId)?.nombre : '', v.usuario || '',
    it.nombre, it.codigo, it.cant, it.precio, it.costo, redondear(it.precio * it.cant), v.cancelada ? 'Sí' : '',
  ])));
  descargar(`ventas-${isoDia(r.desde)}-a-${isoDia(new Date(r.hasta - 1))}.csv`, '﻿' + filas.map((f) => f.map(csvCelda).join(',')).join('\n'), 'text/csv');
});

// ---------- Fotos de productos ----------
// Se guardan en IndexedDB porque en localStorage no caben. Se achican a 320 px.
const fotos = {}; // id del producto → URL para <img>
let baseFotos = null;

function abrirFotos() {
  return new Promise((ok, mal) => {
    const r = indexedDB.open('pdv-fotos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('fotos');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}

async function almacen(modo, accion) {
  baseFotos = baseFotos || (await abrirFotos());
  return new Promise((ok, mal) => {
    const t = baseFotos.transaction('fotos', modo);
    const peticion = accion(t.objectStore('fotos'));
    t.oncomplete = () => ok(peticion && peticion.result);
    t.onerror = () => mal(t.error);
  });
}

async function todasLasFotos() {
  const todas = {};
  await almacen('readonly', (s) => {
    const cursor = s.openCursor();
    cursor.onsuccess = () => { const c = cursor.result; if (c) { todas[c.key] = c.value; c.continue(); } };
  });
  return todas;
}

async function cargarFotos() {
  try {
    Object.entries(await todasLasFotos()).forEach(([pid, blob]) => (fotos[pid] = URL.createObjectURL(blob)));
  } catch (e) { /* navegador sin IndexedDB: la app funciona sin fotos */ }
}

async function guardarFoto(pid, blob) {
  await almacen('readwrite', (s) => s.put(blob, pid));
  if (fotos[pid]) URL.revokeObjectURL(fotos[pid]);
  fotos[pid] = URL.createObjectURL(blob);
}

async function borrarFoto(pid) {
  try { await almacen('readwrite', (s) => s.delete(pid)); } catch (e) { /* no había */ }
  if (fotos[pid]) URL.revokeObjectURL(fotos[pid]);
  delete fotos[pid];
}

async function achicarImagen(archivo, lado = 320) {
  const img = await createImageBitmap(archivo);
  const k = Math.min(1, lado / Math.max(img.width, img.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(img.width * k);
  lienzo.height = Math.round(img.height * k);
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  return new Promise((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.82));
}

const blobATexto = (blob) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });

async function fotosParaRespaldo() {
  const todas = await todasLasFotos();
  for (const pid in todas) todas[pid] = await blobATexto(todas[pid]);
  return todas;
}

async function restaurarFotos(respaldo) {
  try {
    await almacen('readwrite', (s) => s.clear());
    Object.keys(fotos).forEach((pid) => { URL.revokeObjectURL(fotos[pid]); delete fotos[pid]; });
    for (const [pid, texto] of Object.entries(respaldo)) await guardarFoto(pid, await (await fetch(texto)).blob());
  } catch (e) {
    aviso('No se pudieron restaurar las fotos');
  }
}

// ---------- Códigos de barras y etiquetas ----------
// Los códigos que genera la app son EAN-13 que empiezan con 20 (rango para uso interno de tiendas).
const digitoEAN = (d) => String((10 - ([...d].reduce((t, c, i) => t + Number(c) * (i % 2 ? 3 : 1), 0) % 10)) % 10);

function nuevoCodigo() {
  let n = num(db.siguienteCodigo) || 1;
  let codigo;
  do {
    codigo = '20' + String(n).padStart(10, '0');
    codigo += digitoEAN(codigo);
    n++;
  } while (db.productos.some((p) => p.codigo === codigo));
  db.siguienteCodigo = n;
  guardar();
  return codigo;
}

function formatoCodigo(codigo) {
  if (/^\d{13}$/.test(codigo) && digitoEAN(codigo.slice(0, 12)) === codigo[12]) return 'EAN13';
  if (/^\d{8}$/.test(codigo) && digitoEAN('00000' + codigo.slice(0, 7)) === codigo[7]) return 'EAN8';
  return 'CODE128';
}

function dibujarCodigo(svg, codigo, alto) {
  const opciones = { height: alto, width: 1.6, fontSize: 12, margin: 0, textMargin: 1, background: 'transparent' };
  try {
    JsBarcode(svg, codigo, Object.assign({ format: formatoCodigo(codigo) }, opciones));
  } catch (e) {
    JsBarcode(svg, codigo, Object.assign({ format: 'CODE128' }, opciones));
  }
}

async function imprimirEtiquetas(lista) {
  if (!lista.length) return aviso('No hay productos para imprimir');
  if (typeof JsBarcode === 'undefined') return aviso('No se cargó el generador de códigos');
  const sinCodigo = lista.filter((p) => !p.codigo);
  const r = await formulario(lista.length === 1 ? `Etiqueta de "${lista[0].nombre}"` : `Etiquetas de ${lista.length} productos`, [
    ...(sinCodigo.length ? [{ tipo: 'texto', valor: `${sinCodigo.length === 1 ? 'Este producto no tiene' : `${sinCodigo.length} productos no tienen`} código; se les genera uno al imprimir.` }] : []),
    { nombre: 'copias', etiqueta: 'Copias de cada una', tipo: 'number', paso: '1', valor: 1, requerido: true, ancho: 'medio' },
    { nombre: 'precio', etiqueta: 'Mostrar precio', opciones: [['si', 'Sí'], ['no', 'No']], valor: 'si', ancho: 'medio' },
    { nombre: 'papel', etiqueta: 'Papel', opciones: [['rollo', 'Impresora de etiquetas (50 × 25 mm)'], ['hoja', 'Hoja carta (3 columnas)']], valor: 'rollo' },
  ], 'Imprimir');
  if (!r) return;
  sinCodigo.forEach((p) => (p.codigo = nuevoCodigo()));
  if (sinCodigo.length) { guardar(); pintarProductos(); }
  const copias = Math.max(1, Math.min(500, Math.round(num(r.copias))));
  const cont = $('#etiquetas');
  cont.className = 'etiquetas ' + r.papel;
  cont.innerHTML = '';
  lista.forEach((p) => {
    for (let i = 0; i < copias; i++) {
      const et = document.createElement('div');
      et.className = 'etiqueta';
      et.innerHTML = `<div class="et-nombre">${esc(p.nombre)}</div>${r.precio === 'si' ? `<div class="et-precio">${dinero(p.precio)}</div>` : ''}<svg></svg>`;
      cont.appendChild(et);
      dibujarCodigo(et.querySelector('svg'), p.codigo, r.papel === 'rollo' ? 34 : 40);
    }
  });
  imprimir('etiquetas', r.papel === 'rollo' ? '50mm 25mm' : 'letter');
}

$('#btn-etiquetas').addEventListener('click', () => imprimirEtiquetas(productosFiltrados()));

// ---------- Ajustes ----------
function pintarAjustes() {
  const f = $('#form-ajustes');
  Object.entries(db.ajustes).forEach(([k, v]) => { if (f.elements[k]) f.elements[k].value = v; });
  pintarLicencia();
  pintarUsuarios();
}
$('#form-ajustes').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  Object.keys(db.ajustes).forEach((k) => { if (f.elements[k]) db.ajustes[k] = f.elements[k].value.trim(); });
  db.ajustes.stockMinDefault = num(db.ajustes.stockMinDefault);
  db.ajustes.comisionTarjeta = num(db.ajustes.comisionTarjeta);
  guardar();
  pintarMarca();
  aviso('Guardado');
});

$('#btn-respaldo').addEventListener('click', async () => {
  const hoy = new Date().toISOString().slice(0, 10);
  let conFotos = {};
  try { conFotos = await fotosParaRespaldo(); } catch (e) { /* sin fotos */ }
  descargar(`respaldo-punto-de-venta-${hoy}.json`, JSON.stringify(Object.assign({}, db, { fotos: conFotos })), 'application/json');
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
    const { fotos: fotosRespaldo, ...resto } = datos;
    db = Object.assign(vacio(), resto, { ajustes: Object.assign(vacio().ajustes, resto.ajustes) });
    guardar();
    await restaurarFotos(fotosRespaldo || {});
    pintarMarca();
    aviso('Respaldo restaurado');
    if (db.usuarios.length && !usuarioActual()) return bloquear();
    aplicarPermisos();
    mostrarVista('ajustes');
  } catch (err) {
    aviso('Ese archivo no es un respaldo válido');
  }
});

function pintarMarca() {
  $('#marca').textContent = db.ajustes.negocio || 'Punto de Venta';
  document.title = (db.ajustes.negocio ? db.ajustes.negocio + ' · ' : '') + 'Punto de Venta';
}

// ---------- Licencia ----------
// Sin licencia la app se puede usar PRUEBA_DIAS días. La licencia es una clave firmada con la llave
// privada del proveedor (herramientas/licencias.html) y solo vale en el equipo con ese código.
// Se guarda aparte de los datos para que un respaldo no la lleve a otro equipo.
const LLAVE_PUBLICA = { kty: 'EC', crv: 'P-256', x: 'kHXhaBu9s5AaC9AItybUiMRPN0yRd1JNrBns1cmbEQc', y: 'tkCw8ypt99WGgBO4j8xSngMu1j18rDlC4foMzOQwQiQ' };
const PRUEBA_DIAS = 15;
const CLAVE_LICENCIA = 'pdv-licencia-v1';
const DIA = 864e5;

const lic = (() => {
  let l = null;
  try { l = JSON.parse(localStorage.getItem(CLAVE_LICENCIA)); } catch (e) { /* sin acceso */ }
  if (!l || !l.equipo) {
    // Sin letras que se confunden (0/O, 1/I/L) porque el código se dicta por teléfono
    const letras = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const azar = crypto.getRandomValues(new Uint8Array(8));
    l = { equipo: [...azar].map((n) => letras[n % letras.length]).join(''), inicio: Date.now(), visto: Date.now(), clave: '' };
  }
  return l;
})();
let licencia = null; // datos de la clave ya revisada
const guardarLicencia = () => { try { localStorage.setItem(CLAVE_LICENCIA, JSON.stringify(lic)); } catch (e) { /* sin acceso */ } };
guardarLicencia();
const codigoEquipo = () => lic.equipo.slice(0, 4) + '-' + lic.equipo.slice(4);

// Si atrasan el reloj de la computadora, seguimos contando desde la fecha más alta que vimos
function ahora() {
  if (Date.now() > lic.visto) { lic.visto = Date.now(); guardarLicencia(); }
  return lic.visto;
}
const finDelDia = (iso) => new Date(iso + 'T23:59:59').getTime();
const desde64 = (t) => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function leerClave(clave, tipo, revisarFecha = true) {
  const m = /^PDV-([\w-]+)\.([\w-]+)$/.exec(String(clave).replace(/\s/g, ''));
  if (!m) throw new Error('La clave está incompleta. Cópiala otra vez completa.');
  if (!crypto.subtle) throw new Error('Este navegador no puede revisar la clave. Usa la app instalada.');
  let datos;
  try {
    const llave = await crypto.subtle.importKey('jwk', LLAVE_PUBLICA, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const texto = desde64(m[1]);
    if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, llave, desde64(m[2]), texto))) throw new Error();
    datos = JSON.parse(new TextDecoder().decode(texto));
  } catch (e) {
    throw new Error('La clave no es válida. Revisa que esté completa.');
  }
  if (datos.t !== tipo) throw new Error(tipo === 'licencia' ? 'Esa es una llave de rescate, no una licencia.' : 'Esa es una licencia, no una llave de rescate.');
  if (datos.e !== lic.equipo) throw new Error(`Esta clave es para otro equipo. El código de este es ${codigoEquipo()}.`);
  if (revisarFecha && datos.h && finDelDia(datos.h) < ahora()) throw new Error(`Esta clave venció el ${datos.h}.`);
  return datos;
}

async function cargarLicencia() {
  if (lic.clave) {
    try { licencia = await leerClave(lic.clave, 'licencia', false); } catch (e) { licencia = null; }
  }
  pintarLicencia();
}

// ok: se puede cobrar · dias: días que quedan (null = sin vencimiento)
function estadoLicencia() {
  if (licencia) {
    if (!licencia.h) return { ok: true, tipo: 'licencia', dias: null };
    const dias = Math.ceil((finDelDia(licencia.h) - ahora()) / DIA);
    return { ok: dias > 0, tipo: 'licencia', dias };
  }
  const dias = PRUEBA_DIAS - Math.floor((ahora() - lic.inicio) / DIA);
  return { ok: dias > 0, tipo: 'prueba', dias };
}

function pintarLicencia() {
  const e = estadoLicencia();
  const banda = $('#banda-licencia');
  const plural = (n) => `${n} día${n === 1 ? '' : 's'}`;
  let texto = '';
  if (!e.ok) texto = e.tipo === 'prueba' ? 'Terminó la prueba gratis.' : 'Tu licencia venció.';
  else if (e.tipo === 'prueba') texto = `Versión de prueba: te ${e.dias === 1 ? 'queda' : 'quedan'} ${plural(e.dias)}.`;
  else if (e.dias != null && e.dias <= 7) texto = `Tu licencia vence en ${plural(e.dias)}.`;
  banda.hidden = !texto;
  banda.className = 'banda-licencia' + (e.ok ? '' : ' bloqueada');
  if (texto) {
    banda.innerHTML = `${ic(e.ok ? 'key-round' : 'lock')}<span>${texto}${e.ok ? '' : ' Puedes ver tus datos, pero no cobrar.'}</span>` +
      (esDueno() ? '<button class="sec" data-ir-licencia>Activar licencia</button>' : '<span class="muted">Avisa al dueño.</span>');
  }

  const panel = $('#estado-licencia');
  if (!panel) return;
  const estado = licencia
    ? `<span class="badge ${e.ok ? 'ok' : 'agotado'}">${e.ok ? 'Activa' : 'Vencida'}</span> ${esc(licencia.n)} · ${licencia.h ? `${e.ok ? 'vence' : 'venció'} el ${licencia.h}` : 'sin vencimiento'}`
    : `<span class="badge ${e.ok ? 'bajo' : 'agotado'}">${e.ok ? 'Prueba' : 'Prueba terminada'}</span> ${e.ok ? `quedan ${plural(e.dias)}` : 'activa una licencia para seguir cobrando'}`;
  panel.innerHTML = estado;
  $('#codigo-equipo').textContent = codigoEquipo();
}

$('#banda-licencia').addEventListener('click', (e) => {
  if (boton(e).irLicencia == null) return;
  mostrarVista('ajustes');
  $('#clave-licencia').focus();
});
$('#btn-copiar-equipo').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(codigoEquipo()); aviso('Código copiado'); } catch (e) { aviso(`El código es ${codigoEquipo()}`); }
});
$('#form-licencia').addEventListener('submit', async (e) => {
  e.preventDefault();
  const clave = $('#clave-licencia').value.trim();
  try {
    licencia = await leerClave(clave, 'licencia');
    lic.clave = clave.replace(/\s/g, '');
    guardarLicencia();
    $('#clave-licencia').value = '';
    pintarLicencia();
    aviso(`Licencia activada para ${licencia.n}`);
  } catch (err) {
    aviso(err.message);
  }
});

// ---------- Usuarios y permisos ----------
// Sin usuarios la app no pide PIN (como siempre). Al crear el primero, que es el dueño,
// la app pide entrar con PIN al abrirse. Los cajeros no ven Productos ni Ajustes ni la ganancia,
// y para cambiar un precio o cancelar una venta piden el PIN de un dueño.
const SOLO_DUENO = ['productos', 'reportes', 'ajustes'];
const ROLES = { dueno: 'Dueño', cajero: 'Cajero' };
let sesionId = null;
const usuarioActual = () => db.usuarios.find((u) => u.id === sesionId) || null;
const esDueno = () => !db.usuarios.length || usuarioActual()?.rol === 'dueno';
const pinValido = (pin) => /^\d{4,6}$/.test(pin);

async function hashPin(pin, sal) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sal + ':' + pin));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const revisarPin = async (u, pin) => u.pin === (await hashPin(pin, u.sal));
async function ponerPin(u, pin) { u.sal = id(); u.pin = await hashPin(pin, u.sal); }

function aplicarPermisos() {
  const u = usuarioActual();
  $$('#tabs button').forEach((b) => (b.hidden = !esDueno() && SOLO_DUENO.includes(b.dataset.vista)));
  $('#usuario-actual').hidden = !u;
  if (u) {
    $('#usuario-inicial').textContent = u.nombre.trim().charAt(0).toUpperCase();
    $('#usuario-nombre').textContent = u.nombre;
    $('#usuario-rol').textContent = ROLES[u.rol];
  }
  const activa = $('#tabs button.activa');
  if (activa?.hidden) mostrarVista('vender');
  pintarLicencia();
}

// Pide el PIN de un dueño cuando un cajero quiere hacer algo delicado
async function autorizar(accion) {
  if (esDueno()) return true;
  const r = await formulario('Permiso del dueño', [
    { tipo: 'texto', valor: `Para ${accion} se necesita el PIN de un dueño.` },
    { nombre: 'pin', etiqueta: 'PIN del dueño', tipo: 'password', requerido: true },
  ], 'Autorizar');
  if (!r) return false;
  for (const u of db.usuarios.filter((x) => x.rol === 'dueno')) {
    if (await revisarPin(u, r.pin)) return true;
  }
  aviso('PIN incorrecto');
  return false;
}

// Pantalla de entrada
let elegido = null;
function bloquear() {
  sesionId = null;
  elegido = db.usuarios.length === 1 ? db.usuarios[0].id : null;
  if (document.querySelector('dialog[open]')) $$('dialog[open]').forEach((d) => d.close());
  pintarBloqueo();
  $('#bloqueo').hidden = false;
  $('#pin').focus();
}
function pintarBloqueo() {
  $('#bloqueo-negocio').textContent = db.ajustes.negocio || 'Punto de Venta';
  $('#bloqueo-usuarios').innerHTML = [...db.usuarios]
    .sort((a, b) => (a.rol === b.rol ? a.nombre.localeCompare(b.nombre) : a.rol === 'dueno' ? -1 : 1))
    .map((u) => `<button type="button" class="quien ${u.id === elegido ? 'activa' : ''}" data-quien="${u.id}">
      <span class="avatar">${esc(u.nombre.trim().charAt(0).toUpperCase())}</span><span>${esc(u.nombre)}<small>${ROLES[u.rol]}</small></span></button>`).join('');
  $('#pin').value = '';
  pintarPuntos();
}
const pintarPuntos = () => {
  const n = $('#pin').value.length;
  $('#pin-puntos').innerHTML = Array.from({ length: Math.max(4, n) }, (_, i) => `<i class="${i < n ? 'lleno' : ''}"></i>`).join('');
};

$('#bloqueo-usuarios').addEventListener('click', (e) => {
  const d = boton(e);
  if (!d.quien) return;
  elegido = d.quien;
  pintarBloqueo();
  $('#pin').focus();
});
$('#pin').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); pintarPuntos(); });
$('#teclado').addEventListener('click', (e) => {
  const d = boton(e);
  const pin = $('#pin');
  if (d.tecla != null) pin.value = (pin.value + d.tecla).slice(0, 6);
  if (d.borrar != null) pin.value = pin.value.slice(0, -1);
  pintarPuntos();
  pin.focus();
});
$('#form-entrar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const u = db.usuarios.find((x) => x.id === elegido);
  if (!u) return aviso('Toca tu nombre primero');
  if (!(await revisarPin(u, $('#pin').value))) {
    $('#form-entrar').classList.remove('error');
    void $('#form-entrar').offsetWidth;
    $('#form-entrar').classList.add('error');
    $('#pin').value = '';
    pintarPuntos();
    return aviso('PIN incorrecto');
  }
  sesionId = u.id;
  $('#bloqueo').hidden = true;
  aplicarPermisos();
  mostrarVista('vender');
});
$('#btn-bloquear').addEventListener('click', bloquear);

// Si el dueño olvida su PIN, el proveedor le genera una llave de rescate para este equipo
$('#btn-olvide').addEventListener('click', async () => {
  $('#bloqueo').hidden = true;
  const duenos = db.usuarios.filter((u) => u.rol === 'dueno');
  const r = await formulario('Olvidé mi PIN', [
    { tipo: 'texto', valor: `Pide una <b>llave de rescate</b> a quien te vendió el sistema y dale este código de equipo: <b>${codigoEquipo()}</b>` },
    { nombre: 'clave', etiqueta: 'Llave de rescate', requerido: true },
    { nombre: 'quien', etiqueta: 'Dueño', opciones: duenos.map((u) => [u.id, u.nombre]), valor: duenos[0]?.id, ancho: 'medio' },
    { nombre: 'pin', etiqueta: 'PIN nuevo (4 a 6 números)', tipo: 'password', requerido: true, ancho: 'medio' },
  ], 'Cambiar PIN');
  $('#bloqueo').hidden = false;
  if (!r) return;
  if (!pinValido(r.pin)) return aviso('El PIN debe ser de 4 a 6 números');
  try {
    await leerClave(r.clave, 'rescate');
    const u = db.usuarios.find((x) => x.id === r.quien);
    await ponerPin(u, r.pin);
    guardar();
    elegido = u.id;
    pintarBloqueo();
    aviso(`Listo, ${u.nombre} ya puede entrar con su PIN nuevo`);
  } catch (err) {
    aviso(err.message);
  }
});

function pintarUsuarios() {
  const yo = usuarioActual();
  $('#lista-usuarios').innerHTML = db.usuarios.length
    ? db.usuarios.map((u) => `<li>
        <span class="avatar">${esc(u.nombre.trim().charAt(0).toUpperCase())}</span>
        <span class="crece"><b>${esc(u.nombre)}</b>${u.id === yo?.id ? ' <small class="muted">(tú)</small>' : ''}<br><small class="muted">${ROLES[u.rol]}</small></span>
        <button class="btn-icono" data-editar-usuario="${u.id}" title="Editar">${ic('pencil')}</button>
        <button class="btn-icono peligro" data-borrar-usuario="${u.id}" title="Borrar">${ic('trash-2')}</button>
      </li>`).join('')
    : '<li class="muted">Aún no hay usuarios: cualquiera puede usar todo sin PIN. Crea primero al dueño.</li>';
  $('#btn-nuevo-usuario').innerHTML = `${ic('plus')}${db.usuarios.length ? 'Agregar cajero o dueño' : 'Crear dueño'}`;
}

async function editarUsuario(u) {
  const primero = !db.usuarios.length;
  const unicoDueno = u?.rol === 'dueno' && db.usuarios.filter((x) => x.rol === 'dueno').length === 1;
  const r = await formulario(u ? `Editar a ${u.nombre}` : primero ? 'Crear al dueño' : 'Nuevo usuario', [
    ...(primero ? [{ tipo: 'texto', valor: 'Desde ahora la app pedirá entrar con PIN al abrirse. El dueño puede todo; los cajeros solo venden, cobran y hacen corte.' }] : []),
    { nombre: 'nombre', etiqueta: 'Nombre', valor: u?.nombre, requerido: true },
    { nombre: 'rol', etiqueta: 'Puesto', opciones: primero || unicoDueno ? [['dueno', 'Dueño']] : [['cajero', 'Cajero'], ['dueno', 'Dueño']], valor: u?.rol || 'cajero', ancho: 'medio' },
    { nombre: 'pin', etiqueta: u ? 'PIN nuevo (vacío = no cambiar)' : 'PIN (4 a 6 números)', tipo: 'password', requerido: !u, ancho: 'medio' },
  ]);
  if (!r) return;
  if ((r.pin || !u) && !pinValido(r.pin)) return aviso('El PIN debe ser de 4 a 6 números');
  if (db.usuarios.some((x) => x !== u && sinAcentos(x.nombre) === sinAcentos(r.nombre))) return aviso(`Ya hay un usuario llamado ${r.nombre}`);
  const nuevo = !u;
  if (nuevo) u = { id: id() };
  u.nombre = r.nombre;
  u.rol = r.rol;
  if (r.pin) await ponerPin(u, r.pin);
  if (nuevo) db.usuarios.push(u);
  guardar();
  if (primero) {
    sesionId = u.id;
    aviso('Listo. Desde ahora la app pide PIN al abrir.');
  }
  aplicarPermisos();
  pintarUsuarios();
}

$('#btn-nuevo-usuario').addEventListener('click', () => editarUsuario(null));
$('#lista-usuarios').addEventListener('click', (e) => {
  const d = boton(e);
  if (d.editarUsuario) editarUsuario(db.usuarios.find((u) => u.id === d.editarUsuario));
  if (d.borrarUsuario) {
    const u = db.usuarios.find((x) => x.id === d.borrarUsuario);
    const otros = db.usuarios.filter((x) => x !== u);
    if (u.rol === 'dueno' && otros.length && !otros.some((x) => x.rol === 'dueno')) return aviso('Debe quedar al menos un dueño');
    if (!confirm(otros.length ? `¿Borrar a ${u.nombre}?` : `¿Borrar a ${u.nombre}? Sin usuarios, la app ya no pedirá PIN.`)) return;
    db.usuarios = otros;
    guardar();
    if (u.id === sesionId) {
      if (otros.length) return bloquear();
      sesionId = null;
    }
    aplicarPermisos();
    pintarUsuarios();
  }
});

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
aplicarPermisos();
if (db.usuarios.length) bloquear();
pintarVender();
cargarLicencia();
cargarFotos().then(() => { if (Object.keys(fotos).length) { pintarVender(); pintarProductos(); } });
