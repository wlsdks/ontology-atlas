import { describe, expect, it } from 'vitest';

import { GIT_DOWNLOAD_URL, gitInstallGuide , gitHostPlatformFrom} from './git-install-guide';

/**
 * 설치 명령은 **사용자 터미널에서** 실행되므로 오타가 나면 우리는 그 실패를
 * 못 본다(우리 로그에 안 남는다). 여기서 문자열을 고정한다.
 */
describe('gitInstallGuide', () => {
  it('세 플랫폼 모두 1순위 명령을 준다', () => {
    for (const platform of ['macos', 'windows', 'linux'] as const) {
      const guide = gitInstallGuide(platform);
      expect(guide.platform).toBe(platform);
      expect(guide.primary.command, `${platform} primary`).toBeTruthy();
    }
  });

  it('1순위는 추가 도구를 요구하지 않는 경로다', () => {
    // macOS 는 brew 설치를 먼저 요구하면 단계가 하나 더 생긴다 — Command Line
    // Tools 가 애플 기본 경로다. Windows 는 winget 이 OS 기본 탑재.
    expect(gitInstallGuide('macos').primary.command).toBe('xcode-select --install');
    expect(gitInstallGuide('windows').primary.command).toBe('winget install --id Git.Git -e');
  });

  it('brew 는 macOS 의 대안으로만 나온다 (1순위가 아니다)', () => {
    const macos = gitInstallGuide('macos');
    expect(macos.primary.command).not.toContain('brew');
    expect(macos.alternatives.some((a) => a.command === 'brew install git')).toBe(true);
  });

  it('모든 플랫폼이 공식 다운로드 탈출구를 갖는다', () => {
    for (const platform of ['macos', 'windows', 'linux'] as const) {
      const hrefs = gitInstallGuide(platform).alternatives.map((a) => a.href);
      expect(hrefs, `${platform} fallback`).toContain(GIT_DOWNLOAD_URL);
    }
  });

  it('링크 전용 옵션은 command 가 null 이다 (붙여넣을 게 없다는 뜻)', () => {
    const download = gitInstallGuide('linux').alternatives.find((a) => a.href === GIT_DOWNLOAD_URL);
    expect(download?.command).toBeNull();
  });

  it('알 수 없는 값은 macOS 로 떨어진다 (빈 화면보다 낫다)', () => {
    expect(gitInstallGuide('freebsd' as never).platform).toBe('macos');
  });
});

/**
 * 플랫폼 감지 — 순수 함수라 문자열만 넣어 본다.
 *
 * 이 함수가 생긴 이유: 설치 안내(`gitInstallGuide`)와 문구 13종이 **이미 다
 * 있었는데 화면이 그걸 부르지 않았다**(2026-08-02 발견 — `AtlasGitPanel` 의
 * `gitProbe` 호출 0회). 문을 다 지어놓고 안 뚫은 상태였고, 그 문을 뚫는 데
 * 마지막으로 없던 조각이 「이 컴퓨터가 무슨 OS 인가」였다.
 */
describe('gitHostPlatformFrom', () => {
  it.each([
    ['MacIntel', 'macos'],
    ['darwin', 'macos'],
    ['iPhone', 'macos'],
    ['Win32', 'windows'],
    ['Windows NT 10.0', 'windows'],
    ['Linux x86_64', 'linux'],
  ])('%s → %s', (input, expected) => {
    expect(gitHostPlatformFrom(input)).toBe(expected);
  });

  it('못 알아보면 linux 로 떨어진다 — 다운로드 링크는 세 안내 모두에 있다', () => {
    expect(gitHostPlatformFrom('')).toBe('linux');
    expect(gitHostPlatformFrom('SomethingNew')).toBe('linux');
    const guide = gitInstallGuide(gitHostPlatformFrom(''));
    expect(guide.alternatives.some((o) => o.href), '다운로드 링크가 없다').toBe(true);
  });
});
