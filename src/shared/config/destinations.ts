/**
 * 목적지 정본 — id · 기본 주소 · 키보드 단축키 한 곳.
 *
 * ## 왜 이 파일이 생겼나
 *
 * 목적지 일곱의 주소가 `AppNavRail` **컴포넌트 안에** 인라인으로 있었다. 화면을
 * 그리는 데는 충분했지만, 그 목록을 **데이터로 읽어야 하는 두 번째 소비처**
 * (키보드 이동 · 단축키 시트)가 생기면서 문제가 됐다 — 컴포넌트 안의 배열은
 * `t()` 와 아이콘이 섞여 있어 import 할 수 없고, 사본을 만들면 그 순간부터
 * 라우트가 어긋나기 시작한다(Carbon).
 *
 * 그래서 **id 와 주소만** 여기로 내린다. 라벨과 아이콘은 화면의 것이므로 레일에
 * 남는다 — 이 파일은 "무엇이 있고 어디로 가나"만 답한다.
 *
 * ## 이동 단축키는 왜 리더 키(`G` 다음 한 글자)인가
 *
 * ⌘1~⌘9 는 **브라우저의 탭 전환**이다. 웹에서 그것을 가로채면 앱이 사용자의
 * 브라우저를 망가뜨리는 셈이고, 이 제품은 웹이 관문이라 그 대가를 낼 수 없다.
 * 한 글자 단독(`M` · `D` …)도 못 쓴다 — `D`(문서 서랍) · `F`(발표) · `?`(단축키
 * 시트) · `/`(팔레트)가 이미 단독 글자를 쓰고 있어 부딪힌다.
 *
 * 리더 키는 그 둘을 다 피하고, **공개된 선례가 있다** — GitHub(`g c` · `g i`)와
 * Linear 가 같은 문법을 쓴다. 순서열이라 기존 단독 글자와도 충돌하지 않는다:
 * `G` 를 누른 다음 `D` 를 누르는 것과 `D` 만 누르는 것은 다른 입력이다.
 *
 * 시간 제한을 두는 이유는 **`G` 를 눌렀다가 마음이 바뀌는 경우**다. 제한이 없으면
 * 한참 뒤에 누른 글자가 이동으로 해석된다.
 */

export const DESTINATION_IDS = [
  'map',
  'docs',
  'studio',
  'insights',
  'projects',
  'skills',
  /*
   * 「에이전트」 — 2026-08-20 신설(원장 90). 설정 시트 안의 설치·연결 화면을
   * 여기로 뺐다. 스킬이 문서함과 갈라선 것과 같은 문법이다: **답하는 질문이
   * 다르다.** 설정은 값을 고르는 자리이고, 이쪽은 진행 상태가 있는 운영
   * 작업(받고 · 깔고 · 로그인하고 · 고치고 · 대화를 연다)이다.
   *
   * ⚠️ **여덟이 상한이다** (소유자 확정 2026-08-20). 최소 창(높이 720)에서
   * 여덟 번째 타일이 유틸리티 층 위로 8px 남기고 들어간다. 아홉 번째를 넣으려면
   * 무엇을 뺄지 먼저 대야 한다 — 계약이 그것을 강제한다.
   */
  'agents',
  'git',
] as const;

export type DestinationId = (typeof DESTINATION_IDS)[number];

/**
 * 기본 주소. 레일이 문맥에 따라 다른 주소를 줄 수 있는 자리가 하나 있고
 * (`docs` 는 프로젝트 문맥에서 그 프로젝트의 문서함으로 간다), 그때는 레일의
 * 값이 이긴다 — 여기 있는 것은 문맥이 없을 때의 기본이다.
 */
export const DESTINATION_HREF: Record<DestinationId, string> = {
  map: '/topology/',
  docs: '/docs/',
  studio: '/ontology/studio/',
  insights: '/ontology/insights/',
  projects: '/projects/',
  skills: '/skills/',
  agents: '/agents/',
  git: '/git/',
};

/** 리더 키 — 이것을 누른 다음 아래 글자를 누르면 이동한다. */
export const NAV_LEADER_KEY = 'g';

/**
 * 리더 다음에 오는 글자. 첫 글자를 쓰되 겹치면 뜻이 남는 다른 글자로 간다 —
 * `studio` 가 `s` 를 가져가므로 `skills` 는 s**k**ills 의 `k`.
 */
export const DESTINATION_KEY: Record<DestinationId, string> = {
  map: 'm',
  docs: 'd',
  studio: 's',
  insights: 'i',
  projects: 'p',
  skills: 'k',
  // `a` — 겹치는 것이 없다.
  agents: 'a',
  git: 'g',
};

/** 리더를 누른 뒤 다음 글자를 기다리는 시간(ms). */
export const NAV_LEADER_WINDOW_MS = 1500;

/** 글자 → 목적지. 핸들러가 쓰는 방향의 표. */
export const DESTINATION_BY_KEY: Record<string, DestinationId> = Object.fromEntries(
  DESTINATION_IDS.map((id) => [DESTINATION_KEY[id], id]),
) as Record<string, DestinationId>;
