#!/usr/bin/env node

const releaseSecrets = [
  {
    name: "APPLE_CERTIFICATE_P12_BASE64",
    description: "Developer ID Application certificate exported as base64 PKCS#12",
  },
  {
    name: "APPLE_CERTIFICATE_PASSWORD",
    description: "password for that exported .p12 file",
  },
  {
    name: "APPLE_KEYCHAIN_PASSWORD",
    description: "temporary CI keychain password used only while importing the certificate",
  },
  {
    name: "APPLE_SIGNING_IDENTITY",
    description: "Developer ID Application identity passed to codesign",
  },
  {
    name: "APPLE_ID",
    description: "Apple Developer account email for notarytool submission",
  },
  {
    name: "APPLE_APP_SPECIFIC_PASSWORD",
    description: "app-specific password for notarytool",
  },
  {
    name: "APPLE_TEAM_ID",
    description: "Apple Developer Team ID for notarization",
  },
];
const requiredSecrets = releaseSecrets.map((secret) => secret.name);

function formatSecret(secret) {
  return `${secret.name} — ${secret.description}`;
}

function printHelp() {
  console.log(`Usage: pnpm desktop:release-secrets

Fails unless every Developer ID direct-download signing and notarization secret
required for a public macOS release is present in the environment. These are
not Mac App Store submission credentials.

Required environment:
${releaseSecrets.map((secret) => `  ${formatSecret(secret)}`).join("\n")}

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
    const secret = releaseSecrets.find((entry) => entry.name === name);
    console.error(`  - ${secret ? formatSecret(secret) : name}`);
  }
  console.error("[desktop-release-secrets] these are for Developer ID signing/notarization, not Mac App Store submission.");
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
