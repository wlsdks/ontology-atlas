---
name: 온톨로지 모바일 UX — mobile-first 재설계
description: 트리 + ego graph + detail 이 작은 화면에 겹치는 문제 해결, mobile-first 진입 흐름 + LOD 분기
status: 🌱 draft (P2 spec)
date: 2026-04-28
related:
  - docs/superpowers/specs/2026-04-27-ontology-v1-experience-concept.md (v1 UX)
  - docs/superpowers/specs/2026-04-27-ontology-design-loop.md (v0 백본)
---

# 온톨로지 모바일 UX 재설계

> 데스크톱 first 로 자란 ontology UI 를 모바일에서 쓸 만하게. 작은 화면에서 트리·1-hop·detail 이 겹치지 않고, *생성* 까지 가능한 수준.

---

## 1. 한 문장

> **모바일 사용자가 ontology 를 read-only 가 아니라, 탐색·검수·생성까지 가능한 동일 등급 surface 로 쓴다.**

---

## 2. 현재 상태와 문제

### 2.1 현재 모바일 동작

- `/ontology` — `mx-auto max-w-5xl px-5 py-8 md:px-8 md:py-12` (기본 responsive container)
- `OntologyTreeView` — depth indent 16px 씩, 모바일에서도 그대로 렌더
- `NodeDetailPanel` — `fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))]` 모바일 하단 시트, `md:right-6 md:top-24 md:left-auto md:w-[360px]` 데스크톱 우측 카드
- `OntologyEgoGraph` — SVG 320x200 하드코딩, `width="100%"` 로 가로 fit
- `ManualNodeCreateModal` / `ManualEdgeCreateModal` — `pt-[10vh]` + `max-w-lg` 으로 모바일에서 거의 풀 화면
- `GlobalSearch` — Radix Dialog 기본, 모바일에서도 최상단 카드

### 2.2 문제

- **시각적 충돌**: 모바일에서 트리 보다가 노드 클릭 → bottom sheet 가 트리 절반 가림. 트리로 다시 가려면 sheet 닫아야 함 (한 번에 하나만 볼 수 있음).
- **인터랙션 가시성 부족**: 트리 depth 가 깊으면 inline 검색 input + 펼치기/접기 toolbar 가 작은 화면에서 비좁음.
- **ego graph 라벨 잘림**: SVG 가 가로 fit 되어도 viewBox 320x200 고정이라, 모바일 320px 화면에서 라벨 겹침 + 노드 7~8 개 넘으면 못 봄.
- **manual 모달 키보드**: 모바일 textarea 가 키보드 올라오면 폼 보이지 않음. focus 자동 scroll 처리 미흡.
- **글로벌 검색 사용성**: ⌘K 자체가 desktop 메탈로르. 모바일은 헤더 검색 버튼 → 모달이라 일관 동작은 하나 input 이 작아 답답.
- **insights / relations 페이지**: 카드 grid (`md:grid-cols-2`) 가 모바일에서 단일 column 으로 떨어지지만, bar chart 가 좁은 폭에서 깨질 가능성.

---

## 3. 해결 옵션

### 3.1 옵션 A — Level-of-Detail (LOD) 단일 라우트 (권장)

같은 `/ontology` 라우트에서 화면 크기에 따라 layout 자동 분기:

- **데스크톱 (md+)**: 현재 그대로 — 트리 좌측 + detail 우측 rail
- **모바일**: 트리 → 노드 클릭 → **detail 풀 화면 stack** (back arrow → 트리 복귀)
- ego graph 는 detail 안에 자연스럽게 mount, viewBox 동적 (window.width 기반)

**장점**: URL 1 개 유지, deeplink 일관, 코드 흩어짐 X.
**단점**: 컴포넌트마다 responsive 분기 추가 — 코드 복잡도 약간 ↑.

### 3.2 옵션 B — 모바일 전용 라우트 `/m/ontology`

- 모바일 검출 → redirect
- 디자인 자유롭게

**장점**: 디자인 자유.
**단점**: URL 두 갈래 → deeplink 깨짐. 새 라우트 추가는 CLAUDE.md §6.4 정책 (URL 네임스페이스 늘리지 말라) 와 충돌.

### 3.3 옵션 C — 단순 데스크톱 우선 + 모바일 read-only

- 모바일에서 manual create 모달 안 띄움
- 트리 + detail 만

**장점**: 작업 분량 0.
**단점**: §1 한 문장 약속 미달.

### 3.4 결정

→ **옵션 A (LOD 단일 라우트)** 채택. 이유:
- URL 정책 준수 + deeplink (방금 F1 PR 으로 강화) 일관
- Tailwind breakpoint 기반 responsive 가 표준
- 모바일 전용 라우트는 운영 부담 ↑

---

## 4. 사용자 시나리오

### S1 — 모바일 진안, ontology 탐색

- iPhone 13 (390px) 에서 `/ontology` 진입
- 트리 풀 화면 + 헤더 (검색 버튼 + 인사이트/관계/검수 큐 pill)
- 트리 펼침/접기 + inline 검색 정상 동작
- 노드 클릭 → **detail 화면 push** (트리 자체 안 보임, 헤더에 ← arrow)
- detail 안에 ego graph (full-width, viewBox 320x180, ≤ 8 neighbor 가정)
- "+ 관계 추가" 버튼 → 모달 (모바일 풀 화면)

### S2 — 모바일 진안, 새 노드 직접 추가

- 헤더 "+" 버튼 → ManualNodeCreateModal
- 풀 화면, 키보드 올라오면 **input 자동 scroll** (focus 시 scrollIntoView)
- dedup hint 카드는 input 아래 (현재 데스크톱 패턴 유지)
- 제출 → 모달 닫힘 + 새 노드 detail 화면 push

### S3 — 모바일 방문자, 공개 surface 인지

- `/` 홈 토폴로지 (sigma, mobile responsive)
- 노드 tap → 기존 project drawer (변경 X)
- ontology border 색 분기 ✅ (P1 spec 의 legend tooltip 있으면 더 좋음)

### S4 — 모바일 진안, ⌘K 같은 글로벌 검색

- 헤더 "검색" 버튼 → GlobalSearch 풀 화면 모달
- 검색 input 헤더 자동 focus
- 결과 행 모바일 친화 (touch target 44px+)
- 결과 선택 → ontology detail push 또는 documents view 라우팅

---

## 5. UI 변경 사항

### 5.1 NodeDetailPanel — 모바일 stack vs 데스크톱 rail

현재: `fixed bottom + md:fixed right`
새: 모바일에선 `OntologyViewPage` 의 main content 자체가 `selectedNode` truthy 시 `<NodeDetailFullScreen>` 로 교체.

```tsx
// OntologyViewPage 모바일 분기
{selectedNode && isMobile ? (
  <NodeDetailFullScreen node={selectedNode} onBack={() => selectNode(null)} ... />
) : (
  <>
    <OntologyTreeView ... />
    {selectedNode ? <NodeDetailPanel ... /> : null}  {/* desktop only */}
  </>
)}
```

`isMobile` 은 CSS-only 가 깔끔 — `block md:hidden` / `hidden md:block` 쌍.

### 5.2 OntologyEgoGraph — 동적 viewBox

```ts
// 부모 polished width 받아 viewBox 비율 유지
const ratio = 16 / 10;
const w = parentWidth;
const h = w / ratio;
```

ResizeObserver 또는 부모 layout 측정. 모바일 < 360px 면 viewBox 360x225 → 라벨 truncated 길이 12 → 8 자.

### 5.3 트리 모바일 — depth indent 축소

depth indent 16px → 모바일 12px. 또는 깊이 ≥ 4 일 때 자동 collapse.

### 5.4 manual 모달 — keyboard 처리

```tsx
<input onFocus={(e) => e.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" })} />
```

dedup hint 카드 위치도 input 아래로 (모바일 키보드 가려도 보임).

### 5.5 insights / relations — bar chart 모바일

- bar chart `min-width: 280px` 보장
- gridcols 1 강제 (`md:grid-cols-2` → mobile single)

---

## 6. 단계적 구현 plan

### Phase 1 — 모바일 진단 + 기준 metric

- BrowserStack 또는 Playwright mobile viewport 으로 현재 상태 스크린샷 캡처
- 문제 항목 리스트 ("here's where it breaks")
- **분량**: 1-2 fire (분석만)

### Phase 2 — NodeDetailFullScreen (가장 큰 변화)

- `<NodeDetailFullScreen>` 모바일 컴포넌트 신규
- back arrow + scroll 가능한 single column layout
- `OntologyViewPage` 분기
- **분량**: 4-5 fire

### Phase 3 — Ego graph 동적 size

- ResizeObserver / parent measurement
- viewBox + LABEL_MAX_CHARS 동적 분기
- **분량**: 3-4 fire

### Phase 4 — Manual 모달 keyboard 처리

- input focus → scrollIntoView
- dedup hint 위치 재배치
- **분량**: 2-3 fire

### Phase 5 — 트리 + insights + relations polish

- depth indent 축소 / chart min-width 보장 / grid 강제 single
- **분량**: 2-3 fire

**총 12-17 fire** — 큰 작업. Phase 2 가 가장 visible.

---

## 7. 위험 / 대안

### 7.1 위험

- **breakpoint 분기 cascade**: `md:` 한 줄로 처리하다 컴포넌트마다 다른 분기 → 코드 카오스. 완화: 공용 `useIsMobile()` hook 또는 CSS-only 두 컴포넌트 (block/hidden).
- **ego graph SVG 성능**: 동적 viewBox 마다 layout 재계산 → 모바일에서 jank. 완화: debounce + memoization.
- **모바일 검수 흐름**: `/review/knowledge` 가 desktop-heavy. 모바일 검수까지 다듬으면 분량 +5 fire. (이번 spec 범위 외)

### 7.2 대안

- "모바일은 read-only 만" — 옵션 C 로 회귀. §1 약속 미달.
- "모바일 사용자는 데스크톱 권장" — copy 한 줄 안내. 가장 작은 분량이지만 v1 컨셉 §6 보류 항목.

---

## 8. 다음 액션

1. **사용자 결정 항목**:
   - 옵션 A (LOD 단일) vs B (전용 라우트) vs C (read-only) 채택?
   - Phase 1 진단 먼저 vs Phase 2 NodeDetailFullScreen 바로?
   - 우선 surface: `/ontology` only vs `/review/knowledge` 까지?
2. Phase 1 진단 시작 — Playwright mobile viewport screenshot 비교.

---
