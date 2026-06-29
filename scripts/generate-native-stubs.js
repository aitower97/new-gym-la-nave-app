/**
 * Pre-generates lazy stubs for all NativeXxx modules in react-native/specs/modules
 * that use TurboModuleRegistry.getEnforcing() at module load time.
 * Run via: node generate-native-stubs.js  (also runs via postinstall)
 */
const fs = require('fs');
const path = require('path');

const SPECS_DIR = path.resolve(
  __dirname,
  'node_modules/react-native/src/private/specs/modules'
);
const STUBS_DIR = path.resolve(__dirname, 'src/lib/native-stubs');

if (!fs.existsSync(STUBS_DIR)) {
  fs.mkdirSync(STUBS_DIR, { recursive: true });
}

// Build a map: moduleName -> nativeRegistryName
const moduleMap = {}; // e.g. { 'NativePlatformConstantsIOS': 'PlatformConstants' }

fs.readdirSync(SPECS_DIR).forEach((f) => {
  if (!f.endsWith('.js')) return;
  const content = fs.readFileSync(path.join(SPECS_DIR, f), 'utf8');
  const m = content.match(/getEnforcing[^']*'([^']+)'/);
  if (m) {
    const baseName = f.replace('.js', '');
    moduleMap[baseName] = m[1];
  }
});

// Write index file: maps filename -> registry name
const indexPath = path.join(STUBS_DIR, '_index.json');
fs.writeFileSync(indexPath, JSON.stringify(moduleMap, null, 2));

// Generate one stub per module
let count = 0;
Object.entries(moduleMap).forEach(([fileName, nativeName]) => {
  const stubPath = path.join(STUBS_DIR, `${fileName}.js`);
  const content = `'use strict';
// Auto-generated lazy stub for '${nativeName}'
// Prevents TurboModuleRegistry.getEnforcing('${nativeName}') from running
// at bundle load time (before Expo Go runtime is ready).
let _m = null;
function getNative() {
  if (!_m) {
    _m = require('react-native/Libraries/TurboModule/TurboModuleRegistry').getEnforcing('${nativeName}');
  }
  return _m;
}
const proxy = new Proxy({}, {
  get: function(_, key) {
    if (key === '__esModule' || key === 'default') return proxy;
    const val = getNative()[key];
    return typeof val === 'function' ? val.bind(getNative()) : val;
  }
});
module.exports = proxy;
module.exports.default = proxy;
module.exports.__esModule = true;
`;
  fs.writeFileSync(stubPath, content);
  count++;
});

console.log(`Generated ${count} native stubs in ${STUBS_DIR}`);
console.log('Modules stubbed:', Object.values(moduleMap).join(', '));
