// Genera licencias y llaves de rescate para el Punto de Venta.
// Lo corre el workflow "Generar licencia" con la llave privada guardada en el secreto LICENCIA_LLAVE_PRIVADA.
//   node herramientas/licencia.mjs licencia "<negocio>" <codigo-equipo> <meses|0>
//   node herramientas/licencia.mjs rescate "<negocio>" <codigo-equipo>
//   node herramientas/licencia.mjs llaves        (crea un par de llaves nuevo, solo una vez)
import crypto from 'node:crypto';

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const [tipo, negocio = '', equipo = '', meses = '0'] = process.argv.slice(2);

if (tipo === 'llaves') {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  console.log('Llave pública (va en app.js, LLAVE_PUBLICA):');
  console.log(JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }));
  console.log('\nLlave privada (va en el secreto LICENCIA_LLAVE_PRIVADA, nunca en el repo):');
  console.log(privateKey.export({ format: 'pem', type: 'pkcs8' }));
  process.exit(0);
}

const codigo = equipo.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
if (!['licencia', 'rescate'].includes(tipo) || !negocio.trim() || codigo.length !== 8) {
  console.error('Faltan datos: el nombre del negocio y el código del equipo (8 letras y números, ej. K7F2-9QXA).');
  process.exit(1);
}
if (!process.env.LICENCIA_LLAVE_PRIVADA) {
  console.error('Falta el secreto LICENCIA_LLAVE_PRIVADA en Settings → Secrets and variables → Actions.');
  process.exit(1);
}

const hoy = new Date();
const dia = (d) => d.toISOString().slice(0, 10);
let hasta = '';
if (tipo === 'rescate') hasta = dia(new Date(hoy.getTime() + 3 * 864e5));
else if (Number(meses) > 0) { const d = new Date(hoy); d.setMonth(d.getMonth() + Number(meses)); hasta = dia(d); }

const datos = { v: 1, t: tipo, n: negocio.trim(), e: codigo, h: hasta, f: dia(hoy) };
const texto = JSON.stringify(datos);
const firma = crypto.sign('sha256', Buffer.from(texto), { key: process.env.LICENCIA_LLAVE_PRIVADA, dsaEncoding: 'ieee-p1363' });
const clave = `PDV-${b64(texto)}.${b64(firma)}`;

const resumen = [
  `## ${tipo === 'rescate' ? 'Llave de rescate' : 'Licencia'} para ${datos.n}`,
  '',
  `Equipo: \`${codigo.slice(0, 4)}-${codigo.slice(4)}\` · ${hasta ? `Vale hasta el ${hasta}` : 'Sin vencimiento'}`,
  '',
  tipo === 'rescate'
    ? 'Mándasela al dueño. En la pantalla de entrada toca "Olvidé mi PIN" y pégala ahí para poner un PIN nuevo.'
    : 'Mándasela al negocio. En la app: Ajustes → Licencia → pegar → Activar.',
  '',
  '```',
  clave,
  '```',
].join('\n');
console.log(resumen);
if (process.env.GITHUB_STEP_SUMMARY) {
  const fs = await import('node:fs');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumen + '\n');
}
