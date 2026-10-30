# Punto de Venta

Punto de venta web para tienditas, distribuidoras y refaccionarias. Funciona sin internet y todo se guarda en el navegador del equipo donde se usa.

## Qué hace

- **Vender**: escanea con lector de código de barras (USB o Bluetooth) o con la cámara del celular, o busca por nombre, marca o clave. Escribe `3*7501` para agregar 3 piezas de golpe. Cobra con **F2**.
- **Mayoreo automático**: si el producto tiene precio de mayoreo, se aplica solo al llegar a la cantidad mínima. El precio de cada línea se puede cambiar a mano.
- **Formas de pago**: efectivo (calcula el cambio), tarjeta/transferencia y crédito (fiado) con límite por cliente.
- **Ticket** para impresora térmica de 58/80 mm.
- **Fotos de productos**: se ven en los botones de Vender y en la tabla. Se guardan achicadas en el equipo y van incluidas en el respaldo.
- **Códigos de barras**: botón *Generar* para productos que no traen código (EAN-13 interno que empieza con 20) y **etiquetas** para imprimir con nombre, precio y código, en impresora de etiquetas de 50 × 25 mm o en hoja carta.
- **Tarjeta**: la app no cobra la tarjeta. El cobro se hace en tu terminal (Clip, Mercado Pago, banco) y aquí se registra la venta con la referencia del voucher. Si pones la comisión de la terminal en Ajustes, la Caja la descuenta de la ganancia.
- **Productos e inventario**: existencias, stock mínimo con aviso, "Surtir" para registrar mercancía que llega, importar y exportar CSV.
- **Clientes**: saldo, abonos y estado de cuenta.
- **Caja**: entradas y salidas de efectivo, ventas del turno, cancelación de ventas (regresa el inventario), ganancia estimada y corte de caja con diferencia.
- **Respaldo**: descarga y restaura todos los datos en un archivo.
- **Usuarios con PIN**: el dueño puede todo; los cajeros solo venden, cobran, dan abonos y hacen corte. No ven Productos, Ajustes ni la ganancia, y para cambiar un precio o cancelar una venta piden el PIN del dueño. Cada venta y corte guarda quién lo hizo. Sin usuarios, la app no pide PIN.
- **Licencia**: 15 días de prueba gratis. Después hay que activar una licencia para seguir cobrando (los datos se pueden seguir viendo).

## Importar productos desde Excel

Guarda la hoja como CSV con una fila de encabezados. Se reconocen estas columnas (con o sin acentos): `codigo`, `nombre`, `marca`, `categoria`, `costo`, `precio`, `mayoreo`, `min mayoreo`, `existencia`, `stock minimo`. Solo `nombre` es obligatoria. Si el código ya existe, el producto se actualiza.

## Uso

- **En el navegador**: https://paucoxd.github.io/punto-de-venta/ (o abre `index.html`). Funciona sin internet después de la primera vez.
- **Instalada desde el navegador**: en Chrome o Edge aparece el botón verde **⬇ Instalar en este equipo**. Queda como app con su ícono en el escritorio y el menú Inicio.
- **App de escritorio para Windows (.exe)**: en la pestaña **Actions → Instalador de escritorio → Run workflow** se construye el instalador; se descarga desde *Artifacts* al terminar. Si creas una etiqueta `v1.0.1` (o la que sigue), el instalador también se publica en **Releases**.

### Actualizaciones

- **Navegador / app instalada desde Chrome o Edge**: se actualiza sola. Cada vez que abre con internet baja lo último de GitHub Pages.
- **App de Windows (.exe)**: igual que Expedito, revisa sola si hay versión nueva (al abrir y cada 4 horas), la descarga en segundo plano y pregunta si reiniciar para instalarla. También está en el menú *Ayuda → Buscar actualizaciones*.

**Las versiones salen solas:** cada vez que se hace merge de un PR a `main`, GitHub Actions publica la versión siguiente en Releases (`v1.0.1` → `v1.0.2` → …) con el `.exe` y el `latest.yml`, y en unos minutos las apps instaladas la encuentran. Si el merge solo cambia archivos `.md`, no sale versión.

Para saltar a otra versión (por ejemplo `v1.1.0`), crea la Release a mano con esa etiqueta; las siguientes seguirán desde ahí.

Cada forma de abrirla guarda sus propios datos. Para pasar los datos de una a otra usa *Ajustes → Descargar respaldo* y *Restaurar respaldo*.

### Para desarrollar la versión de escritorio

```
npm install
npm run escritorio   # abre la app en una ventana
npm run instalador   # crea el .exe en dist/ (en Windows)
```

## Licencias (para quien vende el sistema)

Cada equipo tiene un **código de equipo** (en *Ajustes → Licencia*, ej. `K7F2-9QXA`). La licencia es una clave firmada que solo funciona en ese equipo, así que no sirve copiarla a otra computadora.

Para dar una licencia:

1. El negocio te manda su código de equipo.
2. En GitHub: **Actions → Generar licencia → Run workflow**. Pon el nombre del negocio, el código y por cuántos meses (o *Sin vencimiento*).
3. Abre la ejecución cuando termine: la clave `PDV-…` sale en el resumen. Mándasela al negocio y la pega en *Ajustes → Licencia → Activar*.

Si un dueño olvida su PIN, genera lo mismo con **¿Qué generar? → rescate**. Esa llave vale 3 días y en la pantalla de entrada se usa con *Olvidé mi PIN*.

La firma usa una llave privada guardada en el secreto `LICENCIA_LLAVE_PRIVADA` (Settings → Secrets and variables → Actions). Nunca la subas al repositorio: con ella cualquiera podría hacer licencias. La llave pública está en `app.js` (`LLAVE_PUBLICA`); si cambias de llaves con `node herramientas/licencia.mjs llaves`, las licencias anteriores dejan de servir.

## Créditos

- Íconos: [Lucide](https://lucide.dev) (licencia ISC), incluidos dentro de `index.html`.
- Códigos de barras: [JsBarcode](https://github.com/lindell/JsBarcode) (MIT), en `vendor/`.
- Letra: [Inter](https://rsms.me/inter/) (licencia SIL OFL), en `fuentes/`.

Ambos van dentro del proyecto, así que la app se ve igual sin internet.
