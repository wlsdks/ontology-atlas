/**
 * `/download` platform state — the one place that decides what the page is
 * allowed to claim.
 *
 * The page used to scatter per-fact placeholders ("recorded at release",
 * "recorded when v0.1.0 publishes") and future-tense trust rows ("the release
 * gate *requires* Developer ID signing"). Six independent placeholders meant
 * six independent chances to drift out of sync with reality, and a visitor
 * could not tell whether the app was installable today. So release-dependent
 * copy now derives from generated macOS and Windows release facts.
 *
 * - published  → real size, real SHA-256, per-arch direct download links, and
 *                signing/notarization stated in the past tense (it happened).
 * - unpublished → one clear "not out yet" state. No fake numbers, no download
 *                buttons that lead nowhere.
 *
 * `MACOS_RELEASE` and `WINDOWS_RELEASE` are generated from the actual GitHub Release
 * (`pnpm download:release-facts`), never hand-edited.
 */

import {
  MACOS_RELEASE,
  WINDOWS_RELEASE,
  type MacosReleaseAsset,
  type WindowsReleaseAsset,
} from '../model/macos-release.generated';

export type DesktopArch = MacosReleaseAsset['arch'];

/** Apple Silicon first — it is the majority of Macs bought since 2020. */
export const ARCH_ORDER: readonly DesktopArch[] = ['aarch64', 'x64'];

export const WINDOWS_STATUS = {
  trackingUrl: 'https://github.com/wlsdks/ontology-atlas/issues',
} as const;

export function isMacosReleasePublished(): boolean {
  return MACOS_RELEASE.published && MACOS_RELEASE.assets.length > 0;
}

/**
 * The release date. Reference download pages nearly always put it beside the version (Zed, for
 * instance, puts version and date on one line) — a version string alone cannot tell you whether this
 * is last week's build or the year before last's.
 */
export function macosPublishedDate(): Date | null {
  if (!MACOS_RELEASE.publishedAt) return null;
  const date = new Date(MACOS_RELEASE.publishedAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function macosAssetFor(arch: DesktopArch): MacosReleaseAsset | null {
  return MACOS_RELEASE.assets.find((asset) => asset.arch === arch) ?? null;
}

export function isWindowsReleasePublished(): boolean {
  return WINDOWS_RELEASE.published && WINDOWS_RELEASE.assets.length === 1;
}

export function windowsAsset(): WindowsReleaseAsset | null {
  if (!isWindowsReleasePublished()) return null;
  return WINDOWS_RELEASE.assets[0] ?? null;
}

/**
 * Bytes → the size a download dialog would show, with one decimal: enough to
 * answer "will this take a moment or a while", not so precise it reads as a
 * checksum.
 *
 * **Decimal MB, because that is what the reader's own machine will say**
 * (measured 2026-07-29). The page divided by 1024² — mebibytes — but labelled
 * the result "MB". macOS Finder and Safari's download list both use decimal
 * MB, so the page promised 39.5 MB and the file landed as 41.4 MB. A ~5%
 * gap is small, but it is the very first number this product asks a stranger
 * to trust, on the page whose whole job is "install this".
 *
 * Either the unit or the divisor had to move. The divisor moved, because the
 * label is what the reader compares against their Finder window.
 */
export function formatAssetSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '';
  return `${(sizeBytes / 1_000_000).toFixed(1)} MB`;
}

export { MACOS_RELEASE, WINDOWS_RELEASE };
export type { MacosReleaseAsset, WindowsReleaseAsset };
