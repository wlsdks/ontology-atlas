import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { connectSrcIsExact, DESKTOP_CONNECT_SRC_TOKENS } from "../../scripts/lib/desktop-csp.mjs";

/**
 * **A rail press in the installed app must be a route change, not a new document.**
 *
 * `scripts/lib/desktop-csp.mjs` carries the measurement: with `'self'` missing from
 * `connect-src`, the App Router's fetch of the arriving route's payload is refused and the
 * router falls back to a full document load. Every rail press then re-booted the app, which
 * is both halves of inspection 122's blocker — one or two frames of the pre-hydration screen
 * (a download button inside the installed app) and then a blank window for the length of the
 * folder restore, 33-67 ms on six documents and 100-300 ms on 104.
 *
 * ## ⚠️ Why this is a config assertion and not a browser gate
 *
 * CI installs Chromium and serves the static export over plain HTTP, where no CSP applies at
 * all: a browser gate for this defect is green before and after the fix, which is not
 * evidence. The **cause** is one line of `tauri.conf.json`, and that line is readable with no
 * engine at all. `pnpm desktop:check` reads the same list — this file exists because
 * `checks:changed` does not recommend `desktop:check` for every diff that can reach the
 * config (`docs/DEVELOPMENT-CHECKS.md`), and a blocker's cause should be guarded by the lane
 * that always runs.
 */
describe("the installed app may fetch its own route payloads", () => {
  const config = JSON.parse(
    readFileSync(path.join(process.cwd(), "src-tauri", "tauri.conf.json"), "utf8"),
  ) as { app?: { security?: { csp?: Record<string, string> } } };
  const csp = config.app?.security?.csp;

  it("declares a connect-src", () => {
    expect(csp, "src-tauri/tauri.conf.json has no app.security.csp").toBeTruthy();
    expect(typeof csp?.["connect-src"]).toBe("string");
  });

  /*
   * ★ `'self'` is the whole fix. Without it the router cannot read the arriving route out of
   * the bundle and reloads the document instead.
   */
  it("allows the app's own origin, so a route change stays a route change", () => {
    expect(
      (csp?.["connect-src"] ?? "").split(/\s+/),
      "connect-src must allow 'self' — without it every rail press is a full document load " +
        "(inspection 122, B1/R1)",
    ).toContain("'self'");
  });

  /*
   * ★ And nothing more. `'self'` widens the directive by exactly the app's own bundle; a
   * remote origin here would be a new place vault data could go
   * (`.claude/rules/local-first.md`).
   */
  it("allows nothing beyond the app itself and its IPC channel", () => {
    expect(
      connectSrcIsExact(csp?.["connect-src"]),
      `connect-src must be exactly ${DESKTOP_CONNECT_SRC_TOKENS.join(" ")} — it is ` +
        `"${csp?.["connect-src"]}"`,
    ).toBe(true);
    expect(JSON.stringify(csp)).not.toContain("https://");
  });
});
