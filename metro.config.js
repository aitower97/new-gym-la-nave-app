const { getSentryExpoConfig } = require('@sentry/react-native/metro');

// getSentryExpoConfig envuelve getDefaultConfig y añade el debug ID a cada
// bundle — necesario para que Sentry pueda emparejar un crash con el source
// map subido (si no, los stack traces en producción salen minificados).
const config = getSentryExpoConfig(__dirname);

module.exports = config;
