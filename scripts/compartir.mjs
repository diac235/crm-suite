#!/usr/bin/env node
/**
 * Modo demostración: compila la interfaz y la sirve junto con la API desde un
 * único puerto, listo para exponerse con un túnel (Cloudflare, ngrok…).
 *
 * Uso:  npm run compartir
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const puerto = process.env.PORT ?? '4000';
const esWindows = process.platform === 'win32';
const npm = esWindows ? 'npm.cmd' : 'npm';

function ejecutar(comando, args, opciones = {}) {
  return new Promise((resolver, rechazar) => {
    const proceso = spawn(comando, args, { cwd: raiz, stdio: 'inherit', shell: esWindows, ...opciones });
    proceso.on('error', rechazar);
    proceso.on('close', (codigo) => (codigo === 0 ? resolver() : rechazar(new Error(`${comando} terminó con código ${codigo}`))));
  });
}

if (!fs.existsSync(path.join(raiz, 'server', '.env'))) {
  console.error('\nNo existe server/.env. Ejecute primero:  npm run configurar\n');
  process.exit(1);
}

console.log('\n=== Modo demostración ===\n');
console.log('1/2  Compilando la aplicación (puede tardar un minuto)...\n');

try {
  await ejecutar(npm, ['run', 'build']);
} catch (error) {
  console.error('\nLa compilación falló:', error.message);
  process.exit(1);
}

console.log('\n2/2  Iniciando el servidor...\n');
console.log('┌────────────────────────────────────────────────────────────┐');
console.log(`│  Compruebe primero en:  http://localhost:${puerto.padEnd(18)}│`);
console.log('│                                                            │');
console.log('│  Para obtener un enlace público, abra OTRA terminal y use:  │');
console.log(`│     cloudflared tunnel --url http://localhost:${puerto.padEnd(13)}│`);
console.log('│                                                            │');
console.log('│  Para detener todo: Ctrl + C en ambas terminales.           │');
console.log('└────────────────────────────────────────────────────────────┘\n');

const servidor = spawn('node', ['dist/index.js'], {
  cwd: path.join(raiz, 'server'),
  stdio: 'inherit',
  env: {
    ...process.env,
    // Un solo proceso sirve la interfaz compilada y la API.
    NODE_ENV: 'production',
    SERVE_STATIC: 'true',
    PORT: puerto,
    // El seed no debe re-ejecutarse: la base ya está preparada.
    RUN_MIGRATIONS_ON_START: 'false',
    RUN_SEED_ON_START: 'false',
  },
});

const detener = () => {
  servidor.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', detener);
process.on('SIGTERM', detener);
servidor.on('close', (codigo) => process.exit(codigo ?? 0));
