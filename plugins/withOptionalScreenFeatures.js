// La app va en vertical ("orientation": "portrait"). Google Play deduce de
// ahí que el móvil *necesita* pantalla vertical y la oculta en tablets,
// Chromebooks y Android XR (aviso que bloquea el envío a revisión).
// Declarar la función como opcional la deja instalar en todos sin cambiar
// la orientación.
const { withAndroidManifest } = require('expo/config-plugins');

const FEATURES = ['android.hardware.screen.portrait', 'android.hardware.screen.landscape'];

module.exports = function withOptionalScreenFeatures(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const list = (manifest['uses-feature'] ||= []);
    for (const name of FEATURES) {
      const existing = list.find((f) => f.$?.['android:name'] === name);
      if (existing) existing.$['android:required'] = 'false';
      else list.push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    return cfg;
  });
};
