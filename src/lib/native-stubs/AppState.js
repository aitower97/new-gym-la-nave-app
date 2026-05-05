'use strict';
// Auto-generated lazy stub for AppState
// Prevents TurboModuleRegistry.getEnforcing('AppState') from being
// called at bundle load time (before runtime is ready in Expo Go SDK 54).
let _m = null;
function get() {
  if (!_m) _m = require('react-native/Libraries/TurboModule/TurboModuleRegistry').getEnforcing('AppState');
  return _m;
}
const proxy = new Proxy({}, { get: (_, k) => (...args) => get()[k](...args) });
module.exports = proxy;
module.exports.default = proxy;
module.exports.__esModule = true;
