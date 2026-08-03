import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * 컨트롤 채택 래칫 — **손으로 쓴 컨트롤 className 은 늘어날 수 없다.**
 *
 * ## 왜 lint 룰이 아니라 래칫인가
 *
 * 갈래 D 의 원안은 「`<button>` 의 className 이 `controlClass()` 에서 오지 않으면
 * lint error」였다. 그런데 `/gate-probe` 규율대로 켜기 전에 전수를 세 보니
 * **419개**였다. 한 PR 로 못 치우는 룰은 강제가 아니라 소음이고, 기존 신호(현재
 * warning 96)까지 덮어 게이트를 무력화한다 — 이 저장소는 `shadow-[` 를 통째로
 * 금지했다가 lint 가 144 → 548 로 뛴 전례가 있다.
 *
 * 게다가 전환은 **정규화**라 픽셀이 바뀐다(칩 143개에 고유 크기 조합 50종, 상위
 * 3종 23% — `control-class.ts` 참조). 픽셀을 바꾸는 결정은 디자인 게이트의 일이지
 * lint 룰의 일이 아니다.
 *
 * 래칫은 그 둘을 가른다:
 *   - **오늘의 419는 그대로 둔다** — 정규화는 디자인 게이트가 순서를 정해 진행한다.
 *   - **420번째는 못 들어온다** — 새 컨트롤은 `controlClass()` 를 쓴다.
 *   - **줄면 기준선도 내린다** — 안 내리면 그 차이가 되돌아갈 여유로 남는다.
 *
 * 접근성 래칫(`tests/e2e/a11y-ratchet.spec.ts`)과 같은 형태다.
 */

const ROOTS = ['src', 'app'];

/**
 * 2026-08-03 전수 실측. **이 수는 내려가기만 한다.**
 *
 * | 모양 | 개수 |
 * |---|---:|
 * | 칩 | 128 |
 * | 텍스트 링크형 | 85 |
 * | 목록 행 | 39 |
 * | 아이콘 정사각 | 36 |
 * | pill | 32 |
 * | 토큰 반경 기타 · 미분류 | 58 |
 * | 카드형 | 18 |
 * | 떠 있는 · h-8 | 19 |
 * | 표준 버튼(기존 `<Button>` 이 덮는 유일한 모양) | 1 |
 *
 * 전수는 419였고 그중 **className 자체가 없는 2건**은 제외했다 — 손으로 쓴 규격이
 * 아니라 래퍼라서다. 이 2를 뺀 **417**이 기준선이고, 이 정정은 래칫이 스스로
 * 잡았다(첫 실행이 «419 → 417 로 줄었다» 로 빨개졌다).
 *
 * ## 내려온 기록 — 이 표가 곧 정규화의 진도다
 *
 * | 값 | 무엇이 옮겨졌나 |
 * |---:|---|
 * | 417 | 2026-08-03 최초 실측 |
 * | **406** | 설정 시트(`src/widgets/app-settings-menu/**`) 11개 — 칩 6 · 아이콘 2 · 행 1 · 링크형 1 (+ 그중 하나는 눌림 상태를 `active` 로 넘김) |
 * | **389** | 지도 두 위젯(`topology-map-v2` · `topology-index-panel`) 31개 중 17개 — 행 8 · 링크형 5 · 아이콘 3 · 카드 2 · 칩 1. 남긴 14개는 여섯 분류에 **없는** 모양(세로 액션 타일 5 · 세그먼트 탭 3 · 창 선택 칩 · 세로 엣지 탭 · 캔버스 앵커 원형 버튼 · 트리 셰브론)이거나, 램프의 최소 인셋(8px)이 이 패널의 4px 인셋과 어긋나 헤더가 자기 행들과 어긋나는 자리(2)다 |
 * | **303** | 문서함 · 빠른 서랍 · 공방(`views/docs-vault` · `widgets/docs-vault` · `widgets/docs-quick-drawer` · `views/ontology-studio`) 121개 중 86개 — 행 27 · 아이콘 24 · 칩 21 · 링크형 13 · pill 4 · 카드 2. 남긴 35개는 넷으로 갈린다: ① **크롬 토큰 계약**(`--chrome-tile-size` · `--docs-header-tile-size` · `--overlay-close-size`)을 지는 자리 4 — 램프가 아니라 크롬이 규격이다 ② **나침 무대의 절대배치 기하**(소켓 · 레인 접기 · 더 잇기 · 고정 높이 30/32 툴바) 15 — 이 표면의 문법이 따로 있고 `studio-navigation` 스펙이 그 치수를 계약으로 잡는다 ③ **한 벌로 읽혀야 하는 세트**(첫 실행 선택 행 4 + 최근 볼트 grid 행 1, 다중행 `items-start` 라 `row`(단행 `items-center`)에 안 맞는다) 11 ④ **문장·바 속 인라인 컨트롤** 5 — `link` 이 `min-h-11`(WCAG 2.5.8)을 실으면서 글줄 안에서는 줄 상자를 44px 로 밀어 올린다(실측 21.3 → 44). 시각 크기와 히트 영역이 다른 축이라는 상류 판단은 옳고, 다만 그 해법이 «문장 속» 이라는 세 번째 축을 아직 안 본다 |
 *
 * | **269** | 위 두 라운드가 「자리가 없어서」 남긴 48개의 회수 — 값 층의 구멍 넷을 메운(`a1f956ce9`) 직후다. 설정 시트 29(칩 24 · 타일 2 · 링크형 3) + 지도 액션 타일 5. `tone` 의 새 넷(secondary 6 · accent 11 · success 2 · warning 2 · danger 1)이 22개를, `shape: 'tile'` 이 7개를, `link` 의 `min-h-11` 이 3개를 열었다 |
 * | **259** | 뷰 라운드 — `src/views/{ontology-insights,download,first-run,git,project-*,gateway-doc,root-entry}` 18개 중 10개. 행 6(조용한 「나머지 보기」 토글 4 + 케밥 메뉴 항목 1 + 그 항목을 쓰는 `<Link>` 3) · 칩 5(의미 공백 쓰기 토글 · 도메인 선택 · 저장 · 취소 · 인계 복사). **여기서 처음으로 `row`/`sm` 이 손으로 쓰던 높이와 정확히 같았다** — `py-1.5`+`--leading-label`(16px) = 28px = `min-h-7`. 램프가 오늘 화면을 맞힌 첫 자리다 |
 * | **227** | features 라운드 — `src/features/**` 63개 중 32개. 칩 15 · pill 6 · 링크형 6 · 아이콘 3 · 나머지 2(도구 탭이 눌림을 `active` 로 넘긴다). 축 사용: `fixedHeight` 2 · `inline` 5 |
 * | **210** | 지도 뷰(`src/views/home/**`) 31개 중 17개 — 아이콘 9 · pill 4 · 칩 1 · 링크형 1(그 외 2는 인디고 강조 아이콘/pill). 남긴 14개는 다섯으로 갈린다: ① **컨트롤이 아닌 것** 3 — `absolute inset-0` 전면 백드롭은 스크림이지 눌리는 원소가 아니다 ② **크롬 토큰 계약** 2 — 투어·단축키 타일은 `--chrome-tile-size`/`--chrome-radius` 를 진다 ③ **말줄임이 필요한 텍스트 컨트롤** 3 — 모양 일곱이 전부 flex 계열이라 `text-overflow: ellipsis` 가 통하지 않는다(실측: `inline-block` 은 `…`, `inline-flex` 는 하드 클립) — **메움 ✅**: `truncate` 축이 display 를 `block` 으로 바꾸고 `truncate` 를 싣는다. 유틸리티만 얹어선 못 고치는 것이라 **모양의 일**이지 소비처의 일이 아니다 ④ **패딩을 가진 텍스트 링크** 3 — `link` 는 패딩이 0이라 `px-1 py-0.5`/`px-2 py-1` 히트 영역이 사라진다 ⑤ **램프에 스텝이 없는 것** 3 — 20px 아이콘 · 40px(`--control-h-lg`) 인디고 pill · 2줄 세로 목록 행 |
 * | **173** | 위젯 라운드 — `src/widgets/**` 중 이미 정규화된 다섯(설정 시트 · 지도 둘 · 문서함 · 빠른 서랍)을 뺀 84개에서 37개. 칩 21 · pill 4 · 아이콘 4 · 카드 5 · 행 2 · 링크형 1. 새 축 0개로 옮겼고, **남긴 47개가 값 층의 다음 구멍 목록**이다(아래). **210 − 37 = 173 이 전수 재측정으로 정확히 맞았다** — 앞선 두 정렬(227 − 37 = 190)과 마찬가지로, 이 라운드가 features·지도 뷰 라운드와 파일을 하나도 안 겹친다는 뜻이다. 세 라운드의 합산이 성립한다 |
 * | **136** | 공방·기록 라운드 — `views/ontology-studio` · `widgets/atlas-git-panel` 38개 중 12개. 카드 7(공방 헤더 6 + 저장) · 칩 2 · 세그먼트 2 · 온액센트 3(겹침). **새 축·모양·톤 0개**로 옮겼다. 기록 패널은 **15개 중 0개** — 이 위젯은 치수를 전부 `--git-*` 크롬 토큰과 3열 그리드가 소유해서 구조적으로 값 층 밖이다(아래) |
 * | **148** | 값 층 라운드 — 옮긴 25개는 새 표면이 아니라 **원장이 반복해서 센 구멍**을 메운 결과다. 세그먼트/고스트 12(지도 INDEX 렌즈 3 · 블록 가져오기 4 · 에이전트 범위 2 · 단축키 스코프 · 투어 뒤로 · 발자국 프리셋) · 패널 잉크 7(첫 실행 4 · 전체 상세 3) · 채운 인디고 3 · 말줄임 3. **새 축 셋 + 여덟째 모양 하나**로 열었고, 그 넷 전부가 원장에 두 번 이상 적혀 있던 것이다 |
 * | **144** | 프리미티브·뷰 라운드(`shared/ui` 18 · `views/{docs-vault,first-run,ontology-insights}` 17 = 35) 중 **4개**. 링크형 2(근접중복 경고의 두 선택지 — `inline` 축이 열어 준 첫 자리) · 칩 2(링크 편집기의 확인·취소). **이 라운드는 옮긴 수보다 «왜 31개가 안 움직였나»가 산출물이다** — 셋 중 하나이고 셋 다 아래에 수를 세어 적었다 |
 *
 * ## 프리미티브·뷰 라운드(2026-08-03)가 남긴 31개 — 세 부류, 그리고 전수
 *
 * ⚠️ **이 라운드는 옮긴 수가 적은 것이 결과다.** `src/shared/ui` 는 시스템
 * **자신의 집**이라 여기 있는 손 className `<button>` 은 대부분 값 층의
 * 소비처가 아니라 **값 층과 같은 층의 계약**(크롬 토큰 · 프리미티브 자신)이다.
 * 억지로 옮기면 계약을 깨거나 색·치수를 `className` 으로 넘겨 층을 무력화한다.
 *
 * | 부류 | 남은 수 | 무엇인가 |
 * |---|---:|---|
 * | **값 층과 같은 층** | 6 | `button.tsx`(값 층 자신) · `select.tsx` 트리거(`--control-h-*` 계약 + `rounded-card` + `w-full`) · `chrome-chip`/`chrome-tile`(`--chrome-tile-size` 44px 계약) · `DocsHeaderTile`(`--docs-header-tile-size`) · `tab-bar`(밑줄 탭 — 반경 0 · `items-baseline` · `pb-[11px]`) |
 * | **이미 원장에 적힌 구멍** | 21 | 아래 census 참조 |
 * | **렌더되지 않는 죽은 프리미티브** | 4 | `link-list-editor` 2(X 글리프 · `rounded-2xl` 추가 버튼) · `chip-list-editor` 2 — **둘 다 프로덕션 소비처 0**(아래) |
 *
 * ### 이번에 **전수로 센** 구멍 넷 — 다음 라운드의 입력
 *
 * 규칙 4(「몇 개가 막혔나 세라」)를 이 라운드가 저장소 전수로 실행했다. 감이
 * 아니라 수다:
 *
 * | 구멍 | 전수 | 어디 |
 * |---|---:|---|
 * | **`sm` 아래 한 칸이 없다**(`px-1`/`px-1.5` 인셋) — 원장 features 라운드 구멍 4의 재측정 | **14** (9파일) | `LiveActivityIndicator` 4 · `TopologyTrailChip` 3 · `AgentActivityChip` · `RealmBlockExportAction` · `DocsSidebarBody` 필터 지우기 · `full-detail-a1` 2 · `TopologyRealmLedger` · `AgentTranscript`. **이 라운드에서 가장 큰 구멍이고, 세 라운드 연속으로 나왔다** |
 * | **원형 아이콘 컨트롤이 없다** — `icon` 은 `rounded-chip` 고정 | **6** (4파일) | `node-explanation-edit` 3 · `info-hint` · `TopologyTrailChip` · `TopologyMapV2`(원장의 「캔버스 앵커 원형 버튼」). 24px 원을 6px 사각으로 바꾸는 것은 정규화가 아니라 **정체성 변경**이라 「체계」 소집 없이 혼자 정하지 않았다 |
 * | **보더 있는 아이콘 정사각이 없다** — 원장 뷰 라운드 구멍 1의 재측정 | **2** | `QueueRowActions` 케밥 · `HubRail`. 수가 둘뿐이라 **아직 축이 아니다** — 규칙 4대로 수를 적어 두고 넘긴다 |
 * | **`rounded-2xl`(16px)이 반경 램프 밖** | **2** | `link-list-editor` · `DocsVaultBacklinks`. 램프는 chip 6 / card 9 / panel 12 뿐이라 16px 은 어느 스텝도 아니다 |
 *
 * ### 💀 렌더되지 않는 프리미티브 둘 — 삭제 후보(소유자 판단)
 *
 * `LinkListEditor`·`ChipListEditor` 는 `shared/ui/index.ts` 가 export 하고
 * 단위 테스트도 있는데 **프로덕션 소비처가 0**이다(전수 grep). 이 저장소는
 * 같은 실패를 이미 겪었다 — `control-class.ts` 머리말의 `Card`/`Badge`/
 * `DetailCard` 셋이고, 그때의 답은 **삭제**였다. 두 컴포넌트는 그때와 같은
 * 증상까지 갖고 있다: 램프 밖 값(`rounded-2xl` 16px)을 쓴다. 이 라운드는
 * 램프에 정확히 맞는 둘만 옮기고 삭제는 제안만 한다 — 공개 export 를 지우는
 * 것은 리팩터가 아니라 API 변경이라서다.
 *
 * ## 공방·기록 라운드(2026-08-03)가 남긴 26개 — 값 층의 새 구멍
 *
 * | 구멍 | 남은 수 | 무엇이 없나 |
 * |---|---:|---|
 * | **`tone: 'accent'` 는 잉크가 아니라 표식이다 — 대비 실측** | 3 | 이 앱에는 인디고가 **둘**이다: 표식용 `--color-indigo-accent`(#7170ff)와 **글자용** `--color-indigo-text-soft`(#bcc3ffeb). 톤 램프는 앞의 것만 낸다. 공방의 노란 힌트 바탕에서 재면 accent 는 **3.55~4.25:1 (AA 미달)**, text-soft 는 **7.09~8.37:1** 이다. 문장 속 컨트롤 3개(유사 노드 열기 2 · 피커 유사 수락 1)를 옮기면 대비가 절반으로 떨어진다. ⚠️ 이건 「못 옮긴 자리」가 아니라 **값 층 자신의 잠재 결함**이다 — accent 는 canvas 위 5.18 · elevated 위 4.53 으로 이미 아슬아슬하고, 틴트 표면 위에서는 진다 |
 * | **크롬 토큰이 치수를 소유한다** (5라운드 연속) | 17 | `--git-row-h`(**clamp** 38~48px, 좁은 폭에서 26px) 6 · `--git-setup-action-height`(36px, **coarse 포인터에서 44px 승격**) 7 · `--overlay-close-size`(32px → coarse 44px) 2 · `px-4` 인셋 2. 램프의 높이 어휘는 고정 3단(28/32/40)뿐이라 **clamp 도 포인터 승격도 표현할 수 없다**. `fixedHeight` 가 삭제되면 그 3단마저 사라져 이 구멍은 **더 커진다** — 삭제 자체는 옳다(값이 틀렸다는 증상이었다). 답은 축이 아니라 「크롬 토큰이 소유한 자리는 값 층 밖」이라고 **명시적으로 등재**하는 것이다 |
 * | **밑줄이 선택 표시인 탭** | 2 | `segment` 는 「보더 0」이 정의라 `border-b-2` 로 선택을 말하는 탭을 못 그린다(커밋 렌즈 개념/파일). 원장은 이 자리를 `segment` 로 «메움 ✅» 처리했지만 **안 메워졌다** — 세그먼트가 연 것은 「틴트로 선택을 말하는 것」이고, 밑줄 탭은 다른 표기법이다. 틴트로 바꾸는 것은 정규화가 아니라 **표기법 변경**이라 디자인 게이트의 일이다 |
 * | **점선 = 「채울 수 있음」 어포던스** | 2 | 나침 무대의 「더 잇기」와 피커의 「새로 만들기」는 `border-dashed` 로 **비어 있음/추가 가능**을 말한다(헌장이 정한 무대 문법). 보더 *스타일* 은 모양이라 `className` 으로 넘기면 층이 무력해진다. 8모양 어디에도 점선이 없다 |
 * | **전폭 중앙정렬 + 터치 승격** | 2 | 연습 정리의 삭제/보관은 `flex-1 justify-center` + `min-h-[var(--overlay-close-size)]`. `chip`/`card` 는 내용 폭이라 `justify-center` 가 없고, `justify-center` 를 가진 `segment` 는 보더가 없다 = **「보더 있는 전폭 중앙 버튼」이 없다**. 터치 승격 축도 `link` 의 `min-h-11` 하나뿐이라 상자 모양은 못 받는다 |
 * | **3열 그리드 행** (2라운드 연속) | 3 | `STEP_ROW`(시각·이름·왜). `row` 는 flex 전용 |
 * | **깊은 인셋 목록 행** (2라운드 연속) | 1 | 커밋 파일 행의 `px-5`. `row` 의 최대는 `px-3` |
 * | **밀집 wrap 목록 속 글자 컨트롤** (3라운드 연속) | 1 | ego 이웃 링크는 `flex-wrap gap-y-1` 목록에 산다. `link` 의 `min-h-11` 을 실으면 줄마다 44px 이 되고, `inline` 축은 「**문장** 속」만 면제한다 |
 * | **램프 밖 16px 반경** | 1 | 진입 선택 카드 — 소유자 승인 + `eslint-disable` 로 **이미 보이게 등재된** 예외 |
 *
 * 곁가지: 이 라운드가 옮긴 공방 헤더 6개는 **`text-caption`(9.5px) 이 3개 있었다** —
 * `studio-navigation.spec.ts` 의 「크롬 라벨은 11px 한 값」 계약이 `studio-save`/
 * `studio-exit` 두 자리만 잡고 있어서 형제들이 빠져나가 있었다. 램프로 옮기니
 * (`card/sm` = `text-label`) 계약이 재지 않던 자리가 자동으로 계약값이 됐다 —
 * **값 층이 계약의 사정거리를 넓힌 첫 사례**다.
 * | **123** | 잔여 라운드 — `src/features/**` + `src/widgets/**` 의 남은 57개(`atlas-git-panel` 15 제외) 중 9개. 칩 6(폴더 열기 시트 2 + 투어 분기 2 + 에이전트 중지/보내기 2) · 세그먼트 2 · 아이콘 1. **새 축·새 값 0개**. 옮긴 칩 넷이 `h-9`(36) → **`--control-h-md`(32)** 로 앉았다 — #884 가 되돌린 사다리가 실제로 작동한 첫 실측이다. 채택률이 낮은 것 자체가 산출물이다 — 남긴 48개를 사유별로 세어 보니 **한 자리씩 다른 이유가 아니라 네 부류**였고, 그중 셋은 이미 원장에 적혀 있던 것이 이번에 정량화된 것이다(아래 「잔여 라운드」 절) |
 *
 * ## features 라운드(2026-08-03)가 찾은 구멍 — 값 층의 다음 입력
 *
 * 남긴 31개는 **한 자리씩 다른 이유**가 아니라 다섯 부류다. 부류마다 램프에
 * 없는 축이 하나씩 있다.
 *
 * 1. **메움 ✅ — 두 번째 글자색 램프가 존재한다** — `--topology-v2-panel-text-{primary,
 *    secondary,tertiary,quaternary}` 는 `--color-text-*` 와 **값이 다르다**
 *    (#868690 vs #8a8f98 …). `tone` 축은 후자만 낸다. 그래서 지도 패널 안에
 *    사는 컨트롤은 구조적으로 값 층 밖이다(11). 「하나의 채색 시스템」을 지키는
 *    램프가 정작 **두 벌의 무채색 램프**를 못 보고 있다.
 *    **어떻게 메웠나**: `scope: 'app' | 'panel'` 축. 「소비처가 잉크만 얹는다」는
 *    기각했다 — 그러면 색이 `className` 에 실려 이 층이 스스로 금지한 것을 하게
 *    되고, 19개를 옮겨도 색은 여전히 손으로 쓴 값이라 **아무것도 안 옮긴 것과
 *    같다**. 패널 안에서 `--color-text-*` 를 통째로 덮는 CSS 안도 기각했다:
 *    그 패널에는 컨트롤 아닌 소비처(제목·통계·힌트)가 더 많고 **그 전부가 같이
 *    바뀐다** — 재지 않은 회귀를 무료로 사는 셈이다. 축은 켠 자리만 바뀌고
 *    계약으로 잠긴다(패널 램프는 **잉크로만** 나갈 수 있고, 신호 3종·인디고는
 *    scope 를 안 탄다). 두 램프가 같아지면 축의 근거가 사라지므로, 계약이
 *    globals.css 의 8개 값을 직접 읽어 **다름을 단언**한다 — 같아지는 날
 *    빨개져 축을 지우라고 말한다. 7개 회수(나머지는 다른 구멍과 겹친다).
 * 2. **메움 ✅ — 채움 컨트롤의 전경색(on-accent)이 없다** — 인디고를 배경으로 깔면 글자는
 *    `text-white` 인데 `tone` 여덟에 그 자리가 없다(5). 그리고 이게 **짝을
 *    끌고 간다**: 폴더 열기 시트의 세로 2연 버튼은 위가 채움(h-9)이라 아래
 *    중립만 램프(34px)로 옮기면 둘의 키가 어긋난다. 한 벌로 읽히는 세트는
 *    **같이 옮기거나 같이 남는다**.
 *    **어떻게 메웠나**: 토큰 `--color-text-on-accent`(#fff, 인디고 위 4.71:1
 *    = AA 통과) + `tone: 'onAccent'`. 잉크만 내면 소비처가 `bg-…`/무게를 계속
 *    손으로 쓰므로 **바탕·무게·잉크를 한 쌍으로** 낸다(`active: true` 가 이미
 *    쓰는 문법). 무게는 실측 13:2 로 semibold 가 규격이고, medium 2건은 편차라
 *    정규화했다. 보더는 톤이 지운다 — 채운 주 동작은 테두리가 없다. 3개 회수,
 *    남은 자리는 `h-9`(36px)·`px-4` 처럼 **다른** 구멍에 동시에 걸린 것들이다.
 * 3. **메움 ✅ — 보더 없는 인셋(고스트) 모양이 없다** — `chip`·`pill`·`card`·`tile` 은
 *    보더가 필수, `link` 는 인셋이 0이다. 그 사이(패딩은 있고 보더는 없는
 *    「고스트 버튼」·세그먼트 항목)가 비어 있다(9). 2·3 라운드가 각각 「보더
 *    있는 상자 속 보더 없는 컨트롤」·「세그먼트 탭」으로 보고한 것과 **같은
 *    구멍**이다 — 세 라운드 연속으로 나왔다.
 *    **어떻게 메웠나(2026-08-03 값 층 라운드)**: 여덟째 모양 `shape: 'segment'`
 *    — 보더 0 · 인셋 있음 · `rounded-chip`. 반경은 소비처가 쓰던
 *    `--chrome-radius-inner` 가 `--radius-chip` 의 **별칭**이라 픽셀 변화 0이고,
 *    그 별칭 사실 자체를 계약이 CSS 에서 읽어 잠근다. 크기 `md` 는 실측 최빈
 *    (`px-2 py-1`/`text-label`)이라 6자리가 그대로 들어왔다. 12개 회수.
 * 4. **`sm` 아래가 없다** — 램프의 최소는 `px-2 py-1`/`text-caption`(칩 24px).
 *    앱에는 그 아래 한 층이 실재한다: mono 마이크로 명령 태그(`px-1.5 py-0.5`/
 *    `text-[9px]`, ~17px) 4개, 알림 벨(`h-6`/`px-1`), 크롬 스트립. 옮기면
 *    +7px 이라 자기 줄을 깬다. 2 라운드의 「4px 인셋」 보고가 실은 **크기 램프에
 *    바닥 한 칸이 없는 것**이었다.
 * 5. **`tone` 셋의 역할이 서로 다르다** — `danger` 는 **글자 역할** 토큰
 *    (`--color-danger-text`)을, `success`/`warning` 은 **신호 역할** 토큰
 *    (`--color-status-*`)을 가리킨다. 그래서 성공 틴트 위의 글자
 *    (`--color-success-text-a94`, 창백한 민트)를 `tone: \'success\'` 로 옮기면
 *    #32b97d 로 **색이 바뀐다**. 억지로 맞추지 않고 남겼다(2).
 *
 * 곁가지 둘: ⓐ `text-label` 을 내면서 **짝인 `tracking-label` 은 안 낸다** —
 * 타입 램프가 1:1 짝을 선언해 두었는데 값 층이 반쪽만 낸다. ⓑ `link` 의
 * `min-h-11` 은 이 저장소가 이미 가진 `touch-hit-expand`(coarse 전용 의사요소,
 * 레이아웃 0)와 **경쟁**한다. 둘 다 걸면 카드가 44px 씩 벌어져서, 실제로는
 * 「`touch-hit-expand` 를 이미 쓰는가」가 `inline` 의 진짜 판정 기준이 됐다.
 *
 * ## 위젯 라운드가 남긴 47개 — 값 층에 자리가 없다
 *
 * | 구멍 | 남은 수 | 무엇이 없나 |
 * |---|---:|---|
 * | **크롬 토큰이 치수를 소유한다**(= 지도 뷰 라운드의 구멍 ②) — **일부 메움 ◐**: `fixedHeight` 가 `--control-h-{sm,md,lg}`(28/32/40) 3단을 받는다. 36px(`--chrome-tile-size`)·44px·가변 토큰은 여전히 밖이다 | 15 | `--overlay-close-size` · `--topology-search-sheet-close-size` · `--topology-shortcut-sheet-close-size` · `--git-row-h` · `--git-setup-action-height` · `--app-nav-rail-tile-*`. 램프의 `fixedHeight` 는 32px 한 단뿐이라 36/44/가변 토큰을 못 받는다 |
 * | **별도 잉크 계열** — **메움 ✅**(`scope: 'panel'`) | 8 | `full-detail-a1` 전체가 `--topology-v2-panel-text-*`(#a3a3ac …) 로 산다. tone 8종은 전부 `--color-text-*` 이라, 옮기면 잉크가 바뀌거나 tone 을 className 으로 덮어야 한다 = 층 무력화. **features 라운드의 구멍 1과 같은 것**이고, 두 라운드가 독립으로 같은 결론에 닿았다(그쪽 11 + 여기 8) |
 * | **밀집 행 속 보조 토글** | 5 | `link` 의 `min-h-11` 은 홀로 선 컨트롤엔 옳지만 체크박스 행·컴포저 메타 줄·이고 카드 이웃 목록에 실으면 행이 2~3배가 된다. `inline` 축은 「문장 속」만 면제하고 「밀집 행 속」을 못 말한다 |
 * | **보더 없는 세그먼트·탭**(= features 라운드의 구멍 3, 네 라운드 연속) — **메움 ✅**(`shape: 'segment'`) | 6 | 이미 보더를 두른 상자 안의 라디오(에이전트 범위 · 단축키 스코프), 밑줄 탭(커밋 렌즈), 보더 없는 pill(필터 지우기). `chip`/`pill` 은 보더가 필수라 상자 속 상자가 된다 |
 * | **채운 인디고 주 동작**(= features 라운드의 구멍 2, on-accent 전경색 없음) — **메움 ✅**(`tone: 'onAccent'`) | 6 | 테두리 없음 + 흰 글자. `chip`/`pill`/`card` 는 보더 필수이고 `<Button>` 은 h-10·`text-body-lg` 로 훨씬 크다. 그 사이가 비어 있다 |
 * | **그리드 행** | 3 | `STEP_ROW` 는 3열 그리드(`grid-cols-[…]`)로 정렬이 정체성이다. `row` 는 flex 전용 |
 * | **문장 속 칩** | 1 | 인용 칩은 `align-baseline`·`py-px` 로 글줄 안에 산다. `inline` 축이 `link` 에만 있다 |
 * | **pill 의 얕은 세로 인셋** | 2 | 램프는 2·2·4px 인데 실제 필터 pill 은 6~10px 을 쓴다. 위 크기로 올리면 타입까지 함께 커진다(caption→body) |
 * | **깊은 인셋 목록 행** | 1 | 커밋 파일 행의 `px-5`(20px) 들여쓰기가 위계를 나른다. `row` 의 최대는 `px-3` |
 *
 * ## 이전 라운드가 남긴 것(설정 5 · 지도 9) — 셋 중 하나다:
 *
 * 1. **소유자 판정이 문자열로 못박혀 있다** —
 *    `settings-sheet-type-dialect.contract.test.ts` 가 `Choice`·`SegmentSwitch`·
 *    알림 칩·LNB 항목의 클래스를 정규식으로 고정한다. 게이트가 지키는 값을
 *    이 전환이 되돌리지 않는다(4).
 * 2. **보더 있는 컨테이너 안의 보더 없는 컨트롤** — 발자국 프리셋 3종은
 *    `border` 를 두른 세그먼트 상자 안에 산다. `chip` 은 보더가 필수라
 *    상자 속 상자가 된다(1 파일 · 반복 3).
 * 3. **램프의 최소 인셋(8px)이 이 패널의 4px 위에 선다** — INDEX 접기 헤더 ·
 *    경계 토글. 옮기면 그 행만 자기 형제들과 어긋난다(2).
 *
 * 나머지 6(세그먼트 탭 3 · 창 선택 칩 · 세로 엣지 탭 · 캔버스 앵커 원형 버튼 ·
 * 트리 셰브론)은 일곱 모양 어디에도 없다.
 *
 * 뷰 라운드가 남긴 8개(2026-08-03)는 **값 층의 새 구멍 셋**을 가리킨다:
 *
 * 1. **보더 있는 아이콘 정사각이 없다** — `icon` 은 정의상 보더가 없다
 *    (`「link`/`row`/`icon` 은 보더가 없다」). 그런데 큐 행의 케밥 트리거는
 *    `h-8 w-8` + `border` 다. 보더를 `className` 으로 넣으면 **모양을 넘기는
 *    것**이라 층이 무력해진다(1 — `QueueRowActions` 케밥).
 * 2. **메움 ✅ — 28px 칩 스텝이 없다** — 칩 램프는 24(sm)/30(md)/32(fixedHeight)를 내는데
 *    저장소에는 `rounded-chip` + `h-7`/`min-h-7` 이 18곳 있다. 이번에 옮긴
 *    인계 복사 칩의 compact 도 28 → 30 으로 올라갔다. `row` 는 28 을 정확히
 *    내는데 칩은 못 낸다 — 축이 갈린 것이지 값이 틀린 게 아니다
 *    (1 — `/download` 체크섬 복사. 관문 표면이라 4px 을 옮기지 않았다).
 *    **어떻게 메웠나**: `fixedHeight` 를 한 단(32)에서 **`--control-h-*` 3단**
 *    (sm 28 · md 32 · lg 40)으로 넓혔다. 값은 지어낸 것이 아니라 globals.css 에
 *    이미 있던 컨트롤 높이 램프이고, Tailwind `h-7`/`h-8`/`h-10` 이 정확히 그
 *    셋이라 arbitrary 를 안 쓴다. `true` 는 `md` 의 별칭으로 남겨 **기존 소비처
 *    출력이 한 바이트도 안 바뀐다**(계약이 이 별칭을 단언한다).
 * 3. **`card` 가 단행(`items-center`) 고정이다** — 아이콘 + 제목 + 설명 두 줄인
 *    선택 카드는 `items-start` 여야 한다. 첫 실행 3개가 여기서 걸린다
 *    (3 — `FirstRunPage`). 앞 라운드의 「한 벌로 읽혀야 하는 세트」와 같은 구멍이
 *    두 번째로 나왔으니 다음 라운드는 이걸 먼저 본다.
 *
 * 나머지 3(에이전트 복사 칩의 `font-mono` + `active:translate-y` 방언 ·
 * 데모 영상 위 전면 오버레이 재생 버튼 · 도메인 결합 히트맵의 `role="gridcell"`)
 * 은 일곱 모양 어디에도 없다.
 *
 * ## 값 층 라운드가 **안 만든 것** — 안 만든 것도 결론이다
 *
 * `/gate-probe` 의 1단계 규율("소음이 신호를 덮으면 룰을 만들지 않는다")을 축에도
 * 적용했다. **소비처를 하나도 못 대는 축은 만들지 않는다** — 이 저장소가 이미
 * 그 실패를 했다(사용처 0인 프리미티브 셋, `control-class.ts` 머리말).
 *
 * | 원장이 요구한 것 | 안 만든 이유(실측) |
 * |---|---|
 * | `card` 의 `items-start`(다행 카드) | 축 하나로 안 열린다. 알려진 소비처 셋을 재 보니 **`items-start` 말고도 2축 이상**이 어긋난다 — `FirstRunPage` 3개는 `grid-cols-[32px_1fr]`(그리드 템플릿이 정체성) · `rounded-chip`(카드는 `rounded-card`) · `px-4 py-3.5`(램프는 `px-3.5 py-2`), `DesktopVaultWelcome` 4개는 반경 0의 풀블리드 행에 `px-4 py-4`. 정렬만 열어도 **한 자리도 안 들어온다** = 사용처 0인 축이 된다. 진짜 구멍은 「다행 목록 행」의 **인셋 열**이고 그건 디자인 판단이지 축이 아니다 |
 * | `text-<step>` 의 짝 `tracking-<step>` | 값 층에서 낼 수는 있으나 **오늘 244개의 폭이 전부 바뀐다**(0.02em × 11px ≈ 6글자 칩 기준 +1.3px). 정직한 고침은 globals.css 에 `--text-<step>--letter-spacing` 을 묶는 것이고, 그건 램프 전 소비처가 대상이라 자체 실측 라운드가 필요하다. 옮긴 자리는 `tracking-label` 을 `className` 으로 유지했다 |
 * | `active` vs 「선택」 축 분리 | 세그먼트 12자리를 재니 **12/12가 인디고 틴트 배경**이었고 갈린 것은 잉크뿐(primary 11 · indigo-accent 1). 방언 하나를 위해 축을 만드는 대신 **다수로 정규화**했다(발자국 프리셋 3개의 선택 잉크가 indigo-accent → text-primary, 배경 a13 → a16) |
 * | `--chrome-radius-inner`(7px) | **구멍이 아니었다.** globals.css 에서 이 토큰은 `var(--radius-chip)` = 6px 의 별칭이다. 원장의 「7px」은 낡은 기록이고, `segment` 가 `rounded-chip` 을 쓰는 근거가 여기 있다 |
 * | `row` 의 4px/`px-1.5` 인셋 · `sm` 아래 한 칸 · 보더 있는 아이콘 정사각 · `pill` 의 세로 인셋 | 손 안 댐. 넷 다 **크기 램프의 바닥/천장을 넓히는** 일이고, 넓히면 오늘 244개가 쓰는 단의 의미가 같이 움직인다. 다음 라운드의 입력으로 남긴다 |
 *
 * ## 잔여 라운드(2026-08-03)가 찾은 구멍 — 넷이고, 셋은 **재확인이 아니라 정량화**다
 *
 * 남긴 48개를 사유로 묶으니 넷이었다. 규칙 4(「몇 개가 막혔나를 세라」)대로
 * 부류마다 수를 붙인다.
 *
 * 1. **크기 램프가 인셋과 타입을 한 단으로 묶는다** (9). 램프는 `px-3 ⇒
 *    text-body` 처럼 인셋과 글자 크기를 **짝으로만** 낸다. 그런데 앱에는
 *    「큰 인셋 + 작은 글자」가 실재한다 — 모노 마이크로 CTA
 *    (`SearchPalette` 3 · `ProjectDrawer` 1 · `GlobalSearch` 1: `px-3 py-1.5`
 *    또는 `px-3 py-2` 에 `text-caption`), 성공 틴트 액션
 *    (`OntologyStarterCta` 2: `px-3` 에 `text-label`), 설정 알림 칩
 *    (`px-2.5` 에 `text-body`, 계약 고정), `MarkdownField` 탭
 *    (`px-2.5` 에 `text-[10px]`).
 *    **이 부류는 「못 옮긴다」가 아니라 「옮기면 타입이 바뀐다」이다** — 이번에
 *    옮긴 에이전트 중지/보내기 2개가 정확히 그 값을 치렀다(`px-3`+`text-label`
 *    → `lg` 를 따르며 11 → 12.5px). 인셋만 고르고 타입을 따로 고르게 하는
 *    것은 축을 하나 더하는 일이라 **규칙 1**에 걸린다. 그러니 답은 축이 아니라
 *    **어느 쪽이 규격인지 정하는 것**이고, 그건 「체계」의 일이다.
 *
 * 2. **`chip`/`pill` 의 기본 보더가 앱의 다수와 다르다** (2 — 이번에 옮기며
 *    치른 값). 램프 기본은 `--color-divider`(0.08). 그런데 칩 반경을 가진
 *    원소의 보더 색 전수는 **`--color-border-soft`/`--chrome-border`(0.06) 74
 *    대 `--color-divider`(0.08) 18** 로 4:1 이다(`--chrome-border` 는
 *    `--color-border-soft` 의 별칭이라 크롬 표면 전체가 0.06 쪽이다).
 *    그래서 칩을 램프로 옮길 때마다 보더가 **조용히 한 단 진해진다.**
 *    규칙 0 의 형태 그대로다 — 다수를 찾지 않고 기본값을 정했다.
 *
 * 3. **`scope: 'panel'` 이 잉크만 연다 — 보더와 인디고는 여전히 밖이다** (7).
 *    축을 만들 때의 논거는 「무채 램프가 패널 바탕 위에서 갖는 두 번째 해」
 *    였다. 그 논거는 **보더와 인디고에도 똑같이 성립하는데 축이 안 연다**:
 *    `--topology-v2-panel-border`(#2a2a30) · `--topology-v2-panel-divider`
 *    (#23232a) · `--topology-v2-indigo-bright`(**#8890e0**, 전역
 *    `--color-indigo-accent` #7170ff 와 다른 값).
 *    값 층은 주석에서 *"패널 램프에는 신호 3종도 인디고도 없다"* 고 단언하지만
 *    **실제로는 있다.** 이 이유로 못 옮긴 자리: `FullDetailA1` 액션 2개
 *    (인셋·타입이 `chip`/`lg` 와 **바이트 일치**인데 색만 밖) · reach 스텝 칩 ·
 *    `FirstRunStarterModule` 투어 CTA · `TopologyIndexPanel` 창 칩 ·
 *    `TopologyIndexTab` · `TopologyMapV2` 앵커.
 *
 * 4. **사다리 복원(#884)이 세 모양에만 닿았다 — 18개 조합 중 7개만 사다리 위다.**
 *    이 라운드는 `fixedHeight` 제거 전에 재고 후에 다시 쟀는데, 그 사이에
 *    #884 가 칩/pill 에 `min-h-8` 을 넣었다. 그래서 이번에 옮긴 `h-9`(36px)
 *    버튼 넷이 **정확히 `--control-h-md`(32) 위에 앉았다** — 사다리가 실제로
 *    작동한 첫 실측이다.
 *
 *    그런데 **여덟 모양 × 세 단을 전수로 재 보니 절반이 아직 밖이다**
 *    (2026-08-03, 1512×860 · 다크 · 실측). 사다리는 **28 / 32 / 40**:
 *
 *    | 모양 | sm | md | lg |
 *    |---|---:|---:|---:|
 *    | chip | 24 | **32** | **32** |
 *    | pill | 24 | **32** | **32** |
 *    | segment | 22 | 24 | **32** |
 *    | row | **28** | 36 | 42 |
 *    | card | 30 | 34 | **40** |
 *    | icon | 24 | **28** | **32** |
 *
 *    읽히는 것 셋: ① **18개 중 7개만** 사다리 값이다 — 22 · 24 · 30 · 34 ·
 *    36 · 42 는 여전히 이 앱의 높이 어휘 밖이다. ② **`chip`/`pill` 은 md 와 lg
 *    의 높이가 같다**(둘 다 32) — 크기 축이 세 단인데 실제 높이는 두 종이고,
 *    그래서 「한 단 크게」가 높이로는 아무 일도 안 한다. ③ **칩 계열에 40px
 *    (`--control-h-lg`) 단이 없다** — 40px 주 동작(`FirstRunStarterModule`
 *    `h-10`)은 `card`/`lg` 로만 갈 수 있는데 그건 반경이 9px 이라 칩이 아니다.
 *
 *    **다음 라운드의 첫 입력은 이 표다.** 규칙 0 이 잡아낸 것은 값 하나가
 *    아니라 **패딩이 높이를 정하게 두는 방식** 자체였고, `min-h-*` 은 그
 *    셋만 고쳤다.
 *
 * 곁가지 둘: ⓐ **「떠오르는 세그먼트」가 없다**(2) — `segment` 의 눌림은 인디고
 * 틴트 한 가지인데, 트랙 위에 `--color-panel` 썸이 떠오르는 방언이 둘 있고
 * (`LocaleSwitch` · 설정 `SegmentSwitch`) 그중 하나는 계약이 문자열로 고정한다.
 * ⓑ **타입 스텝을 안 내는 자리가 없다**(2) — 모양 여덟이 전부 크기를 강제하므로,
 * 부모 글자 크기를 **상속해야** 하는 문장 속 컨트롤(`AgentProposalCard` 인용
 * 링크 · `ProjectForm` 디스클로저 헤더)은 구조적으로 못 들어온다.
 *
 * ## 이 수가 **과다 계상**이라는 것 — 알고 두는 한계
 *
 * 세는 것은 여는 태그 안의 **리터럴** `controlClass(` 다. 그래서 램프를 통과한
 * 완성 클래스를 상수로 뽑아 `className={SHARED}` 로 쓴 컨트롤은 여기서
 * 「손으로 쓴 것」으로 잡힌다. 안전한 방향의 오차이지만(과소 계상은 없다),
 * **공유 상수로 뽑는 옳은 리팩터에 벌점을 준다.** 그래서 이 라운드는 잉크만
 * 상수로 공유하고 램프 호출은 자리마다 인라인으로 썼다.
 */
const BASELINE_HAND_WRITTEN_CONTROLS = 123;

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

function countHandWrittenControls(): { total: number; byFile: Array<[string, number]> } {
  const byFile: Array<[string, number]> = [];
  let total = 0;
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const source = readFileSync(file, 'utf8');
      // `const X = controlClass({…})` / `const X = cn(controlClass({…}), …)` 의 이름들.
      const systemConstants = [...source.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=[^;\n]*controlClass\s*\(/g)].map(
        (m) => m[1],
      );
      let n = 0;
      for (const m of source.matchAll(/<button\b/g)) {
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
         *
         * 그래서 같은 파일 안에서 `controlClass(...)` 로 만든 상수의 이름을 모아,
         * 그 이름을 쓰는 태그도 통과시킨다. 안전 방향(과소 계상)이 아니라 정확
         * 방향이다 — 그 상수는 실제로 시스템을 통과한 값이다.
         */
        if (/controlClass\s*\(/.test(tag)) continue;
        if (systemConstants.length > 0 && systemConstants.some((name) => new RegExp(`\\b${name}\\b`).test(tag))) continue;
        n += 1;
      }
      if (n > 0) {
        byFile.push([file, n]);
        total += n;
      }
    }
  }
  byFile.sort((a, b) => b[1] - a[1]);
  return { total, byFile };
}

describe('컨트롤 채택 래칫', () => {
  const { total, byFile } = countHandWrittenControls();

  it('손으로 쓴 컨트롤이 늘지 않는다 — 새 컨트롤은 controlClass() 를 쓴다', () => {
    expect(
      total,
      `손으로 className 을 쓴 <button> 이 ${BASELINE_HAND_WRITTEN_CONTROLS} → ${total} 로 늘었다.\n` +
        `새 컨트롤은 \`controlClass({ shape })\` 를 쓴다 — 모양 여섯은 실측에서 나왔고 ` +
        `(칩 128 · 링크형 85 · 행 39 · 아이콘 36 · pill 32 · 카드 18), 램프 밖 값을 못 낸다.\n` +
        `가장 많은 파일: ${byFile.slice(0, 3).map(([f, n]) => `${f}(${n})`).join(' · ')}`,
    ).toBeLessThanOrEqual(BASELINE_HAND_WRITTEN_CONTROLS);
  });

  it('줄었으면 기준선도 내린다 — 여유를 무료로 두지 않는다', () => {
    // 래칫의 나머지 절반. 고치고 기준선을 안 내리면 그만큼이 조용히 되돌아갈 수 있다.
    expect(
      total,
      `손으로 쓴 컨트롤이 ${BASELINE_HAND_WRITTEN_CONTROLS} → ${total} 로 줄었다. ` +
        `이 파일의 BASELINE_HAND_WRITTEN_CONTROLS 도 ${total} 로 내려라.`,
    ).toBeGreaterThanOrEqual(BASELINE_HAND_WRITTEN_CONTROLS);
  });

  it('탐지기가 실제로 세고 있다 — 0을 통과로 읽지 않는다', () => {
    // 워크가 조용히 빈 집합을 돌면 위 둘이 «항상 통과» 가 된다. 그건 게이트가
    // 없는 것과 구별되지 않는다.
    expect(total, '한 건도 못 셌다면 파서나 경로가 깨진 것이다').toBeGreaterThan(0);
    expect(byFile.length, '파일별 집계가 비었다').toBeGreaterThan(10);
  });
});
