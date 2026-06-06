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

Fails unless every Developer ID direct-download signing and notarization secret
required for a public macOS release is present in the environment. These are
not Mac App Store submission credentials.

Required environment:
${requiredSecrets.map((name) => `  ${name}`).join("\n")}

The certificate secret must be a base64-encoded Developer ID Application .p12
export in PKCS#12 DER form.
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
  console.error("[desktop-release-secrets] missing required Developer ID direct-download secrets:");
  for (const name of missing) {
    console.error(`  - ${name}`);
  }
  console.error(
    "[desktop-release-secrets] refusing to publish an unsigned or unnotarized direct-download macOS release artifact.",
  );
  process.exit(1);
}

function decodedPkcs12Secret(value) {
  const normalized = value.replace(/\s+/g, "");
  if (normalized.length === 0 || normalized.length % 4 !== 0) {
    return null;
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    return null;
  }
  const decoded = Buffer.from(normalized, "base64");
  if (decoded.length < 32) {
    return null;
  }
  return decoded;
}

function hasDerSequenceEnvelope(decoded) {
  if (decoded[0] !== 0x30) {
    return false;
  }
  const firstLengthByte = decoded[1];
  if (firstLengthByte === undefined) {
    return false;
  }
  if (firstLengthByte < 0x80) {
    return decoded.length === firstLengthByte + 2;
  }
  const lengthByteCount = firstLengthByte & 0x7f;
  if (lengthByteCount === 0 || lengthByteCount > 4 || decoded.length < 2 + lengthByteCount) {
    return false;
  }
  let declaredLength = 0;
  for (let index = 0; index < lengthByteCount; index += 1) {
    declaredLength = (declaredLength << 8) + decoded[2 + index];
  }
  return decoded.length === 2 + lengthByteCount + declaredLength;
}

const decodedCertificate = decodedPkcs12Secret(values.APPLE_CERTIFICATE_P12_BASE64);
if (!decodedCertificate) {
  console.error(
    "[desktop-release-secrets] APPLE_CERTIFICATE_P12_BASE64 must be a base64-encoded .p12 export.",
  );
  console.error(
    "[desktop-release-secrets] refusing to publish a macOS release that cannot import its signing certificate.",
  );
  process.exit(1);
}

if (!hasDerSequenceEnvelope(decodedCertificate)) {
  console.error(
    "[desktop-release-secrets] APPLE_CERTIFICATE_P12_BASE64 must decode to a PKCS#12 DER sequence with a valid length envelope.",
  );
  console.error(
    "[desktop-release-secrets] refusing to publish a macOS release that cannot import its signing certificate.",
  );
  process.exit(1);
}

console.log(
  "[desktop-release-secrets] Developer ID direct-download signing and notarization secrets are present and structurally valid",
);
