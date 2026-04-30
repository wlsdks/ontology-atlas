---
name: 온톨로지 ERD canvas editor v1 — drag·drop 그래프 편집
description: DB ERD designer 같은 직관적 ontology 작성 surface 설계. xyflow OSS 기반.
status: 🌱 design — 자율 루프 cycle 8 (2026-04-30) 작성. Track C 단계별 도입 가이드.
date: 2026-04-30
related:
  - docs/superpowers/specs/2026-04-27-ontology-manual-editor-v0.md
  - docs/superpowers/specs/2026-04-27-ontology-v1-experience-concept.md
  - docs/superpowers/specs/2026-04-27-ontology-frontmatter-contract.md
  - docs/superpowers/notes/2026-04-30-quality-loop-audit.md (§5 Track C)
---

# 온톨로지 ERD canvas editor v1

> **비전 (진안)**: "ontology 만들기가 DB ERD designer 처럼 직관적이어야 함. 도식적으로 노드 끌어다 놓고 관계 그리는 식."

---

## 0. 왜 필요한가 — manual editor v0 보다 한 단계 위

manual editor v0 (2026-04-27 spec) 는 **modal 기반 폼** 으로 노드 1개씩 추가. 강점은 빠른 단일 노드 생성. 약점:

- **공간 감각 부재** — 노드 간 관계가 "텍스트 select" 로 정의돼 ER diagram 같은 시각 인지 안 됨.
- **다 노드 한 번에 작성 어려움** — 5개 capability + 그 사이 5개 edge 만들려면 modal 10번 열고 닫음.
- **계층 구조 시각화 약함** — project / domain / capability / element 4 단계가 트리에서만 보임.

ERD canvas editor v1 의 목표:

1. **canvas 에 노드 끌어다 놓기** — palette 에서 kind 골라 드래그 → 위치 결정.
2. **관계는 노드 사이 선 그리기** — handle drag → drop on target node.
3. **계층은 자동 layout 또는 수동 위치** — dagre layered (자동) / 자유 배치 (수동).
4. **inspector 패널** — 선택 노드 상세 inline 편집.
5. **저장 / 불러오기** — Firestore + frontmatter export 양방향.

manual editor v0 (modal) 와 **공존**. 단순 1 노드 추가는 modal, 그래프 단위 작성은 canvas.

---

## 1. OSS 채택 — `@xyflow/react`

quality-loop-audit.md §5.1 비교 표 결과:

| 후보 | 선정 / 비선정 사유 |
|---|---|
| **`@xyflow/react` (ReactFlow v12)** | ✅ MIT / ~30kB gzipped / 활성 (2026-04 기준 weekly 활동) / theme override CSS variable. drag-drop / handle / inspector 추상화 강함. |
| `cytoscape.js` | layout 강하지만 ~80kB + 자체 canvas 라 React idiom 위배. |
| `@projectstorm/react-diagrams` | port 기반 ERD 강하지만 commit 둔화 (2024 후 거의 정지). |
| `mermaid` | DSL 텍스트 기반 — drag-drop UX 와 정반대 방향. 별도 export 옵션으로만 검토. |
| `dagre` / `elkjs` | layout-only. xyflow 보조로 쓰면 적합. |

**결정**: `@xyflow/react` 채택 + `dagre` 자동 layout 보조.

### 1.1 설치 + 마이그레이션 비용

- `pnpm add @xyflow/react@^12 dagre@^0.8` (~33kB gzipped 합계)
- 디자인 헌장 §11 충돌 default 점검:
  - 기본 mini-map / control / handle 색상 = 회색 + 인디고 친화 — override 거의 불요
  - 기본 edge animation = 점선 dash flow — disable (`animated={false}`)
  - 기본 node selection halo = `box-shadow` blur — disable / `border` 로 교체
  - hover scale transform 없음 (✅ §11 호환)

### 1.2 React 19 / Next.js 16 호환

- xyflow v12 는 React 18+ peer / 19 호환 (changelog 확인)
- Next.js 16 dynamic import (`next/dynamic` + `ssr: false`) 로 SSR 회피 (xyflow 내부 ResizeObserver / Window 의존)

---

## 2. Surface 설계

### 2.1 라우트

`/ontology/edit/?account=...` (신규).

기존 `/ontology/?account=...` (read-only tree view) 는 그대로 유지. 진입 동선:

- `/ontology/` 페이지 우상단 toolbar 에 **"편집기 열기"** pill 추가
- `/ontology/edit/` 우상단 toolbar 에 **"트리로 보기"** pill (역방향)

### 2.2 레이아웃 (3 column desktop)

```
┌──────────┬──────────────────────┬──────────┐
│ palette  │      canvas          │ inspector│
│  (kind)  │   (xyflow)           │ (selected│
│          │                      │  node)   │
│ project  │   ◯ project          │          │
│ domain   │      │               │ name     │
│ capab.   │   ◯ domain           │ kind     │
│ element  │      │  ╲             │ summary  │
│          │   ◯ cap. ─── ◯ elem  │ relates  │
│          │                      │          │
└──────────┴──────────────────────┴──────────┘
```

- **palette (좌, ~180px)**: kind chip 4개 (project/domain/capability/element). 클릭 시 canvas 중앙에 새 노드 추가 (또는 drag-drop).
- **canvas (중)**: xyflow `<ReactFlow>` mount. zoom/pan/fit-to-view 기본.
- **inspector (우, ~320px)**: 선택 노드의 detail. inline 편집 → debounce save.

mobile (< md): palette + canvas 만 (inspector 는 bottom sheet). drag-drop 은 desktop only.

### 2.3 단축키

| 키 | 동작 |
|---|---|
| `N` | palette 첫 kind 새 노드 추가 (canvas 중앙) |
| `Delete` / `Backspace` | 선택 노드 삭제 (확인 모달) |
| `Ctrl/Cmd + Z` | undo |
| `Ctrl/Cmd + Y` / `Ctrl/Cmd + Shift + Z` | redo |
| `F` | fit-to-view |
| `Esc` | 선택 해제 |

---

## 3. 데이터 모델

### 3.1 Firestore 변경 (additive)

기존 `knowledgeApprovedNodes`/`Edges` 스키마 유지. 캔버스 좌표 추가:

```ts
// knowledgeApprovedNodes/{id}
{
  id: string;
  kind: 'project' | 'domain' | 'capability' | 'element';
  name: string;
  summary?: string;
  // ... 기존 필드 ...
  // 신규 (canvas 좌표 — optional). null 이면 자동 layout 적용.
  canvasPosition?: { x: number; y: number; updatedAt: Timestamp };
}
```

- canvas 에서 노드 드래그 → debounce 500ms 후 `canvasPosition` 업데이트
- canvas 가 없을 때는 dagre 가 layered layout 자동 계산해 ephemeral position 표시
- 사용자가 한 번 옮기면 그때부터 manual position 우선

### 3.2 Edge 좌표

엣지는 자동 라우팅 (xyflow 내장). manual edge waypoint 는 v1 범위 X (v2 검토).

### 3.3 권한

- `/ontology/edit/` 진입은 `account.editor` 이상
- 게스트 / viewer 는 redirect → `/ontology/` (read-only)

---

## 4. 핵심 인터랙션

### 4.1 노드 추가

방법 1 (palette click): kind chip 클릭 → canvas 중앙 + viewport offset 위치에 placeholder 노드 (`name = "(이름 입력)"`). inspector 가 자동 열려 name field 포커스.

방법 2 (palette drag): kind chip 을 canvas 위로 drag → drop 위치에 노드 추가.

방법 3 (단축키 N): 위와 동일 (palette 첫 kind).

### 4.2 엣지 그리기

xyflow `<Handle>` (source / target) 노출. source handle drag → target node hover 시 highlight → drop 시 edge 생성. edge type 기본 `relates_to` — inspector 에서 변경.

### 4.3 inline 편집

inspector 패널 안에서 `name` / `summary` / `kind` 변경 가능. debounce 800ms 후 자동 저장. dirty 시각 cue (인디고 dot 우상단).

### 4.4 자동 layout toggle

toolbar 에 "자동 정렬" 버튼. 누르면 dagre 가 모든 노드 재배치. canvas position 은 보존되지만 자동 layout 적용 시 임시 override.

---

## 5. 디자인 헌장 §11 theme override

xyflow 기본 CSS variable 을 wrapper 에서 override:

```tsx
<div
  className="ontology-canvas"
  style={{
    '--xy-node-background-color': 'rgba(14, 16, 22, 0.96)',
    '--xy-node-border': '1px solid rgba(255, 255, 255, 0.1)',
    '--xy-node-text-color': 'var(--color-text-primary)',
    '--xy-edge-stroke': 'rgba(94, 106, 210, 0.46)', // indigo alpha
    '--xy-handle-background-color': 'var(--color-indigo-brand)',
    '--xy-controls-button-background-color': 'rgba(20, 22, 28, 0.94)',
  }}
>
  <ReactFlow ... />
</div>
```

금지 항목 점검:
- ✅ scale hover 없음 (xyflow 기본 X)
- ✅ glow / pulse 없음
- ✅ 보라핑크 그라디언트 없음
- ✅ glassmorphism 없음

추가 차단:
- `<Background>` 의 dot pattern 만 사용 (gradient 없음)
- mini-map: 기본 disabled (필요 시 toggle)
- edge animation: `animated={false}` 강제

---

## 6. 단계별 도입 (Track C 8 fire)

| fire | scope | DoD |
|---|---|---|
| C-1 | xyflow 설치 + 라우트 `/ontology/edit/` placeholder 마운트 | 빈 canvas 노출 + `/ontology/` 에서 진입 link |
| C-2 | 기존 `knowledgeApprovedNodes` Firestore 구독 → xyflow nodes 변환 (read-only) | 기존 노드들이 canvas 에 dagre layout 으로 보임 |
| C-3 | palette 좌측 (kind chip 4개) + 클릭 시 canvas 중앙 노드 추가 (저장 X) | UI 만 동작, persist 없음 |
| C-4 | inspector 우측 + 선택 노드 inline 편집 (name / summary debounce save) | save 후 read-only view 에도 반영 |
| C-5 | 노드 drag → canvasPosition Firestore 저장 (debounce 500ms) | 새로고침 후 위치 보존 |
| C-6 | edge handle drag → target drop → 엣지 생성 + Firestore 저장 | edge type 기본 relates_to |
| C-7 | 단축키 (N / Del / Cmd+Z / F / Esc) + undo/redo (xyflow 내장) | 키 입력 동작 |
| C-8 | frontmatter export — 현재 canvas 를 md frontmatter 로 download | 기존 ontology contract (T-1~T-13) 호환 |

각 fire 는 quality-loop-audit.md §0.1 cadence (10 분 안) 준수. 큰 fire 는 2 sub-fire 로 분할.

---

## 7. 회귀 / 위험 / 완화

| 위험 | 완화 |
|---|---|
| xyflow SSR hydration mismatch | `next/dynamic({ ssr: false })` wrap |
| ResizeObserver loop limit 경고 | xyflow v12 가 자체 처리 (changelog 확인) |
| 1000+ 노드 시 fps 하락 | viewport culling 기본 + minimap 별도 toggle |
| canvasPosition 충돌 (다중 사용자 동시 편집) | last-write-wins (account 1 editor 가정 v1 범위) |
| 자동 layout vs manual position 혼란 | toggle 명확 + "자동 정렬 시 모든 위치 덮어쓰기" 확인 모달 |
| 디자인 헌장 §11 회귀 | E-13 lint 룰 (cycle 6 도입) 이 hover:scale / 보라핑크 차단. xyflow theme override 추가 점검 |

---

## 8. v2 backlog (out of scope v1)

- **edge waypoint 수동 라우팅** — manual edge curve 조정
- **노드 그룹 / 컨테이너** — domain 안에 capability 묶기
- **다중 사용자 실시간 협업** — Firestore presence 기반
- **다이어그램 export PNG / SVG** — html2canvas 또는 xyflow 내장 toBlob
- **ontology query DSL** — 검색 / 필터 / saved view
- **mobile 편집** — touch handle drag (현재 read-only)

---

## 9. 검증 / DoD

- [ ] `pnpm test:run` 회귀 0
- [ ] `pnpm exec tsc --noEmit` 0 errors
- [ ] `pnpm lint` 0 errors (E-13 헌장 룰 포함)
- [ ] Playwright MCP — `/ontology/edit/` 진입 + 노드 추가 / 엣지 생성 / 저장 / 새로고침 후 보존 확인
- [ ] 디자인 헌장 §11 수동 점검 — 색상 / 모션 / 호버 어디도 위반 없음
- [ ] 기존 `/ontology/` read-only view 회귀 0

---

## 10. 결정 기록

- **2026-04-30 (cycle 8)**: spec 초안 — Track C 8 fire 분할 계획 + xyflow 채택 + canvasPosition 추가 결정.
