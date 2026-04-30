# 품질 자율 루프 audit (2026-04-30 ~)

> **이 md 는 루프가 매 fire 마다 처음 5 분 동안 읽고, 본 파일의 §6 progress log 만 갱신.** 다른 섹션은 진안의 결정 없이 수정 금지.
>
> 코드 변경은 항상 별도 PR 로 — 본 md 변경 commit 과 분리.

## 0. 루프 동작 규칙 (자기 자신을 위한 지침)

### 0.1 cadence
- **10 분 cron** 으로 동작. 한 fire 가 10 분 안에 끝나야 — 끝나지 않으면 fire 를 더 작게 쪼갠다.
- 한 fire = 한 PR. PR 안에 여러 commit 가능.
- 코드 변경 PR 은 본 md 갱신 commit 과 분리 (audit md 가 매번 PR 에 묶이면 review 부담 폭증).

### 0.2 commit / PR 정책
- 영문 conventional prefix + 한글 본문 (`feat:` / `fix:` / `refactor:` / `chore:` / `test:` / `docs:`).
- 진행한 PR 은 자동 머지 (이전 세션 패턴 — `gh pr merge --squash --delete-branch`).
- 한 fire 안에 PR 머지까지 — 다음 fire 가 main 에서 시작.

### 0.3 verification 의무
- **모든 코드 변경은 Playwright 로 검증**. e2e spec 작성 또는 Playwright MCP browser 직접 조작.
- `pnpm test:run` (vitest), `pnpm exec tsc --noEmit`, `pnpm lint` 매 fire 통과.
- 실제 페이지 동작 확인 안 한 채 "테스트 통과" 만으로는 마무리 금지.

### 0.4 fire 우선순위 결정 (매 fire 처음에 1~2 분 사용)
1. §6 progress log 마지막 항목 읽기 — 어디서 멈췄나
2. §3~§5 의 Track 표 보고 가장 영향 큰 1 항목 pick (회귀 차단 > UX > OSS > 리팩토링 순)
3. fire scope 가 10 분 안 들어가는지 self-check — 안 되면 더 작게

### 0.5 Track 분배 (매 5 fire 마다 검증) — **2026-04-30 업데이트**
- 한 Track 만 5 fire 연속 = 다음 fire 는 다른 Track 강제
- **새 비율 1:1:3:1:1** (진안 결정 — 새 기능/디자인 폴리시 우선):
  - Track A (코드 개선 / 리팩토링 — "필요할 때만" 유지)
  - Track B (UX 폴리시)
  - **Track C (온톨로지 아틀라스 + 새 기능 + 디자인 폴리시) — 가중 3배**
  - Track D (OSS / 성능)
  - Track E (정책 / spec)

### 0.6 배포 정책 (NEW — 2026-04-30)
- **3 cycle 마다 1회 자동 배포** — `pnpm build && firebase deploy --only hosting`
- 빠른 배포 — 진안이 변경 즉시 운영 도메인 (`https://aslan-project-map.web.app`) 에서 검증 가능
- main 빌드 깨짐 시 배포 SKIP + §10 progress log 에 'deploy skipped' 기록
- 배포는 audit md commit 과 별도 — 코드 PR 머지 후 main 에서 직접 실행

---

## 1. 루프의 본질 — 왜 이걸 하나

진안 (1 인 사용자) 이 매번 직접 검토 + 결정하는 부담을 줄이기 위해, 다음 7 축을 자동 점검 + 개선:

1. **기능 개선** — 미완성/누락 기능 닫기, 새 가치 슬라이스 추가
2. **점검** — 회귀 / 깨진 동선 / 죽은 코드 / 깨진 link
3. **기획 완결성** — 모든 기능이 "왜 존재하는지" 이유 검증. 이유 없으면 제거 or 재설계
4. **사용성 (UX)** — **사용자가 처음 봤을 때 "이게 뭐지?" 싶은 라벨 / 흐름 잡아내기**
5. **온톨로지 ERD-style 그래프 구성** — DB ERD designer 같은 직관적 ontology 만들기 도구
6. **OSS 적용** (상용 가능 라이선스) — 2026-04 기준 최신, 렉 없고 성능 좋은 것만
7. **코드 최적화 / 성능 / 아키텍처 규율 / 리팩토링** — **필요 판단 시에만**

특히 **#4 (UX) 가 핵심** — "공개 화면" 같은 모호한 용어를 진안 본인이 이해 못 하면, 외부 사용자는 더 모름. 라벨 / 툴팁 / 빈 상태 안내 / onboarding 모두 처음 보는 사람 시점에서 점검.

---

## 2. 사용자 시점 점검 체크리스트 (매 UX fire 에 적용)

루프가 한 surface 를 점검할 때 다음 5 질문을 자기 자신에게:

1. **라벨 명확한가** — "공개 화면", "검수 큐", "온톨로지" 같은 용어가 처음 보는 사람에게 의미 전달되나? 안 되면 inline tooltip / hint / 짧은 설명 추가
2. **다음 액션 명확한가** — 빈 상태 / 에러 상태에서 사용자가 다음에 뭘 할지 알 수 있나?
3. **돌아갈 길 있나** — sub-page 에서 백링크 / breadcrumb / 출발점 회귀 동선
4. **모바일 (375px) 에서도 작동하나** — 데스크톱에서만 잘 되는 동선 회귀
5. **권한 거부 / 비-로그인 시 우아한가** — 빈 화면 / 0px 영역 / silent fail 없음

각 질문에 "아니오" 면 그게 **이번 fire 의 ticket**.

---

## 3. Track A — 코드 안정성 / 리팩토링 (필요할 때만)

| ID | 항목 | 위치 | 상태 | 판단 |
|---|---|---|---|---|
| A-1 | DocsVaultPage 잔여 분리 — AdvancedMenu | `src/views/docs-vault/ui/DocsVaultPage.tsx` L1860-1997 (137 줄) | ⏸ Fire 4-d-3 | medium (ref + useEffect 페어). callback ref 패턴 권장 |
| A-2 | DocsVaultPage useDocsVaultActions hook | `src/views/docs-vault/ui/DocsVaultPage.tsx` L489-1123 (635 줄) | ⏸ Fire 4-d-4 | high (큰 surface). 단계별 → 먼저 5 handler 만 추출 |
| A-3 | ProjectForm Fire 6-2 — 12 텍스트 필드 Controller wrap | `src/features/project-edit/ui/ProjectForm.tsx` | ⏸ | dirty test 통과 후 단계 분할 |
| A-4 | ProjectForm Fire 6-3 — 배열 필드 (dependencies / screenshots) | `src/features/project-edit/ui/ProjectForm.tsx` | ⏸ | Controller 래핑 |
| A-5 | ProjectForm Fire 6-4 — submit handler 정리 | `src/features/project-edit/ui/ProjectForm.tsx` | ⏸ | setError API 로 비동기 룰 이동 |
| A-6 | 인디고 hex 잔존 grep | `rg "#5e6ad2|94, ?106, ?210" src/` | 미점검 | indigo-tokens.ts 로 통일 후보 |
| A-7 | HomePage 1670 줄 분리 후보 | `src/views/home/ui/HomePage.tsx` | 미시작 | 변경 빈도 보고 결정 — 자주 바뀌면 분할 |
| A-8 | KnowledgeDocumentDetail 1486 줄 분리 | `src/views/knowledge-document-detail/ui/` | 미시작 | outline / actions / review status 3 영역 후보 |
| A-9 | SigmaTopology 1592 줄 — interaction layer 분리 | `src/widgets/topology-map-sigma/ui/` | 미시작 | drag / hover / select 분리 가능 검토 |
| A-10 | OperationsNav signOut redirect 회귀 (`/login/`) e2e | `tests/e2e/post-3fire-coverage.spec.ts` | 미작성 | 회귀 차단 |
| A-11 | 죽은 코드 / 미사용 export 제거 | `pnpm exec ts-prune` (없으면 추가 검토) | 미시작 | 발견 시 별도 PR |
| A-12 | E2E 깨진 스펙 grep — `/admin/dev-login/` 잔존 | `rg "admin/dev-login" tests/` | ✅ 진행됨 (cycle 3/5/14) | 재발 방지 spec 필요 |
| A-13 | shared/ui 컴포넌트 unit test 부재 분 | `src/shared/ui/*.tsx` 중 `*.test.tsx` 없는 것 | ✅ 10/12 (cycle 20~42) | 잔존 toast / tooltip |
| A-14 | features/permissions 의 Firestore rules 페어 검증 | `src/features/permissions/` ↔ `firestore.rules` | 미시작 | 권한 룰 회귀 차단 |
| A-15 | **HomePage 1670 줄 분리** — toolbar / 하단 hint / settings drawer 추출 | `src/views/home/ui/HomePage.tsx` | 새 ticket | medium risk, 매 fire 1 part |
| A-16 | **KnowledgeDocumentDetail 1486 줄 분리** — outline / actions / review status panel | `src/views/knowledge-document-detail/` | 새 ticket | medium risk |
| A-17 | **SigmaTopology 1592 줄 분리** — drag layer / hover layer / select layer | `src/widgets/topology-map-sigma/ui/` | 새 ticket | high risk, 신중히 |
| A-18 | **DocsVaultPage AdvancedMenu 추출** | L1860-1997 ⏸ 보류 | 새 ticket | medium |
| A-19 | **ProjectForm useDocsVaultActions hook 추출** | 큰 surface | 새 ticket | high risk |
| A-20 | **죽은 코드 제거** — `pnpm exec ts-prune` 또는 수동 grep | 미시작 | 새 ticket | low |
| A-21 | **eslint warnings 점차 제거** (현재 57 warnings 누적) | `pnpm lint` | 새 ticket | per-fire 1~2 |

리팩토링 원칙:
- **필요할 때만**. 단순히 "큰 파일이라서" 분리하지 않음. 변경이 잦거나 테스트 힘들거나 review 어려운 곳만.
- 분리 시 본체 시그니처 / 동작 0 변경 (순수 위치 이동).
- 새 widget / hook 마다 unit test 추가.
- Surface 분리 후 `pnpm test:run` + Playwright e2e 1 케이스 (관련 surface) 통과 의무.

---

## 4. Track B — UX / 사용성

> **이 Track 이 가중치 2x** (§0.5). 진안 본인이 "공개 화면" 같은 라벨을 못 알아보면 외부 사용자는 더 모름.

### 4.1 라벨 / 용어 명확화 (모호한 용어 → 설명 추가)

| ID | 항목 | 사용자 시점 질문 | 위치 | 상태 |
|---|---|---|---|---|
| B-1 | "공개 화면" 라벨 명확화 | "공개 = 비-로그인도 보이는?" 처음 알기 어려움 | `src/views/knowledge-document-detail/` `src/widgets/operations-nav/` | 미시작 |
| B-2 | "검수 큐" 4 단계 시각 명확화 | "왜 4 단계인지, 각 단계가 뭘 하는지" 한 번에 | `src/views/knowledge-review-workspace/` | 미시작 |
| B-3 | "온톨로지" 첫 진입 시 한 줄 설명 | "ontology = 지식의 노드/관계 모음" inline | `src/views/ontology-view/` `src/views/settings-ontology/` | 미시작 |
| B-4 | LocalVault vs ServerVault 분기 의미 | "두 source 가 뭐가 다른지" inline 설명 | `src/features/docs-vault-local/` `src/views/docs-vault/` | 미시작 |
| B-5 | "검수" / "승인" / "발행" 동사 정합성 | review / approve / publish — 라벨 vs 코드 vs spec 일치? | grep 광범 | 미시작 |
| B-6 | "Hub" 노드 의미 | IAM/Reactor 만 채색 — 왜 hub 인지 hover hint | `src/widgets/topology-map-sigma/` | 미시작 |
| B-7 | "검수 우회" / "stub" / "B/C 등급" 등급 라벨 | A/B/C 처리 등급의 의미 inline | `src/widgets/frontmatter-onboarding/` | 미시작 |

### 4.2 동선 / 빈 상태 / 에러 상태

| ID | 항목 | 사용자 시점 질문 | 위치 | 상태 |
|---|---|---|---|---|
| B-8 | 빈 ontology 상태 onboarding 강화 | 신규 사용자가 첫 ontology 만드는 절차 | `src/widgets/frontmatter-onboarding/` | 부분 (widget 존재) |
| B-9 | KnowledgeDocumentNewPage "분석 시작" 워크플로 | 비전 사용자가 이해 가능한지 | `src/views/knowledge-document-new/` | 미시작 |
| B-10 | `/projects` 빈 상태 (프로젝트 0 개) — CTA 명확한가 | "다음에 뭐?" | `src/views/project-selector/` | 미시작 |
| B-11 | 권한 거부 / 비-로그인 시 안내 | silent fail / 0px 영역 없는지 | 모든 surface 광범 | 미시작 |
| B-12 | 404 / not-found 페이지 | 출발점 회귀 동선 (홈으로) | `app/not-found.tsx` | 미시작 |
| B-13 | 에러 boundary (`error.tsx`) 한국어 / 회복 동선 | "오류 발생 — 새로고침" 명확한지 | `app/error.tsx` `app/global-error.tsx` | 미시작 |
| B-14 | 공개 카드 hover 시 액션 시각 cue | "여기서 클릭하면 뭐?" | `src/widgets/topology-map-sigma/` | 미시작 |

### 4.3 모바일 / 반응형

| ID | 항목 | 위치 | 상태 |
|---|---|---|---|
| B-15 | `/project/[slug]/edit/` 모바일 (375px) 사용 가능성 | `src/features/project-edit/ui/ProjectForm.tsx` | 미시작 |
| B-16 | DocsVaultPage 모바일 drawer 동선 | `src/views/docs-vault/ui/parts/DocsVaultMobileDrawer.tsx` (있다면) | 점검 |
| B-17 | KnowledgeReviewWorkspace 모바일 — 큐/문서 좌우 분할 | `src/views/knowledge-review-workspace/` | 미시작 |
| B-18 | OperationsNav 모바일 드롭다운 / hamburger | `src/widgets/operations-nav/` | 미시작 |
| B-19 | BottomTabBar 시각 / 라벨 명확성 (4-5 탭) | `src/widgets/bottom-tab-bar/` | 미시작 |

### 4.4 알림 / 시각 피드백

| ID | 항목 | 위치 | 상태 |
|---|---|---|---|
| B-20 | sonner toast 의 한국어 hotkey 라벨 (Alt+T) | `app/layout.tsx` Toaster 옵션 | 미시작 |
| B-21 | 저장 / 발행 / 삭제 액션 후 toast 일관성 | grep `toast.success` `toast.error` | 미시작 |
| B-22 | 로딩 상태 표시 (skeleton vs spinner) 일관성 | shared/ui Skeleton 컴포넌트 | 미시작 |
| B-23 | dirty 상태 시각 (브라우저 unload 경고 + 저장 안 됨 칩) | `src/features/project-edit/` | 미시작 |

각 항목 fire 단위로 closure — 코드 변경 + Playwright 검증 + (필요 시) 라벨 변경 + tooltip / hint 추가.

### 4.5 UX fire 표준 절차 (Playwright MCP)

```
1. browser_navigate — 대상 surface
2. browser_snapshot — 초기 상태 (라벨 / 빈 상태)
3. §2 5 질문 self-Q&A — 답이 "아니오" 인 항목 1 개 fix
4. browser_resize 375x800 — 모바일 점검
5. 변경 후 browser_snapshot 재확인
6. e2e spec 1 케이스 (회귀 차단)
```

---

## 5. Track C — 온톨로지 아틀라스 (Ontology Atlas) — 새 기능 + 디자인 폴리시 [가중 3배]

> 진안 비전: "ontology 만들기가 DB ERD designer 처럼 직관적이어야 함. 도식적으로 노드 끌어다 놓고 관계 그리는 식."
>
> **이름**: 온톨로지 아틀라스 (Ontology Atlas) — 2026-04-30 결정. Aslan project map 의 'map' 컨셉 일관 + ontology = '지식의 척추' (진안 메모) 와 직결.
>
> **디자인 의무 (NEW)**: 단순히 작동하는 게 아니라 **UI/UX 가 예뻐야 함**. 노드 / 엣지 / palette / inspector 모두 micro-interaction polish, motion 일관성, 헌장 §11 안에서 깔끔한 시각.

### 5.1 OSS 후보 비교

| ID | 후보 | 라이선스 | 번들 (gzipped) | 마지막 commit | 헌장 §11 호환 | 결정 |
|---|---|---|---|---|---|---|
| C-1a | `@xyflow/react` (ReactFlow v12) | MIT | ~30 kB | 활성 (2026-04) | theme override 가능 | 후보 1 |
| C-1b | `cytoscape.js` | MIT | ~80 kB | 활성 | canvas 기반, 복잡한 layout 강함 | 후보 (대량 노드용) |
| C-1c | `@projectstorm/react-diagrams` | MIT | ~60 kB | 둔화 | port 기반 ERD 표현 강함 | 보류 (commit 둔화) |
| C-1d | `mermaid` | MIT | ~150 kB | 활성 | 텍스트 기반, drag-drop 약함 | 보류 (DSL 제약) |
| C-1e | `dagre` + `elkjs` | MIT/EPL | dagre 7kB / elkjs 100kB | dagre 둔화 / elkjs 활성 | layout-only | C-1a 보조 |
| C-1f | `react-flow` (구 v11) | MIT | deprecated | — | — | 제외 (xyflow 로 통합됨) |

**잠정 1순위**: `@xyflow/react` v12 + `dagre` (자동 layout 보조). 헌장 호환은 CSS variable override 로 처리.

### 5.2 Surface 설계

| ID | 항목 | 상태 |
|---|---|---|
| C-2 | ontology editor surface 디자인 — 좌 palette / 중 canvas / 우 inspector | 미시작 |
| C-3 | 데이터 model 설계 — 캔버스 좌표 (x,y) 저장 vs 자동 layout | 미시작 |
| C-4 | 헌장 §11 호환 — glow / 보라핑크 / scale hover 금지 검증 | 미시작 |
| C-5 | export — frontmatter md 또는 JSON schema 로 저장 (기존 T-1~T-13 호환) | 미시작 |
| C-6 | `/ontology/edit` 또는 `/settings/ontology/edit` 라우트 결정 | 미시작 (기존 `/settings/ontology` 와 통합 검토) |
| C-7 | 단축키 — 노드 추가 (N), 삭제 (Del), 연결 (드래그) | 미시작 |
| C-8 | undo / redo (Ctrl+Z) | 미시작 |
| C-9 | 자동 정렬 (dagre layered / force-atlas2) toggle | 미시작 |
| C-10 | mobile fallback — 편집 vs read-only 분기 | 미시작 |

### 5.3 단계별 실행 계획 (현재 cycle 1~45 누적)

**완료**:
1. ✅ C-1 (cycle 9) — `@xyflow/react` 설치 + `/ontology/edit/` mount
2. ✅ C-2 (cycle 10) — knowledgeApprovedNodes 구독 + dagre layout
3. ✅ C-3 (cycle 15) — kind palette + ephemeral 노드
4. ✅ C-4 (cycle 19) — inspector + 인라인 이름 편집
5. ✅ C-5 (cycle 24) — Firestore manual 노드 저장
6. ✅ C-6 (cycle 41) — ephemeral edge (handle drag)
7. ✅ UX polish (cycle 29) — 자동 select after add

**다음 (next 6 시간 cycle 우선순위)**:
- **C-7 (NEW name: Atlas) — 라우트/타이틀 rename** — `/ontology/edit/` UX 텍스트 + breadcrumb 전부 "온톨로지 아틀라스" 로 통일
- **C-8 디자인 폴리시 — node visual** — 인디고 alpha gradient (정적, animated X) + kind 별 살짝 다른 톤 + rounded soft shadow (헌장 §11 호환)
- **C-9 디자인 폴리시 — edge visual** — 살짝 곡선 (curve) + kind 별 dash pattern + label 가독성 개선
- **C-10 디자인 폴리시 — palette card** — 4 kind 의 시각적 미니 아이콘 + hover 시 palette card 살짝 backdrop 톤 변화
- **C-11 디자인 폴리시 — inspector slick** — 선택 시 inspector fade-in motion (motion-reduce 준수) + 필드 그룹화 + 더 풍부한 metadata 슬롯
- **C-12 manual edge save** — ephemeral edge → addManualKnowledgeEdge (ephemeral nodes 먼저 저장 후 id 매핑)
- **C-13 frontmatter export** — Atlas 의 현재 그래프를 md frontmatter 로 다운로드 (T-1~T-13 호환)
- **C-14 keyboard shortcuts** — N (new), Del (remove), Cmd+Z (undo), F (fit-view), Esc (deselect)
- **C-15 zoom / pan UX** — Zoom 컨트롤 사용자 친화적 위치 + zoom 단축키 (Cmd+= / Cmd+-)
- **C-16 mobile read-only** — 모바일 (< md) 에서 read-only 보기 + tablet 이상 편집
- **C-17 onboarding overlay** — 첫 진입 시 "노드 끌어다 놓기 / 핸들 drag 로 관계" 3-step inline coach mark
- **C-18 자동 layout toggle** — dagre layered vs force-atlas2 vs manual 전환 button

OSS 도입 검토 기준 (재정의):
- 라이선스 MIT / Apache / ISC (GPL/AGPL 제외)
- 번들 크기 (gzipped < 50 kB 권장. 50-100kB 는 가치 입증 필요)
- 마지막 commit ≤ 6 개월
- WebGL / Canvas 성능 — 대량 노드 (≥ 100) 에서 60fps 유지
- 디자인 헌장 §11 default theme 호환 (or 쉬운 theme override)
- React 19 호환 (Next.js 16 베이스)

---

## 6. Track D — OSS 적용 / 성능

도입된 OSS (이전 fire 기준):
- ✅ `cmdk` (글로벌 검색)
- ✅ `sonner` (toast — 자체 구현 대체)
- ✅ `@tanstack/react-virtual` (project chip 가상화)
- ✅ `@radix-ui/react-tooltip` (tooltip wrapper)
- ✅ `react-hook-form` + `@hookform/resolvers` (Fire 6 RHF foundation)

### 6.1 OSS 후보

| ID | 후보 OSS | 용도 | 라이선스 / 크기 | 상태 |
|---|---|---|---|---|
| D-1 | `@xyflow/react` (ReactFlow v12) | Track C ontology editor | MIT / ~30kB | C-1a 와 통합 |
| D-2 | `vaul` | 모바일 sheet / drawer (Radix-스타일) | MIT / ~10kB | 조사 필요 |
| D-3 | `@tanstack/react-table` | KnowledgeDocumentsPage 큰 표 | MIT / ~14kB | 검토 (사용 빈도 확인) |
| D-4 | `usehooks-ts` | 유틸 (debounce / media-query) | MIT / tree-shake | 조사 |
| D-5 | `@types/wicg-file-system-access` | LocalVault 타이핑 | DT (free) | 검토 |
| D-6 | `mdast-util-from-markdown` 직접 사용 | frontmatter parsing 안정화 | MIT | 검토 (현재 wrapper 있음) |
| D-7 | `zustand` | 복잡한 client state (모달 / dirty / drawer) | MIT / ~3kB | 조사 (현재 useState 산재) |
| D-8 | `@formkit/auto-animate` | 리스트 추가/삭제 애니메이션 (FLIP) | MIT / ~3kB | 헌장 §11 호환 검토 (scale 없는 fade 만) |
| D-9 | `react-resizable-panels` | DocsVaultPage 좌우 분할 사용자 조정 | MIT / ~9kB | 조사 |
| D-10 | `dnd-kit` | 검수 큐 / 카드 drag-drop | MIT / ~10kB | 조사 (Track B-2 와 페어) |

### 6.2 성능 점검 항목

| ID | 항목 | 측정 도구 | 임계값 |
|---|---|---|---|
| D-P1 | Sigma 토폴로지 1979 노드 fps | Chrome DevTools FPS meter | 60fps 유지 |
| D-P2 | cmdk 글로벌 검색 키 입력 latency | Performance.now | < 50ms |
| D-P3 | 정적 export 빌드 시간 | `time pnpm build` | < 3 분 |
| D-P4 | 첫 의미있는 paint (FMP) `/` | Lighthouse | < 1.5s |
| D-P5 | bundle size (gzipped, 첫 페이지) | `next build` 출력 | < 250kB |
| D-P6 | DocsVaultPage 트리 200+ 노드 시 스크롤 jank | Chrome FPS | 60fps |
| D-P7 | KnowledgeDocumentsPage 100+ 행 가상화 | scroll fps | 60fps |
| D-P8 | Firestore onSnapshot listener 수 | DevTools network | 페이지당 < 5 |

### 6.3 의존성 보안 / 업데이트 점검

| ID | 항목 | 도구 | 빈도 |
|---|---|---|---|
| D-S1 | `pnpm audit` | pnpm | 매 5 fire |
| D-S2 | `pnpm outdated` | pnpm | 매 5 fire |
| D-S3 | Next.js / React major 버전 점검 | github releases | 1 회/월 |

---

## 7. Track E — 기획 완결성 (spec ↔ 코드)

| ID | spec / 영역 | 코드 갭 | 상태 |
|---|---|---|---|
| E-1 | `2026-04-27-ontology-v1-experience-concept.md` §6 backlog | O-1 ~ O-9b ✅, O-10 ✅, 그 외? | 점검 필요 |
| E-2 | knowledge-subsystem-v2 foundation 의 worker / publish executor | 미구현 | spec 만 있음 |
| E-3 | T-11 측정 대시보드 결정 | 옵션 B (수동) | 닫힘 |
| E-4 | admin namespace removal Phase 6 (slug 라우트) | 기각 (정적 export 제약) | 닫힘 |
| E-5 | 새 spec 작성 — Track C ontology editor | 미시작 | C 조사 후 |
| E-6 | `/admin/*` 잔존 라우트 → 신 라우트 이행 | grep `app/admin/` | 부분 (대부분 이전 완료, 잔존 점검) |
| E-7 | URL 계약 통합 — `/?p=`, `/project/view/?slug=`, `/project/[slug]` | 진안 비전 = `/project/[slug]` 통일 | 미시작 |
| E-8 | Diagnostics 라우트 의미 / 사용 빈도 | `/diagnostics/*` 가 실제 쓰이는지 | 점검 필요 |
| E-9 | settings 라우트 6 개 (api-keys / categories / hub / ontology / project-import / statuses) 비대칭 | 일관 IA 검토 | 미시작 |
| E-10 | Knowledge backend contract v1 — 클라이언트 stub 잔존 | spec vs 코드 한 줄씩 비교 | 점검 필요 |
| E-11 | 공개 surface 데이터 경계 — `knowledgePublicNodes/Edges` 발행 path | 발행 executor 부재 | E-2 와 페어 |
| E-12 | Mobile vs Desktop UX 분기 정책 spec | 부재 (현재 ad-hoc) | spec 작성 후보 |
| E-13 | 디자인 헌장 §11 자동 검증 spec | scale-hover / glow / 보라핑크 grep 자동화 | lint 룰 후보 |
| E-14 | i18n / 다국어 대비 (현재 한국어 hardcoded) | spec 부재 | 미시작 |
| E-15 | A11y 접근성 spec (axe-core e2e) | `tests/e2e/a11y-structure.spec.ts` 존재 — 확장? | 부분 |

기능마다 "왜 존재하는지" 추적:
- spec 없으면 진안 인터뷰 또는 코드 주석 / 변경 history 로 추론
- 이유가 약하면 제거 후보로 mark
- 이유가 분명한데 사용 어려우면 UX 개선 후보 (Track B)
- spec 있는데 코드 없음 = 구현 후보 (Track A)
- spec 없는데 코드 있음 = spec 작성 후보 (이번 Track E)

### 7.1 정책 정합성 점검 (CLAUDE.md / spec / 헌장 ↔ 코드)

> **이 sub-track 이 핵심**: 진안의 명시적 요구 — "기획적인 완결성이나 정책적으로 안맞는 부분이 없도록".
> 매 5 fire 마다 1 회 강제 점검 (Track E 우선 슬롯).

| ID | 정책 출처 | 점검 항목 | 위반 시 조치 |
|---|---|---|---|
| E-P1 | CLAUDE.md §2 | `/admin/*` 새 라우트 추가 금지 | grep `app/admin/` 후 신 라우트로 redirect |
| E-P2 | CLAUDE.md §6.3 | 정적 export 위반 (`next/server` / `cookies()` / API route) | 즉시 제거, client direct-read 로 대체 |
| E-P3 | CLAUDE.md §6.4 | 공개 surface 가 raw 문서 / review 상태 / extraction 후보 읽지 않음 | Firestore rules 검증, 위반 시 즉시 fix |
| E-P4 | CLAUDE.md §10.3 | source of truth 단일 — 같은 개념을 두 컬렉션 / 두 화면 / 두 입력 경로에서 동시에 진실원으로 두지 않음 | 중복 발견 시 한 쪽으로 통합 |
| E-P5 | CLAUDE.md §11 | 디자인 헌장 — 보라핑크 그라디언트 / glassmorphism / glow pulse / 움직이는 그라디언트 / scale hover / 둘 이상 채색 시스템 | grep 후 즉시 제거 |
| E-P6 | CLAUDE.md §11 | 단일 인디고 (#5e6ad2) + 무채색 외 색상 | indigo-tokens.ts 통일 |
| E-P7 | CLAUDE.md §11 | 신호 톤 (amber 경고 / red 에러) UI 외 사용 금지 | grep `rgba(255, ?179, ?71` `rgba(229, ?72, ?77` |
| E-P8 | CLAUDE.md §10.7 | commit message 한글 prefix (`정리` / `구조` / `루프`) 금지 | git log 점검, 재발 시 PR title 영문 prefix 강제 |
| E-P9 | CLAUDE.md §9 | FSD import 방향 (app→views→widgets→features→entities→shared) | `eslint-plugin-boundaries` 룰 위반 0 유지 |
| E-P10 | CLAUDE.md §6.2 | App Router 만 사용, `pages/` 라우터 도입 금지 | `pages/` 디렉터리 존재 시 즉시 제거 |
| E-P11 | CLAUDE.md §2 | "운영자 / 관리자" 별도 역할 없음 (Notion / Obsidian 모델) | 코드에 admin-only 분기 발견 시 권한 모델 재검토 |
| E-P12 | CLAUDE.md §8 | Knowledge subsystem 최소 슬라이스 — review queue / publish executor / 공개 연동 초기 범위 제외 | 범위 초과 PR 발견 시 plan 재확인 |
| E-P13 | spec `2026-04-27-ontology-frontmatter-contract.md` | 등급 A/B/C frontmatter JSON Schema 위반 | extraction job / parse 시 schema validate |
| E-P14 | spec `2026-04-27-ontology-id-resolution.md` | canonical node ID 충돌 / stub placeholder 잔존 | 매 5 fire 마다 grep 점검 |
| E-P15 | CLAUDE.md §10.5 | URL / metadata / static params / build behavior 변경 시 설계 문서 기록 | 라우트 추가 PR 에 spec 변경 동반 확인 |
| E-P16 | CLAUDE.md §11 | 허브 노드 (IAM/Reactor) 외 채색 금지 | 새 노드 채색 도입 시 진안 결정 필요 |
| E-P17 | 진안 메모 `feedback_no_competitor_names.md` | 다른 서비스 이름 (토스 등) 코드 / 커밋 / 브랜치 금지 | grep 후 발견 시 즉시 rename |
| E-P18 | 진안 메모 `project_ontology_is_core.md` | 토폴로지 단순화 / 온톨로지 우선 — 토폴로지 기능 추가가 ontology 우선순위를 침범하지 않는지 | 새 토폴로지 기능 검토 |
| E-P19 | CLAUDE.md §3 | knowledge subsystem v2 미구현 사실 — spec 만 보고 런타임 가정 금지 | 새 fire 가 knowledge 컬렉션 신규 사용 시 검증 |
| E-P20 | spec `2026-04-25-admin-namespace-removal.md` | 이행 진행 중 — 새 코드는 신 라우트, 구 라우트는 redirect 후 삭제 | Phase 진행 상황 점검 (현재 어디까지?) |

### 7.2 정책 점검 fire 표준 절차

```bash
# 매 5 fire 마다 1 회 (§0.5 Track E 강제 슬롯)

# 1. CLAUDE.md 위반 grep 자동화
rg "from ['\"]next/server['\"]" src/  # E-P2 정적 export 위반
rg "transform: scale\(" src/  # E-P5 scale hover
rg "linear-gradient.*purple|pink.*purple" src/  # E-P5 보라핑크
rg "backdrop-blur" src/  # E-P5 glassmorphism (의도된 사용 제외)
rg "\#[0-9a-fA-F]{6}" src/ | grep -v indigo-tokens  # E-P6 hex 직접 사용
rg "app/admin/" -l  # E-P1 admin 라우트 잔존
rg "/admin/dev-login" tests/  # E-P1 e2e 잔존

# 2. spec ↔ 코드 cross-check (1 spec 당 1 fire)
# 예: ontology-frontmatter-contract.md 의 schema vs frontmatter parser 코드

# 3. 위반 발견 시 즉시 fix PR — Track E 정책 fire 로 §10 기록
# 위반 없음 = "no-op pass" 로 §10 기록 (다음 fire 가 다른 Track 으로 이동)
```

### 7.3 정책 위반 자동 차단 (lint 룰 후보)

매 5 fire 가 수동 grep 으로 점검하지만, 영구 차단은 lint 룰로:

| ID | 룰 후보 | 도입 시점 |
|---|---|---|
| E-L1 | ESLint custom rule — `next/server` import 금지 | E-P2 위반 1 회 발견 시 |
| E-L2 | ESLint — `transform: scale(` 클래스 금지 (Tailwind safelist 정규식) | E-P5 위반 1 회 발견 시 |
| E-L3 | ESLint — hex 색상 직접 사용 금지 (`indigo-tokens` 외) | E-P6 위반 1 회 발견 시 |
| E-L4 | `eslint-plugin-boundaries` 강화 — admin namespace import 차단 | E-P1 위반 1 회 발견 시 |
| E-L5 | commit-msg hook — 한글 prefix 차단 | E-P8 위반 1 회 발견 시 |

---

## 8. 진안 의 운영 메타 정보

- 운영 도메인: `https://aslan-project-map.web.app`
- 운영 계정: `aslan` (공개), `stress-lab` (1979 프로젝트, 데모 계정)
- 진안 본인 계정: `devqamain@gmail.com` (인증된 OSS 작업자)
- 데모 로그인: `/login/` 의 "데모 로그인" 버튼 → `stress-lab` 계정으로 진입
- LocalVault 폴더: 진안 OS 파일 시스템 (브라우저 File System Access API)

검증 운영 절차:
- `pnpm dev` (port 3000) 가 실행 중일 때만 e2e Playwright 실행
- aslan 계정 시각 회귀 spec 은 운영 도메인 (`PLAYWRIGHT_BASE_URL=https://aslan-project-map.web.app`) 또는 운영 데이터 시드된 dev 환경 필요

---

## 9. 진행 history (이전 세션, 참고용)

5-fire 로드맵 + 후속 (PR #195~#216 머지):
- audit 12 papercut 모두 closure (Critical 4 + Annoying 8 + Nit 4)
- title= 22 사이트 95% Tooltip 마이그레이션 + TooltipProvider 전역
- DocsVaultPage 2656 → 2151 (-505, 19%)
- RHF foundation + dirty unit test
- 신규 OSS: sonner / @tanstack/react-virtual / @radix-ui/react-tooltip / react-hook-form

---

## 10. progress log (루프가 매 fire 마다 마지막 줄 추가)

| cycle | 시각 | Track | 항목 | PR | 결과 |
|---|---|---|---|---|---|
| (init) | 2026-04-30 | — | 루프 audit md 작성 | — | 본 md |
| 1 | 2026-04-30 01:03 KST | B (UX) | B-1 / '공개 화면 상태' → '공개 그래프 발행 현황' + Info tooltip | #217 | pass (Playwright MCP hover 노출 확인) |
| 2 | 2026-04-30 01:07 KST | E (정책) → B (UX) | §7.1 정책 grep no-op pass (위반 없음) → B-20 / sonner region '알림 alt+T' → '작업 알림' + hotkey 비활성화 | #218 | pass (region 라벨 단순화 확인) |
| 3 | 2026-04-30 01:16 KST | A (회귀 차단) | A-12 / knowledge-ui.spec.ts admin 폐기 라우트 5 곳 → 신 경로 (knowledge/* + review/knowledge/*) | #219 | pass (Playwright MCP 3 신 라우트 200) |
| 4 | 2026-04-30 01:26 KST | B (UX) | B-3 / 온톨로지 h1 옆 Info tooltip — 첫 진입 사용자 ontology 정의 노출 | #220 | pass (Playwright MCP hover 노출) |
| 5 | 2026-04-30 01:35 KST | A (회귀 차단 cont) | A-12 / overflow-sweep + a11y-structure spec 의 admin 폐기 라우트 5 곳 → /knowledge + /review/knowledge | #221 | pass (curl 200 × 3) |
| 6 | 2026-04-30 01:48 KST | E (정책 영구 차단) | E-13 / 디자인 헌장 §11 lint 룰 (hover:scale + 보라핑크 그라디언트) — Literal/TemplateElement 양쪽 | #222 | pass (probe 2 패턴 catch / 코드 0 위반) |
| 7 | 2026-04-30 01:59 KST | E (정책 점검 강제) | E-P17 / 닫힌 plan + audit log + fixture 의 토스 / Toss / Apple/Toss 라벨 15곳 → 중립 표현. manifest 재생성 | #223 | pass (instruction-level grep 0 잔존) |
| 8 | 2026-04-30 02:06 KST | C (ontology ERD) + E-5 (spec) | 온톨로지 ERD canvas editor v1 spec 작성 (xyflow 채택 + 8 fire 단계별 도입 + 헌장 §11 theme override) | #224 | pass (49 docs vault 등록) |
| 9 | 2026-04-30 02:17 KST | C (ontology ERD 구현) | C-1 / @xyflow/react 설치 + /ontology/edit/ placeholder canvas + /ontology/ 양방향 link | #225 | pass (Playwright MCP Controls 노출 확인) |
| 10 | 2026-04-30 02:27 KST | C (ontology ERD 구현) | C-2 / knowledgeApprovedNodes/Edges 구독 + xyflow read-only 노드 + dagre layered layout (@dagrejs/dagre 채택) | #226 | pass (빈 상태 placeholder 노출 확인) |
| 11 | 2026-04-30 02:37 KST | B (UX) | B-2 / ReviewStepper 4 stage 에 hover Tooltip + aria-label description (단계별 설명 노출) | #227 | pass (4 stage aria-label description 포함 확인) |
| 12 | 2026-04-30 02:46 KST | D (OSS / 첫 D fire) | D-4 / usehooks-ts@^3.1.1 도입 + LandingPage 1 곳 useMediaQuery 교체 (6→5 inline matchMedia) | #228 | pass (tsc/lint/955 tests 통과) |
| 13 | 2026-04-30 02:57 KST | E (정책 grep no-op) + D (cont) | 정책 grep 위반 0 (isAdmin = global SaaS gateway 허용) → D-4 cont / SigmaHubRail useMediaQuery (5→4 inline) | #229 | pass (토폴로지 정상 로드) |
| 14 | 2026-04-30 03:06 KST | A (회귀 차단 cont) | A-12 / admin-dashboard-ui.spec.ts 삭제 + public-topology /admin/project/edit/ → /project/[slug]/edit/ | #230 | pass (curl 200) |
| 15 | 2026-04-30 03:17 KST | C (ontology ERD 구현) | C-3 / palette 좌측 4 kind chip + click-to-add ephemeral 노드 (인디고 dashed border + 임시 N개 지우기 헤더) | #231 | pass (Playwright MCP 도메인 클릭 시 group 추가 확인) |
| 16 | 2026-04-30 03:26 KST | B (UX + 정책) | B-13 / error.tsx + auth-service '관리자에게' 표현 3곳 정리 (§2 Notion/Obsidian 모델 호환) | #232 | pass (grep 잔존 0) |
| 17 | 2026-04-30 03:35 KST | D (OSS) | D-4 cont / DocsVaultFolderTopology prefers-reduced-motion useMediaQuery (4→3 inline matchMedia) | #233 | pass (/docs/ 200) |
| 18 | 2026-04-30 03:46 KST | B (UX) | B-10 / /projects 빈 상태 비-manage 사용자 dead-end 회피 — '워크스페이스 지도로' CTA 추가 | #234 | pass (curl 200) |
| 19 | 2026-04-30 03:57 KST | C (ontology ERD 구현) | C-4 / 우측 inspector 280px + ephemeral 인라인 이름 편집 + approved read-only detail (ReactFlow OnSelectionChange) | #235 | pass (3 column 노출 확인) |
| 20 | 2026-04-30 04:05 KST | A (회귀 차단) | A-13 / Badge unit test (7 케이스) — shared/ui test 보강 (1→2 file) | #236 | pass (955→962 tests) |
| 21 | 2026-04-30 04:15 KST | E (정책 grep no-op) + D (cont) | 정책 grep 위반 0 (E-P2/P5/P6/P9/P10/P17 clean) → D-4 cont DocsVaultGraph useMediaQuery (3→2 inline) | #237 | pass (962 tests) |
| 22 | 2026-04-30 04:25 KST | B (UX) | B-9 / KnowledgeDocumentNewPage 4단계 stepper (1. 올리기 현재 → 2. 분석 자동 → 3. 골라내기 → 4. 공개) | #238 | pass (list 4 listitem 노출) |
| 23 | 2026-04-30 04:36 KST | A (회귀 차단) | A-13 cont / Card unit test 5 sub-component (7 케이스) — shared/ui test 3/12 보유 | #239 | pass (962→969 tests) |
| 24 | 2026-04-30 04:47 KST | C (ontology ERD 구현) | C-5 / ephemeral → Firestore manual 노드 저장 (slugify+kind id, addManualKnowledgeNode, toast 결과, 성공 시 ephemeral 제거) | #240 | pass (코드 + 라우트 검증) |
| 25 | 2026-04-30 04:55 KST | E (정책 잔존 fix) + B (UX) | E-P17 / cycle 7 누락 잔존 — bottom-tab-bar + SigmaTopology 코멘트의 토스/Apple 정리 + '정리' 라벨 의미 보강 | #241 | pass (rg 0 잔존) |
| 26 | 2026-04-30 05:05 KST | D (OSS) | D-4 cont / SigmaTopology prefers-reduced-motion ref-pattern matchMedia → useMediaQuery (6→1 잔존, GestureHint 만) | #242 | pass (969 tests / / 200) |
| 27 | 2026-04-30 05:15 KST | B (UX 일관성) | B-22 / 로딩 라벨 ASCII '...' → Unicode '…' (project-editor + knowledge-document-detail 2곳) | #243 | pass (rg 0 잔존) |
| 28 | 2026-04-30 05:25 KST | A (회귀 차단) | A-13 cont / InfoHint unit test (6 케이스) — shared/ui test 4/12 보유 | #244 | pass (969→975 tests) |
| 29 | 2026-04-30 05:35 KST | C (UX polish) | palette 추가 후 자동 select (cycle 24 알려진 결함 fix) — addNode 가 id 반환 → setSelectedId | #245 | pass (Playwright MCP 즉시 inspector 노출 확인) |
| 30 | 2026-04-30 05:46 KST | E (정책 grep no-op) + A (회귀) | 정책 grep 위반 0 (광범위) → A-13 cont Button unit test 9 케이스 (shared/ui 5/12) | #246 | pass (975→984 tests) |
| 31 | 2026-04-30 05:56 KST | B (UX 일관성) | B-22 cont / 로딩 verb '로딩 중' → '불러오는 중' (순한국어 통일, knowledge-dashboard + ontology-edit) | #247 | pass (rg 0 잔존) |
| 32 | 2026-04-30 06:05 KST | A (회귀 차단) | A-13 cont / DetailCard unit test (7 케이스) — shared/ui test 6/12 보유 | #248 | pass (984→991 tests) |
| 33 | 2026-04-30 06:15 KST | B (UX 데이터 보호) | B-23 / ProjectForm beforeunload 가드 — dirty 상태에서 탭 닫기/새로고침 silent 손실 방지 | #249 | pass (991 tests) |
| 34 | 2026-04-30 06:25 KST | A (회귀 차단) | A-13 cont / LiveAnnouncer unit test (5 케이스, iOS VoiceOver dedup workaround 명시) — shared/ui test 7/12 (58%) | #250 | pass (991→996 tests) |
| 35 | 2026-04-30 06:36 KST | E (정책 grep no-op) + A (회귀) | 정책 grep 위반 0 → ChipListEditor unit test (8 케이스 — readonly + editable interaction + variant §11) — shared/ui 8/12 (67%) | #251 | pass (1004 tests, 1000 milestone) |
| 36 | 2026-04-30 06:45 KST | A (회귀 차단) | A-13 cont / LinkListEditor unit test (9 케이스 — anchor 보안 + Enter commit + 빈 필드 가드 + Esc cancel) — shared/ui 9/12 (75%). **6시간 시뮬레이션 (§17) 마지막 fire 도달** | #252 | pass (1013 tests, +58 누적) |
| 37 | 2026-04-30 06:56 KST | E (정책 정합성 cont) | E-P11 / 잔존 user-facing '관리자' 4곳 정리 (§2 Notion/Obsidian — '공간 주인' / '편집 권한 시' 로 교체) | #253 | pass (rg 0 잔존) |
| 38 | 2026-04-30 07:05 KST | D (OSS 마무리) | D-4 final / GestureHint useMediaQuery — inline matchMedia 6→0 완료 (cycle 12~38, 5 fire 점진) | #254 | pass (rg 0 잔존) |
| 39 | 2026-04-30 07:18 KST | B (UX) + E (정책 잔존) | OperationsNav 5 항목 description tooltip + 코멘트 'Apple Music / 토스 sub-tab' 정리 (E-P17 잔존 fix 마지막) | #255 | pass (1013 tests, fixup 후) |
| 40 | 2026-04-30 07:26 KST | E (정책 grep 강화) | E-P17 / KnowledgeDocumentNewPage 주석 'Obsidian·Notion' 일반화. 강화 grep — Notion·Obsidian 까지 커버 | #256 | pass (E-P1~P17 모두 clean) |
| 41 | 2026-04-30 07:36 KST | C (ontology ERD 구현) | C-6 / ephemeral edge — handle drag → 임시 관계 (인디고 dashed) + self-loop/duplicate 가드 | #257 | pass (1013 tests, persist 없음 — C-7 에서) |
| 42 | 2026-04-30 07:46 KST | A (회귀 차단) | A-13 cont / InlineEditable unit test (12 케이스, 가장 복잡한 ui) — shared/ui test 10/12 (83%) | #258 | pass (1013→1025 tests) |
| 43 | 2026-04-30 07:55 KST | B (UX 데이터 보호) | B-23 cont / KnowledgeDocumentNewPage beforeunload 가드 (title / rawMarkdown / projectIdsInput dirty) | #259 | pass (1025 tests) |
| 44 | 2026-04-30 08:05 KST | D (의존성 점검) | D-S2 첫 실행 — pnpm outdated 표 + firebase-tools 15.15→15.16 safe patch (major 6개 보류 §16) | #260 | pass (1025 tests) |
| 45 | 2026-04-30 08:16 KST | E (정책 grep no-op) + A (회귀) | 정책 grep 위반 0 → useEphemeralNodes hook unit test (9 케이스, ERD canvas 핵심 회귀 차단) | #261 | pass (1025→1034 tests) |
| 46 | 2026-04-30 08:25 KST | C (Atlas rename + 재설계) | **루프 재설계** Track ratio 1:1:3:1:1 + 6h 종료 + 3-cycle deploy + Atlas rename (h1/title) + ticket pool 확장 (Track A 7 + Track C 12) | #262 | pass (1034 tests) |
| 47 | 2026-04-30 08:28 KST | C (Atlas 디자인) | C-8 / Atlas custom node visual — 4 kind 별 인디고 hue + ephemeral '임시' chip + approved soft shadow + selection ring (헌장 §11 호환) | #263 | pass (Playwright MCP custom node 노출 확인) |
| 48 | 2026-04-30 08:35 KST | C (Atlas 디자인) | C-9 / Atlas edge visual — KnowledgeEdgeType 7종별 stroke/dash + label dark bg 가독성 + ephemeral 인디고 accent | #264 | pass (1034 tests) |
| 49 | 2026-04-30 08:46 KST | C (Atlas 디자인) + **첫 deploy** | C-10 / palette card lucide 아이콘 + hover 시각 → 머지 후 `pnpm build && firebase deploy --only hosting` 실행 (cycle 47~49 누적 변경 배포) | #265 | pass (deploy 성공 — https://aslan-project-map.web.app) |
| 50 | 2026-04-30 08:55 KST | C (Atlas 디자인) | C-11 / Atlas inspector slick — framer-motion AnimatePresence fade (180ms opacity, 헌장 §11 + motion-reduce 호환) + ephemeral '저장 ID' / '좌표' grid 메타 | #266 | pass (1034 tests) |
| 51 | 2026-04-30 09:06 KST | A (코드 개선) | A-21 / eslint unused-vars 3 제거 (LandingPage / ProjectSelectorPage / OperationsNav.test) — 57→54 warnings | #267 | pass (1034 tests) |
| 52 | 2026-04-30 09:15 KST | C (Atlas 디자인) + **2번째 deploy** | C-14 / Atlas 키보드 단축키 (N / Del / Esc) + kbd hint row → `pnpm build && firebase deploy` (cycle 50~52 누적 배포) | #268 | pass (deploy 성공) |
| 53 | 2026-04-30 09:25 KST | C (Atlas 디자인) | C-17 / Atlas onboarding overlay — 3-step coach mark (palette/핸들/저장) + framer-motion fade + localStorage 'dismiss' (헌장 §11 + motion-reduce) | #271 | pass (1034 tests) |
| 54 | 2026-04-30 09:37 KST | A (코드 개선) | A-21 cont / DocsVaultPage unused imports 13 제거 (lucide 11 + widget 3 + type 1) — 54→41 warnings | #272 | pass (1034 tests) |
| 55 | 2026-04-30 09:46 KST | D (보안 audit) + A (정리) + **3번째 deploy** | D-S1 첫 audit (production 2 vuln — protobufjs critical / postcss moderate, upstream 대기) + A-21 cont 1 unused → deploy (cycle 53~55 누적 배포) | #273 | pass (deploy 성공) |
| 56 | 2026-04-30 09:55 KST | C (Atlas 기능) | C-13 / Atlas frontmatter export — Blob 다운로드 + spec contract v1 호환 (id/kind/title/status/version) + '## 관계' 섹션 | #274 | pass (1034 tests) |

---

## 11. Surface inventory (자율 픽업용)

루프가 한 fire 안에 surface 한 곳을 집중 점검할 때 참조. 모든 surface 는 `/login/` 후 `stress-lab` 데모 계정으로 접근 가능.

### 11.1 공개 surface (비-로그인 접근 가능)

| 라우트 | views | 용도 | 데이터 소스 |
|---|---|---|---|
| `/` | `views/home/` | 토폴로지 홈 | public projects + knowledgePublicNodes |
| `/projects` | `views/project-selector/` | 공개 프로젝트 목록 | public projects |
| `/project/[slug]` | `views/project-detail/` | 공개 상세 | public projects |
| `/project/view/?slug=...` | (legacy redirect) | 구 URL 호환 | redirect to `/project/[slug]` |
| `/login/` | `views/login/` | 로그인 + 데모 진입 | Firebase Auth |
| `/signup/` | `views/signup/` | 신규 가입 | Firebase Auth |
| `/share/[token]` | `views/share-doc/` | 단일 문서 공유 link | knowledgePublic |

### 11.2 인증 surface (로그인 필요)

| 라우트 | views | 용도 |
|---|---|---|
| `/account/*` | `views/account-settings/` | 계정 설정 / 멤버 관리 |
| `/dev/login/` | `views/dev-login/` | 로컬 우회 로그인 (dev only) |
| `/diagnostics/*` | `views/diagnostics-*/` | 운영 도구 (insights / migrate) |
| `/docs/*` | `views/docs-vault/` | 개인 문서 보관소 |
| `/knowledge/*` | `views/knowledge-*/` | 지식 추출 / 검수 / 발행 |
| `/ontology/*` | `views/ontology-*/` | ontology view / insights / relations |
| `/project/[slug]/edit/` | `views/project-editor/` | 프로젝트 편집 |
| `/review` | `views/knowledge-review-workspace/` | 검수 큐 |
| `/settings/*` | `views/settings-*/` | 시스템 설정 (categories / hub / ontology / etc) |

### 11.3 Surface 진입 검증 (자율 fire 시작 시 1 회)

```bash
# Playwright MCP
browser_navigate http://localhost:3000/{path}
browser_snapshot  # 200 / 404 / 권한 거부 / 빈 상태 어느 쪽?
```

만약 surface 가 권한 거부 → Track B-11 fire 후보. 빈 상태 → Track B-10/B-12 fire 후보.

---

## 12. 함정 / pitfalls (반복하지 말 것)

이전 fire 에서 학습된 함정:

### 12.1 라우트 / e2e

- **`/admin/*` 네임스페이스는 폐기됨** — 새 spec / route / e2e 에서 `/admin/dev-login/` 같은 경로 쓰지 말 것. `/dev/login/` 사용.
- **`role="tab"` 제거됨** (PR #206) — `aria-current='page'` 사용. e2e 셀렉터 갱신 필요.
- **DocsVaultTree 는 `<nav aria-label="문서 트리">`** — `role="tree"` 아님.
- **public-auth.spec.ts 비활성화** — h1 sr-only + h3 visible strict mode violation. Firebase emulator 필요. 재활성화는 별도 fire.

### 12.2 정적 export 제약

- **dynamic [id] 라우트 + auth-gated 데이터 = 불가능**. `getStaticParams` 가 빌드 시 모든 슬러그를 알 수 없음. `?id=` query 패턴 유지.
- **server-only 의존성 금지** — `next/server`, `cookies()`, `headers()` 등.
- **API route 사용 금지** (`output: 'export'` 와 비호환). Firebase callable functions 또는 client direct-read 사용.

### 12.3 디자인 헌장 §11

- 새 OSS 도입 시 default theme 검토 — glow / scale hover / 보라-핑크 그라디언트 default 면 override 필수.
- `transform: scale(...)` hover 금지. `bg-[color:rgba(...)]` 변경으로 대체.
- 인디고 hex 직접 사용 금지 — `src/shared/config/indigo-tokens.ts` 의 `indigoRgba()` 사용.

### 12.4 RHF + Zod

- `zodResolver` 의 input/output 타입 mismatch — `as never` cast 또는 `Resolver<T>` 명시 필요.
- `setValue` 의 Path<T> 타입 — `Parameters<typeof rhfSetValue>[0]` 로 우회 가능하지만 가능하면 정확한 path 사용.
- `default([])` 가 zod 에서 input/output 분기 만듦 — RHF resolver 호환 시 주의.

### 12.5 검증

- "테스트 통과" 만으로는 마무리 금지 — Playwright MCP browser snapshot 또는 e2e 실제 동작 확인 의무.
- e2e 실패 시 셀렉터 outdated 가능성 먼저 점검 (admin-namespace / role-attr 변경).

---

## 13. Verification 레시피 라이브러리

### 13.1 surface 표준 점검 (모든 fire 공통)

```bash
# 1. 정적 검증
pnpm exec tsc --noEmit
pnpm lint
pnpm test:run

# 2. dev 서버 (이미 동작 중인지 확인)
curl -s http://localhost:3000/ -o /dev/null -w "%{http_code}\n"
# 200 = OK. 아니면 pnpm dev 시작.

# 3. 변경 surface 만 e2e 실행
pnpm exec playwright test tests/e2e/{관련-spec}.spec.ts --reporter=line
```

### 13.2 UX fire (Playwright MCP)

```
browser_navigate http://localhost:3000/{surface}
browser_snapshot
# §2 5 질문 self-Q&A
# 변경 후
browser_snapshot
browser_resize 375 800
browser_snapshot
```

### 13.3 ProjectForm RHF 회귀

```
browser_navigate http://localhost:3000/project/{slug}/edit/?account=stress-lab
browser_fill_form ... # name / description 변경
# dirty 칩 노출 확인
browser_click 저장
# toast 노출 + dirty 해제 확인
```

### 13.4 DocsVaultPage 회귀

```
browser_navigate http://localhost:3000/docs/?account=stress-lab
# sidebar / outline / drawer / advanced menu 동작
# 인쇄 popout — handleExportDocHtml 수동 smoke
```

### 13.5 토폴로지 stress 검증

```
# stress-lab 계정 — 1979 노드
browser_navigate http://localhost:3000/?account=stress-lab
# Chrome DevTools FPS 60 유지 확인
# cmdk 검색 latency < 50ms
```

---

## 14. fire scope 안 쪽 / 바깥 쪽 가이드 (10 분 안에)

### 14.1 IN (10 분 안 가능)

- 라벨 1~3 곳 변경 + tooltip 추가
- 작은 컴포넌트 추출 (50~150 줄)
- e2e spec 1~2 케이스 추가
- OSS 1 개 설치 + 기본 마운트
- 1 surface 의 5 질문 점검 + 1 fix
- typo / 한국어 메시지 정정
- test ID 추가 / 셀렉터 보강
- Firestore 룰 1 줄 변경 + 테스트

### 14.2 OUT (별도 fire 또는 plan 필요)

- 큰 컴포넌트 (300+ 줄) 통째 추출
- 새 라우트 + 페이지 + 데이터 모델 (multi-PR)
- OSS 도입 + 기존 컴포넌트 전면 교체
- 다국어 도입
- 새 Firebase function 작성

10 분 초과가 보이면 **fire 더 작게 쪼갠다** (§0.4 self-check).

---

## 15. 자율 픽업 우선순위 (매 fire §0.4 절차)

```
1. §10 progress log 마지막 5 줄 읽기
   ↓
2. 마지막 정책 점검 fire 가 5 fire 전? → §7.1 정책 점검 강제 (E-P*)
   ↓
3. 같은 Track 5 연속? → 다른 Track 강제 (§0.5)
   ↓
4. 회귀 / 깨진 e2e? → Track A 강제 (회귀 차단 1순위)
   ↓
5. 모호 라벨 / 빈 상태 미정 surface? → Track B
   ↓
6. ontology editor 단계별 진입? → Track C
   ↓
7. OSS 후보 활성? → Track D
   ↓
8. spec ↔ 코드 갭? → Track E (정책 외)
```

**§7.1 정책 점검은 무조건 매 5 fire 마다** — 위반 없으면 "no-op pass" 로 §10 기록하고 다음 fire 가 다른 Track. 위반 있으면 즉시 fix PR.

각 Track 안에서는 표 위쪽부터 (영향 큰 순). pick 한 ticket 의 ID 를 §10 progress log 에 명시 (예: "B-1 / 공개 화면 라벨 명확화").

---

## 16. 진안 의 운영 보호 정책 (자율 루프 가드레일)

자율 루프가 침범하면 안 되는 영역:

- **production 데이터 수정 금지** — `aslan-project-map.web.app` 의 Firestore 직접 변경 X. dev 환경 / 데모 계정만.
- **새 도메인 / 새 Firebase 프로젝트 생성 금지**.
- **dependency major 업그레이드 금지** — patch / minor 만. major 는 진안 결정 후.
- **새 .env 환경변수 추가 시 진안 통보** — `.env.example` 갱신.
- **CI / GitHub Actions / Firebase deploy 설정 변경 금지** — 별도 fire 필요.
- **본 audit md 의 §0~§9 / §11~§16 수정 금지** — §10 progress log 만 갱신.
- **머지 전 main 빌드 깨지면 즉시 rollback** — fire 결과 "regress" 로 기록 후 다음 fire 가 fix.

위반 가능성이 있는 fire 는 **defer** 로 §10 에 기록하고 다른 ticket 으로 이동.

---

## 17. 6 시간 운영 시뮬레이션 (참고)

10 분 cron × 36 fire = 6 시간. Track 비율 1:2:1:1:1 → A 6 + B 12 + C 6 + D 6 + E 6.

| 시간대 | Track 분배 (예상) | 누적 산출물 |
|---|---|---|
| 0-1h | A 1 + B 2 + C 1 + D 1 + E 1 | 6 PR / log 6 줄 |
| 1-2h | A 1 + B 2 + C 1 + D 1 + E 1 | 12 PR |
| 2-3h | A 1 + B 2 + C 1 + D 1 + E 1 | 18 PR |
| 3-4h | A 1 + B 2 + C 1 + D 1 + E 1 | 24 PR |
| 4-5h | A 1 + B 2 + C 1 + D 1 + E 1 | 30 PR |
| 5-6h | A 1 + B 2 + C 1 + D 1 + E 1 | 36 PR |

티켓 총수 (현재 §3-§7): A 14 + B 23 + C 10 + D 18 + E 15 = **80 항목**. 6 시간 = 36 fire 에 충분. 12 시간 (72 fire) 도 가능.

---

## 18. fire 종료 체크리스트 (매 fire 마지막 1 분)

- [ ] PR 머지 완료 (`gh pr merge --squash --delete-branch`)
- [ ] `git pull origin main` (다음 fire 가 main 에서 시작)
- [ ] §10 progress log 한 줄 추가 (cycle / 시각 / Track / 항목 / PR # / 결과)
- [ ] audit md commit 분리 (코드 PR 과 다른 commit)
- [ ] 다음 fire 가 같은 Track 5 연속? 다른 Track 으로 회피 가능한지 §0.5 점검
- [ ] 만약 fire 실패 → §10 결과 "regress" 또는 "defer" 기록 + 다음 fire 가 fix 우선

---

## 19. 자율 루프 종료 조건 — **2026-04-30 업데이트**

### 19.1 시간 기반 (NEW)
- **6시간 운영** 후 self-pause — cycle 46 시작 시각 + 6h
- 진안 명시 재시작 또는 새 audit md 없으면 멈춤

### 19.2 회귀 / 안정성
- 진안이 명시적으로 종료 ("loop 멈춰" / "stop")
- main 빌드 3 회 연속 깨짐 → self-pause + 진안 호출
- 정책 grep 위반이 같은 fire 안에서 fix 안 됨 → self-pause

### 19.3 ticket 고갈
- audit md §3-§7 모든 ticket 닫힘 → 진안 호출 ("새 ticket 추가 또는 종료?")

### 19.4 progress log
- 50 줄 도달 — 진안 결정 요청 (continue / pause). cycle 45 까지 51 줄 도달 → 진안 응답 후 cycle 46 부터 재시작 (현재).
