/**
 * The primary option per platform needs no extra tooling: macOS `xcode-select --install`, Windows
 * `winget`, Linux apt and dnf with the official page for the rest. Atlas informs; the user runs the
 * command. Pure data so typos are unit-testable.
 */

export type GitHostPlatform = 'macos' | 'windows' | 'linux';

interface GitInstallOption {
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
