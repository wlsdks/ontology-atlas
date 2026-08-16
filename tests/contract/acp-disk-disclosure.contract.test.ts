import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

/**
 * 앱이 사용자의 **자격증명 파일에 링크를 거는 한**, 화면이 그 사실을 말해야
 * 한다.
 *
 * ## 왜 (2026-08-17)
 *
 * 대화를 시작하면 Rust 가 앱 데이터 안에 그 도구용 설정 폴더를 만들고,
 * 사용자의 실제 자격증명 파일(`~/.claude/.credentials.json`)에 심볼릭 링크를
 * 건다. 그 설계 자체는 옳다 — 격리하면 로그인이 깨지고(실측
 * `Authentication required`), 비밀을 앱 폴더로 **복사**하는 것은 신뢰 헌장이
 * 막는 종류의 일이라 링크가 그 사이의 답이다.
 *
 * 그런데 **아무 화면도 그 사실을 말하지 않고 있었다.** 바로 옆 API 키 칸은
 * 키를 어떻게 두는지 두 문장으로 설명한다. 실제 자격증명 파일을 건드리는
 * 이쪽이 침묵하는 것은 앞뒤가 안 맞는다 — 헌장이 약속한 것은 「사용자 모르게
 * 하는 것이 없다」이지 「나쁜 짓을 안 한다」가 아니다.
 *
 * ## 무엇을 검사하고 무엇을 안 하나
 *
 * **검사한다**: 링크를 만드는 코드가 있으면 그것을 알리는 문구가 두 로케일에
 * 다 있고, 화면이 실제로 그것을 그린다 — **참조 무결성**이다.
 *
 * **검사하지 않는다**: 그 문구의 **문장**. 사람이 쓴 문장을 못박지 않는다
 * (`.claude/rules/documentation.md`) — 문구는 자유롭게 고쳐도 되고 번역해도
 * 된다. 잠그는 것은 「말하는가」이지 「무엇이라고 말하는가」가 아니다.
 *
 * 그래서 이 검사는 **링크 코드가 사라지면 같이 풀린다.** 링크를 안 걸게 되면
 * 알릴 것도 없어지므로 그때는 이 검사가 문구를 요구하지 않는다.
 */

const ACP_RS = 'src-tauri/src/acp.rs';
const PANEL = 'src/widgets/app-settings-menu/ui/AcpRuntimeSettings.tsx';

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

/** 자격증명 링크를 실제로 거는 코드가 살아 있는가. */
function linksCredentials(source: string): boolean {
  // 함수 선언이 아니라 **부르는 자리**를 본다 — 선언만 남고 아무도 안 부르면
  // 디스크에는 아무 일도 안 일어난다.
  return /link_credentials\(&source, &link\)/.test(source);
}

describe('자격증명에 링크를 거는 한 화면이 그것을 말한다', () => {
  const acp = read(ACP_RS);

  it('검사가 헛돌고 있지 않다 — 볼 파일과 볼 표식이 실재한다', () => {
    expect(acp.length).toBeGreaterThan(1000);
    expect(acp).toContain('fn link_credentials');
  });

  it('링크를 걸면 두 로케일에 알림 문구가 있다', () => {
    if (!linksCredentials(acp)) return; // 링크를 안 걸면 알릴 것도 없다
    for (const [locale, messages] of [
      ['ko', ko],
      ['en', en],
    ] as const) {
      const runtimes = (messages as { nav: { settingsMenu: { runtimes: Record<string, unknown> } } })
        .nav.settingsMenu.runtimes;
      const note = runtimes.diskNote;
      expect(typeof note, `${locale}: diskNote 가 없다`).toBe('string');
      expect(String(note).trim().length).toBeGreaterThan(30);
    }
  });

  it('그 문구를 화면이 실제로 그린다 — 있기만 하고 안 그리면 알린 것이 아니다', () => {
    if (!linksCredentials(acp)) return;
    const panel = read(PANEL);
    expect(panel).toContain("t('diskNote')");
    expect(panel).toContain('app-settings-runtimes-disk-note');
  });

  it('링크 코드가 사라지면 이 검사도 같이 풀린다 — 죽은 요구를 남기지 않는다', () => {
    expect(linksCredentials('fn nothing() {}')).toBe(false);
    expect(linksCredentials(acp)).toBe(true);
  });
});
