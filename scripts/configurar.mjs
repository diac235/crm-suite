#!/usr/bin/env node
/**
 * Asistente de configuración inicial.
 * Crea server/.env a partir del ejemplo, genera los secretos JWT y arma la
 * cadena de conexión a PostgreSQL preguntando los datos al usuario.
 *
 * Uso:  npm run configurar
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rutaEjemplo = path.join(raiz, 'server', '.env.example');
const rutaEnv = path.join(raiz, 'server', '.env');
const rutaEnvWeb = path.join(raiz, 'web', '.env');
const rutaEjemploWeb = path.join(raiz, 'web', '.env.example');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

/**
 * Cola de líneas leídas. Permite que el asistente funcione tanto de forma
 * interactiva como con la entrada redirigida desde un archivo o una tubería.
 */
const lineasPendientes = [];
const esperando = [];
let entradaCerrada = false;

rl.on('line', (linea) => {
  const resolver = esperando.shift();
  if (resolver) resolver(linea);
  else lineasPendientes.push(linea);
});

rl.on('close', () => {
  entradaCerrada = true;
  while (esperando.length > 0) esperando.shift()('');
});

function leerLinea() {
  if (lineasPendientes.length > 0) return Promise.resolve(lineasPendientes.shift());
  if (entradaCerrada) return Promise.resolve('');
  return new Promise((resolver) => esperando.push(resolver));
}

function secreto() {
  return crypto.randomBytes(48).toString('base64').replace(/[=+/]/g, '');
}

/** Pregunta al usuario y devuelve su respuesta o el valor por defecto. */
async function preguntar(texto, porDefecto) {
  process.stdout.write(`${texto}${porDefecto ? ` [${porDefecto}]` : ''}: `);
  const respuesta = (await leerLinea()).trim();
  if (!process.stdin.isTTY) process.stdout.write(`${respuesta || porDefecto || ''}\n`);
  return respuesta || porDefecto || '';
}

function reemplazar(contenido, clave, valor) {
  const patron = new RegExp(`^${clave}=.*$`, 'm');
  return patron.test(contenido) ? contenido.replace(patron, `${clave}=${valor}`) : `${contenido}\n${clave}=${valor}`;
}

console.log('\n=== Configuración inicial del CRM ===\n');

if (Number(process.versions.node.split('.')[0]) < 20) {
  console.error(`Se requiere Node.js 20 o superior. Versión detectada: ${process.versions.node}`);
  process.exit(1);
}

if (fs.existsSync(rutaEnv)) {
  const sobrescribir = await preguntar('Ya existe server/.env. ¿Desea reemplazarlo? (s/N)', 'N');
  if (!/^s/i.test(sobrescribir)) {
    console.log('Configuración cancelada. No se modificó nada.');
    rl.close();
    process.exit(0);
  }
}

let contenido = fs.readFileSync(rutaEjemplo, 'utf8');

console.log('Datos de conexión a PostgreSQL:\n');
const host = await preguntar('  Host', 'localhost');
const puerto = await preguntar('  Puerto', '5432');
const baseDatos = await preguntar('  Base de datos', 'crm_db');
const usuarioBd = await preguntar('  Usuario', 'postgres');
const claveBd = await preguntar('  Contraseña del usuario', '');

if (!claveBd) {
  console.error('\nLa contraseña de PostgreSQL es obligatoria.');
  rl.close();
  process.exit(1);
}

const claveCodificada = encodeURIComponent(claveBd);
const cadena = `postgresql://${usuarioBd}:${claveCodificada}@${host}:${puerto}/${baseDatos}`;

console.log('\nUsuario administrador inicial del CRM:\n');
const correoAdmin = await preguntar('  Correo', 'admin@crm.local');
const claveAdmin = await preguntar('  Contraseña inicial', 'Admin*2026Seguro');

const demo = await preguntar('\n¿Cargar datos de ejemplo para probar el sistema? (S/n)', 'S');

contenido = reemplazar(contenido, 'DATABASE_URL', cadena);
contenido = reemplazar(contenido, 'JWT_ACCESS_SECRET', secreto());
contenido = reemplazar(contenido, 'JWT_REFRESH_SECRET', secreto());
contenido = reemplazar(contenido, 'SEED_ADMIN_EMAIL', correoAdmin);
contenido = reemplazar(contenido, 'SEED_ADMIN_PASSWORD', claveAdmin);
contenido = reemplazar(contenido, 'SEED_DEMO_DATA', /^s/i.test(demo) ? 'true' : 'false');

fs.writeFileSync(rutaEnv, contenido, { mode: 0o600 });
if (!fs.existsSync(rutaEnvWeb) && fs.existsSync(rutaEjemploWeb)) {
  fs.copyFileSync(rutaEjemploWeb, rutaEnvWeb);
}

console.log('\n✔ server/.env creado con secretos generados automáticamente.');
console.log('\nSiguientes pasos:\n');
console.log('  1) npm run db:migrate     crea las tablas');
console.log('  2) npm run db:seed        carga permisos, roles, catálogos y el administrador');
console.log('  3) npm run dev            levanta la API y la interfaz\n');
console.log('  Luego abra  http://localhost:5173  e ingrese con:');
console.log(`     usuario:    ${correoAdmin}`);
console.log(`     contraseña: ${claveAdmin}\n`);

rl.close();
