/**
 * `/download` platform state — the one place that decides what the page is
 * allowed to claim.
 *
 * The page used to scatter per-fact placeholders ("recorded at release",
 * "recorded when v0.1.0 publishes") and future-tense trust rows ("the release
 * gate *requires* Developer ID signing"). Six independent placeholders meant
 * six independent chances to drift out of sync with reality, and a visitor
 * could not tell whether the app was installable today. So release-dependent
 * copy now derives from a single boolean: is there a published macOS release?
 *
 * - published  → real size, real SHA-256, per-arch direct download links, and
 *                signing/notarization stated in the past tense (it happened).
 * - unpublished → one clear "not out yet" state. No fake numbers, no download
 *                buttons that lead nowhere.
 *
 * `MACOS_RELEASE` is generated from the actual GitHub Release
 * (`pnpm download:release-facts`), never hand-edited.
 */

import { MACOS_RELEASE, type MacosReleaseAsset } from '../model/macos-release.generated';

export type DesktopArch = MacosReleaseAsset['arch'];

/** Apple Silicon first — it is the majority of Macs bought since 2020. */
export const ARCH_ORDER: readonly DesktopArch[] = ['aarch64', 'x64'];

/**
 * Windows is not shipping in this release. Stating that plainly beats
 * omitting the platform: a Windows visitor otherwise cannot tell whether the
 * product excludes them permanently or simply has not got there yet.
 *
 * Flipping this to a real release means the same honesty bar macOS clears —
 * a signed installer and an install-verification gate. An unsigned `.exe`
 * makes every downloader click through a SmartScreen warning, which would
 * contradict the verifiable-trust claim this page makes.
 */
export const WINDOWS_STATUS = {
  available: false,
  trackingUrl: 'https://github.com/wlsdks/ontology-atlas/issues',
} as const;

export function isMacosReleasePublished(): boolean {
  return MACOS_RELEASE.published && MACOS_RELEASE.assets.length > 0;
}

export function macosAssetFor(arch: DesktopArch): MacosReleaseAsset | null {
  return MACOS_RELEASE.assets.find((asset) => asset.arch === arch) ?? null;
}

/**
 * Bytes → the size a download dialog would show. Mebibytes with one decimal:
 * enough to answer "will this take a moment or a while", not so precise it
 * reads as a checksum.
 */
export function formatAssetSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '';
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export { MACOS_RELEASE };
export type { MacosReleaseAsset };
