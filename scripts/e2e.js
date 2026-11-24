#!/usr/bin/env node
/**
 * Pruebas de extremo a extremo con Maestro (.maestro/).
 *
 *   npm run e2e                      → todas
 *   npm run e2e -- .maestro/01-menu-en-frio.yaml
 *
 * Necesita: Metro arrancado (npx expo start --dev-client), un emulador con la
 * build de desarrollo y las credenciales de la cuenta de pruebas en
 * .env.maestro.local (no se sube al repo):
 *   MAESTRO_EMAIL=...
 *   MAESTRO_PASSWORD=...
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const envFile = path.join(root, '.env.maestro.local');
const vars = [];
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(MAESTRO_[A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) vars.push('-e', `${m[1]}=${m[2]}`);
  }
} else {
  console.warn('Aviso: falta .env.maestro.local (MAESTRO_EMAIL / MAESTRO_PASSWORD); el login fallará si no hay sesión.');
}

const bin = process.env.MAESTRO_BIN
  || path.join(os.homedir(), 'maestro', 'bin', process.platform === 'win32' ? 'maestro.bat' : 'maestro');

// El emulador llega a Metro por localhost
spawnSync('adb', ['reverse', 'tcp:8081', 'tcp:8081'], { stdio: 'ignore' });

const targets = process.argv.slice(2);
const res = spawnSync(bin, ['test', ...vars, ...(targets.length ? targets : ['.maestro'])], {
  cwd: root, stdio: 'inherit', shell: process.platform === 'win32',
});
process.exit(res.status ?? 1);
