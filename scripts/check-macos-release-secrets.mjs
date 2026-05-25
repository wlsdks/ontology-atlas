#!/usr/bin/env node

const requiredSecrets = [
  "APPLE_CERTIFICATE_P12_BASE64",
  "APPLE_CERTIFICATE_PASSWORD",
  "APPLE_KEYCHAIN_PASSWORD",
  "APPLE_SIGNING_IDENTITY",
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
];

function printHelp() {
  console.log(`Usage: pnpm desktop:release-secrets

Fails unless every Apple signing and notarization secret required for a public
macOS release is present in the environment.

Required environment:
${requiredSecrets.map((name) => `  ${name}`).join("\n")}

The certificate secret must be a non-empty base64-encoded Developer ID
Application .p12 export.
`);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

const values = Object.fromEntries(
  requiredSecrets.map((name) => [name, (process.env[name] ?? "").trim()]),
);

const missing = requiredSecrets.filter((name) => !values[name]);

if (missing.length > 0) {
  console.error("[desktop-release-secrets] missing required Apple release secrets:");
  for (const name of missing) {
    console.error(`  - ${name}`);
  }
  console.error(
    "[desktop-release-secrets] refusing to publish an unsigned or unnotarized macOS release artifact.",
  );
  process.exit(1);
}

function isValidBase64Secret(value) {
  const normalized = value.replace(/\s+/g, "");
  if (normalized.length === 0 || normalized.length % 4 !== 0) {
    return false;
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    return false;
  }
  return Buffer.from(normalized, "base64").length > 0;
}

if (!isValidBase64Secret(values.APPLE_CERTIFICATE_P12_BASE64)) {
  console.error(
    "[desktop-release-secrets] APPLE_CERTIFICATE_P12_BASE64 must be a non-empty base64-encoded .p12 export.",
  );
  console.error(
    "[desktop-release-secrets] refusing to publish a macOS release that cannot import its signing certificate.",
  );
  process.exit(1);
}

console.log(
  "[desktop-release-secrets] Apple release signing and notarization secrets are present and structurally valid",
);
