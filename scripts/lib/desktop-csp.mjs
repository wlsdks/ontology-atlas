/**
 * **What the installed app is allowed to connect to** — one list, two readers.
 *
 * `connect-src` is the CSP directive that governs `fetch`, `XMLHttpRequest`, WebSocket and
 * EventSource. In this app it governs exactly two things: the Tauri IPC channel, and the
 * App Router fetching the arriving route's own payload out of the bundle before it swaps the
 * screen.
 *
 * ⚠️ **The second one was missing, and it cost a release.** The list used to be `ipc:
 * http://ipc.localhost`, which reads as the tightest possible rule and silently broke every
 * client-side route change in the installed app: the payload fetch was refused, and the
 * router's documented fallback is a **full document load**. Measured in a probe build of the
 * installed app, pressing a rail destination logged
 * `TypeError: Load failed tauri://localhost/ko/git/?focus=main`, reset the probe's own
 * module-level counter to 1, and reported `navType=navigate` at `now=58` ms — a brand-new
 * document. So each press re-booted the app: one or two frames of the pre-hydration screen
 * (every destination in the rail, the *browser* copy, and a **download button inside the
 * installed app**, which `AGENTS.md` forbids outright), then a blank window for as long as
 * restoring the folder took — 33-67 ms on a six-document folder, 100-300 ms on the
 * 104-document dogfood vault. That is inspection 122's B1 and R1 in one cause.
 *
 * `'self'` is the app's own bundled assets over the `tauri:` scheme. It adds no remote
 * origin, so `.claude/rules/local-first.md`'s promise that nothing leaves this computer
 * without the user's knowledge is untouched. The list is **exact** in both directions — every
 * token required, no token beyond it — so neither a wildcard nor a remote host can arrive
 * without changing this file and reading this comment.
 *
 * Readers: `scripts/check-desktop-readiness.mjs` (the `desktop:check` gate) and
 * `tests/contract/desktop-route-payload-csp.contract.test.ts` (the always-run lane, because
 * `checks:changed` does not recommend `desktop:check` for every diff that can reach this).
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
