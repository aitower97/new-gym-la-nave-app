'use strict';
// Lazy stub: defer TurboModuleRegistry.getEnforcing('PlatformConstants')
// until getConstants() is actually called (not at module load time).
// This fixes the "[runtime not ready] PlatformConstants could not be found"
// crash in Expo Go SDK 54 with New Architecture.

let _native = null;

function getNative() {
  if (!_native) {
    // By the time any code calls getConstants(), the runtime IS ready.
    _native = require('react-native/Libraries/TurboModule/TurboModuleRegistry').getEnforcing('PlatformConstants');
  }
  return _native;
}

const lazySingletonSpec = {
  getConstants: () => getNative().getConstants(),
};

module.exports = lazySingletonSpec;
module.exports.default = lazySingletonSpec;
module.exports.__esModule = true;
