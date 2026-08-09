'use client';

import { useEffect, useRef } from 'react';
import {
  DESTINATION_BY_KEY,
  DESTINATION_HREF,
  NAV_LEADER_KEY,
  NAV_LEADER_WINDOW_MS,
  type DestinationId,
} from '@/shared/config/destinations';

/**
 * 목적지 이동 단축키 — `G` 를 누른 다음 목적지의 글자를 누른다.
 *
 * 문법과 왜 리더 키인지는 `shared/config/destinations.ts` 에 있다. 이 파일은
 * **그 문법을 키보드 사건으로 옮기는 것**만 한다.
 *
 * ## 안 먹어야 하는 자리 셋
 *
 * 1. **입력 중** — `input` · `textarea` · `contentEditable`. 「go」를 타이핑하다가
 *    화면이 바뀌면 그건 단축키가 아니라 결함이다.
 * 2. **조합키가 눌린 채** — `⌘G`(찾기 다음) · `⌃G` 는 브라우저와 OS 의 것이다.
 *    리더는 **아무 조합키 없이** 눌린 `G` 만이다.
 * 3. **막는 표면이 열려 있을 때** — 모달·시트는 뒤를 막기로 되어 있고
 *    (`design.md` 「뒤를 막지 않는 모달」 금지), 그 약속이 키보드에서도 지켜져야
 *    한다. 설정 시트를 열어 둔 채 `G D` 를 누르면 시트는 그대로인데 뒤 화면만
 *    바뀐다 — 막는다고 한 표면이 안 막은 것이다.
 *
 *    **판정을 호출자에게 맡기지 않고 DOM 에서 읽는다.** `disabled` prop 으로
 *    두면 새 모달을 만드는 사람이 그 배선을 빠뜨리고, 그건 이 저장소가 이미
 *    낸 값이다(레일 유틸 슬롯을 페이지마다 손으로 등록하다 공방이 빠뜨린 #65).
 *    `aria-modal="true"` 는 그 표면들이 **이미** 달고 있는 것이라, 접근성 속성이
 *    곧 배선이 된다 — 새 모달은 그 속성을 달아야 정상이므로 공짜로 지켜진다.
 *    `disabled` 는 그래도 남긴다: 모달이 아니면서 키를 독점하는 상태
 *    (관문 화면처럼)를 호출자가 알릴 길이 필요하다.
 *
 * ## 순서열을 `useRef` 로 두는 이유
 *
 * 리더를 눌렀다는 사실은 **화면에 아무것도 바꾸지 않는다**. `useState` 로 두면
 * 리더를 누를 때마다 앱 전체가 다시 그려지고, 그 비용을 가장 잦은 입력이 낸다
 * (`architecture.md` 「아직 화면에 안 그려진 것의 데이터는 미리 만들지 않는다」와
 * 같은 결의 이야기다).
 */
/**
 * 지금 **화면에 실제로 떠 있는** 막는 표면이 있나.
 *
 * ⚠️ **`querySelector('[aria-modal="true"]')` 하나로는 틀린다** (2026-08-09,
 * e2e 가 잡았다). 그것은 문서의 **첫** 일치를 돌려주는데, 그게 화면에 없는 것일
 * 수 있다 — 이 앱의 표면들은 퇴장 애니메이션 동안 DOM 에 남아 있고
 * (`use-presence.ts` 의 `EXIT_WINDOW_MS`), 그 사이 `aria-hidden` 이 붙는다.
 * 숨은 하나가 먼저 걸리면 **이동 단축키가 영구히 죽는다** — 화면에는 아무 단서도
 * 없이. 실측에서 설정 시트를 열었을 때 정확히 그 상태가 됐다.
 *
 * 그래서 **모두 훑고, 그려진 것이 하나라도 있으면** 막는다. 판정은 화면 기준이다
 * (`design-audit` 의 「사각형이 나온다고 보이는 것은 아니다」와 같은 규율).
 */
function blockingSurfaceOpen(): boolean {
  for (const el of document.querySelectorAll('[aria-modal="true"]')) {
    if (el.closest('[aria-hidden="true"]')) continue;
    if (el.getClientRects().length === 0) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (Number(style.opacity) < 0.05) continue;
    return true;
  }
  return false;
}

/**
 * 이 키가 그 글자인가 — **입력기(IME)와 자판 배열에 안 넘어가게.**
 *
 * ⚠️ **`event.key` 만 보면 한글 입력 상태에서 통째로 안 먹는다** (2026-08-10,
 * 설치 앱 실측). 한글 입력기가 켜져 있으면 물리 `G` 키의 `event.key` 는 `ㅎ`,
 * `P` 는 `ㅔ` 다. 조합키도 안 눌렸고 초점도 body 였고 막는 표면도 없었는데, 단지
 * 글자가 달라서 `DESTINATION_BY_KEY` 에 걸리지 않았다.
 *
 * **이 제품의 주 언어가 한국어다.** 즉 이 버그는 «드문 환경» 이 아니라 소유자와
 * 대상 사용자의 **평소 상태**였고, 브라우저 e2e 는 Latin 을 타이핑하므로 원리적으로
 * 못 잡는다.
 *
 * 그래서 둘 중 하나라도 맞으면 통과시킨다:
 *
 * - `event.code === 'KeyG'` — **물리 위치**. 입력기와 무관하다(한글·일본어·중국어).
 * - `event.key === 'g'` — **찍힌 글자**. QWERTY 가 아닌 Latin 배열(AZERTY·Dvorak)
 *   에서 사용자가 실제로 누르는 키다.
 *
 * 하나만 쓰면 각각 반대쪽을 잃는다: `code` 만 보면 AZERTY 에서 `A` 를 눌러야
 * `KeyQ` 가 되고, `key` 만 보면 한글에서 아무것도 안 된다.
 */
export function matchesLetter(event: Pick<KeyboardEvent, 'key' | 'code'>, letter: string): boolean {
  if (event.key.toLowerCase() === letter) return true;
  return event.code === `Key${letter.toUpperCase()}`;
}

/** 이 사건이 어느 목적지의 글자인가. 없으면 `null`. */
function destinationForEvent(
  event: Pick<KeyboardEvent, 'key' | 'code'>,
): DestinationId | null {
  for (const [letter, id] of Object.entries(DESTINATION_BY_KEY)) {
    if (matchesLetter(event, letter)) return id;
  }
  return null;
}

export interface DestinationShortcutOptions {
  /** 목적지로 데려간다. 라우터는 호출자가 쥔다 — `shared` 가 라우터를 모르게. */
  navigate: (href: string, id: DestinationId) => void;
  /** 막는 표면이 열려 있으면 true. */
  disabled?: boolean;
  /** 문맥에 따라 기본 주소를 덮어쓸 때. 없으면 `DESTINATION_HREF`. */
  hrefOverrides?: Partial<Record<DestinationId, string>>;
}

export function useDestinationShortcuts({
  navigate,
  disabled = false,
  hrefOverrides,
}: DestinationShortcutOptions) {
  /**
   * 리더를 누른 시각. `null` 이면 안 누른 것.
   *
   * ⚠️ **`event.timeStamp` 를 쓰면 안 된다** (2026-08-10, 설치 앱 실측). 처음에는
   * 시각을 `event.timeStamp` 로 읽고 «0 이면 안 누른 것» 으로 판정했다. 브라우저
   * (Chromium)에서는 잘 돌았고 e2e 도 통과했는데, **설치 앱(WKWebView)에서는
   * 리더 조합이 하나도 안 먹었다** — `G P` 도 `G M` 도. 같은 화면에서 `?` 는
   * 정상이었으니 키가 WebView 에 닿기는 했다.
   *
   * 그래서 시계를 사건에서 떼어 낸다: 시각은 `performance.now()` 로, 「눌렀나」는
   * **`null` 이 아닌가**로 판정한다. 0 을 «안 누름» 의 뜻으로 겸용하면, 어떤
   * 런타임이 0 을 주는 순간 기능이 통째로 사라지고 화면에는 아무 단서도 없다.
   */
  const leaderAt = useRef<number | null>(null);

  useEffect(() => {
    if (disabled) {
      leaderAt.current = null;
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;

      // 막는 표면이 떠 있으면 이동하지 않는다 (위 3번).
      if (blockingSurfaceOpen()) {
        leaderAt.current = null;
        return;
      }

      const now = performance.now();

      if (leaderAt.current !== null && now - leaderAt.current <= NAV_LEADER_WINDOW_MS) {
        const id = destinationForEvent(event);
        leaderAt.current = null;
        if (!id) return;
        event.preventDefault();
        navigate(hrefOverrides?.[id] ?? DESTINATION_HREF[id], id);
        return;
      }

      // 리더를 새로 누른다. `G G`(git)가 성립하려면 리더 자신도 두 번째 글자가
      // 될 수 있어야 하는데, 그 판정은 위 블록이 먼저 하므로 순서가 중요하다.
      leaderAt.current = matchesLetter(event, NAV_LEADER_KEY) ? now : null;
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, disabled, hrefOverrides]);
}
