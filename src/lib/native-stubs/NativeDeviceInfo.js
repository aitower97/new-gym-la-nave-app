'use strict';
// Auto-generated lazy stub for 'DeviceInfo'
// Prevents TurboModuleRegistry.getEnforcing('DeviceInfo') from running
// at bundle load time (before Expo Go runtime is ready).
let _m = null;
function getNative() {
  if (!_m) {
    _m = require('react-native/Libraries/TurboModule/TurboModuleRegistry').getEnforcing('DeviceInfo');
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
