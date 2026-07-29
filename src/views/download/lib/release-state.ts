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

/**
 * 게시된 것이 **정식이 아니라 후보**인가.
 *
 * 숨기지 않고 말한다. 후보 빌드는 서명·공증을 정식과 같은 경로로 통과했지만
 * 아직 넓게 쓰이지 않았다 — 그 둘은 서로 다른 사실이고, 받는 사람은 누르기
 * 전에 둘 다 알아야 한다. 감추면 "왜 정식인 줄 알았는데 rc 냐" 가 되고,
 * 파일을 통째로 숨기면(구 동작) 서명된 빌드가 있는데도 페이지가 "아직
 * 없습니다" 라고 말하는 거짓이 된다.
 */
export function isMacosPrerelease(): boolean {
  return isMacosReleasePublished() && MACOS_RELEASE.prerelease;
}

/**
 * 릴리스 시점. 레퍼런스 다운로드 페이지가 버전 옆에 거의 항상 함께 두는 사실이다
 * (예: Zed 는 버전과 날짜를 한 줄에 둔다) — 버전 문자열만으로는 "이게 지난주
 * 빌드인지 재작년 빌드인지" 를 알 수 없기 때문이다.
 */
export function macosPublishedDate(): Date | null {
  if (!MACOS_RELEASE.publishedAt) return null;
  const date = new Date(MACOS_RELEASE.publishedAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function macosAssetFor(arch: DesktopArch): MacosReleaseAsset | null {
  return MACOS_RELEASE.assets.find((asset) => asset.arch === arch) ?? null;
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

export { MACOS_RELEASE };
export type { MacosReleaseAsset };
