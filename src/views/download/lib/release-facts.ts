/**
 * /download engraved fact-strip values that ARE real, checked-in facts —
 * not fabricated marketing numbers. Each one traces to an actual repo
 * source of truth:
 *
 * - `RELEASE_VERSION` — `package.json` / `src-tauri/tauri.conf.json`
 *   `version` (release-status tooling already enforces these three stay
 *   aligned — see `check-macos-release-status.mjs`'s `version_alignment`
 *   check).
 * - `RELEASE_MIN_MACOS` — `src-tauri/tauri.conf.json`
 *   `bundle.macOS.minimumSystemVersion`.
 * - `buildDmgName` — the real asset-naming convention enforced by
 *   `scripts/check-macos-download-release.mjs`
 *   (`ontology-atlas_<version>_<aarch64|x64>.dmg`, lowercase).
 *
 * DMG file size is deliberately NOT included here — no DMG has been built
 * or published yet (v0.1.0 hasn't shipped), so there is no real number to
 * show. The UI renders an honest "recorded at release" placeholder instead
 * of a fabricated size, matching the SHA-256 row's existing honesty pattern.
 *
 * `release-facts.test.ts` guards drift against `package.json` and
 * `tauri.conf.json` directly.
 */

export const RELEASE_VERSION = "0.1.0";
export const RELEASE_MIN_MACOS = "macOS 12";
export const RELEASE_ARCHES = ["aarch64", "x64"] as const;
export type ReleaseArch = (typeof RELEASE_ARCHES)[number];

export function buildDmgName(arch: ReleaseArch): string {
  return `ontology-atlas_${RELEASE_VERSION}_${arch}.dmg`;
}
