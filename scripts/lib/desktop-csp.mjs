/**
 * Exact `connect-src` tokens: Tauri IPC plus `'self'` (the router fetches route payloads from the
 * bundle; refusing that forces a full document load). No wildcard or remote host. Read by
 * `scripts/check-desktop-readiness.mjs`.
 */
export const DESKTOP_CONNECT_SRC_TOKENS = ["'self'", "ipc:", "http://ipc.localhost"];

/** Splits a `connect-src` string into its source tokens. */
function readConnectSrcTokens(value) {
  return typeof value === "string" ? value.trim().split(/\s+/).filter(Boolean) : [];
}

/** Is this `connect-src` exactly the allowed list, in any order? */
export function connectSrcIsExact(value) {
  const tokens = readConnectSrcTokens(value);
  return (
    DESKTOP_CONNECT_SRC_TOKENS.every((token) => tokens.includes(token)) &&
    tokens.every((token) => DESKTOP_CONNECT_SRC_TOKENS.includes(token))
  );
}
