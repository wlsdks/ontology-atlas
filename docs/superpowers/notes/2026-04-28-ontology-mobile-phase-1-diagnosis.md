---
name: 온톨로지 모바일 UX — Phase 1 진단 보고서
description: 코드 read 만으로 추정한 모바일 (375x667 ~ 414x896) 진단 결과 + Phase 2 우선순위 + 측정 metric
status: 🌱 Phase 1 deliverable
date: 2026-04-28
related:
  - docs/superpowers/specs/2026-04-28-ontology-mobile-ux.md (P2 spec)
---

# 온톨로지 모바일 UX — Phase 1 진단

> P2 spec §6 Phase 1 deliverable. 코드 변경 0, 진단 + 우선순위 + Phase 2 진입 시 측정 metric 만 작성. 다음 fire 의 Phase 2 (NodeDetailFullScreen 등) 의 시작점.

---

## 진단 방법

코드 read-only — 실제 디바이스 / Playwright 미사용. CSS 클래스 + breakpoint 분기 + viewport math 로 모바일 (375x667 가정) 동작 추정.

스캔 대상 8 파일:
- `src/views/ontology-view/ui/OntologyViewPage.tsx`
- `src/views/ontology-insights/ui/OntologyInsightsPage.tsx`
- `src/views/ontology-relations/ui/OntologyRelationsPage.tsx`
- `src/widgets/ontology-tree-view/ui/OntologyTreeView.tsx`
- `src/widgets/ontology-ego-graph/ui/OntologyEgoGraph.tsx`
- `src/widgets/manual-node-create-modal/ui/ManualNodeCreateModal.tsx`
- `src/widgets/manual-edge-create-modal/ui/ManualEdgeCreateModal.tsx`
- `src/widgets/global-search/ui/GlobalSearch.tsx`

---

## 진단 결과

### 1. NodeDetailPanel — 모바일에서 트리 가림 + 스크롤 불가

**현상**
`OntologyViewPage.tsx` line 491 의 `<aside>` 가 모바일에서 `fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))]` 로 트리 위에 bottom sheet 로 떠 있음. 패널 자체는 max-height 제약 없음 → 콘텐츠가 화면 상단을 넘어가도 잘림 (overflow-y-auto 없음). ego graph 6 neighbor + 관련 문서 6 개 + manual note + projectIds 모두 포함하면 화면 100% 초과.

**영향**: 🔴 high
**Phase 2 fix**: max-height + overflow-y-auto 추가. 또는 모바일 전용 `<NodeDetailFullScreen>` 으로 트리에서 push 전환 (back arrow → 트리 복귀).

### 2. 모달 키보드 가림 — Manual modal 두 종류

**현상**
`ManualNodeCreateModal.tsx` line 157 `pt-[10vh]` 고정 — 모달 카드는 viewport 상단 67px 부근 시작. iOS 키보드 (~280px) 올라오면 viewport 가 387px 로 축소되며, 모달 폼 하단 (특히 manualNote textarea) 이 키보드에 가려짐. focus 시 자동 scrollIntoView 없음. `ManualEdgeCreateModal` 도 동일 패턴.

**영향**: 🔴 high
**Phase 2 fix**: 모바일에서 bottom sheet 로 전환 + input/textarea focus 시 `scrollIntoView({ block: "center" })`. dedup hint / id collision 알림 위치도 input 아래로.

### 3. SVG ego graph — 라벨 한국어 6자 제한 + 겹침

**현상**
`OntologyEgoGraph.tsx` line 23~25 의 `LABEL_MAX_CHARS = 12` 가 한국어 1자 ≈ 영어 2자라 실 가독 6 자. NodeDetailPanel 모바일 max-w-md (28rem=448px) 안의 SVG viewBox 320x200 hardcoded 라 가로 fit 시 라벨 truncate 더 심해짐. neighbor 7~8 노드면 12·3·6·9시 + 사이 angle 에 라벨이 겹침.

**영향**: 🟡 med (라벨 가독성 < 50% 추정 — 텍스트 list 가 보조하지만 시각화 가치 약함)
**Phase 2 fix**: viewBox 동적 (parent width → ratio) + LABEL_MAX_CHARS 모바일 8 자. 또는 라벨 토글 (on/off).

### 4. 트리 indent 누적 — depth 4+ 에서 가로 잠식

**현상**
`OntologyTreeView.tsx` line 89 `treeNode.depth * 16` — depth=4 면 64px indent. 모바일 375 px - container px-5 (40px) - indent 64px = 본문 271px. KindChip + title + ManualSourceChip 모두 들어가면 title truncate 정도 심해짐 → kind 구별 어려움.

**영향**: 🟡 med
**Phase 2 fix**: 모바일 indent 12px. 또는 depth ≥ 4 자동 collapse + "전체 펼치기" 가이드.

### 5. Touch target — 트리 행 + 강한 관계 행

**현상**
- 트리 행: `OntologyTreeView.tsx` line 98 `px-2 py-1.5` ≈ 높이 32px. 토글 버튼 `h-5 w-5` (20px). 권장 44px 미달.
- 강한 관계 행: `OntologyRelationsPage.tsx` 의 strong edges list `py-1.5` ≈ 24px. 더 작음.

**영향**: 🟡 med (행 자체 hit area 는 어느정도 커서 잘 눌릴 가능성, 다만 토글 버튼 정확도 ↓)
**Phase 2 fix**: 모바일 한정 `py-2.5` 또는 hit area expansion.

### 6. Insights / Relations 페이지 — 차트 모바일

**현상**
- `OntologyInsightsPage.tsx`: grid `md:grid-cols-2` → 모바일 single. timeline `md:col-span-2` 는 full width. div 기반 bar chart `h-20` (80px) — 픽셀 단위 height 계산 시 30 일 막대 가독성 ↓.
- `OntologyRelationsPage.tsx`: edge type 분포 + strong edges. 클릭 가능 button 행이 모바일에서 작음.

**영향**: 🟢 low (반응형은 작동, 미세 폴리시 수준)
**Phase 2 fix**: chart `min-w` 보장 + 막대 색상 contrast 강화 (a11y 기여).

### 7. GlobalSearch — 모바일 OK

**현상**
`pt-[12vh]` + `max-w-xl` (36rem=576px). 모바일 375 - px-4 (32) = 343px 사용. input + 결과 list 모두 fit. (PR #75 a11y 픽스 + Radix Dialog Title/Description 적용 완료.)

**영향**: 🟢 OK
**Phase 2 fix**: 변경 없음.

### 8. Tree view 검색 + toolbar — 비좁음

**현상**
`OntologyTreeView.tsx` line 222~244 의 검색 input + 펼치기/접기 toolbar — 모바일에서 input + 두 버튼이 같은 행에 들어가면 input 폭 < 200px. 한국어 placeholder "트리에서 노드 찾기 — 한·영 OK" 가 잘림.

**영향**: 🟡 med
**Phase 2 fix**: 모바일에서 toolbar 가 input 아래 새 행으로 떨어지게 (`flex-wrap` 또는 `flex-col md:flex-row`).

---

## 🔴 Phase 2 우선 fix 3개

| # | 항목 | 분량 | 예상 fire |
|---|---|---|---|
| 1 | NodeDetailPanel 모바일 stack 또는 scroll drawer | 큼 (UX 재설계) | 4-5 fire |
| 2 | Manual 모달 bottom sheet + 키보드 처리 | 중 | 2-3 fire |
| 3 | SVG ego graph viewBox 동적 + 라벨 정책 | 중 | 2-3 fire |

## 🟡 Phase 3-4 medium fix 3개

- 트리 indent 모바일 축소 + depth 4+ 자동 collapse
- Touch target 44px 보장 (트리 / 강한 관계)
- Tree toolbar wrap (모바일 새 행)

## 🟢 그대로 둠

- GlobalSearch (이미 모바일 친화)
- BottomTabBar 56px (표준)
- grid `md:grid-cols-2` 분기 (정상 작동)

---

## 📊 Phase 2 진척 측정 metric 3개

| metric | 현재 (추정) | Phase 2 목표 |
|---|---|---|
| **NodeDetailPanel 콘텐츠 도달률** — 모든 섹션 (ego 6+ / 관련 문서 6+ / manual note) 이 스크롤 또는 stack 으로 도달 가능 | ~30% (잘림) | 100% |
| **Ego graph 라벨 가독성** — 한국어 라벨이 3 자 이상 표시되는 노드 비율 | ~20% | 70%+ |
| **Manual 모달 입력 완료율** — iOS/Android 키보드 올라온 상태에서 textarea 입력 가능 | 0% (가려짐) | 95%+ |

측정 방법:
- 사용자 손 검증 (iPhone / Android 디바이스 직접) 1 사이클
- 또는 Playwright mobile viewport (Phase 2 후반에 자동 e2e)

---

## 다음 fire — Phase 2 진입 조건

1. 사용자가 위 진단 검토 + Phase 2 우선순위 동의
2. Phase 2 fix 3 개 중 한 개 골라 진입 (작업 4-5 fire 큰 단위라 한 PR 단위로 끝나기 어려움)
3. 권장: **#1 NodeDetailPanel 부터** — 가장 visible · 가장 critical · 다른 fix 의 공통 토대 (mobile 분기 패턴 정립)
