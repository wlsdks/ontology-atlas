/**
 * What to install, and how, on a machine without git.
 *
 * Owner, 2026-07-26: *"없으면 설치 페이지로 유도하거나 brew나 뭔가 설치방식
 * 알려주는건 하면 안되는건가? window, mac 둘 다 지원해야하는데.."* (if git is
 * missing, may we point at an install page or show a brew command? we support
 * both Windows and macOS).
 *
 * **Yes — not doing it is the defect.** The trust charter forbids silent
 * execution and automatic installs; "paste this command into your terminal" is
 * the opposite, since the user knows what will happen and runs it themselves. We
 * detect and inform; installation happens in the user's hands.
 *
 * The primary option per platform is whichever needs **no additional tooling**:
 *
 * - macOS: `xcode-select --install`. Telling people to install Homebrew first
 *   adds a step; Command Line Tools is Apple's own path and ships git. brew stays
 *   as an alternative for those who already have it.
 * - Windows: `winget`, bundled since Windows 10 1709. The official download page
 *   covers environments without it.
 * - Linux: no single command across distributions — apt and dnf are listed, and
 *   everything else goes to the official page.
 *
 * Pure data so the commands can be unit-tested: a typo would fail in the user's
 * terminal where we would never see it.
 */

export type GitHostPlatform = 'macos' | 'windows' | 'linux';

export interface GitInstallOption {
  /** The command to paste; `null` means this option is a link only. */
  command: string | null;
  /** i18n key under `atlasGit.install.*`. */
  labelKey: string;
  /** Official page — the way out when the command does not work. */
  href?: string;
}

export interface GitInstallGuide {
  platform: GitHostPlatform;
  /** The path that needs no additional tooling. */
  primary: GitInstallOption;
  /** For people already using another tool, or environments without the primary. */
  alternatives: GitInstallOption[];
}

/** Last resort on every platform. */
export const GIT_DOWNLOAD_URL = 'https://git-scm.com/downloads';

export function gitInstallGuide(platform: GitHostPlatform): GitInstallGuide {
  if (platform === 'windows') {
    return {
      platform,
      primary: {
        command: 'winget install --id Git.Git -e',
        labelKey: 'install.winget',
      },
      alternatives: [
        { command: null, labelKey: 'install.download', href: GIT_DOWNLOAD_URL },
      ],
    };
  }
  if (platform === 'linux') {
    return {
      platform,
      primary: { command: 'sudo apt install git', labelKey: 'install.apt' },
      alternatives: [
        { command: 'sudo dnf install git', labelKey: 'install.dnf' },
        { command: null, labelKey: 'install.download', href: GIT_DOWNLOAD_URL },
      ],
    };
  }
  return {
    platform: 'macos',
    primary: { command: 'xcode-select --install', labelKey: 'install.xcode' },
    alternatives: [
      { command: 'brew install git', labelKey: 'install.brew' },
      { command: null, labelKey: 'install.download', href: GIT_DOWNLOAD_URL },
    ],
  };
}

/**
 * Picks the host platform from what the browser or WebView reports. Pure, so
 * tests pass strings; reading `navigator` is the caller's job.
 *
 * Unrecognised input falls back to `linux`: it is the one guide a user can still
 * correct for themselves if the package manager is wrong, and all three carry the
 * download link anyway.
 */
export function gitHostPlatformFrom(uaOrPlatform: string): GitHostPlatform {
  const value = uaOrPlatform.toLowerCase();
  if (/mac|iphone|ipad|ipod|darwin/.test(value)) return 'macos';
  if (/win/.test(value)) return 'windows';
  return 'linux';
}
