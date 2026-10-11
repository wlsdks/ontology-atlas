import { describe, expect, it } from 'vitest';

import { GIT_DOWNLOAD_URL, gitInstallGuide , gitHostPlatformFrom} from './git-install-guide';

/**
 * Install commands run **in the user's terminal**, so a typo fails somewhere we
 * never see — it reaches none of our logs. These strings are pinned here.
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
    // Requiring brew first would add a step on macOS; Command Line Tools is Apple's
    // own path. On Windows, winget ships with the OS.
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
 * Platform detection — a pure function, so strings are all that go in.
 *
 * Why it exists: the install guidance (`gitInstallGuide`) and its 13 strings **were
 * already there and no screen called them** (found 2026-08-02: `AtlasGitPanel` called
 * `gitProbe` zero times). The door was fully built but never cut open, and the last
 * missing piece was knowing which OS this computer is.
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
