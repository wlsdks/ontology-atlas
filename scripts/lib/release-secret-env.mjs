export const CURRENT_RELEASE_SECRET_NAMES = Object.freeze([
  "APPLE_CERTIFICATE_P12_BASE64",
  "APPLE_CERTIFICATE_PASSWORD",
  "APPLE_API_KEY_P8_BASE64",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER_ID",
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
]);

export const LEGACY_RELEASE_SECRET_NAMES = Object.freeze([
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
]);

export const RUNTIME_RELEASE_CREDENTIAL_NAMES = Object.freeze([
  "NOTARYTOOL_KEY_PATH",
]);

export const ALL_RELEASE_CREDENTIAL_NAMES = Object.freeze([
  ...CURRENT_RELEASE_SECRET_NAMES,
  ...LEGACY_RELEASE_SECRET_NAMES,
  ...RUNTIME_RELEASE_CREDENTIAL_NAMES,
]);

export function releaseChildEnv(baseEnv = process.env, allowedNames = []) {
  const env = { ...baseEnv };
  for (const name of ALL_RELEASE_CREDENTIAL_NAMES) {
    delete env[name];
  }
  for (const name of allowedNames) {
    if (Object.hasOwn(baseEnv, name) && baseEnv[name] !== undefined) {
      env[name] = baseEnv[name];
    }
  }
  return env;
}
