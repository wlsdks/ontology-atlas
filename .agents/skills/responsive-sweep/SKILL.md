---
name: responsive-sweep
description: Live-verify a UI change across the tablet/laptop/wide breakpoint matrix with chrome-devtools — resize through the band widths, probe occlusion with elementFromPoint, check bottom-tab-bar reserve clearances, and screenshot the key states. Use after any change touching layout, floating panels, chrome rows, or breakpoint-gated markup, before claiming "responsive is fine". Static reasoning about Tailwind variants misses cascade-order and overlap defects that only rects reveal.
---

# /responsive-sweep — 브레이크포인트 매트릭스 실측

반응형 결함은 코드만 봐서는 안 잡힌다 — 실례 3건이 근거다: ① `max-lg:pb-*`
가 `md:py-*` 보다 스타일시트 앞에 emit 되어 768–1023 에서 조용히 패배(예약고
16px 실측으로만 발견) ② 상단 크롬 3표면 겹침(rect 실측 79px 침범) ③ 탭바
뒤 콘텐츠 도달 불가(elementFromPoint 로만 확정). 이 스킬은 그 실측 루프를
표준화한다. (2026-07-23 태블릿 소탕 라운드에서 확립.)

## 폭 매트릭스

대상 표면이 닿는 밴드만 골라도 되지만, 전면 스윕은 이 7폭이 기준이다:

| 폭×높이 | 밴드 | 브레이크포인트 관계 |
|---|---|---|
| 600×900 | 폰/소형 태블릿 포트레이트 | <md — INDEX 풀-블리드 시트 모드 |
| 768×1024 | 태블릿 포트레이트 | md 경계 — 사이드 패널 시작, 탭바 존재 |
| 834×1112 | 11" 태블릿 | md–lg 사이 |
| 1024×768 | 태블릿 랜드/12.9" 포트 | lg 경계 — nav-rail 시작, 탭바 소멸 |
| 1440×900 | 14" 노트북 | xl–2xl 사이 — 라벨 사다리 구간 |
| 1920×1080 | FHD | 2xl+ — zoom 1.15 |
| 2560×1440 | QHD | zoom 1.3 |

## 루프 (폭마다)

1. `resize_page` → 대상 URL `navigate_page` (상태 파라미터 포함 —
   `?index=expanded`, `?recent=auto` 등 검증 상태를 URL 로 재현).
2. **rect 실측** — `evaluate_script` 로:
   - 고정/절대 요소끼리 겹침: 의심 요소들의 `getBoundingClientRect()` 를
     받아 교차 폭을 계산해 수치로 남긴다 ("겹쳐 보임"이 아니라 "18px 침범").
   - **클릭 차단**: 상호작용 요소 중심점에 `document.elementFromPoint(cx,cy)`
     — 반환이 그 요소(또는 자손)가 아니면 무엇이 가로채는지 기록.
   - **탭바 예약고** (<lg 만): `nav[data-tabbar="primary"]` 의 top 과, 스크롤
     끝까지 내린 뒤 마지막 콘텐츠 요소 bottom 을 비교 — 콘텐츠가 탭바 top
     을 넘으면 결함. 하단 앵커 패널(INDEX·판독계·데이터시트)도 bottom 이
     탭바 top 미만인지 확인.
3. `take_screenshot` — before/after 를 남겨 시각 판정 병행.

## 알려진 계약 (판정 기준)

- `docs/DESIGN-SYSTEM.md` "Touch & tablet responsive contract" 절이 규범:
  탭바 구간(<lg)의 하단 앵커/스크롤 끝은 `--topology-mobile-bottom-tab-reserve`
  계약 필수 — "탭바 뒤 가려짐"은 결함. `<md` 확장 INDEX 는 풀-블리드 시트.
  coarse-pointer 44px 은 `@media (pointer: coarse)` 단일 출처.
- **캐스케이드 함정**: `max-*` 변형은 `min-*` 변형보다 스타일시트 앞에
  emit 될 수 있다 — `max-lg:pb-X` + `md:py-Y` 조합은 768–1023 에서 pb 가
  질 수 있으니 base + `lg:` 오버라이드의 결정론 구성을 쓰고, 반드시
  computed `paddingBottom` 을 실측한다.
- 상단 유틸리티 레인은 칩 축약 사다리(<2xl kbd 접기, 토글류 <2xl 라벨
  접기)가 계약 — 칩을 추가했으면 1440 에서 검색 레인과의 교차 폭을 재라.

## 보고

폭×표면 표로: 통과/결함(수치 근거), 스크린샷 포인트, 적용한 수정과 after
실측. "습관적 전체 스윕"은 하지 않는다 — 변경이 닿는 밴드 우선, 전면
스윕은 layout/chrome/브레이크포인트 게이트 변경 시에만.
