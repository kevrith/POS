/**
 * Expo config plugin — allows plain http:// requests on Android.
 *
 * Android standalone builds block cleartext (non-HTTPS) traffic by default,
 * which breaks connecting to a LAN server like http://192.168.x.x:3010.
 * This sets android:usesCleartextTraffic="true" on the <application> tag
 * at prebuild time. It only touches the AndroidManifest — no Gradle changes
 * (expo-build-properties was removed because it broke the Gradle build).
 */
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:usesCleartextTraffic'] = 'true';
    }
    return cfg;
  });
};
