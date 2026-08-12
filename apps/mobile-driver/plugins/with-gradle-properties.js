/**
 * Expo config plugin — disables Gradle JVM toolchain auto-provisioning.
 *
 * The foojay-resolver-convention plugin tries to download JDK toolchains from
 * Maven Central during CI builds, which fails with 403 Forbidden on GitHub
 * Actions. Since the CI runner already has JDK 17 installed via setup-java,
 * we disable auto-provisioning so Gradle uses the pre-installed JDK instead.
 */
const { withGradleProperties } = require('expo/config-plugins');

module.exports = function withDisableToolchainProvisioning(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;

    // Disable JVM toolchain auto-provisioning
    const key = 'org.gradle.java.installations.auto-provision';
    const existing = props.find((p) => p.type === 'property' && p.key === key);
    if (!existing) {
      props.push({ type: 'property', key, value: 'false' });
    } else {
      existing.value = 'false';
    }

    return cfg;
  });
};
