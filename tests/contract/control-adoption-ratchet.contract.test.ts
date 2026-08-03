import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * 컨트롤 채택 래칫 — **손으로 쓴 컨트롤 className 은 늘어날 수 없다.**
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 오늘의 목록 (2026-08-04) — 이 파일에서 먼저 읽을 것
 * ════════════════════════════════════════════════════════════════════
 *
 * 세는 수는 **셋**이다. 종전엔 113 이 한 덩어리였고, 그래서 무엇이 진전인지
 * 알 수 없었다 — 옮길 수 없는 자리와 아직 안 옮긴 자리가 같은 칸에 있었다.
 *
 * | 수 | 뜻 | 어느 방향으로 움직이나 |
 * |---:|---|---|
 * | **등재 23** | 값 층 밖이라고 **검증되어 등재된** `<button>` 자리(`OUTSIDE_VALUE_LAYER`) | 늘리려면 `BASELINE_REGISTERED` 를 **손으로** 올린다. 그 diff 가 「왜」를 적을 자리다 |
 * | **버튼 부채 85** | 아직 안 옮긴 `<button>` | **줄어야 한다.** 버튼 진도는 여기서 읽는다 |
 * | **앵커 부채 109** | 손으로 규격을 쓴 `<Link>` 85 · `<a>` 24 | **줄어야 한다.** 2026-08-04 신설 — 아래 「세 번째 수」 절 |
 * | 버튼 전수 108 | 등재 + 버튼 부채 | 파생값이다. 이 수를 보고 판단하지 않는다 |
 *
 * ⚠️ **2026-08-04 이전 이 게이트는 `<button>` 만 셌다.** 그래서 「부채 85」는
 * 한 번도 *컨트롤 전체*의 수였던 적이 없다 — 앵커 109 는 게이트의 시야 밖에서
 * 자유롭게 늘 수 있었다. 수가 갑자기 194 로 뛴 것이 아니라, **그만큼이 내내
 * 안 세어지고 있었다.**
 *
 * ### ⚠️ 등록부는 허가 목록이 아니라 부채 목록이다
 *
 * 하드컷 등록부(`surface-motion-ratchet.contract.test.ts`) 머리말의 규율을
 * 그대로 승계한다 — *"여기 없는데 하드컷인 표면을 발견하면 줄을 더하는 게
 * 아니라 고친다."*
 *
 * 1. **등재는 검증을 통과한 자리만.** 「아마 못 옮길 것」은 등재가 아니라
 *    부채다. 검증되지 않은 것이 부채 쪽에 있는 것은 **안전한 방향**의 오차다.
 * 2. **파일을 등재해도 그 파일이 면제되지 않는다.** 줄은 파일이 아니라 **수**를
 *    등재한다. 등재된 파일에 손 컨트롤을 하나 더 쓰면 등재 수는 그대로고 부채가
 *    1 오른다 = 빨개진다.
 * 3. **근거가 사라지면 줄도 죽는다.** 각 줄은 `proof` 문자열을 지고, 그것이
 *    파일에서 사라지면 게이트가 «주장이 죽었다» 고 말한다. `chrome-token` 줄은
 *    한 겹 더 — globals.css 에서 그 토큰이 **정말 고정 단이 아닌지**까지 본다.
 *    토큰이 평범한 px 하나가 되는 날 그 줄은 빨개지고 부채로 내려온다.
 * 4. **등재가 도피처가 되면 이 라운드는 실패다.** 옮길 수 있는데 안 옮긴 것을
 *    등재하는 것이 정확히 그 실패다.
 *
 * ### 등재의 기준 — 「영원히 밖」과 「아직 안 옮김」을 가르는 선
 *
 * 값 층(`controlClass()`)이 내는 것은 **className** 이다. 그래서 다음 셋은 이
 * 층이 원리적으로 낼 수 없고, 축을 더해도 안 된다:
 *
 * | 주장 | 무엇이 값 층 밖인가 |
 * |---|---|
 * | `chrome-token` | 크롬 토큰이 치수를 소유한다. 값 층의 높이 어휘는 **고정 단**뿐인데 이 토큰들은 `clamp(38px, 4.2vh, 48px)` 이거나 좁은 폭·coarse 포인터에서 **다른 값으로 재정의**된다. 고정 단 램프는 뷰포트 함수도 포인터 승격도 표현할 수 없다 |
 * | `stage-geometry` | 치수가 className 이 아니라 **JS 가 계산한 `style`** 에서 온다(절대배치 무대 좌표). 램프는 style 을 못 낸다 |
 * | `value-layer-peer` | 값 층 **자신의 집**. 프리미티브가 자기 규격을 스스로 선언하는 자리다. 억지로 옮기면 계약을 깨거나 색·치수를 `className` 으로 넘겨 층을 무력화한다 — 층이 자기를 소비할 수는 없다 |
 *
 * 반대로 **「값 층에 그 모양이 아직 없다」는 등재 사유가 아니다.** 그건 「체계」가
 * 부품을 더하면 열리는 자리이므로 **부채**다. 이 구분이 이 라운드의 전부다.
 *
 * `conditional` 이 붙은 줄은 「X 가 생기면 옮긴다」는 뜻이다 — 값 층이 그 축을
 * 얻는 날 등재를 지우고 부채로 내린 뒤 갚는다.
 *
 * ### 2026-08-04 등재 라운드가 **기각한 13건** — 등재 주장이 거짓이었다
 *
 * 이 라운드에 들어온 주장은 「git 15 · shared/ui 10 · 공방 11 = 36 이 값 층
 * 밖」이었다. 자리마다 열어 보니 **23 만 참**이었다:
 *
 * | 기각된 자리 | 수 | 주장이 왜 거짓인가 |
 * |---|---:|---|
 * | `atlas-git-panel/ui/CommitDetail.tsx` | 2 | `--git-*` 토큰을 **안 쓴다**. 밑줄 탭(`min-h-9 border-b-2`)과 깊은 인셋 행(`px-5`) — 둘 다 원장이 이미 센 **값 층의 구멍**이다 = 부채 |
 * | `atlas-git-panel/ui/ConceptEgoCard.tsx` | 1 | 같음. `flex-wrap` 목록 속 글자 컨트롤 — 「밀집 wrap」 구멍 = 부채 |
 * | `shared/ui/node-explanation-edit.tsx` | 3 | `src/shared/ui` 에 **살 뿐** 프리미티브가 아니다. `h-6 w-6 rounded-full` 은 원장이 이미 이름까지 적어 둔 「원형 아이콘 컨트롤이 없다」 구멍 = 부채 |
 * | `shared/ui/info-hint.tsx` | 1 | 같은 원형 아이콘 구멍 = 부채 |
 * | `shared/ui/compact-copy-button.tsx` | 1 | `rounded-chip px-2 py-1 text-label` 은 램프가 내는 값이다. 밖에 있는 것은 `active:translate-y` **누름 방언** 하나 = 부채 |
 * | `ontology-studio/**` — 문장 속 컨트롤 3 · 점선 피커 1 · `rounded-2xl` 진입 카드 1 | 5 | 「무대 기하」가 아니다. 앞의 넷은 `inline`/점선 구멍이고, 마지막 하나는 **소유자 승인 + `eslint-disable` 로 이미 보이게 등재된** 램프 대기 예외다 = 부채 |
 *
 * ⚠️ **덧붙여, 공방 11 의 근거로 제시된 「`studio-navigation.spec.ts` 가 그
 * 치수를 계약으로 못박는다」는 사실이 아니다.** 그 스펙이 재는 것은
 * `studio-save`/`studio-exit` 둘의 `fontSize`·`height` 뿐이고, 그 둘은 이 11 안에
 * **없다**. 무대의 세 자리가 값 층 밖인 진짜 이유는 e2e 계약이 아니라
 * **`style={{left, top, width: layout.socket.w …}}`** 다 — 근거를 바꿔 등재했다.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 부채 90 이 기다리는 것 — 값 층의 구멍 (다음 라운드의 입력)
 * ════════════════════════════════════════════════════════════════════
 *
 * 라운드마다 「못 옮긴 이유」를 세어 왔고, 그 census 를 여기 한 번만 둔다. 수는
 * 그 구멍을 마지막으로 센 라운드의 실측이다.
 *
 * | 구멍 | 마지막 실측 | 무엇이 없나 |
 * |---|---:|---|
 * | **크기 램프가 인셋과 타입을 한 단으로 묶는다** | 9 | 「큰 인셋 + 작은 글자」가 실재한다(모노 마이크로 CTA 5 · 성공 틴트 액션 2 · 설정 알림 칩 · `MarkdownField` 탭). 옮기면 타입이 바뀐다 — 축이 아니라 **어느 쪽이 규격인지** 정하는 「체계」의 일 |
 * | **`scope: 'panel'` 이 잉크만 연다** | 7 | 보더·인디고는 여전히 밖이다: `--topology-v2-panel-border`(#2a2a30) · `--topology-v2-panel-divider`(#23232a) · `--topology-v2-indigo-bright`(#8890e0 ≠ 전역 #7170ff). 값 층 주석은 *"패널 램프에 인디고는 없다"* 고 단언하지만 **있다** |
 * | **원형 아이콘 컨트롤이 없다** | 6 | `icon` 은 `rounded-chip` 고정. 24px 원을 6px 사각으로 바꾸는 것은 정규화가 아니라 **정체성 변경**이라 「체계」 소집 없이 혼자 정하지 않았다 |
 * | **밀집 행·wrap 속 보조 컨트롤** | 5 + 1 | `link` 의 `min-h-11`(WCAG 2.5.8)을 실으면 행이 2~3배가 된다. `inline` 축은 「**문장** 속」만 면제하고 「밀집 행 속」을 못 말한다 |
 * | **3열 그리드 행** | 3 | `STEP_ROW`(시각·이름·왜). `row` 는 flex 전용 |
 * | **`tone: 'accent'` 는 잉크가 아니라 표식이다** | 3 | 인디고가 둘이다 — 표식용 `--color-indigo-accent`(#7170ff)와 글자용 `--color-indigo-text-soft`(#bcc3ffeb). 틴트 바탕 위 실측: accent **3.55~4.25:1 (AA 미달)** vs text-soft **7.09~8.37:1**. 「못 옮긴 자리」가 아니라 **값 층 자신의 잠재 결함** |
 * | **밑줄이 선택 표시인 탭** | 2 | `segment` 는 「보더 0」이 정의라 `border-b-2` 탭을 못 그린다. 틴트로 바꾸는 것은 정규화가 아니라 **표기법 변경** = 디자인 게이트의 일 |
 * | **점선 = 「채울 수 있음」 어포던스** | 2 | 무대의 「더 잇기」·피커의 「새로 만들기」. 보더 *스타일* 은 모양이라 `className` 으로 넘기면 층이 무력해진다 |
 * | **전폭 중앙정렬 + 터치 승격** | 2 | `chip`/`card` 는 내용 폭이라 `justify-center` 가 없고, `justify-center` 를 가진 `segment` 는 보더가 없다 = 「보더 있는 전폭 중앙 버튼」이 없다 |
 * | **떠오르는 세그먼트** | 2 | `segment` 의 눌림은 인디고 틴트 하나인데, 트랙 위에 `--color-panel` 썸이 떠오르는 방언이 둘(`LocaleSwitch` · 설정 `SegmentSwitch`)이고 하나는 계약이 문자열로 고정한다 |
 * | **타입 스텝을 안 내는 자리가 없다** | 2 | 모양 여덟이 전부 크기를 강제하므로, 부모 글자 크기를 **상속해야** 하는 컨트롤은 구조적으로 못 들어온다 |
 * | **보더 있는 아이콘 정사각이 없다** | 2 | `QueueRowActions` 케밥 · `HubRail`. 수가 둘뿐이라 **아직 축이 아니다** — 수를 적어 두고 넘긴다 |
 * | **pill 의 얕은 세로 인셋** | 2 | 램프는 2·2·4px 인데 실제 필터 pill 은 6~10px. 올리면 타입까지 커진다 |
 * | **깊은 인셋 목록 행** | 1 | 커밋 파일 행의 `px-5`. `row` 의 최대는 `px-3` |
 * | **램프 밖 16px 반경** | 1 | 진입 선택 카드 — 소유자 승인 + `eslint-disable` 로 **이미 보이게 등재된** 예외. `--radius-surface`(16) 등재는 다음 디자인 패스 |
 * | **누름 방언(`active:translate-y`)** | 1 | `compact-copy-button`. 값 층에 누름 축이 없다 |
 *
 * ### 등재 후보이지만 **이 라운드가 검증하지 않은** 자리 — 다음 등재 라운드
 *
 * 위 세 디렉터리 밖에도 같은 `chrome-token` 주장을 할 만한 자리가 있다:
 * `SearchPalette`(`--overlay-close-size`) · `GlobalSearch`
 * (`--topology-search-sheet-close-size`) · `ShortcutSheet`
 * (`--topology-shortcut-sheet-close-size`) · `DocsHeaderTile`
 * (`--chrome-tile-size`) · `AppNavRail`/`GitStatusTile`(`--app-nav-rail-tile-*`).
 * **지금은 전부 부채로 둔다** — 규율 1대로 열어 보고 검증한 자리만 등재한다.
 * 부채 90 이 그만큼 낙관적이지 않다는 뜻이고, 그건 안전한 방향의 오차다.
 *
 * ### 이 수가 **과다 계상**이라는 것 — 알고 두는 한계
 *
 * 세는 것은 여는 태그의 **리터럴** `controlClass(` 다(같은 파일에서
 * `controlClass()` 로 만든 상수를 쓰는 태그는 통과시킨다). 그래서 램프를 통과한
 * 완성 클래스를 **다른 파일**에서 import 해 쓰면 「손으로 쓴 것」으로 잡힌다.
 * 안전한 방향의 오차이지만(과소 계상은 없다), 공유 상수로 뽑는 옳은 리팩터에
 * 벌점을 준다.
 *
 * ### 2026-08-04 구멍 라운드 — 부채 90 → 85, 그리고 **새 축 0개**
 *
 * 남은 77건(이 라운드 시작 시점의 미등재분)을 전수로 갈랐다. **이 라운드의
 * 산출물은 옮긴 5건이 아니라 「왜 축을 안 만들었나」다.**
 *
 * | 부류 | 수 | 무엇인가 |
 * |---|---:|---|
 * | **값 층 밖 재판정** | 25 | 크롬 토큰 계약 10 · 스크림/전면 오버레이 5 · 설정 시트 계약이 클래스 문자열을 고정 4 · 오류/404 표준 버튼 자리 6(이번에 4 채택) → **21은 다음 등재 라운드** |
 * | **모노 대문자 마이크로 CTA** | 5 | **3라운드 연속.** 다음 판정 1순위 — 단 축(voice)이 아니라 **부품**으로 먼저 검토한다(규칙 1) |
 * | 다행·그리드 행 | 10 | 선행 「축 안 만듦」 결정 유효 |
 * | panel 보더·인디고 | 6 | **4라운드 연속.** 단 전부 2차 구멍과 겹쳐 단독 회수 0~1 |
 * | 인셋 바닥·비대칭 | 5 | |
 * | 타입·잉크 상속 | 5 | |
 * | 40px·틴트 채움 3 · 밀집 행 속 2 · 칩 28px 1 | 6 | |
 * | 단발(같은 사유가 하나뿐) | 14 | 축의 근거가 되지 못한다 |
 *
 * **왜 축을 하나도 안 만들었나**: 남은 자리 대부분이 **구멍 둘 이상에 동시에**
 * 걸린다(예: panel 인디고 + 인셋·타입 결합). 그래서 어떤 단일 축을 신설해도
 * 그 축 **혼자** 여는 자리가 0~1이다. 소비처 0~1 축은 만들지 않는다 —
 * `fixedHeight` 를 죽인 그 기준이다. **panel 보더·인디고 6은 인셋·타입 결합
 * 해제와 같은 라운드에서만 연다.**
 *
 * **재측정이 앞선 관측 둘을 정정했다**: 「원형 아이콘 6」은 이 대상군에선 **2**
 * (넷은 `shared/ui` 라 값 층 밖) · `HubRail` 은 「보더 있는 아이콘 정사각」이
 * 아니라 세로 엣지 탭이라, 정사각은 **1**뿐이고 여전히 축이 아니다.
 *
 * 옮긴 5: 404 두 파일이 `<Button>` 채택(그 자리 대비 **4.42 → 4.70** 정정 —
 * `a11y-ratchet` 의 ROUTES 밖이라 래칫이 못 보던 자리다) · `rounded-[4px]`
 * + eslint-disable → `rounded-micro`(disable 사유가 등재로 소멸).
 *
 * ⚠️ 곁가지 실측: raw `buttonVariants()` 는 base 의 `border-transparent` 와
 * 변형 보더가 **둘 다 남아** CSS 소스 순서가 투명을 이긴다. `<Link>` 소비처는
 * `cn` 병합이 필수다.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 역사 — 라운드별 기록 (417 → 108). **지우지 않는다**
 * ════════════════════════════════════════════════════════════════════
 *
 * 각 라운드가 무엇을 셌는지가 다음 승격의 근거다. 아래는 압축본이고 수치와
 * 사유는 보존한다. 원문 서술은 git 이력(이 파일의 2026-08-03 판)에 있다.
 *
 * ### 왜 lint 룰이 아니라 래칫인가 (창립 판단, 여전히 유효)
 *
 * 원안은 「`<button>` 의 className 이 `controlClass()` 에서 오지 않으면 lint
 * error」였다. `/gate-probe` 규율대로 켜기 전에 전수를 세니 **419개**였다. 한 PR
 * 로 못 치우는 룰은 강제가 아니라 소음이고 기존 신호(warning 96)까지 덮는다 —
 * 이 저장소는 `shadow-[` 를 통째로 금지했다가 lint 가 144 → 548 로 뛴 전례가
 * 있다. 게다가 전환은 **정규화**라 픽셀이 바뀌고(칩 143개에 고유 크기 조합
 * 50종), 픽셀을 바꾸는 결정은 디자인 게이트의 일이지 lint 룰의 일이 아니다.
 *
 * ### 최초 실측 (2026-08-03) — 전수 419, 기준선 417
 *
 * 모양별: 칩 128 · 텍스트 링크형 85 · 목록 행 39 · 아이콘 정사각 36 · pill 32 ·
 * 토큰 반경 기타/미분류 58 · 카드형 18 · 떠 있는·h-8 19 · 표준 버튼 1.
 * className 자체가 없는 **2건**은 래퍼라 제외했고, 그 정정을 래칫이 스스로
 * 잡았다(첫 실행이 «419 → 417 로 줄었다» 로 빨개졌다).
 *
 * ⚠️ 파서 교훈: 여는 태그를 **중괄호 깊이**로 끊지 않으면 `onClick={() => …}` 의
 * `=>` 를 태그 끝으로 읽는다. 첫 측정에서 실제로 그랬고 419 중 251개가
 * 「className 없음」으로 분류돼 결론이 통째로 뒤집힐 뻔했다. **잴 원소를 틀리면
 * 수치가 나와도 틀린 수치다.**
 *
 * ### 내려온 기록
 *
 * | 값 | 무엇이 옮겨졌나 |
 * |---:|---|
 * | 417 | 최초 실측 |
 * | 406 | 설정 시트 11 — 칩 6 · 아이콘 2 · 행 1 · 링크형 1 |
 * | 389 | 지도 두 위젯 31 중 17 — 행 8 · 링크형 5 · 아이콘 3 · 카드 2 · 칩 1. 남긴 14 는 여섯 분류에 **없는** 모양(세로 액션 타일 5 · 세그먼트 탭 3 · 창 선택 칩 · 세로 엣지 탭 · 캔버스 앵커 원형 · 트리 셰브론)이거나, 램프 최소 인셋(8px)이 이 패널의 4px 인셋과 어긋나는 자리 2 |
 * | 303 | 문서함·빠른 서랍·공방 121 중 86 — 행 27 · 아이콘 24 · 칩 21 · 링크형 13 · pill 4 · 카드 2. 남긴 35 = 크롬 토큰 계약 4 · 무대 절대배치 15 · 한 벌로 읽히는 세트 11 · 문장 속 인라인 5 |
 * | 269 | 위 두 라운드가 「자리가 없어서」 남긴 48 의 회수 — 값 층의 구멍 넷을 메운 직후(`a1f956ce9`). 설정 시트 29 + 지도 액션 타일 5. `tone` 의 새 넷(secondary 6 · accent 11 · success 2 · warning 2 · danger 1)이 22 를, `shape: 'tile'` 이 7 을, `link` 의 `min-h-11` 이 3 을 열었다 |
 * | 259 | 뷰 라운드 18 중 10 — 행 6 · 칩 5. **여기서 처음으로 `row`/`sm` 이 손으로 쓰던 높이와 정확히 같았다**(`py-1.5` + `--leading-label` = 28px = `min-h-7`) |
 * | 227 | features 라운드 63 중 32 — 칩 15 · pill 6 · 링크형 6 · 아이콘 3 · 기타 2 |
 * | 210 | 지도 뷰 31 중 17 — 아이콘 9 · pill 4 · 칩 1 · 링크형 1. 남긴 14 = 컨트롤이 아닌 것 3(전면 백드롭은 스크림이지 눌리는 원소가 아니다) · 크롬 토큰 2 · 말줄임 필요 3 · 패딩 가진 텍스트 링크 3 · 램프에 스텝 없음 3 |
 * | 173 | 위젯 라운드 84 중 37 — 칩 21 · pill 4 · 아이콘 4 · 카드 5 · 행 2 · 링크형 1. 새 축 0. **210 − 37 = 173 이 전수 재측정과 정확히 맞았다** = 세 라운드가 파일을 하나도 안 겹친다는 뜻 |
 * | 148 | 값 층 라운드 25 — 원장이 반복해 센 구멍을 메운 결과. 세그먼트/고스트 12 · 패널 잉크 7 · 채운 인디고 3 · 말줄임 3. 새 축 셋 + 여덟째 모양 하나 |
 * | 136 | 공방·기록 라운드 38 중 12 — 카드 7 · 칩 2 · 세그먼트 2 · 온액센트 3(겹침). 새 축·모양·톤 0. **기록 패널은 15 중 0** — 이 라운드가 「구조적으로 값 층 밖」을 처음 보고했고, 2026-08-04 이 그중 **12** 를 등재했다(나머지 3 은 값 층의 구멍이라 부채) |
 * | 144 | 프리미티브·뷰 라운드 35 중 4. **옮긴 수보다 «왜 31개가 안 움직였나»가 산출물** — 값 층과 같은 층 6 · 이미 원장에 적힌 구멍 21 · 렌더 안 되는 죽은 프리미티브 4 |
 * | 123 | 잔여 라운드 57 중 9 — 칩 6 · 세그먼트 2 · 아이콘 1. 새 축·값 0. 옮긴 칩 넷이 `h-9`(36) → **`--control-h-md`(32)** 로 앉았다 = #884 가 되돌린 사다리가 작동한 첫 실측 |
 * | 119 | 죽은 프리미티브 둘 **삭제** — `LinkListEditor`·`ChipListEditor` 는 export 되고 단위 테스트도 있는데 프로덕션 소비처가 **0**이었다(전수 grep). 정확히 그 4건 |
 * | 117 | 값 층 라운드 2(체계석) 6 — 세 라운드 연속 센 「sm 아래 한 칸」을 **마이크로 티어**로 메웠다: `--radius-micro`(4px — 이미 96곳이 그 값) + 칩 `size: 'xs'` + `segment/sm` 재정의. 함께: chip/pill 기본 보더를 divider(0.08) → border-soft(0.06)로 — 전수 74:18 의 다수 정정 |
 * | **113** | 접근성·잉크 라운드 이후의 오늘. 2026-08-04 에 **등재 23 + 부채 90** 으로 갈렸다 |
 *
 * ### 죽은 프리미티브 삭제가 딸고 나온 것 (2026-08-03)
 *
 * `link-list-editor` 는 이 저장소에서 `data-external-link-marker`(라벨 앞 `↗`
 * 허용 열의 선언)를 **쓰는 유일한 `.tsx`** 였고,
 * `label-decoration.contract.test.ts` 가 *"표식을 쓴 파일이 0이면 안 된다"* 로 그
 * 사실에 기대고 있었다. **아무도 렌더하지 않는 컴포넌트가 규칙의 허용 조항을
 * 떠받치고 있었다.** 허용 열은 유지하고(WCAG G201 — 새 창으로 나가기 전 경고),
 * 게이트의 공회전 방지를 「예외를 쓴 파일 수」에서 「스캔한 파일 수 + 합성
 * 프로브」로 옮겼다. 원장: `docs/DECISIONS.md` 2026-08-03 「죽은 프리미티브 둘」.
 *
 * ### 값 층 라운드가 **안 만든 것** — 안 만든 것도 결론이다
 *
 * `/gate-probe` 1단계 규율("소음이 신호를 덮으면 룰을 만들지 않는다")을 축에도
 * 적용했다. **소비처를 하나도 못 대는 축은 만들지 않는다.**
 *
 * | 원장이 요구한 것 | 안 만든 이유(실측) |
 * |---|---|
 * | `card` 의 `items-start`(다행 카드) | 축 하나로 안 열린다. 소비처 셋이 **2축 이상** 어긋난다(`FirstRunPage` 3 은 `grid-cols-[32px_1fr]` · `rounded-chip` · `px-4 py-3.5`, `DesktopVaultWelcome` 4 는 반경 0 풀블리드에 `px-4 py-4`). 정렬만 열면 **한 자리도 안 들어온다** = 사용처 0인 축 |
 * | `text-<step>` 의 짝 `tracking-<step>` | 낼 수는 있으나 **오늘 244개의 폭이 전부 바뀐다**(0.02em × 11px ≈ 6글자 칩 +1.3px). 정직한 고침은 globals.css 에 `--text-<step>--letter-spacing` 을 묶는 것이고 자체 실측 라운드가 필요하다 |
 * | `active` vs 「선택」 축 분리 | 세그먼트 12자리 실측이 **12/12 인디고 틴트 배경**이었고 갈린 것은 잉크뿐(primary 11 · accent 1). 축 대신 **다수로 정규화**했다 |
 * | `--chrome-radius-inner`(7px) | **구멍이 아니었다.** globals.css 에서 `var(--radius-chip)` = 6px 의 별칭이다. 원장의 「7px」은 낡은 기록이고, `segment` 가 `rounded-chip` 을 쓰는 근거가 여기 있다 |
 * | `fixedHeight` 축 | 2026-08-03 **삭제**. 값이 틀렸다는 증상이었지 축이 아니었다 |
 *
 * ### 사다리 실측 (2026-08-03, 1512×860 · 다크) — 18 조합 중 7 만 사다리 위
 *
 * 사다리는 **28 / 32 / 40**:
 *
 * | 모양 | sm | md | lg |
 * |---|---:|---:|---:|
 * | chip | 24 | **32** | **32** |
 * | pill | 24 | **32** | **32** |
 * | segment | 22 | 24 | **32** |
 * | row | **28** | 36 | 42 |
 * | card | 30 | 34 | **40** |
 * | icon | 24 | **28** | **32** |
 *
 * 읽히는 것 셋: ① 22 · 24 · 30 · 34 · 36 · 42 는 여전히 이 앱의 높이 어휘
 * **밖**이다 ② `chip`/`pill` 은 md 와 lg 의 높이가 같아 「한 단 크게」가 높이로는
 * 아무 일도 안 한다 ③ 칩 계열에 40px(`--control-h-lg`) 단이 없다.
 *
 * ### 값 층이 계약의 사정거리를 넓힌 첫 사례
 *
 * 공방·기록 라운드가 옮긴 공방 헤더 6개에 `text-caption`(9.5px)이 3개 있었다 —
 * `studio-navigation.spec.ts` 의 「크롬 라벨은 11px 한 값」 계약이
 * `studio-save`/`studio-exit` 두 자리만 잡고 있어 형제들이 빠져나가 있었다.
 * 램프로 옮기니(`card/sm` = `text-label`) 계약이 재지 않던 자리가 자동으로
 * 계약값이 됐다.
 */

/** 값 층 밖이라는 **주장의 종류**. 새 종류를 더하려면 위 「등재의 기준」 표에도 적는다. */
type OutsideClaim = 'chrome-token' | 'stage-geometry' | 'value-layer-peer';

interface OutsideEntry {
  /** 저장소 상대 경로. 실재해야 한다. */
  readonly file: string;
  /** 이 파일에서 **값 층 밖이라고 등재하는 수**. 파일 전체가 아니다. */
  readonly count: number;
  readonly claim: OutsideClaim;
  /**
   * 이 파일에 **남아 있어야 하는 근거 문자열**. 사라지면 주장이 죽은 것이므로
   * 게이트가 빨개진다. `chrome-token` 은 토큰 이름을 쓰고, 그 토큰이 정말 고정
   * 단이 아닌지까지 globals.css 에서 확인한다.
   */
  readonly proof: string;
  readonly why: string;
  /** 「X 가 생기면 옮긴다」 — 값 층이 그 축을 얻으면 등재를 지우고 부채로 내린다. */
  readonly conditional?: string;
}

/**
 * **검증된 「값 층 밖」 등록부.**
 *
 * 여기 없는데 값 층 밖인 자리를 발견하면 **줄을 더하기 전에 열어서 확인한다** —
 * 위 규율 1. 확인 못 하면 부채로 둔다.
 */
const OUTSIDE_VALUE_LAYER: readonly OutsideEntry[] = [
  {
    file: 'src/widgets/atlas-git-panel/ui/AtlasGitPanel.tsx',
    count: 5,
    claim: 'chrome-token',
    proof: '--git-row-h',
    why:
      '변경 행 · 「나머지」 토글 · STEP_ROW 3열 그리드 행 3. 높이가 ' +
      'clamp(38px, 4.2vh, 48px) 이고 좁은 폭에서 26px, coarse 포인터에서 44px 로 ' +
      '재정의된다. 값 층의 높이 어휘는 고정 단뿐이라 **뷰포트 함수를 표현할 수 없다**.',
  },
  {
    file: 'src/widgets/atlas-git-panel/ui/AtlasGitPanel.tsx',
    count: 7,
    claim: 'chrome-token',
    proof: '--git-setup-action-height',
    why:
      '스냅샷 확인/취소 · 도크 · 재확인 · 재시도 · init · init 복사. 데스크톱 36px ' +
      '인데 coarse 포인터에서 --touch-target-min(44px)으로 **승격**한다. 램프는 ' +
      '포인터 조건부 높이를 못 낸다.',
    conditional: '값 층이 포인터 승격 축(coarse 에서 44px)을 얻으면 다시 연다.',
  },
  {
    file: 'src/views/ontology-studio/ui/StudioCompass.tsx',
    count: 3,
    claim: 'stage-geometry',
    proof: 'layout.socket',
    why:
      '레인 접기 · 「더 잇기」 · 소켓. 셋 다 absolute + style={{left, top, width, height}} ' +
      '로 **JS 가 계산한 무대 좌표**를 받는다(layout.fold · layout.addChip · ' +
      'layout.socket). className 램프는 style 을 낼 수 없다.',
  },
  {
    file: 'src/views/ontology-studio/ui/StudioMaterializeDialog.tsx',
    count: 1,
    claim: 'chrome-token',
    proof: '--overlay-close-size',
    why: '오버레이 닫기 — 32px 이고 coarse 포인터에서 44px 로 승격한다.',
    conditional: '값 층이 포인터 승격 축을 얻으면 다시 연다.',
  },
  {
    file: 'src/views/ontology-studio/ui/StudioPracticeCleanup.tsx',
    count: 2,
    claim: 'chrome-token',
    proof: '--overlay-close-size',
    why:
      '연습 정리의 삭제·보관. min-h-[var(--overlay-close-size)] 로 coarse 에서 44px ' +
      '로 승격한다. 같은 자리가 「전폭 중앙정렬」 구멍에도 걸리지만, **영원히 밖인 ' +
      '쪽은 포인터 승격**이다.',
    conditional: '값 층이 포인터 승격 축을 얻으면 다시 연다 — 그때 전폭 중앙 모양도 함께 필요하다.',
  },
  {
    file: 'src/shared/ui/button.tsx',
    count: 1,
    claim: 'value-layer-peer',
    proof: 'buttonVariants',
    why: '표준 버튼 프리미티브 자신. 값 층이 자기를 소비할 수는 없다.',
  },
  {
    file: 'src/shared/ui/chrome-chip.tsx',
    count: 1,
    claim: 'value-layer-peer',
    proof: '--chrome-tile-size',
    why: '크롬 칩 프리미티브. 높이가 --chrome-tile-size 크롬 계약이고 소비처는 className 만 얹는다.',
  },
  {
    file: 'src/shared/ui/chrome-tile.tsx',
    count: 1,
    claim: 'value-layer-peer',
    proof: '--chrome-tile-size',
    why: '크롬 타일 프리미티브. 같은 크롬 계약(36px, coarse 에서 max(36px, 44px)).',
  },
  {
    file: 'src/shared/ui/select.tsx',
    count: 1,
    claim: 'value-layer-peer',
    proof: '--control-h-md',
    why:
      'select 트리거. **값 층과 같은 컨트롤 높이 사다리**(--control-h-md/lg)를 직접 ' +
      '읽고 w-full · rounded-card 로 폼 필드 계약을 진다.',
  },
  {
    file: 'src/shared/ui/tab-bar.tsx',
    count: 1,
    claim: 'value-layer-peer',
    proof: '--tabbar-underline',
    why:
      '밑줄 탭 프리미티브 자신. 반경 0 · items-baseline · pb-[11px] · ' +
      'border-b-[length:var(--tabbar-underline)] 로 **다른 표기법**을 소유한다. ' +
      'segment 는 「보더 0」이 정의라 이 표기법을 못 그린다.',
  },
];

/**
 * **리터럴이다 — `OUTSIDE_VALUE_LAYER` 에서 파생하지 않는다.**
 *
 * 하드컷 래칫이 `BASELINE = REGISTRY.length` 로 두었다가 「늘지 않는다」가
 * **원리적으로 실패 불가**였던 결함을 물려받지 않는다: 줄을 더하면 기준선도 같이
 * 올라가 멈춤쇠가 양방향으로 헐거워진다. 등재를 늘리려면 이 수를 **손으로**
 * 올려야 하고, 그 diff 가 곧 「왜」를 적을 자리다.
 */
const BASELINE_REGISTERED = 23;

/**
 * **이 수만 줄어야 한다.** 전수(113)에서 등재(23)를 뺀 나머지.
 *
 * 등재된 파일에 손 컨트롤을 하나 더 써도 등재 수는 안 오르므로 이 수가 오른다 —
 * 등재는 면제가 아니다.
 */
const BASELINE_HAND_WRITTEN_DEBT = 85;

const ROOTS = ['src', 'app'];
const GLOBALS_CSS = 'app/globals.css';
const SELF = 'tests/contract/control-adoption-ratchet.contract.test.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walk(p, out);
    } else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) {
      out.push(p);
    }
  }
  return out;
}

/**
 * 여는 태그를 **중괄호 깊이**로 끊는다.
 *
 * ★ 이걸 안 하면 `onClick={() => …}` 의 `=>` 를 태그 끝으로 읽는다. 첫 측정에서
 * 실제로 그랬고, 그 결과 419개 중 251개가 「className 없음」으로 분류돼 결론이
 * 통째로 뒤집힐 뻔했다. **잴 원소를 틀리면 수치가 나와도 틀린 수치다.**
 */
function openingTag(source: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < source.length; i += 1) {
    const c = source[i];
    if (quote) {
      if (c === quote && source[i - 1] !== '\\') quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return source.slice(from, i);
  }
  return source.slice(from, from + 2000);
}

/**
 * **컨트롤은 `<button>` 만이 아니다** (2026-08-04).
 *
 * 이 래칫은 하루 동안 `<button>` 만 셌고, 그래서 손으로 규격을 쓴 앵커
 * **109곳**(`<Link>` 85 · `<a>` 24)이 게이트의 시야 밖에 있었다. 누를 수 있고
 * 자기 높이·인셋·반경을 손으로 쓰는 원소라는 점에서 버튼과 다르지 않다 —
 * 값 층의 `link` 모양이 정확히 그 자리를 위해 있다.
 */
const BUTTON_TAGS = ['button'] as const;
const ANCHOR_TAGS = ['Link', 'a'] as const;

function countInFile(file: string, tags: readonly string[] = BUTTON_TAGS): number {
  const source = readFileSync(file, 'utf8');
  // `const X = controlClass({…})` / `const X = cn(controlClass({…}), …)` 의 이름들.
  const systemConstants = [...source.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=[^;\n]*controlClass\s*\(/g)].map(
    (m) => m[1],
  );
  let n = 0;
  for (const m of source.matchAll(new RegExp(`<(?:${tags.join('|')})\\b`, 'g'))) {
    const tag = openingTag(source, m.index + m[0].length);
    if (!/className/.test(tag)) continue; // 클래스가 없으면 손으로 쓴 규격이 아니다
    /*
     * 시스템을 통과했나. **여는 태그의 리터럴만 보는 것으로는 부족하다** —
     * 완성된 클래스를 상수로 뽑아 여러 자리가 공유하면(`const INDIGO_CHIP =
     * controlClass({…})`) 그 소비처들이 「손으로 쓴 것」으로 잡힌다.
     *
     * 2026-08-03 회수 라운드가 그 벌점을 실제로 맞았다: 인디고 강조 칩이
     * 테두리·호버까지 있어야 완성이라 상수 4벌로 묶어야 했는데, 그러면 래칫이
     * 나빠졌다고 말한다. **옳은 리팩터를 말리는 게이트는 게이트가 아니다.**
     */
    if (/controlClass\s*\(/.test(tag)) continue;
    if (systemConstants.length > 0 && systemConstants.some((name) => new RegExp(`\\b${name}\\b`).test(tag))) continue;
    n += 1;
  }
  return n;
}

/**
 * 등록부를 **인자로 받는다** — 프로브가 줄을 빼거나 파일을 얹어 탐지기 자체를
 * 겨눌 수 있어야 한다(하드컷 래칫의 `stillHardCut(registry)` 와 같은 이유).
 */
function census(scanned: string[], registry: readonly OutsideEntry[] = OUTSIDE_VALUE_LAYER, tags: readonly string[] = BUTTON_TAGS) {
  const byFile = new Map<string, number>();
  let total = 0;
  for (const file of scanned) {
    const n = countInFile(file, tags);
    if (n > 0) {
      byFile.set(file, n);
      total += n;
    }
  }
  const registeredByFile = new Map<string, number>();
  for (const entry of registry) {
    registeredByFile.set(entry.file, (registeredByFile.get(entry.file) ?? 0) + entry.count);
  }
  let registered = 0;
  for (const n of registeredByFile.values()) registered += n;
  return { total, registered, debt: total - registered, byFile, registeredByFile };
}

/**
 * 크롬 토큰이 **정말로 고정 단 밖인가.**
 *
 * 값 층은 고정 px 스텝을 낸다. 그러니 토큰이 조건(폭·포인터)마다 다른 값으로
 * 재정의되거나 뷰포트 함수를 쓸 때만 「표현 불가」가 참이다. 토큰이 평범한 px
 * 하나로 정리되는 날 이 검사가 빨개지고, 그 줄은 등재가 아니라 부채가 된다.
 */
function tokenIsBeyondFixedSteps(css: string, token: string): boolean {
  const declarations = [...css.matchAll(new RegExp(`${token}\\s*:\\s*([^;]+);`, 'g'))].map((m) => m[1].trim());
  if (declarations.length === 0) return false;
  if (declarations.length > 1) return true;
  return /clamp\(|max\(|min\(|\d+v[hw]|touch-target-min/.test(declarations[0]);
}

const scannedFiles = ROOTS.flatMap((root) => walk(root));
const { total, registered, debt, byFile, registeredByFile } = census(scannedFiles);
const globalsCss = readFileSync(GLOBALS_CSS, 'utf8');

/**
 * ════════════════════════════════════════════════════════════════════
 * ## 앵커 컨트롤 — **세 번째 수** (2026-08-04)
 * ════════════════════════════════════════════════════════════════════
 *
 * ### 왜 부채 85 에 더하지 않고 수를 새로 만드나
 *
 * 이 파일 머리말이 이미 그 판단을 적어 뒀다: *"종전엔 113 이 한 덩어리였고,
 * 그래서 무엇이 진전인지 알 수 없었다 — 옮길 수 없는 자리와 아직 안 옮긴 자리가
 * 같은 칸에 있었다."* 그 교훈을 여기 그대로 적용한다.
 *
 * 앵커 109를 부채 85에 더하면 **194** 가 되고, 그 수가 내려갈 때 버튼이 옮겨진
 * 것인지 앵커가 옮겨진 것인지 알 수 없다. 두 부류는 **작업 단위가 다르다** —
 * 버튼은 `controlClass({ shape })` 한 줄이면 대개 끝나는데, 앵커는 `<Link>` 가
 * `cn` 병합을 강제하고(이 파일이 실측해 둔 곳: raw `buttonVariants()` 는 base 의
 * `border-transparent` 와 변형 보더가 둘 다 남아 소스 순서가 투명을 이긴다)
 * 외부 링크는 `↗` 선행 표식 규칙까지 걸린다.
 *
 * ### `<Link>` 와 `<a>` 는 왜 한 수인가
 *
 * 반대로 이 둘은 **가르지 않는다**. `<Link>` 가 렌더하는 것이 `<a>` 이고, 값 층에서
 * 둘의 목적지가 같은 `shape: 'link'` 다. 처방이 같은 것을 두 칸에 두면 그건 진도를
 * 읽는 눈금이 아니라 장부질이다. 대신 태그별 내역을 여기 적어 둔다 —
 * **`<Link>` 85 · `<a>` 24**(2026-08-04 실측, 이 파일의 파서 기준).
 *
 * ⚠️ 감사 보고서의 수는 **77** 이었다. 그 차이는 드리프트이거나 다른 필터이고,
 * 게이트가 쓰는 수는 **이 파일의 파서가 실제로 센 것**이어야 한다 — 남이 센 수를
 * 기준선에 적으면 첫 실행이 빨개지고, 그때 사람은 게이트가 아니라 수를 고친다.
 *
 * ### 등재는 오늘 0 이다
 *
 * 버튼 쪽 `OUTSIDE_VALUE_LAYER` 같은 「값 층 밖」 주장이 앵커에는 **아직 하나도
 * 검증되지 않았다**. 규율 1대로 열어 보고 확인한 자리만 등재하므로, 검증 전에는
 * 전부 부채다 — 안전한 방향의 오차다.
 */
// 85 → 86: 이 게이트가 브랜치에서 재는 동안 main 이 앵커를 하나 더 들였다
// (#907 오버레이 반경 라운드). 게이트가 없던 시점에 쓰인 자리라 회귀가 아니라
// **신설 시점의 실측**이다 — 다음 라운드부터 이 수는 내려가기만 한다.
const ANCHOR_TAG_SPLIT: Readonly<Record<string, number>> = { Link: 86, a: 24 };

/**
 * **리터럴이다.** 버튼 쪽 두 기준선과 같은 이유 — 파생값으로 두면 멈춤쇠가
 * 양방향으로 헐거워진다(하드컷 래칫이 실제로 그렇게 죽었다).
 *
 * **이 수만 줄어야 한다.**
 */
const BASELINE_ANCHOR_DEBT = 110;

const anchorCensus = census(scannedFiles, [], ANCHOR_TAGS);

describe('컨트롤 채택 래칫 — 등재된 「값 층 밖」', () => {
  it('등재된 파일이 전부 실재한다 — 없는 파일을 세면 수가 거짓이 된다', () => {
    for (const entry of OUTSIDE_VALUE_LAYER) {
      expect(existsSync(entry.file), `${entry.file} 이 없다 — 옮겼거나 지웠으면 등록부도 고친다`).toBe(true);
    }
  });

  it('각 줄의 근거가 아직 파일에 있다 — 근거가 사라지면 주장도 죽는다', () => {
    for (const entry of OUTSIDE_VALUE_LAYER) {
      expect(
        readFileSync(entry.file, 'utf8').includes(entry.proof),
        `${entry.file} 에서 «${entry.proof}» 가 사라졌다. 이 줄의 주장(${entry.claim})은 그 근거 위에 ` +
          `서 있다 — 자리가 바뀌었으면 등록부를 다시 쓰고, 값 층으로 옮겼으면 줄을 지워라.`,
      ).toBe(true);
    }
  });

  it('`chrome-token` 줄의 토큰이 정말 고정 단 밖이다 — px 하나가 되면 부채로 내려온다', () => {
    const chromeTokens = OUTSIDE_VALUE_LAYER.filter((e) => e.claim === 'chrome-token');
    expect(chromeTokens.length, '`chrome-token` 줄이 하나도 없으면 이 검사는 공집합 위에서 논다').toBeGreaterThan(0);
    for (const entry of chromeTokens) {
      expect(
        tokenIsBeyondFixedSteps(globalsCss, entry.proof),
        `${entry.proof} 가 globals.css 에서 **고정 단 하나**가 됐다. 그러면 값 층이 낼 수 있으므로 ` +
          `«표현 불가» 주장이 죽는다 — ${entry.file} 를 등록부에서 지우고 부채로 갚아라.`,
      ).toBe(true);
    }
  });

  it('등재 수가 그 파일의 실측을 넘지 않는다 — 있지도 않은 것을 등재할 수 없다', () => {
    for (const [file, claimed] of registeredByFile) {
      const actual = byFile.get(file) ?? 0;
      expect(
        claimed,
        `${file}: 등재 ${claimed} 인데 실측 손 컨트롤은 ${actual} 뿐이다. 자리를 값 층으로 옮겼으면 ` +
          `등록부의 수도 함께 내려라 — 안 내리면 그만큼이 부채에서 조용히 사라진다.`,
      ).toBeLessThanOrEqual(actual);
    }
  });

  it('등재가 늘지 않는다 — 늘리려면 리터럴을 손으로 올리고 diff 에 왜를 적는다', () => {
    expect(
      registered,
      `등재가 ${BASELINE_REGISTERED} → ${registered} 로 늘었다. **등록부는 허가 목록이 아니라 부채 ` +
        `목록이다** — 옮길 수 있는데 안 옮긴 것을 등재하는 것이 이 게이트가 막으려는 실패다. 정말 값 ` +
        `층이 원리적으로 못 내는 자리라면 BASELINE_REGISTERED 를 손으로 올려라.`,
    ).toBeLessThanOrEqual(BASELINE_REGISTERED);
  });

  it('등재가 줄었으면 기준선도 내린다 — 여유를 무료로 두지 않는다', () => {
    expect(
      registered,
      `등재가 ${BASELINE_REGISTERED} → ${registered} 로 줄었다. BASELINE_REGISTERED 도 ${registered} 로 내려라.`,
    ).toBeGreaterThanOrEqual(BASELINE_REGISTERED);
  });
});

describe('컨트롤 채택 래칫 — 앵커(`<Link>` · `<a>`)', () => {
  it('앵커 부채가 늘지 않는다 — 누를 수 있는 것은 전부 값 층을 지난다', () => {
    const worst = [...anchorCensus.byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    expect(
      anchorCensus.debt,
      `손으로 규격을 쓴 앵커가 ${BASELINE_ANCHOR_DEBT} → ${anchorCensus.debt} 로 늘었다.\n` +
        `\`controlClass({ shape: 'link' })\` 가 이 자리를 위해 있다. \`<Link>\` 는 \`cn\` 병합이 필수다 — ` +
        `raw 변형은 base 의 border-transparent 가 소스 순서로 이긴다(이 파일 실측).\n` +
        `가장 많은 파일: ${worst.map(([f, n]) => `${f}(${n})`).join(' · ')}`,
    ).toBeLessThanOrEqual(BASELINE_ANCHOR_DEBT);
  });

  it('앵커 부채를 갚았으면 기준선도 내린다 — 여유를 무료로 두지 않는다', () => {
    expect(
      anchorCensus.debt,
      `앵커 부채가 ${BASELINE_ANCHOR_DEBT} → ${anchorCensus.debt} 로 줄었다. ` +
        `BASELINE_ANCHOR_DEBT 도 ${anchorCensus.debt} 로 내려라.`,
    ).toBeGreaterThanOrEqual(BASELINE_ANCHOR_DEBT);
  });

  it('태그 내역이 전수와 맞는다 — 두 태그가 서로를 잃지 않는다', () => {
    const perTag = Object.fromEntries(
      ANCHOR_TAGS.map((tag) => [tag, census(scannedFiles, [], [tag]).total]),
    );
    expect(
      perTag,
      '머리말의 태그 내역이 실측과 어긋난다. 수가 움직였으면 내역도 같이 고쳐라 — ' +
        '내역이 낡으면 다음 사람이 어느 쪽이 움직였는지 못 읽는다.',
    ).toEqual(ANCHOR_TAG_SPLIT);
    expect(Object.values(perTag).reduce((a, b) => a + b, 0)).toBe(anchorCensus.total);
  });
});

describe('컨트롤 채택 래칫 — 아직 안 옮긴 부채', () => {
  it('부채가 늘지 않는다 — 새 컨트롤은 controlClass() 를 쓴다', () => {
    const worst = [...byFile.entries()]
      .filter(([f]) => !registeredByFile.has(f))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    expect(
      debt,
      `아직 안 옮긴 손 컨트롤이 ${BASELINE_HAND_WRITTEN_DEBT} → ${debt} 로 늘었다 ` +
        `(전수 ${total} − 등재 ${registered}).\n` +
        `새 컨트롤은 \`controlClass({ shape })\` 를 쓴다 — 모양 여덟은 실측에서 나왔고 램프 밖 값을 못 낸다.\n` +
        `등재된 파일이라도 면제가 아니다: 거기 손 컨트롤을 더하면 등재 수는 그대로고 이 수가 오른다.\n` +
        `미등재 중 가장 많은 파일: ${worst.map(([f, n]) => `${f}(${n})`).join(' · ')}`,
    ).toBeLessThanOrEqual(BASELINE_HAND_WRITTEN_DEBT);
  });

  it('부채를 갚았으면 기준선도 내린다 — 여유를 무료로 두지 않는다', () => {
    expect(
      debt,
      `부채가 ${BASELINE_HAND_WRITTEN_DEBT} → ${debt} 로 줄었다. ` +
        `이 파일의 BASELINE_HAND_WRITTEN_DEBT 도 ${debt} 로 내려라.`,
    ).toBeGreaterThanOrEqual(BASELINE_HAND_WRITTEN_DEBT);
  });

  it('두 수의 합이 전수와 맞는다 — 갈라진 수가 서로를 잃지 않는다', () => {
    expect(registered + debt).toBe(total);
  });
});

/**
 * **탐지기 프로브** — `/gate-probe` 규율.
 *
 * 위 테스트들은 「오늘의 수」와 「오늘의 등록부」 위에서만 돈다. 그러면 탐지기가
 * 조용히 빈 집합을 돌거나, 등재가 부채를 통째로 삼켜도 전부 초록일 수 있다.
 * 여기서 판정 함수를 **양방향으로** 겨눈다.
 *
 * ⚠️ 어제 하드컷 래칫에서 `BASELINE = REGISTRY.length` 라 「늘지 않는다」가
 * **원리적으로 실패 불가**였던 결함이 나왔다. 그래서 두 기준선을 리터럴로 두고,
 * 아래 ④가 그 사실 자체를 단언한다.
 */
describe('탐지기 프로브 — 이 게이트가 실제로 무엇을 잡는가', () => {
  const FIXTURE = 'tests/fixtures/control-adoption/HandWrittenControl.tsx.fixture';

  it('① 손으로 쓴 컨트롤을 실제로 센다 — 0을 통과로 읽지 않는다', () => {
    expect(existsSync(FIXTURE), '프로브 픽스처가 사라지면 탐지기 증명도 사라진다').toBe(true);
    // 픽스처 둘: 램프 밖 규격 하나 + **등재 안 된** 크롬 토큰 자리 하나.
    expect(countInFile(FIXTURE), '픽스처의 손 컨트롤 2건을 못 셌다면 파서가 깨진 것이다').toBe(2);

    // 실물 위에서도 살아 있다.
    expect(total, '한 건도 못 셌다면 파서나 경로가 깨진 것이다').toBeGreaterThan(0);
    expect(byFile.size, '파일별 집계가 비었다').toBeGreaterThan(10);
  });

  it('② 등재 안 된 자리를 손 컨트롤로 만들면 **부채**로 잡힌다 — 등재 쪽으로 새지 않는다', () => {
    /*
     * 픽스처를 스캔 대상에 얹으면 그 2건이 전부 부채로 간다. 크롬 토큰을 쓰는
     * 자리라도 **등록부에 없으면** 등재가 아니다 — 「토큰을 쓰면 면제」가 아니라
     * 「검증되어 등재된 줄만 면제」다.
     */
    const withFixture = census([...scannedFiles, FIXTURE]);
    expect(withFixture.registered).toBe(registered);
    expect(withFixture.debt).toBe(debt + 2);
    expect(
      withFixture.debt,
      '미등재 자리에 손 컨트롤이 늘었는데 부채 기준선을 안 넘었다면 이 게이트는 아무것도 안 막는다',
    ).toBeGreaterThan(BASELINE_HAND_WRITTEN_DEBT);
  });

  it('③ 등록부에서 줄을 지우면 그 자리가 **부채로 돌아온다** — 등재가 사실을 지우지 않는다', () => {
    for (const entry of OUTSIDE_VALUE_LAYER) {
      const without = census(
        scannedFiles,
        OUTSIDE_VALUE_LAYER.filter((e) => e !== entry),
      );
      expect(without.registered).toBe(registered - entry.count);
      expect(
        without.debt,
        `${entry.file}(${entry.proof}) 줄을 지웠는데 부채가 안 늘었다 — 그 줄은 아무것도 등재하고 있지 않다`,
      ).toBe(debt + entry.count);
    }
  });

  it('④ 기준선 둘이 **리터럴**이다 — 등록부에서 파생되면 「늘지 않는다」가 실패 불가가 된다', () => {
    const source = readFileSync(SELF, 'utf8');
    expect(
      /const BASELINE_REGISTERED = \d+;/.test(source),
      'BASELINE_REGISTERED 가 리터럴이 아니다. `OUTSIDE_VALUE_LAYER.length` 나 reduce 로 두면 줄을 ' +
        '더할 때 기준선도 같이 올라가 멈춤쇠가 헐거워진다(하드컷 래칫의 실제 결함).',
    ).toBe(true);
    expect(/const BASELINE_HAND_WRITTEN_DEBT = \d+;/.test(source), '부채 기준선도 리터럴이어야 한다').toBe(true);
  });

  it('⑤ 토큰 검사가 아무거나 통과시키지 않는다 — 고정 단 토큰은 반드시 거절한다', () => {
    // 양성: 조건마다 재정의되거나 뷰포트 함수를 쓴다.
    expect(tokenIsBeyondFixedSteps(globalsCss, '--git-row-h')).toBe(true);
    expect(tokenIsBeyondFixedSteps(globalsCss, '--overlay-close-size')).toBe(true);
    // 음성: `--control-h-md` 는 32px 하나뿐이라 값 층이 그대로 낼 수 있다.
    expect(
      tokenIsBeyondFixedSteps(globalsCss, '--control-h-md'),
      '고정 단 하나인 토큰까지 통과시키면 「크롬 토큰이라 못 옮긴다」가 무제한 면제가 된다',
    ).toBe(false);
    expect(tokenIsBeyondFixedSteps(globalsCss, '--radius-chip')).toBe(false);
    // 없는 토큰은 근거가 아니다.
    expect(tokenIsBeyondFixedSteps(globalsCss, '--not-a-real-token-xyz')).toBe(false);
  });

  it('⑦ 앵커 탐지기가 실제로 센다 — `<button>` 만 세던 사각지대의 자(尺)', () => {
    // 픽스처의 앵커 둘(`<Link>` 하나 · `<a>` 하나)을 세야 한다.
    expect(
      countInFile(FIXTURE, ANCHOR_TAGS),
      '픽스처의 손 앵커 2건을 못 셌다면 앵커 탐지기가 죽은 것이다',
    ).toBe(2);
    // 실물 위에서도 살아 있다 — 이게 없으면 「앵커 부채 0」과 「안 셌다」가 같은 초록이다.
    expect(anchorCensus.total, '앵커를 한 건도 못 셌다면 태그 정규식이 깨진 것이다').toBeGreaterThan(0);
    expect(anchorCensus.byFile.size, '앵커 파일별 집계가 비었다').toBeGreaterThan(10);
  });

  it('⑧ 앵커를 하나 더 쓰면 **앵커 부채로** 잡힌다 — 버튼 수는 안 움직인다', () => {
    const withFixture = census([...scannedFiles, FIXTURE], [], ANCHOR_TAGS);
    expect(withFixture.debt).toBe(anchorCensus.debt + 2);
    expect(
      withFixture.debt,
      '앵커가 늘었는데 기준선을 안 넘었다면 이 게이트는 아무것도 안 막는다',
    ).toBeGreaterThan(BASELINE_ANCHOR_DEBT);
    // 두 수는 서로를 오염시키지 않는다.
    expect(census([...scannedFiles, FIXTURE]).debt, '앵커 픽스처가 버튼 부채를 움직였다').toBe(debt + 2);
  });

  it('⑨ 앵커 기준선이 **리터럴**이다', () => {
    expect(/const BASELINE_ANCHOR_DEBT = \d+;/.test(readFileSync(SELF, 'utf8'))).toBe(true);
  });

  it('⑩ 값 층을 지난 앵커는 안 센다 — 램프를 통과해도 세면 옮길 이유가 사라진다', () => {
    // 소비처가 실재해야 이 프로브가 뜻이 있다: 이미 `controlClass` 를 쓰는 앵커.
    const adopted = scannedFiles.filter((f) => {
      const src = readFileSync(f, 'utf8');
      return /<(Link|a)\b[^>]*controlClass\s*\(/.test(src.replace(/\n/g, ' '));
    });
    expect(adopted.length, '값 층을 지난 앵커 소비처가 0이면 이 면제는 검증된 적이 없다').toBeGreaterThan(0);
  });

  it('⑥ 등재는 **파일 면제가 아니다** — 같은 위젯의 미등재 파일이 부채로 살아 있다', () => {
    const file = 'src/widgets/atlas-git-panel/ui/CommitDetail.tsx';
    expect(byFile.get(file) ?? 0, '이 프로브는 미등재 파일 하나가 실제로 세어지고 있을 때만 뜻이 있다').toBeGreaterThan(
      0,
    );
    expect(
      registeredByFile.has(file),
      'CommitDetail 은 등재되지 않았다 — 값 층의 구멍(밑줄 탭 · 깊은 인셋)이라 부채다',
    ).toBe(false);
  });
});
