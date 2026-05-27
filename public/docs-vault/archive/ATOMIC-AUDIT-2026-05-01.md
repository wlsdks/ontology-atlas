# Atomic Audit — Mission v2 First-Principles Decomposition

> **Date**: 2026-05-01 (mission v2 cleanup 10 PR 머지 후)
> **Method**: 12 도메인을 Haiku 병렬 sub-agent 로 분석. 1원리 게이트 — *"X 가 없어도 사용자/AI agent 가 mission v2 를 수행할 수 있는가?"*
> **Mission v2**: "사람과 AI agent 가 같이 저작하는 codebase 의 ontology"
> - 척추: md frontmatter → ontology
> - AI agent (Claude Code 등) = MCP partner
> - frontmatter 자체가 자기-승인
> - 3 view: 트리 (`/`) / 토폴로지 (`/topology` Sigma) / 빌더 (`/ontology/edit` xyflow)

---

## TL;DR — 도메인별 1원리 평가 한눈에

| # | 도메인 | 결정 | 핵심 결과 |
|---|---|---|---|
| 1 | **Routes** (app/) | ✅ PASS | 27 라우트 모두 mission 정렬, 의도된 부재 (`/admin/*` · `/review/*` · `/share/*`) 0 |
| 2 | **Vault local-first** | ✅ PASS | 척추 (frontmatter→ontology) 외부 의존 0, fastpath 견고. P0/P1 = optional refactor |
| 3 | **Mode-aware adapters** | ✅ PASS | 5 hook (`useDataSourceMode` / `useProjects` / `useProjectMutations` / `useOntologyInsight` / `useTaxonomy`) 모두 3 mode 처리 |
| 4 | **Ontology core** (TBox+ABox+Evidence+V1.1) | ✅ PASS | 척추 직결 6 영역 (TBox versioning · ABox · Evidence · V1.1 qualifiers/rank · manual editor · vault fastpath). dead code 0 |
| 5 | **Search + 단축키** | ✅ PASS | 척추 직결, ⌘K + ⇧⌘K + ? 일관. vault stub 검색 통합 (local 모드만 — 마이너 gap) |
| 6 | **Builder + xyflow** | ✅ PASS (마이너) | 사람 저작 surface 척추 직결. C-5 (approved 노드 in-canvas 편집) + vault md write 미구현 |
| 7 | **Topology** (Sigma WebGL) | ✅ PASS | 출구 view 1 으로 견고. Layer 0 컨테이너 잔재 활용도 점검 후보 (P2) |
| 8 | **Knowledge documents** (cloud) | ⚠️ 부분 dead | knowledge-job/output/evidence 는 cold storage. cloud 모드만 가치 — vault 모드 의미 0 |
| 9 | **Auth + permissions** | ✅ PASS | local-first 0 마찰 약속 유지. account-scope dead code 정리 후보 (P1) |
| 10 | **Settings + diagnostics** | ✅ PASS | dead 0, 운영자 영역 모두 mission 정렬 |
| 11 | **Widgets** | ⚠️ dead 발견 | `ontology-output-badges` (425 줄, 0 imports) + `candidate-ontology-match` (106 줄, extraction 의존) DEAD |
| 12 | **MCP server** | ✅ PASS | 7 도구 95% workflow 커버. T30 (find_path) + T31 (list_kinds) optimization, blocking 아님 |
| 13 | **Project + landing** | ✅ PASS | Project entity + ProjectForm 척추 견고, landing mission v2 정렬, project-editor/selector 라우팅 명확화 후보 |

전체 결론: **mission v2 정렬 매우 견고**. 척추 (md frontmatter → ontology + AI agent partner + 3 view) 가 모든 도메인에서 직결. mission v2 cleanup 10 PR 효과 검증됨. **신규 dead code 2 widget (-531 줄) 발견 — 즉시 정리 가능 P0**.

---

## 1. Routes (app/)

**결정**: ✅ PASS — 27 라우트 모두 mission 정렬, 의도된 부재 (`/admin/*` · `/review/*` · `/share/*` · `/project/topology` · `/project/view`) 0.

### 핵심 발견
- 모든 mission-critical path (`/` ontology hub · `/topology` Sigma · `/ontology/edit` builder · `/docs` vault picker · `/knowledge` documents · `/projects` list) 활성
- title metadata template `'%s · oh-my-ontology'` 일관
- canonical URLs + OG 이미지 + robots 정책 정확
- generateStaticParams (project/[slug] + opengraph-image) build-time fetch
- 404/error boundary 3-layer (`error.tsx` / `not-found.tsx` / `global-error.tsx`)

### P1 단순화 후보
- `/diagnostics/page.tsx` redirect → `/diagnostics/insights/` 직접 link 로 대체 가능
- `/docs` robots: index 정책 검증 (내부 ref 만이면 noindex)

---

## 2. Vault Local-First

**결정**: ✅ PASS — 척추 (frontmatter → ontology) 외부 의존 0, manifest 빌드 + fingerprint skip 견고.

### 핵심 모듈 (척추 직결 7개)
- `useLocalVault` — manifest 호스팅 + handle 영속
- `buildLocalManifest` — FS walk + frontmatter parse + backlink + heading + excerpt + fingerprint
- `deriveOntologyFromVault` — kind/domain/capabilities/elements/relates → OntologyStubNode/Edge
- `useVaultOntology` — vault.manifest → derivation
- `useOntologyInsight` (mission v2) — mode-aware vault stub 변환
- `VaultOntologyStubsPanel` — UI 노출
- `local-fs-handle` — IndexedDB 영속

### P1/P2 후보 (척추 외)
- `findRelatedDocs` (107 줄) / `findRelationshipRadarSuggestions` (136 줄) — 발견 heuristic, optional plugin 분리 후보
- `scaffoldTopology` — 빈 vault 부트스트랩, vault-scaffold feature 분리 후보
- `applyFrontmatterUpdates` / `serializeFrontmatterValue` — shared lib 으로 추출 후보

---

## 3. Mode-Aware Adapters

**결정**: ✅ PASS — 5 hook 모두 3 mode 처리, 의존 그래프 깔끔.

### Hook 정렬
| Hook | 3 mode 처리 | 결정 |
|---|---|---|
| `useDataSourceMode` | static/local/cloud | ✅ 척추 |
| `useProjects` | local sync + cloud subscribe + static fallback | ✅ 척추 |
| `useProjectMutations` | static reject + local FS + cloud Firestore | ✅ 척추 |
| `useOntologyInsight` (mission v2) | local vault stub + cloud Firestore subscribe | ✅ 척추 |
| `useTaxonomy` | cloud subscribe + local/static defaults | ⚠️ 부분 (vault 커스텀 taxonomy 미구현) |

### Anti-pattern 발견 0 (silent fallback to demo / mode 없는 직접 Firestore subscribe / mutation only mode-aware) 모두 통과.

### P2 후보 (긴급도 낮음)
- TaxonomyProvider: vault 의 `categories.md` / `statuses.md` 커스텀 지원 (현재 default fallback)
- `useVaultOntology` 내부 mode 검증 명시 (현재는 useOntologyInsight 안에서만 호출)

---

## 4. Ontology Core (TBox + ABox + Evidence + V1.1)

**결정**: ✅ PASS — 척추 직결 6 영역 모두 견고, dead code 0.

### 인벤토리
| 영역 | 줄수 | 상태 |
|---|---|---|
| TBox Core (ontology-class/relation/tbox) | 610 | ✅ |
| ABox (knowledge-graph types/mapper/api) | 743 | ✅ |
| Evidence (knowledge-evidence/evidence-summary) | 108 | ✅ |
| Manual editor (modals) | 785 | ✅ |
| Fast path (derive-ontology-from-vault) | 253 | ✅ |
| UI projection (tree/stub/ego) | 878 | ✅ |
| **합계** | ~3,500 | **dead code 0** |

### 차별점 검증
- **TBox versioning**: `ontologyTBoxVersions/{vN}` immutable + `ontologyTBoxState/{accountId}` active pointer
- **Evidence-grounded**: 모든 statement 이 evidenceIds 배열 가짐
- **V1.1 qualifiers + rank**: 4 qualifier kind (string / time / quantity / nodeRef) + 3 rank
- **Manual editor source tracking**: `source='manual'` + manualAuthor + tboxVersionId

### V1.x 진화 차단 분석
- V1.1 ✅ 완료
- V1.2 (literals) — 새 컬렉션 + types 확장 필요
- V1.3 (rich refs) — evidence 필드 확장 필요
- V1.4 (ActionType) — DEFERRED (Q4 + 보안 sub-spec)
- V1.5 (cardinality) — 즉시 가능

---

## 5. Search + 단축키

**결정**: ✅ PASS — 척추 직결, vault stub 통합 (local 모드).

### Widget 인벤토리
| Widget | 줄수 | 역할 |
|---|---|---|
| GlobalSearch (`⇧⌘K`) | 464 | ontology + 문서 + 프로젝트 통합 |
| MountedGlobalSearch | 144 | subscribeKnowledgePublicGraph 자동 mount |
| SearchPalette (`⌘K`) | 695 | 프로젝트 전용 + vault docs 보조 |
| ShortcutSheet (`?`) | 287 | 9 섹션 단축키 카드 |
| SearchHint | 105 | 상단 약약 (검색/Regions/Autolayout) |
| RegionNavigator | 145 | 카테고리/허브 필터 |

### 핵심 흐름 (mission v2 정렬)
- vault `.md` → `useVaultOntology` → `useOntologyInsight` → MountedGlobalSearch.subscribeKnowledgePublicGraph → GlobalSearch 매칭
- ⚠️ Cloud mode 에서는 vault stub 검색 미통합 (마이너 gap, P2)

### P2 후보
- SearchPalette 문서 검색 점수 정렬 (현재 top 3 단순 매칭)
- "N" 키 정의 (ShortcutSheet 에 있는데 실제 binding 미확인)
- Project chip filter 를 GlobalSearch 에도 추가

---

## 6. Builder + xyflow ERD Canvas

**결정**: ✅ PASS — 사람 저작 surface 척추 직결, marginal issue 2개.

### 핵심 흐름
1. Palette click → `useEphemeralNodes.addNode(kind)` → temp node
2. Handle drag → `useEphemeralEdges.addEdge(connection)` → temp edge
3. Inspector → `addManualKnowledgeNode({id: "kind.slug", title, kind})` → Firestore upsert
4. md export → frontmatter + body → blob download

### Marginal Issues (P1)
- **C-5 미구현**: approved 노드 in-canvas 편집 불가 (read-only inspector 만)
- **Vault md write 부재**: ephemeral export 는 client-side blob only, vault 디스크에 직접 쓰는 path 없음

### Phase 4 적용 가능 영역
- Kind 별 lucide 아이콘 추가 (현재: dashed border + 텍스트만)
- Edge type selector UI (현재: related_to 하나만)
- 한국어 매핑 layer (이미 부분 적용)

---

## 7. Topology (Sigma WebGL)

**결정**: ✅ PASS — 출구 view 1 견고, 성능 가드 양호.

### 인벤토리 (총 11,798 줄, 34 파일)
- UI 핵심 3개 (SigmaTopology / SigmaControls / SigmaHubRail) — 2,200 줄
- 그래프/물리 (graph-build / physics) — 950 줄
- Reducer 6개 (filter / focus / overlay-flags / context-dim / audit / container-hover / anim) — 565 줄
- 보조 (camera-url-sync / keyboard-nav / depth / palette / tone / labels) — 590 줄
- 뷰 widgets (focus-label / tooltip / context-menu / minimap) — 810 줄
- 테스트 — 1,400+

### 성능 가드 검증
- ✅ `allowInvalidContainer: true` (SSR 통과)
- ✅ `dynamic({ ssr: false })` (WebGL SSR 가드)
- ✅ zoom LOD `lodHideRatio 1.8/2.4`
- ✅ ForceAtlas2 한 번 settle 후 d3-force 미세조정
- ✅ recent pulse sine 변조 (색상 변경 0)

### P2 후보
- Layer 0 컨테이너 drill-down (`stripNamePrefix` / `reducer-container-hover.ts` / `CONTAINER_COLOR`) — 활용도 낮으면 -40+줄 정리 가능

---

## 8. Knowledge Documents (cloud-mode)

**결정**: ⚠️ 부분 dead — vault 모드 의미 0, cloud 모드만 가치.

### 인벤토리 (총 5,859 줄)
| 영역 | 줄수 | 상태 |
|---|---|---|
| knowledge-document core (api / model / lib) | 1,126 | ✅ active (cloud) |
| knowledge-version (record / mapper) | 210 | ✅ active (cloud) |
| knowledge-job | 319 | ⚠️ deprecated (mission v2) — read-only display 만 |
| knowledge-output | 371 | ❄️ cold storage |
| knowledge-evidence | 137 | ❄️ cold storage |
| views (4 page) | 3,506 | ✅ active (cloud) |
| document-ontology-evidence widget | 90 | ✅ read-only |

### Mission v2 분석
- **vault 모드**: knowledge-document 의미 0 — vault `projects/*.md` + frontmatter 가 진실원
- **cloud 모드**: 신규 `.md` 업로드 + 버전 관리의 유일한 surface
- **dead 영역**: knowledge-job / knowledge-output / knowledge-evidence — cold storage, 신규 writing 0

### P1 후보 (BACKLOG T24)
- knowledge-job 의 `latestJobStatus` 필드 / `jobStatus` 필터 — 사용처 검증 후 archive
- knowledge-output / knowledge-evidence — DocumentOntologyEvidenceSection 외 의존 검증 후 deprecate
- 컬렉션 정규화: `knowledgeDocumentVersions` 단일화

---

## 9. Auth + Permissions

**결정**: ✅ PASS — local-first 0 마찰 유지.

### 핵심 게이트 분석
- **공개 (로그인 0)**: `/`, `/login`, `/signup`, `/reset-password` + 모든 read-only ontology surface
- **로그인 게이트 (PermissionGate)**: `/account`, `/settings/*`, `/project/*/edit`, `/knowledge/*` — 쓰기 작업 전용
- **demo 우회**: `signInWithDemo()` → `localStorage` demo session → 로그인 없이 진입

### Anti-pattern 발견 0
- ✅ Firebase Auth (email/password + Google) 만
- ✅ dev-admin-bypass 0 (이미 제거됨)
- ✅ PermissionGate 가 default 흐름 차단 안 함
- ✅ 외부 IAM / Magic link / OTP / SMS 0

### P1 후보 (single-user 잔재)
- `?account=` URL query 완전 제거
- `normalizeAccountId` / `ACCOUNT_QUERY_KEY` 삭제
- PermissionGate accountId 분기 → 자기 공간만 체크

---

## 10. Settings + Diagnostics

**결정**: ✅ PASS — dead code 0, 운영자 영역 모두 mission 정렬.

### 인벤토리 (총 3,840 줄, 20 파일)
| 영역 | 줄수 | 운영자 역할 |
|---|---|---|
| settings-hub | 157 | iOS Settings 패턴 진입점 |
| settings-categories | 1,392 | 라벨·배치·크기 |
| settings-statuses | 784 | 상태 라벨·색상 |
| settings-project-import | 318 | CSV 일괄 |
| settings-ontology | 361 | TBox read-only + version 추가 |
| settings-ontology-history | 161 | snapshot list |
| diagnostics-insights | 386 | stale/orphan/promotion |
| account-settings | 281 | (인증 영역, 분리됨) |

### Mission v2 검증
- ✅ `api-keys` / `migration` / `extraction settings` 잔재 0
- ✅ TaxonomyProvider mode-aware (local/static defaults, cloud subscribe)
- ✅ TBox restore phase 2 예약 (주석 명시)

---

## 11. Widgets (보조 UI)

**결정**: ⚠️ dead 발견 — `ontology-output-badges` + `candidate-ontology-match`

### Inventory (이미 audit 한 것 제외, 23 widget)

| Widget | 줄수 | 호출처 | 결정 |
|---|---|---|---|
| account-menu (PublicAccountMenu) | 401 | 5 페이지 | ✅ KEEP |
| operations-nav (OperationsNav) | 206 | 16 페이지 | ✅ KEEP (mission spine nav) |
| project-drawer (ProjectDrawer) | 1,220 | HomePage | ✅ KEEP |
| project-knowledge-topology | 872 | HomePage / ProjectDetail | ✅ KEEP |
| workspace-ontology-strip | 78 | HomePage / ProjectSelector | ✅ KEEP |
| docs-quick-drawer | 998 | HomePage (lazy) | ✅ KEEP |
| docs-vault (다양) | 4,753 | vault ecosystem | ✅ KEEP (local 모드 major surface) |
| project-documents-list | 203 | ProjectDetail | ✅ KEEP |
| project-ontology-overview | 114 | ProjectDetail | ✅ KEEP |
| dashboard-ontology-summary | 130 | KnowledgeDashboard | ✅ KEEP |
| document-new-ontology-hints | 176 | KnowledgeDocumentNew | ✅ KEEP |
| document-ontology-evidence | 90 | KnowledgeDocumentDetail | ✅ KEEP (read-only) |
| frontmatter-onboarding | 217 | KnowledgeDocumentNew | ✅ KEEP |
| tbox-class-create-modal | 322 | SettingsOntology | ✅ KEEP |
| tbox-class-edit-modal | 292 | SettingsOntology | ✅ KEEP |
| tbox-relation-create-modal | 374 | SettingsOntology | ✅ KEEP |
| ontology-export-modal | 353 | SettingsOntology | ✅ KEEP |
| ontology-import-modal | 322 | SettingsOntology | ✅ KEEP |
| bottom-tab-bar (BottomTabBar) | 82 | 3 페이지 | ✅ KEEP (mobile mirror) |
| public-quick-actions | 147 | ProjectDrawer | ✅ KEEP |
| search-hint (SearchHint) | 106 | HomePage | ✅ KEEP |
| **candidate-ontology-match** | **106** | **DocumentNewOntologyHints만** | **⚠️ DEAD (extraction 의존)** |
| **ontology-output-badges** | **425** | **0 imports** | **⚠️ DEAD (extraction review-queue)** |

### Dead 발견
- **`src/widgets/ontology-output-badges/` (425 줄, 0 imports)** — extraction pipeline + review queue 의존, mission v2 cleanup 후 orphaned
- **`src/widgets/candidate-ontology-match/` (106 줄)** — DocumentNewOntologyHints 만 호출, hint 자체가 extraction 결과 매칭 surface 라 의미 없음

### P1 추가 후보 (label 정합)
- `bottom-tab-bar` ↔ `operations-nav` 라벨 일치 audit (코드 주석 A2-6 참조)

### P2 후보 (복잡도 검토)
- `docs-vault` 4,753 줄 — local 모드 major surface 지만 매우 큼, 분리 가능성
- `project-drawer` 1,220 줄 — list + detail + docs + integrity 혼재, concern separation 후보

---

## 12. MCP Server + Dogfood Vault

**결정**: ✅ PASS — 7 도구 95% workflow 커버, 견고.

### Package inventory (총 950 줄)
| File | 줄수 | 책임 |
|---|---|---|
| mcp/package.json | 22 | Node v20+, MCP SDK ^1.0.0 |
| mcp/src/index.js | 360 | Server host + 7 도구 spec/impl |
| mcp/src/vault.mjs | 216 | walk / read / write / patchFrontmatter / findBacklinks |
| mcp/src/parser.mjs | 143 | scalar / inline-list / block-list / inline-object / block-object |
| mcp/src/parser.test.mjs | 93 | 7 smoke tests, 전부 PASS |
| mcp/README.md | 105 | 등록 가이드 |
| .mcp.json.example | 11 | Claude Code config 템플릿 |

### Dogfood vault 인벤토리 (21 노드)
- 1 root project
- 8 domain (vault-local-first / mode-aware-adapters / ontology-core / views / ai-agent-partner / auth-account / settings-diagnostics / onboarding-ux)
- 7 capability (frontmatter-to-ontology / mcp-server / mode-aware-adapter / ontology-hub-mode-aware / tbox-versioning / topology-sigma-render / v1-1-qualifiers-rank)
- 4 element (file-system-access-api / mcp-sdk / sigma-graphology / xyflow)
- 1 vault-readme

### 1원리 평가
- **Discovery / Detail / Traceability / Authorship / Refinement** workflow 모두 cover (95%)
- Slug-based addressing (human-readable, path-friendly)
- Schema-less frontmatter (validation overhead 0)
- Sync I/O (21 노드 vault 에 충분, async 오버헤드 회피)

### Tool gap (P1/P2)
- T30 `find_path(from, to)` — 그래프 traversal optimization
- T31 `list_kinds()` — kind 분포 통계
- (선택) `delete_concept` — confirmation pattern 필요

### Dogfood vault 정렬 gap
- AI agent domain 의 capability 5개 → 7개로 분리 후보 (`mcp-add-relation`, `mcp-patch-concept`, `mcp-find-backlinks` 별도 노드)

### Parser 동기화 검증
- ✅ `mcp/src/parser.mjs` (JS) 와 `src/shared/lib/parse-frontmatter.ts` (TS) 가 capability 동기화
- ✅ Roundtrip (serialize → parse → identical) test pass

---

## 13. Project Entity + Landing

**결정**: ✅ PASS — entity 척추 견고, landing mission v2 정렬.

### 인벤토리 (총 14,252 LOC, 75 파일)
| 영역 | 줄수 | 상태 |
|---|---|---|
| Entity (project) | 3,336 | ✅ active |
| views/landing | 333 | ✅ mission v2 정렬 (PR #9) |
| views/root-entry | 78 | ✅ |
| views/home (topology) | 1,451 | ✅ mode-aware |
| views/ontology-view (`/`) | 1,069 | ✅ |
| views/project-detail | 1,357 | ✅ |
| views/project-editor | 442 | △ 라우팅 명확화 후보 |
| views/project-selector | 701 | △ 라우팅 명확화 후보 |
| features/project-quick-create | 227 | ✅ |
| features/project-quick-edit | 305 | ✅ |
| features/project-edit (form) | 3,074 | ✅ 척추 (ProjectForm) |
| features/project-share | 82 | ✅ Q2 후 단순화 (CopyLink 만) |
| features/project-import | 353 | ✅ |
| features/project-export | 148 | ✅ |

### Landing mission v2 검증
- ✅ "사람과 AI agent 가 같이 저작하는 codebase ontology" 헤드 카피
- ✅ ValueChainRail 3-step (마크다운 작성 → ontology 자동 자라남 → 트리·토폴로지·ERD)
- ✅ MiniTopology frozen SVG (14 노드 / 21 relations) 시각 증명
- ✅ "frontmatter 자체가 자기-승인" 안내

### Mode-aware 정렬
- HomePage line 141 — "mode-aware projects read — local 모드는 vault 매니페스트 sync, cloud 는 Firestore onSnapshot"
- entity 의 `hubSlugs` + `computeHubSlugs` 정합 ✅
- ProjectImpactMode (none / upstream / downstream / network) 의존 그래프 시각화 ✅

### P1 후보 (라우팅 명확화)
- `project-editor` (442 줄) vs `project-selector` (701 줄) — 라우팅 맵 명시 (ARCHITECTURE.md)
- `project-share` 협업 기능 부재 — BACKLOG 에 "Q2 후 단순화: URL 공유만" 기록

---

## 종합 — 1원리 게이트 통과 여부

| 영역 | 통과 | 결정 |
|---|---|---|
| **척추 (md frontmatter → ontology)** | ✅ | vault local-first + mode-aware + ontology core 모두 직결 |
| **AI agent partner (MCP)** | ✅ | 7 도구 + dogfood vault (대기 중 audit 결과로 보강) |
| **Frontmatter 자기-승인** | ✅ | review queue 제거됨, vault stub 직접 노출 |
| **3 view (`/` 트리 / `/topology` Sigma / `/ontology/edit` xyflow)** | ✅ | 모두 mode-aware 통합, 출구 명확 |
| **Local-first 0 마찰** | ✅ | demo session 우회 + PermissionGate 쓰기만 차단 |
| **Cloud sync 옵션 (Firebase Auth)** | ✅ | email/password + Google OAuth, 외부 IAM 0 |
| **단일 진실원** | ⚠️ | knowledge-document/version 이 vault 와 부분 중복 (cloud 모드 mirror 역할) |

---

## 발견된 P0/P1/P2 액션 (도메인 전체)

### P0 — 즉시 가능 (마이너 정리)

- **`src/widgets/ontology-output-badges/` 통째 삭제** (425 줄, 0 imports — 진짜 dead)
- **`src/widgets/candidate-ontology-match/` 통째 삭제** (106 줄, 단 1 호출처 `DocumentNewOntologyHints` 도 extraction hint 라 같이 정리 가능)
- 누적 -531 줄 정리

### P1 — 단계적 정리 (1-2 PR)

- **knowledge-job + knowledge-output + knowledge-evidence cold storage 명시 + 사용처 정리** (BACKLOG T24 와 같이)
- **account-scope dead code 정리** — `?account=` URL query, `normalizeAccountId`, `ACCOUNT_QUERY_KEY`
- **Builder C-5 완성** — approved 노드 in-canvas 편집
- **Vault md write path** — ephemeral export 후 vault 자동 저장

### P2 — 단순화 후보 (선택)

- vault `findRelatedDocs` / `findRelationshipRadarSuggestions` plugin 분리
- TaxonomyProvider 의 vault 커스텀 categories/statuses 지원
- Sigma Layer 0 컨테이너 drill-down 활용도 점검 후 제거 (-40+줄)
- SearchPalette 문서 검색 점수 정렬
- GlobalSearch 의 cloud mode vault stub 통합

---

## 결론

mission v2 cleanup 10 PR (#5-#14) 후 모든 도메인이 mission v2 와 매우 견고하게 정렬됨. 발견된 단순화 후보는 모두 P1/P2 marginal — *척추 (md frontmatter → ontology + AI agent partner + 3 view)* 자체는 손상 없음.

**다음 진행 우선순위 (1원리 정렬)**:
1. P0 BACKLOG T28-T31 (demo blueprint mission v2 + dogfood hint + MCP find_path/list_kinds)
2. P1 V1.x 진화 (V1.5 cardinality 즉시 + V1.2/V1.3 Q 답 후)
3. P1 knowledge-* 컬렉션 정규화 (BACKLOG T24)
4. P2 비개발자 surface (Phase 4, T33-T36)
