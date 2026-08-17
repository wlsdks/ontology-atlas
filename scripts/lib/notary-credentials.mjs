export function decodeNotaryApiKeySecret(value) {
  const normalized = (value ?? "").replace(/\s+/g, "");
  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error("APPLE_API_KEY_P8_BASE64 must be valid base64.");
  }
  const decoded = Buffer.from(normalized, "base64");
  const text = decoded.toString("utf8");
  if (
    !text.startsWith("-----BEGIN PRIVATE KEY-----\n") ||
    !text.endsWith("-----END PRIVATE KEY-----\n")
  ) {
    throw new Error("APPLE_API_KEY_P8_BASE64 must decode to an App Store Connect .p8 private key.");
  }
  return decoded;
}

export function resolveNotaryAuthentication(env = process.env) {
  const profile = (env.NOTARYTOOL_PROFILE ?? "").trim();
  if (profile) {
    return {
      mode: "keychain-profile",
      args: ["--keychain-profile", profile],
    };
  }

  const keyPath = (env.NOTARYTOOL_KEY_PATH ?? "").trim();
  const keyId = (env.APPLE_API_KEY_ID ?? "").trim();
  const issuerId = (env.APPLE_API_ISSUER_ID ?? "").trim();

  if (keyPath && keyId && issuerId) {
    return {
      mode: "api-key",
      args: ["--key", keyPath, "--key-id", keyId, "--issuer", issuerId],
    };
  }

  throw new Error(
    "notarization requires NOTARYTOOL_KEY_PATH, APPLE_API_KEY_ID, and APPLE_API_ISSUER_ID.",
  );
}
