/**
 * /download engraved fact-strip values that ARE real, checked-in facts —
 * not fabricated marketing numbers. Each one traces to an actual repo
 * source of truth:
 *
 * - `RELEASE_VERSION` — **read from `package.json` at build time**, not transcribed. It was a
 *   hand-typed literal until 2026-08-25, which made it a fourth place to remember beside
 *   `package.json`, `tauri.conf.json` and `Cargo.toml` while being a copy of the first rather than
 *   an independent source. `desktop:release-status` catches a stale copy, but it runs at the tag
 *   and not in CI, so a wrong download page survived every check until somebody tried to ship.
 *   `next.config.ts` puts the value on `NEXT_PUBLIC_RELEASE_VERSION`; importing the manifest here
 *   would drag the whole dependency list into the client bundle.
 * - `RELEASE_MIN_MACOS` — `src-tauri/tauri.conf.json`
 *   `bundle.macOS.minimumSystemVersion`.
 * - `buildDmgName` — the real asset-naming convention enforced by
 *   `scripts/check-macos-download-release.mjs`
 *   (`ontology-atlas_<version>_<aarch64|x64>.dmg`, lowercase).
 *
 * Per-release facts that only exist once a build is published — DMG byte
 * size, SHA-256, download URL — deliberately do NOT live here. They come
 * from `model/macos-release.generated.ts`, written by
 * `pnpm download:release-facts` out of the real GitHub Release, and are read
 * through `lib/release-state.ts`. This file holds only what the repository
 * itself already knows before any build exists.
 *
 * `release-facts.test.ts` guards drift against `package.json` and
 * `tauri.conf.json` directly.
 */

// The CLI command count's single source of truth is the length of the `CLI_COMMANDS` array in
// cli/src/lib/cli-commands.mjs — a number hardcoded here that diverges from the real count makes
// the download page lie. `cli-commands.mjs` is a dependency-free pure constant module, so it is
// tree-shaken normally in the static export build.

/**
 * The MCP tool count. The `TOOLS` array in `mcp/src/index.js` is the single source of truth, but
 * that module is the server entry point (stdio JSON-RPC) and cannot be pulled into the web bundle.
 * So the value lives here and **drift is caught by a test** — the same discipline as the CLI side.
 * Adding or removing a tool turns `release-facts.test.ts` red first.
 */
export const MCP_TOOL_COUNT = 37;

/*
 * ⚠️ The fallback exists for tooling that renders this module without Next's build-time `env`
 * (unit tests, scripts). It must never be a version string: a plausible-looking wrong number is
 * worse on a download page than an obviously broken one, because nobody checks it.
 */
export const RELEASE_VERSION = process.env.NEXT_PUBLIC_RELEASE_VERSION ?? 'unknown';
export const RELEASE_MIN_MACOS = "macOS 12";
export const RELEASE_ARCHES = ["aarch64", "x64"] as const;
export type ReleaseArch = (typeof RELEASE_ARCHES)[number];

/**
 * Signing and notarization are **properties of the workflow**, not marketing copy.
 *
 * When the Developer ID certificate was issued on 2026-07-27 (`docs/DECISIONS.md`) the release path
 * returned to signing. The guidance this page had been showing until then — "not signed yet · use
 * Open Anyway in System Settings" — became **false that day**, and the same ledger entry left it as
 * an open item: *"once we have a certificate … the page copy is reverted with it"*.
 *
 * Writing the value by hand would let it quietly go false again, so the source of truth is the
 * `desktop:release-artifact` chain in `package.json` — it ends with `desktop:sign` →
 * `desktop:sign:dmg` → `desktop:notarize` → `desktop:verify-release-dmg`
 * (`--require-signed --require-notarized`), so **a build that fails verification cannot become a
 * release asset.** Dropping any step from the chain turns `release-facts.test.ts` red first.
 */
export const RELEASE_SIGNING = {
  /** Signed with a Developer ID Application certificate. */
  developerId: true,
  /** Notarized by Apple (notarytool) with the ticket stapled to the DMG. */
  notarized: true,
} as const;

export function buildDmgName(arch: ReleaseArch): string {
  return `ontology-atlas_${RELEASE_VERSION}_${arch}.dmg`;
}

/**
 * The Windows installer's minimum OS.
 *
 * `tauri.conf.json` has no slot for this — only macOS has
 * `bundle.macOS.minimumSystemVersion`. So the source of truth is **the runtime's floor**: Tauri
 * v2's Windows backend uses WebView2, and the lowest desktop OS the WebView2 runtime supports is
 * Windows 10. Release verification runs on that family too (`.github/workflows/windows-beta-check.yml`
 * and the `windows-2022` job in `release-macos.yml` — dependency audit, Defender scan, unattended
 * install, launch, and a bundled MCP smoke test).
 *
 * ⚠️ **This value is "what is required to run", not "what we verified".** As the ledger states
 * (2026-08-20), the SmartScreen screen on a real Windows 11 machine has not been verified, and the
 * hero's trust line (`trustLineWindows`) carries that fact separately. This line does not stand in
 * for that warning.
 */
export const RELEASE_MIN_WINDOWS = "Windows 10";
