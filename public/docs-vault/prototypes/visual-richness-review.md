# 시각 리치니스 라운드 — 디자인 리뷰 + 파라미터 스펙 (2026-07)

> 소유자 피드백 5건(A 시각 빈곤 · B 다이브 과심도 · C 줌 둔감 · D 설정 어포던스 ·
> E 크롬 충돌)에 대한 리뷰·레퍼런스 조사·처방. 목업:
> `chrome-recomposition.html` · `focus-dive-before-after.html` ·
> `visual-richness-sampler.html`. 스샷: `shots/`.
> 헌장 유지: 무채색 + 단일 인디고, 그라디언트/글로우/글래스모피즘 금지,
> data-ink 원칙(Tufte). 레퍼런스는 원칙 인용만 — 자산 모방 없음.

---

## A. "전체 페이지가 시각적으로 표현되는 것들이 없다" — 서피스별 처방

### 진단 (정직하게)

기계가공-계기판 언어는 **토폴로지 캔버스 위에서는** 성립한다(각인 숫자·기계가공
셰이프·블루프린트 그리드가 곧 시각 표현). 문제는 **DOM 패널 서피스**다 —
insights·A1·projects·데이터시트가 전부 "모노 숫자 + 텍스트 행"으로만 구성되어,
계기판이 아니라 **로그 덤프**처럼 읽힌다. 계기(instrument)에는 바늘·눈금·미터가
있다; 지금 패널에는 숫자만 있다. 이 간극이 소유자가 느낀 빈곤의 실체다.

레퍼런스들이 공통으로 쓰는 절제된 리치니스 장치는 4가지로 수렴한다:

1. **수치 옆 비례 마크** — 숫자마다 그에 비례하는 바/미터/스파크라인을 병치
   (Linear Insights의 "quick glance metrics → detailed graphs" 스펙트럼,
   Vercel Observability의 시계열 + 라우트 테이블 병치).
2. **글리프 미니어처** — 데이터의 형태 언어(우리의 kind 글리프)를 패널 안에서
   반복해 캔버스와 패널이 같은 세계임을 시각적으로 증명 (Obsidian 그래프의
   color group 도트가 필터 패널에 그대로 재등장하는 방식).
3. **타이포그래피 자체를 장치로** — 각인 숫자·트래킹 캡스·모노 정렬
   (iA Writer: "typography does the heavy lifting", 모노크롬 + 단일 액센트).
4. **정직한 미니 지도** — 실데이터에서 유도한 소형 SVG 계기 (랜딩의 honest
   SVG instruments 가 이미 이 문법을 확립 — 앱 내부로 확장을 안 했을 뿐).

### 처방 목록 (우선순위순)

| 순위 | 서피스 | 처방 | 장치 |
|---|---|---|---|
| **P1** | `/ontology/insights` | 가장 빈곤한 서피스. ① kind census 를 글리프 미니어처 + 비례 미터 행으로 ② relation 분포를 trace 모티프(실선/파선 마크) + 바 행으로 ③ 도메인별 신선도 heatstrip (vault mtime 유도 — 정직 데이터) ④ 허브 목록에 실그래프 유도 미니 ego 썸네일 ⑤ 갱신 활동 스파크라인 (git/mtime 이력) | `visual-richness-sampler.html` 로 목업 |
| **P1** | 토폴로지 데이터시트/INDEX | B3 의 도메인 capacity 미터·신선도 도트·각인 pcensus 는 이미 옳은 방향 — 출하가 처방이다. 메트릭 행(`쓰는 곳 2 · 기대는 곳 2`)에 소형 비례 틱 추가 | B3 + E 목업 |
| **P2** | A1 전체 상세 | reach 패널에 미니 ego 지도(SVG, 실이웃 데이터) 삽입; 관계 행마다 trace 마크(이미 데이터시트에 있는 문법 재사용); evidence 행에 신선도 틱 | 문법은 sampler 와 동일 — 별도 목업 불요 |
| **P2** | `/projects` 카드 | fact strip 에 kind 글리프 미니어처 열 + 도메인 미터 + 신선도 도트 (sampler 의 census 행 문법 그대로) | 〃 |
| **P3** | 섹션 구분자 | 긴 패널의 섹션 경계에 relation trace 모티프(실선─·파선╌ hairline)를 구분자로 — 장식이 아니라 범례의 반복 | 〃 |
| **반려** | 랜딩 | 이미 honest SVG instrument 문법 보유. 손대지 말고 이 문법을 **앱 내부로** 수출하는 것이 위 P1~P3 | — |

**금지 유지**: 색 추가 없음(인디고 + 중립 램프만), 그라디언트/글로우 없음, 장식
모션 없음. heatstrip 도 중립 명도 램프 + 인디고 신선 도트만 사용.

### 레퍼런스 (원칙 인용)

- Linear Insights — 수치↔그래프 스펙트럼, 절제된 대시보드: <https://linear.app/features/insights>
- Vercel Observability — 시계열 + 정렬 가능한 라우트 테이블 병치: <https://vercel.com/docs/observability>
- Obsidian Graph view — 필터/그룹/로컬 그래프/타임랩스, 도트 문법 재등장: <https://obsidian.md/help/plugins/graph>
- iA Writer — 모노크롬 + 단일 액센트, 타이포가 리치니스의 본체: <https://ia.net/writer>
- Tufte data-ink (프로젝트 캐논, `docs/FOUNDATIONS.md`) — 모든 잉크는 데이터

---

## B. 포커스 다이브 과심도 — 원인과 스펙

### 근본 원인 (코드 확정)

`src/widgets/topology-map-v2/ui/topology-camera-math.ts#computeFocusCameraTarget`:

```
scale = min(effectiveMax, max(cameraScaleMin, fitScale, revealFloor))
revealFloor = overviewEntryScale × capability.fullRatio  // = entry × 2.0
```

`revealFloor` 는 C1 A3 에서 "클릭해도 capability 가 안 드러난다"를 고치려고
넣었지만, **C1 A2 의 ego tier 면제**(`tier-visibility.ts` — 포커스 노드 + 1-hop
이웃은 줌 비율과 무관하게 표시·클릭 가능)가 같은 문제를 이미 해결했다. 지금은
ego bbox 의 자연 fit(대개 entry×1.2~1.6)을 **entry×2.0 바닥이 강제로 뚫고
지나가** 과심도 착지 + 라벨 밀집이 생긴다. revealFloor 는 잉여이며 삭제 대상.

### 다이브 카메라 스펙

```
egoFit  = fit( egoBounds × 1.15 )            // bbox 를 중심 기준 1.15 배 확장 후 fit
                                              // (가산 margin 70 world-unit 대체 —
                                              //  비례 여백이라 클러스터 크기와 무관하게 일정한 호흡)
tscale  = clamp( egoFit, overviewEntryScale, effectiveMax )
          // 하한 = entry: 다이브가 오버뷰보다 얕게 빠지지 않는다
          // 상한 = entry × maxZoomRatio (기존 실효 최대 유지)
          // revealFloor 항 삭제
center  = ego bbox 중심 (기존과 동일, safe-inset 보정 유지)
```

수용 기준: 1512×945 에서 어떤 노드를 클릭해도 ① ego 전원이 안전영역 안에
여백 포함 수납 ② 선택 노드 라벨 + 이웃 라벨 전부 판독 가능 ③ 라벨 겹침 0.

### 다이브 줌 라벨 declutter — 양보 계층

스샷의 "V I E Views (Topo…" 충돌 = 도메인 **sky-chart 워터마크**(트래킹 캡스,
far-field 장식층)와 **컴팩트 도메인 라벨**이 같은 앵커에 동시 표시된 것.
양보 우선순위(위가 이긴다):

1. 선택 노드 라벨 (항상)
2. ego 이웃 라벨 (항상 — 밝은 엣지 끝점은 이름을 가진다)
3. 컴팩트 도메인 라벨 — ego 도메인은 3차 톤으로 감쇄, 비-ego 도메인은 dim
4. **sky-chart 워터마크 — 포커스 활성 시 alpha 0** (장식층은 다이브에서 존재
   금지; far-field 전용 유지. 크로스페이드 갭: farT < 0.4 에서 워터마크 0,
   farT > 0.6 에서 컴팩트 라벨 0 — 중간 대역 동시표시 금지)
5. 비-ego capability/element 라벨 — 표시 안 함 (기존 ego-dim 유지)

목업: `focus-dive-before-after.html` (실스샷 구도 재현 before / 스펙 적용 after).

---

## C. 줌 필 "느리고 사용성 안 좋음" — 파라미터 스펙

### 진단: 노치당 배율은 정상권, **스프링이 범인**

| 항목 | 현재 | 레퍼런스 | 판정 |
|---|---|---|---|
| 노치당 배율 (deltaY 120) | `exp(120×0.0016)` = **1.212×** | d3-zoom 기본 `2^(120×0.002/120·0.24)` ≈ **1.181×** ([d3js.org/d3-zoom](https://d3js.org/d3-zoom)) · Leaflet **2.0×**/노치 (`wheelPxPerZoomLevel: 60`, [leafletjs.com/reference](https://leafletjs.com/reference.html)) · Figma 체감 ≈1.2× | 디자인툴 하한권 — 소폭 상향 여지 |
| 줌 스프링 응답 | `--topology-v2-camera-spring-angfreq: 2.941`, 임계감쇠 → **95% 도달 1.61 s** (임계감쇠 step response: ωt≈4.74) | Figma/맵류는 휠 줌을 즉시 반영 + ~100 ms 스무딩 | **주범.** 휠 한 틱의 결과가 1.6초에 걸쳐 도착 — "느리다"의 실체 |
| 전체 줌 범위 | ratio 0.5→3.2 = 6.4×, 1.212×/노치로 **~9.7 노치** | Leaflet 은 동급 범위를 ~3노치 | 부차 요인 |

### 처방 (숫자)

1. **휠 감도** `0.0016 → 0.0020` — 노치당 **1.271×** (d3 1.18 과 맵 2.0 사이,
   디자인툴 상단권). 전범위 횡단 ~7.7 노치. 트랙팩 연속 델타는 선형이라 자동
   비례 — 별도 분기 불요. `0.0024`(1.334×)는 트랙팩 과민 위험이 있어 2차 후보.
2. **스프링 이원화** — 토큰 분리:
   - `--topology-v2-camera-spring-angfreq-interactive: 12` — 휠 줌 스케일 축
     전용. 95% 도달 **0.40 s** (ω=12, 임계감쇠). 촉각은 유지하되 지각적으로
     "즉답"에 진입. 14(0.34 s)까지 상향 여지.
   - `--topology-v2-camera-spring-angfreq: 4.7` — 프로그램 이동(다이브·오버뷰
     복귀·fit) 전용으로 기존 토큰 재정의. 95% 도달 **1.0 s** — 시네마틱 유지
     (현 2.941 의 1.6 s 는 다이브에서도 늘어진다).
3. **끝단 상태**(선택): 휠 줌은 스프링 대신 **직접 적용 + τ≈90 ms 지수
   스무딩** (Figma/맵 방식) — 스프링은 프로그램 이동 전용으로 환원. 1·2 로
   부족하면 이 단계로. 구현 부담이 더 커서 토큰 변경을 quick win 으로 먼저.

수용 기준: 휠 3노치 연타 시 최종 배율 도달 체감 < 0.5 s; 다이브는 1 s 내 착지.

---

## D. 설정/언어 어포던스 — 기어 vs EN/KO 필

**판정: 우측 유틸리티 레일의 기어가 이긴다.** 근거:

- 필요한 설정이 이미 3개(언어 · 테마 · INDEX 기본 상태) — EN/KO 필은 그중
  1개만 해결하고, 3개를 개별 크롬으로 노출하면 지도 위 소음 3배.
- 토폴로지는 지도가 주인공인 서피스 — 크롬은 최소·집약이 원칙 (B3 승인 방향).
- 랜딩의 EN/KO 필은 유지 — 설정이 언어 하나뿐인 제로-크롬 페이지라 필이 옳다.
  서피스마다 옳은 어포던스가 다르다.

**기어 팝오버 스펙** (`chrome-recomposition.html` frame 2 에 목업):

- 우측 유틸리티 레일 최하단, 28 px 기계가공 사각 버튼 (fit-view 버튼과 동일 문법).
- 팝오버 232 px, 기어 아래 우측 정렬. 행 3개, 전부 segmented control:
  `언어 EN | KO` · `테마 다크 | 라이트` · `INDEX 기본 펼침 | 접힘`.
- transient surface 규율: 열릴 때 다른 transient 를 닫고, Esc/외부 클릭으로
  닫힘. 저장은 IndexedDB 설정 범위(진실원 아님 — local-first 가드 준수).

---

## E. 크롬 재구성 — INDEX ↔ 브랜드 충돌 해소

**선택안: 크롬 로우 분리** (필 축소 모프 반려). 상단 56 px 를 크롬 레인으로
예약하고 INDEX 패널은 그 아래(top 64 px)에서 시작한다.

- 좌: 브랜드 필 — 상태 무관 불변. (INDEX 상태에 따라 필이 아이콘으로 모프하는
  안은 브랜드 앵커가 흔들리고 상태기계가 늘어서 반려 — Linear 식 고정 헤더
  규율이 더 조용하다.)
- 중앙: 각인 census — **단일 출처.** INDEX 내부의 pcensus 중복 행은 삭제,
  INDEX 헤더에는 에이전트 동기화 도트만 남긴다.
- 우: 유틸리티 레일 (fit-view + 기어). 데이터시트는 레일 아래 top 64 px.
- 접힘 상태: 세로 INDEX 탭도 크롬 로우 아래에서 시작 — 브랜드 필과 어떤
  상태에서도 기하적으로 충돌 불가능.

목업: `chrome-recomposition.html` — frame 1 기본(펼침), frame 2 접힘 + 기어
팝오버 열림. 이 파일이 B3 폴리시 스펙이다.

---

## 검증 계획

- 목업 3종 스크린샷(1512 px)을 `shots/` 에 보존 — B3 구현 PR 의 수용 기준.
- B(다이브)·C(줌) 는 구현 시 `topology-camera-math.test.ts` 에 revealFloor
  삭제 회귀 테스트 + 스프링 토큰 이원화 단위 테스트 동반.
- 설치 앱 증빙: B3 폴리시 구현 후 macOS WebView 에서 크롬 로우·기어 팝오버
  재검증 (Design Guardian 절차).
