import type { MacosReleaseAsset, WindowsReleaseAsset } from './release-state';
import type { VisitorDesktopPlatform } from './visitor-platform';

export interface DownloadChoice {
  /** The Windows installer leads the page's controls, for a Windows visitor with an installer. */
  windowsPrimary: boolean;
  /** The page leads with a file to download; otherwise it leads with the browser map. */
  fileWins: boolean;
}

/**
 * The page's one platform decision, taken once so the hero, the trust line, the facts and the
 * closing section agree. A handheld cannot install a file, and an unpublished release has none.
 */
export function chooseDownload({
  published,
  primaryAsset,
  windowsInstaller,
  visitorPlatform,
}: {
  published: boolean;
  primaryAsset: MacosReleaseAsset | null;
  windowsInstaller: WindowsReleaseAsset | null;
  visitorPlatform: VisitorDesktopPlatform;
}): DownloadChoice {
  return {
    windowsPrimary: visitorPlatform === 'windows' && windowsInstaller !== null,
    fileWins: published && primaryAsset !== null && visitorPlatform !== 'handheld',
  };
}
