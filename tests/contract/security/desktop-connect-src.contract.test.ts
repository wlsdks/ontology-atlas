import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { connectSrcIsExact, DESKTOP_CONNECT_SRC_TOKENS } from "../../../scripts/lib/desktop/desktop-csp.mjs";

/**
 * **The installed app may fetch its own bundled files and nothing else over the network.**
 *
 * `scripts/lib/desktop/desktop-csp.mjs` carries the token list. With `'self'` missing from
 * `connect-src` the app cannot fetch its own bundled files, such as the licence list. A rail
 * press is a route change inside one document; `tests/e2e/app-shell/router-contract.spec.ts`
 * guards that in a browser.
 *
 * ## ⚠️ Why this is a config assertion and not a browser gate
 *
 * CI installs Chromium and serves the static export over plain HTTP, where no CSP applies at
 * all: a browser gate for this defect is green before and after the fix, which is not
 * evidence. The **cause** is one line of `tauri.conf.json`, and that line is readable with no
 * engine at all. `pnpm desktop:check` reads the same list — this file exists because
 * `checks:changed` does not recommend `desktop:check` for every diff that can reach the
 * config (`scripts/lib/check-rules/`), and a blocker's cause should be guarded by the lane
 * that always runs.
 */
describe("the installed app may fetch its own bundled files", () => {
  const config = JSON.parse(
    readFileSync(path.join(process.cwd(), "src-tauri", "tauri.conf.json"), "utf8"),
  ) as { app?: { security?: { csp?: Record<string, string> } } };
  const csp = config.app?.security?.csp;

  it("declares a connect-src", () => {
    expect(csp, "src-tauri/tauri.conf.json has no app.security.csp").toBeTruthy();
    expect(typeof csp?.["connect-src"]).toBe("string");
  });

  /*
   * ★ Without `'self'` the app cannot read its own bundled files.
   */
  it("allows the app's own origin, so it can read its own files", () => {
    expect(
      (csp?.["connect-src"] ?? "").split(/\s+/),
      "connect-src must allow 'self' — without it the app cannot fetch its own bundled files",
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
