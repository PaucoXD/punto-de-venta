# Punto de Venta

Punto de venta web para tienditas, distribuidoras y refaccionarias. Funciona sin internet y todo se guarda en el navegador del equipo donde se usa.

## Qué hace

- **Vender**: escanea con lector de código de barras (USB o Bluetooth) o con la cámara del celular, o busca por nombre, marca o clave. Escribe `3*7501` para agregar 3 piezas de golpe. Cobra con **F2**.
- **Mayoreo automático**: si el producto tiene precio de mayoreo, se aplica solo al llegar a la cantidad mínima. El precio de cada línea se puede cambiar a mano.
- **Formas de pago**: efectivo (calcula el cambio), tarjeta/transferencia y crédito (fiado) con límite por cliente.
- **Ticket** para impresora térmica de 58/80 mm.
- **Productos e inventario**: existencias, stock mínimo con aviso, "Surtir" para registrar mercancía que llega, importar y exportar CSV.
- **Clientes**: saldo, abonos y estado de cuenta.
- **Caja**: entradas y salidas de efectivo, ventas del turno, cancelación de ventas (regresa el inventario), ganancia estimada y corte de caja con diferencia.
- **Respaldo**: descarga y restaura todos los datos en un archivo.

## Importar productos desde Excel

Guarda la hoja como CSV con una fila de encabezados. Se reconocen estas columnas (con o sin acentos): `codigo`, `nombre`, `marca`, `categoria`, `costo`, `precio`, `mayoreo`, `min mayoreo`, `existencia`, `stock minimo`. Solo `nombre` es obligatoria. Si el código ya existe, el producto se actualiza.

## Uso

Abre `index.html` en el navegador o publícalo con GitHub Pages.
