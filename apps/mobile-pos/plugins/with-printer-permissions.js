/**
 * Expo config plugin: manifest tweaks for Bluetooth and LAN receipt printing.
 *
 * react-native-bluetooth-classic declares ACCESS_FINE_LOCATION because device
 * DISCOVERY needs it. The cashier app only uses printers already paired in the
 * phone's Bluetooth settings (no discovery), so the permission is removed: it
 * would otherwise trigger a location prompt and a Play Store location review.
 */
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withPrinterPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    manifest['uses-permission'] = manifest['uses-permission'] ?? [];
    const name = 'android.permission.ACCESS_FINE_LOCATION';
    const existing = manifest['uses-permission'].find((p) => p.$['android:name'] === name);
    if (existing) existing.$['tools:node'] = 'remove';
    else manifest['uses-permission'].push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    return cfg;
  });
};
