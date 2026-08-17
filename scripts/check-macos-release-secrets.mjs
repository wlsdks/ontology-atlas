#!/usr/bin/env node
import { decodeNotaryApiKeySecret } from "./lib/notary-credentials.mjs";

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
    name: "APPLE_API_KEY_P8_BASE64",
    description: "App Store Connect API private key (.p8) encoded as base64",
  },
  {
    name: "APPLE_API_KEY_ID",
    description: "App Store Connect API key ID for notarytool",
  },
  {
    name: "APPLE_API_ISSUER_ID",
    description: "App Store Connect API issuer UUID for notarization",
  },
  {
    name: "TAURI_SIGNING_PRIVATE_KEY",
    description: "private key for signing Tauri updater artifacts",
  },
  {
    name: "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
    description: "password for the Tauri updater signing key",
  },
];
const appleReleaseSecrets = releaseSecrets.slice(0, 5);
const updaterReleaseSecrets = releaseSecrets.slice(5);
const updaterOnly = process.argv.includes("--updater-only");
const requiredSecrets = (updaterOnly ? updaterReleaseSecrets : releaseSecrets).map(
  (secret) => secret.name,
);

function formatSecret(secret) {
  return `${secret.name} — ${secret.description}`;
}

function printHelp() {
  console.log(`Usage: pnpm desktop:release-secrets

Fails unless every Developer ID direct-download signing and notarization secret
required for a public macOS release is present in the environment. These are
not Mac App Store submission credentials.

Required environment:
${appleReleaseSecrets.map((secret) => `  ${formatSecret(secret)}`).join("\n")}

The default mode also requires:
${updaterReleaseSecrets.map((secret) => `  ${formatSecret(secret)}`).join("\n")}

Use --updater-only for the Windows updater-signing check; that mode requires
only the two Tauri updater secrets and does not inspect the Apple certificate.

The certificate secret must be a base64-encoded Developer ID Application .p12
export in PKCS#12 DER form. The notarization key secret must be the base64 of
the complete App Store Connect .p8 PEM file.
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

if (!updaterOnly) {
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

  try {
    decodeNotaryApiKeySecret(values.APPLE_API_KEY_P8_BASE64);
  } catch (error) {
    console.error(
      `[desktop-release-secrets] ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error(
      "[desktop-release-secrets] refusing to pass malformed notarization key material to the release pipeline.",
    );
    process.exit(1);
  }
}

console.log(
  updaterOnly
    ? "[desktop-release-secrets] updater signing secrets are present"
    : "[desktop-release-secrets] Developer ID direct-download signing, notarization, and updater secrets are present and structurally valid",
);
