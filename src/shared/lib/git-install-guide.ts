/**
 * git 이 없는 컴퓨터에 **무엇을 어떻게 설치하는지** 알려주는 순수 데이터 (#78 후속).
 *
 * 소유자 질문(2026-07-26): *"없으면 설치 페이지로 유도하거나 brew나 뭔가
 * 설치방식 알려주는건 하면 안되는건가? window, mac 둘 다 지원해야하는데.."*
 *
 * **해도 된다 — 오히려 안 하는 게 결함이다.** 신뢰 헌장이 금지하는 것은 조용한
 * 실행·자동 설치·사용자 몰래 하는 일이다. "이 명령을 터미널에 붙여넣으세요" 는
 * 그 반대다: 사용자가 무엇이 일어날지 알고 직접 실행한다. 우리가 하는 일은
 * **감지하고 알려주기**까지고, 설치는 사용자 손에서 일어난다.
 *
 * 플랫폼별 1순위를 고른 기준 — **추가 도구를 요구하지 않는 경로가 먼저다**:
 *
 * - macOS: `xcode-select --install` 이 1순위. Homebrew 를 먼저 깔라고 하면
 *   설치 단계가 하나 더 생긴다. Command Line Tools 는 애플이 제공하는 기본
 *   경로이고 git 이 그 안에 들어 있다. brew 는 이미 쓰는 사람을 위한 대안.
 * - Windows: `winget` 이 1순위. Windows 10 1709+ 에 기본 탑재라 추가 설치가
 *   없다. 그게 없는 환경을 위해 공식 다운로드 페이지를 대안으로 둔다.
 * - Linux: 배포판마다 달라 단일 명령이 없다. apt/dnf 둘을 나열하고, 그 외는
 *   공식 페이지로 보낸다.
 *
 * 순수 데이터라 UI 없이 단위 테스트할 수 있다 — 명령 오타는 사용자 터미널에서
 * 실패하고 우리는 그 사실을 못 보므로, 여기서 고정한다.
 */

export type GitHostPlatform = 'macos' | 'windows' | 'linux';

export interface GitInstallOption {
  /** 사용자가 붙여넣을 명령. `null` 이면 링크만 있는 경로. */
  command: string | null;
  /** i18n 키(`atlasGit.install.*`) — 이 옵션이 무엇인지 한 줄. */
  labelKey: string;
  /** 공식 안내 페이지. 명령이 안 먹을 때의 탈출구. */
  href?: string;
}

export interface GitInstallGuide {
  platform: GitHostPlatform;
  /** 1순위 — 추가 도구를 요구하지 않는 경로. */
  primary: GitInstallOption;
  /** 대안 — 이미 다른 도구를 쓰는 사람 또는 1순위가 없는 환경. */
  alternatives: GitInstallOption[];
}

/** git 공식 다운로드 — 어느 플랫폼에서도 마지막 탈출구. */
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
 * 브라우저/WebView 가 알려주는 값에서 호스트 플랫폼을 고른다. 순수 함수라
 * 테스트가 문자열만 넣어 볼 수 있다 — `navigator` 를 직접 읽는 자리는 호출부다.
 *
 * 못 알아보면 `linux` 로 떨어진다: 세 안내 중 유일하게 **패키지 관리자 이름을
 * 틀려도 사용자가 스스로 고쳐 읽을 수 있는** 형태이고, 다운로드 링크는 세
 * 플랫폼 모두에 붙는다.
 */
export function gitHostPlatformFrom(uaOrPlatform: string): GitHostPlatform {
  const value = uaOrPlatform.toLowerCase();
  if (/mac|iphone|ipad|ipod|darwin/.test(value)) return 'macos';
  if (/win/.test(value)) return 'windows';
  return 'linux';
}
