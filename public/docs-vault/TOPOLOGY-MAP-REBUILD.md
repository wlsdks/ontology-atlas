# 지도(Relief) 뷰 재구성 설계 — 단일 컨테이너 변환 아키텍처

> 2026-07-03. 소유자 결정: "지도쪽이 부드럽지도 않고 버벅거림 — 전체 재구성".
> 이 문서는 다음 세션이 바로 구현에 들어가기 위한 단일 진실원이다.
> 브랜치: `feat/topology-map-rebuild` (main = PR #305 머지 직후).

## 1. 증상과 실측 근거

- **실측 프레임은 문제없다**: 설치 앱 frame-profile 프로브
  (`pnpm desktop:verify-topology-frame-profile:ko`) 기준 지도 뷰 팬/호버/줌
  전부 avg 8.3~11.6ms (120Hz). 소유자가 느끼는 "버벅임"은 fps 가 아니라
  **모션 문법의 부재**다.
- 버벅임의 실체 3가지:
  1. **매 프레임 DOM 동기화** — Sigma 카메라가 움직일 때마다 afterRender 훅이
     카드 22~50개 각각의 style 을 재계산·재기록. 카드들이 각자 따로 미세하게
     떨리고, 브라우저 합성 최적화가 불가능한 구조.
  2. **펼침/접기 = 좌표 순간이동** — reveal 재배치가 트랜지션 없이 순간 적용.
     카드가 어디서 와서 어디로 갔는지 시각적 연속성이 없다.
  3. **줌 렌즈 강등 점프** — 줌인하면 카드가 1글자 글리프로 순간 강등
     (기획자 감사 ②: "줌인 = 정보 감소" 역전).

## 2. 현 구조 (문제의 원천)

- `src/widgets/topology-map-sigma/ui/SigmaSkeletonCards.tsx` — **10,900+ 줄**.
  DOM 카드 + SVG 커넥터를 Sigma WebGL 카메라에 per-frame 동기화.
- 좌표 소스: `HomePage` → `buildOntologySkeleton` + `computeRevealState` +
  `buildRevealRadialLayout` (결정론적, 이건 유지 가치 있음).
- Sigma 캔버스는 지도 모드에서 엣지를 그리지 않음 (카드 모드에선 hidden) —
  즉 지도에서 Sigma 의 실질 역할은 **카메라 상태 + 미니맵 + 배경 star dust** 뿐.

## 3. 목표 아키텍처 — 단일 컨테이너 변환 + FLIP

지도는 22~50개 카드의 **문서형 다이어그램**이다 (대량 시각화는 그래프 뷰 담당).

```
<div data-testid="topology-map-canvas">          ← 뷰포트 (overflow hidden)
  <div data-map-transform-container              ← 카메라 = 이 요소 하나의
       style="transform: translate(tx,ty) scale(k)">   CSS transform (GPU 합성)
    <svg>…contains 스파인 + 관계 커넥터…</svg>   ← 카드와 같은 좌표계, 한 몸
    <article data-skeleton-card style="left:x; top:y">…</article> × N
  </div>
</div>
```

핵심 계약:
- **카드 좌표는 배치 시 1회만 기록** (absolute px, 그래프 좌표계). 팬/줌 중
  DOM 쓰기 = 컨테이너 transform 1건. → 구조적으로 jank 불가능.
- **카메라**: 자체 상태 (tx, ty, k) — Sigma 카메라와의 동기화 제거. 배경
  star dust 가 필요하면 같은 transform 을 CSS 변수로 공유하는 저비용 캔버스
  1장 (또는 생략 — 기획자: 지도의 주인공은 구조선+카드).
- **펼침/접기 = FLIP**: 재배치 전 rect 스냅샷 → 새 레이아웃 적용 →
  invert transform → play (`--topology-motion-*` 토큰, 200ms 이내,
  `prefers-reduced-motion` 존중).
- **줌 = 점진 공개** (기획자 ② 해소): 줌인일수록 정보 증가 (카드 풀 유지 +
  접힌 하위 미리보기). 글리프 강등은 *줌아웃 밀도 초과* 구간에서만.
- **fit = 진짜 fit** (기획자 ③ 해소): 카드 px bounds ∪ + 좌패널 폭 오프셋
  기준 transform 계산 — 22개 전부 뷰포트 안 보장을 단위 테스트로 고정.

## 4. 보존해야 할 계약 (깨지면 안 되는 것)

- **인터랙션 문법** (2026-07-03 확정): 클릭=선택만(지형 불변) ·
  배지(`data-skeleton-card-expand`)=펼치기(→ `mode=focus`) · 닫기=접기
  (→ overview). 더블클릭=펼치기.
- **URL/모드**: `mode=overview|graph|focus|path|health` + `p=` — 전부 유지.
  2뷰 레일([지도|그래프] + 정리 칩)도 유지.
- **verify markers**: `scripts/verify-macos-app-launch.mjs` 와
  `src-tauri/src/lib.rs` 의 marker 수집이 참조하는 `data-*` 계약
  (`data-skeleton-card`, `data-skeleton-card-expand`, `topologyCard*`,
  `data-overview-hierarchy-spine`, drag cluster, selected relation 군).
  새 컨테이너에서 같은 이름을 재공급하거나, 검증기와 lib.rs 를 함께 갱신.
- **드래그**: 카드 드래그(pin/release + localStorage persist)와 드래그 클러스터
  의미 — physics 는 그래프 뷰 소관이므로 지도에선 "카드 위치 조정 + persist"
  수준이면 충분한지 PO 재확인.
- **토큰**: 색/모션/폭 전부 `--topology-*` 경유 (신규 hex/clamp 금지 —
  `docs/DESIGN-SYSTEM.md` 절차).
- **agent handoff**: 팝오버/분석 바의 브리프·프로필·영향 카피 계약 무변경.

## 5. 마이그레이션 순서 (슬라이스)

1. **S1 — 병렬 스캐폴드**: `src/widgets/topology-map-canvas/` 신설.
   컨테이너 transform + 정적 카드/커넥터 렌더 (기존 layout 함수 재사용).
   feature flag or `?mapEngine=next` 로 스위칭.
2. **S2 — 카메라**: 휠 줌(커서 앵커) + 드래그 팬 + fit + 미니맵 연동.
   프레임 프로파일 프로브로 팬/줌 DOM-write 0 검증.
3. **S3 — 인터랙션 이식**: 선택/배지 펼치기/닫기 + 팝오버 앵커 + 관계
   커넥터 클릭. url-state 는 무변경이므로 HomePage glue 만.
4. **S4 — FLIP 전환**: 펼침/접기/모드 전환의 위치 연속성.
5. **S5 — 스왑 + verify 마이그레이션**: 기본 지도를 신 엔진으로, marker
   재공급, `desktop:verify-topology-*` 그린, Design Guardian 검증,
   `SigmaSkeletonCards` 지도 경로 제거 (그래프 뷰 잔존 의존 확인 후).
- 각 슬라이스마다: focused vitest + 설치 앱 스크린샷.

## 6. 검증 계획

- 프레임: frame-profile 프로브에 "지도 팬/줌 중 style mutation 수" 카운터
  추가 (MutationObserver) — 목표 0/frame.
- 시각: 다크/라이트 × idle/선택/펼침 6장 + Design Guardian verdict.
- 계약: url-state · TopologyAnalysisBar · 신규 map-canvas 단위 테스트 +
  `desktop:verify-topology-drag-motion:ko` 계열 그린.

## 7. 조사 티켓 (재구성과 별도)

- **Esc → mode=path 미스터리**: focus 상태에서 합성 Escape keydown 후 URL 이
  `mode=path` 로 전이하는 현상 관찰됨 (2026-07-03, dev). Esc 는 선택 해제에
  연결된 키가 아님 — 원인 불명. cmdk(⌘K palette) 전역 리스너 의심.
- **WebGL 저알파 불투명 합성**: `EdgeCurveProgram`+`node-border` 조합에서
  저알파 색이 사실상 불투명 렌더 (Design Guardian 확인). premultipliedAlpha
  또는 @sigma/edge-curve 원인 조사 — 위젯 전반의 알파 계약이 걸려 있음.

## 8. 참고 파일

- 레이아웃(유지): `src/views/home/lib/topology-ontology-skeleton.ts`,
  `topology-reveal-state.ts`, `buildRevealRadialLayout`
- 교체 대상: `src/widgets/topology-map-sigma/ui/SigmaSkeletonCards.tsx` 의
  지도 경로 (그래프 뷰 = `SigmaTopology.tsx` free-graph 경로는 무관/유지)
- 검증 인프라: `scripts/verify-macos-app-launch.mjs`,
  `src-tauri/src/lib.rs` (verify eval + marker 수집),
  `pnpm desktop:verify-topology-frame-profile:ko`
- 기획자 감사 백로그 원문: `docs/CHANGELOG.md` 2026-07-03 항목 참조
