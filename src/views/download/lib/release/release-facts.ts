/**
 * Facts the repository knows before any build: the version (from `package.json` through
 * next.config.ts, since importing the manifest drags it into the bundle), minimum macOS
 * (`src-tauri/tauri.conf.json`) and the DMG name `scripts/download/check-macos-download-release.mjs`
 * enforces. Per-build size and checksum come from `lib/release-state.ts`, and
 * release-facts.test.ts catches drift.
 */

/* For tools without Next's build env; never a version string, since a plausible wrong one goes unchecked. */
export const RELEASE_VERSION = process.env.NEXT_PUBLIC_RELEASE_VERSION ?? 'unknown';
export const RELEASE_MIN_MACOS = "macOS 12";
export const RELEASE_ARCHES = ["aarch64"] as const;
export type ReleaseArch = (typeof RELEASE_ARCHES)[number];

/**
 * Mirrors the `desktop:release-artifact` chain in `package.json`, which ends in
 * `desktop:verify-release-dmg --require-signed --require-notarized`; `release-facts.test.ts` fails
 * if a step is dropped.
 */
export const RELEASE_SIGNING = {
  developerId: true,
  notarized: true,
} as const;

export function buildDmgName(arch: ReleaseArch): string {
  return `ontology-atlas_${RELEASE_VERSION}_${arch}.dmg`;
}

/**
 * WebView2's floor, since `tauri.conf.json` has no Windows minimum. It is what runs, not what
 * was verified: `trustLineWindows` carries the unverified SmartScreen warning.
 */
export const RELEASE_MIN_WINDOWS = "Windows 10";
