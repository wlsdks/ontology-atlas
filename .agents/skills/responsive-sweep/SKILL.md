---
name: responsive-sweep
description: Live-verify a UI change across the tablet/laptop/wide breakpoint matrix with chrome-devtools — resize through the band widths, probe occlusion with elementFromPoint, check bottom-tab-bar reserve clearances, and screenshot the key states. Use after any change touching layout, floating panels, chrome rows, or breakpoint-gated markup, before claiming "responsive is fine". Static reasoning about Tailwind variants misses cascade-order and overlap defects that only rects reveal.
---

# /responsive-sweep — 화면 폭을 바꿔 가며 직접 재 본다

먼저 이 문서에 계속 나오는 말 셋:

- **브레이크포인트** — 화면 폭이 이 값을 넘으면 레이아웃이 바뀌도록 정해 둔 경계
  폭(`md`=768px · `lg`=1024px …).
- **rect** — 요소가 화면에서 실제로 차지하는 사각형(`getBoundingClientRect()` 가
  주는 위치와 크기). 「겹쳐 보인다」가 아니라 「18px 파고들었다」로 말하게 해 준다.
- **크롬**(chrome) — 내용이 아니라 내용을 감싸는 UI 틀(헤더 · 툴바 · 탭바 ·
  사이드 패널).

반응형 결함은 코드만 봐서는 안 잡힌다 — 실제로 겪은 3건이 근거다: ① `max-lg:pb-*`
가 `md:py-*` 보다 스타일시트에서 **먼저** 나오는 바람에 768–1023px 구간에서 아무
신호 없이 밀렸다(아래쪽 여백이 16px 로 줄어든 것을 재 보고서야 발견) ② 상단 크롬
세 개가 서로 겹쳤다(rect 를 재서 79px 파고든 것을 확인) ③ 탭바에 가려 콘텐츠를
누를 수 없었다(`elementFromPoint` 로만 확정됐다). 이 스킬은 그 재 보는 절차를
표준으로 만든 것이다. (2026-07-23 태블릿 소탕 라운드에서 확립.)

## 폭 매트릭스

바꾼 화면이 닿는 구간만 골라 재도 되지만, 전부 훑을 때는 이 7폭이 기준이다:

| 폭×높이 | 구간 | 브레이크포인트 관계 |
|---|---|---|
| 600×900 | 폰/소형 태블릿 세로 | <md — INDEX 가 화면을 가득 채우는 시트로 바뀜 |
| 768×1024 | 태블릿 세로 | md 경계 — 사이드 패널 시작, 탭바 존재 |
| 834×1112 | 11" 태블릿 | md–lg 사이 |
| 1024×768 | 태블릿 가로/12.9" 세로 | lg 경계 — 좌측 세로 내비 시작, 탭바 사라짐 |
| 1440×900 | 14" 노트북 | xl–2xl 사이 — 라벨이 단계적으로 줄어드는 구간 |
| 1920×1080 | FHD | 2xl+ — zoom 1.15 |
| 2560×1440 | QHD | zoom 1.3 |

## 루프 (폭마다)

1. `resize_page` 로 폭을 바꾸고 대상 URL 로 `navigate_page` (검증하려는 상태를
   URL 로 재현한다 — `?index=expanded`, `?recent=auto` 등).
   **`?guides=off` 를 항상 함께 붙인다** (2026-07-28) — 첫 방문 안내가 반투명
   막으로 화면을 덮으면 `elementFromPoint` 가 전부 그 막을 돌려줘서, 겹침·가림
   판정이 통째로 무의미해진다. 안내 화면 자체의 반응형을 볼 때만 `?guides=reset`.
   이 목록이 있는 곳은 한 곳뿐이다: `features/guided-tour/model/first-run-seen.ts`.
2. **rect 를 직접 잰다** — `evaluate_script` 로:
   - 화면에 고정돼 떠 있는 요소끼리 겹치는지: 의심되는 요소들의
     `getBoundingClientRect()` 를 받아 겹친 폭을 계산해 수치로 남긴다
     ("겹쳐 보인다"가 아니라 "18px 파고들었다").
   - **클릭이 막히는지**: 누를 수 있는 요소의 한가운데 좌표에
     `document.elementFromPoint(cx,cy)` 를 던져 본다 — 돌아온 것이 그 요소(또는
     그 안의 요소)가 아니면 무엇이 가로채고 있는지 기록한다.
   - **탭바가 가리지 않게 비워 둔 아래 여백** (<lg 구간만):
     `nav[data-tabbar="primary"]` 의 top 과, 끝까지 스크롤한 뒤 마지막 콘텐츠
     요소의 bottom 을 비교한다 — 콘텐츠가 탭바 top 을 넘어가면 결함이다. 화면
     아래에 붙는 패널(INDEX·판독계·데이터시트)도 bottom 이 탭바 top 보다 위인지
     확인한다.
3. `take_screenshot` — 전후를 남겨 눈으로도 같이 본다.

## 이미 정해져 있는 규칙 (판정 기준)

- `docs/DESIGN-SYSTEM.md` 의 "Touch & tablet responsive contract" 절이 기준이다:
  탭바가 있는 구간(<lg)에서 화면 아래에 붙는 패널과 스크롤 끝은
  `--topology-mobile-bottom-tab-reserve` 만큼 자리를 비워 둬야 한다 — "탭바 뒤에
  가려짐"은 결함이다. `<md` 에서 펼친 INDEX 는 화면을 가득 채우는 시트가 된다.
  손가락으로 누르는 기기의 44px 최소 크기는 `@media (pointer: coarse)` 한 곳에서만
  정한다.
- **CSS 순서 함정**: `max-*` 로 시작하는 변형이 `min-*` 변형보다 스타일시트에서
  먼저 나올 수 있다 — 그러면 `max-lg:pb-X` + `md:py-Y` 조합은 768–1023px 에서
  `pb` 쪽이 진다. 조건 없는 기본값 + `lg:` 덮어쓰기처럼 순서가 확실한 방식을 쓰고,
  실제로 계산된 `paddingBottom` 을 반드시 재서 확인한다.
- 상단 유틸리티 줄은 폭이 좁아지면 칩이 단계적으로 줄어들기로 돼 있다(2xl 미만에서
  단축키 표시를 접고, 토글류의 라벨을 접는다) — 칩을 새로 추가했으면 1440px 에서
  검색 줄과 겹치는 폭을 재라.

## 보고

「폭 × 화면」 표로: 통과/결함(수치 근거), 스크린샷을 찍은 지점, 적용한 수정과
고친 뒤 다시 잰 값. "습관적으로 전 구간 훑기"는 하지 않는다 — 변경이 닿는 구간부터
재고, 전 구간 훑기는 레이아웃·크롬·브레이크포인트 관련 검사를 바꿨을 때만 한다.
