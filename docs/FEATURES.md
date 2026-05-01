# FEATURES — oh-my-ontology

> 사용자가 **지금 실제로 사용 가능한** 기능 전수 인벤토리.
> 작성일: 2026-05-01 (mission v2 cleanup 7 PR 머지 후)
> 갱신 trigger: 새 surface 추가 / 기존 surface 제거 시 즉시 반영. PR 본문 + CHANGELOG 와 같이 업데이트.

---

## 0. 한눈에

> **mission v2**: "사람과 AI agent 가 같이 저작하는 codebase 의 ontology."
> **운영 모델**: 1인 도구. local-first vault. 로그인은 옵션. AI agent (Claude Code 등) 는 MCP 서버로 직접 read/write.

```
입력 (사람 + AI agent)        파싱             저장              출력
        │                       │                │                │
        ▼                       ▼                ▼                ▼
  vault 의 .md  →          frontmatter   →  vault 또는    →  트리 (/) [hub]
  (frontmatter)                              Firestore        토폴로지 (/topology Sigma)
  + AI agent (MCP)                                            빌더 (/ontology/edit xyflow)
```

---

## 1. 모드 분기 (data source)

`useDataSourceMode()` hook 이 셋 중 하나를 결정:

| 모드 | 조건 | 동작 |
|---|---|---|
| **local** | vault 폴더 활성 | vault manifest 가 진실원, Firebase 호출 0 |
| **cloud** | Firebase 로그인 + vault 미활성 | Firestore onSnapshot 실시간 sync |
| **static** | 둘 다 없음 | 빌드 타임 demo manifest |

**효과**: 사용자가 vault 폴더를 열면 `/` (ontology hub) · `/topology` · `/projects` · `/project/[slug]` 모든 곳에서 즉시 vault 데이터로 바뀜. mutation (생성/편집/삭제) 도 동일하게 mode-aware.

---

## 2. 라우트별 기능

### Ontology hub + 시각화

#### `/` — Ontology Tree Hub (mission v2 의 척추)

- **mode-aware** (Q1=(a) 채택, `useOntologyInsight`):
  - local: vault frontmatter stub 노드/엣지를 즉시 트리·ego graph·검색에 노출
  - cloud: `knowledgePublicNodes/Edges` projection 구독
  - static: demo manifest
- **계층 트리**: project → domain → capability → element (문서 노드는 근거로만 기여, 트리 제외)
- **노드 클릭** → 우측 detail 패널: kind / title / 요약 / project 연결 / 근거 문서 / **ego 그래프** (1-hop / 2-hop SVG) / 이웃 리스트 / "+ 관계 추가" / "노드 링크 복사"
- **상단 toolbar pills**: 노드 추가 / 검색 (⌘K / ⇧⌘K) / 빌더 열기 → / 인사이트 / 관계
- **통계 카드**: 트리 노드 / 관계 / 근거 문서 / 미해결 stub / 마지막 발행
- **stub 처리**: 미해결 참조 → 트리 하단 `OntologyStubList` 위젯에서 "승격" (kind 선택) / "폐기" 액션 (cloud 모드에서 `promoteStubNode` / `dismissStubNode` callable)
- **빈 vault empty-state** (mode-aware): vault 활성 시 "frontmatter 적기 → 빌더에서 정리" 2-step. 그 외엔 "vault 열기 → frontmatter → 빌더" 3-step.
- **단축키**: `⌘K` 검색 · `⇧⌘K` 글로벌 검색 · `?` 단축키 시트

#### `/topology` — Sigma WebGL 토폴로지 (mission v2 출구 view)

- **렌더**: Sigma.js + Graphology + ForceAtlas2 — 전체 프로젝트를 공간 네트워크로 펼침
- **인터랙션**: 노드 클릭 → ProjectDrawer · hover → tooltip + 1-hop 이웃 강조 · 드래그 / 휠 → pan/zoom
- **사이드 widgets**: 좌측 Legend (kind 색 범례) · 우측 SigmaHubRail (degree 상위 허브 빠른 점프) · 하단 RegionNavigator (minimap)
- **단축키**: `⌘K` 검색 · `?` 단축키 시트
- **모드**: 모든 모드에서 동작 — 데이터 소스만 다름

#### `/ontology/edit` — Builder (xyflow ERD)

- **palette (좌)**: 4 kind 클릭 → 캔버스 가운데에 새 임시 노드 (인디고 dashed)
- **연결**: 노드 가장자리 점에서 drag → 다른 노드에 drop → 임시 관계 edge
- **Inspector (우)**: 임시 노드 선택 시 이름 + 저장 → `knowledgeApprovedNodes/Edges` (cloud) 또는 vault `.md` (local) 로 commit
- **md 내보내기**: ephemeral 노드/엣지를 frontmatter 마크다운으로 download
- **fullscreen toggle**: F 키 또는 우상단 Maximize 버튼 — OperationsNav 숨김 + 풀 viewport
- **단축키**: N (새 project 노드) · F (전체 화면) · Del (선택 삭제) · Esc (선택 해제 / 전체 화면 종료)
- **빌더 onboarding**: 첫 진입 + 빈 캔버스에 3-step coach mark (다시 보지 않기 토글)
- **layout**: 단순 grid

#### `/ontology/insights` — 인사이트
- **kind 분포** (막대), **프로젝트별 분포** (정렬), **관계 type 분포**
- **cross-project 관계** 비율 / 절대값
- **허브 노드 top 10** (degree, 문서·project 제외)
- **최근 활동 10건** (상대 시간)
- **30일 활동 타임라인** (일자별 승인 막대)
- **미연결 노드** (orphan, amber 강조)
- 모든 항목 클릭 → `/ontology/?node=<id>` 로 점프

#### `/ontology/relations` — 관계 분포
- **edge type 분포** (좌) — 클릭 toggle 필터
- **강한 관계 top 12** (evidence 풍부한 순) — from → type → to + cross chip + evidence count

### Vault Local-First

#### `/docs` — Vault Picker / Doc Vault
- **로컬 폴더 선택** (File System Access API):
  - 폴더 선택 → 전체 `.md` 자동 스캔 → manifest 빌드
  - 파일 수 + 마지막 스캔 시각 ("방금 / 5초 전 / 3분 전")
  - 새로고침 / 닫기 / 재승인 버튼
  - 미지원 브라우저 / 권한 거부 / 접근 오류 사용자 친화 메시지
- **vault 활성 시 surface**:
  - 폴더 트리 + 사이드바 (pinned · 최근 · 태그)
  - 본문 viewer (마크다운 + frontmatter 메타바)
  - 폴더 토폴로지 view (Sigma) — 문서 간 링크 그래프
  - "vault frontmatter ontology" 패널 — frontmatter 만으로 추출된 stub 노드/엣지
  - 백링크 / 관련 문서 / 관계 레이더
  - 명령 팔레트 (vault 전용 — Daily Note, Scaffold Topology, 내보내기 등)
- **scaffoldTopology()**: 빈 vault 에 `projects/`, `README.md`, `categories.md`, `statuses.md`, 샘플 프로젝트 hub/leaf 자동 생성

### 프로젝트

#### `/projects` — 프로젝트 목록
- **mode-aware**: local 모드면 vault 의 `projects/*.md`, cloud 면 Firestore
- **검색 / 필터**: query · category · status · 표시 개수
- **카드별**: ontology 노드 카운트 배지, 빠른 작업 (편집)
- **ProjectQuickCreatePanel** — 페이지 안에서 인라인 빠른 생성 (mode-aware)
- **CSV 내보내기** — 전체 다운로드
- **WorkspaceOntologyStrip** — 상단 ontology 요약 strip

#### `/project/[slug]` — 프로젝트 상세
- **렌더**: 메타 (이름·설명·태그·스택·상태·카테고리·시작/완료일·진행도·소유자·아이콘) + 의존성 그래프 + 토폴로지 미리보기
- **인라인 편집** (권한 시): description / status 등 즉시 수정
- **DependencyPicker**: 의존성 칩 multi-select + 검색 + cycle/missing 경고
- **CopyProjectLinkButton**: 단순 URL 복사 (mission v2 정렬, share-doc 시스템과 별개)
- **Mission 7 원자 정합**: vault 의 `projects/<slug>.md` 로부터 모든 정보 자동 매핑

#### `/project/new` · `/project/[slug]/edit` — 에디터
- **풀 폼**: 이름·slug·설명·detail (markdown)·태그·스택·링크·의존성·아이콘·상태·카테고리·진행도·timeline·screenshots
- **자동 추천**: description 에서 다른 프로젝트 이름 발견 시 dependency 추천 chip
- **mode-aware mutation**: local → vault `.md` 작성/패치, cloud → Firestore upsert
- **저장 후 동작 선택**: "저장하고 계속 보기" / "저장하고 목록으로" / "저장하고 공개 화면으로"

#### `/project/fallback` — 정적 export 폴백
- Firebase Hosting rewrite 가 unknown slug 를 client-side Firestore 조회로 라우팅. 빌드타임에 모르는 동적 slug 도 정상 렌더.

### 문서 (cloud-mode 옵션)

> mission v2 정렬: cloud LLM extraction 흐름 (`enqueueExtractionJob` 등) 은 제거됨. user-side AI agent (Claude Code) 가 MCP 로 직접 ontology 갱신.

#### `/knowledge` — 대시보드
- 문서 통계 카드, 빠른 진입 액션
- vault 모드 활성 시 "vault summary" 카드 노출
- 미공개 문서 안내 → "vault 열기" / 빌더 CTA

#### `/knowledge/documents`
- 목록 + 검색 + 필터 (project / 문서 유형 / 상태 / 분석 상태)
- 행 액션: 문서 상세

#### `/knowledge/documents/new`
- 새 문서 등록 — 제목 / 마크다운 본문 / 프로젝트 다중 태깅
- **mode-aware projects**: vault 프로젝트도 picker 에 등장
- 템플릿 (명세 / 결정 기록), 입력 규칙 안내

#### `/knowledge/documents/view?id=...`
- 문서 상세 — 메타 / 마크다운 렌더 / 버전 이력 / **historical** 추출 결과 (cold storage)
- **2단계 stepper** (mission v2 정렬): 올리기 → 공개 — "분석 stage" 는 vault frontmatter 가 자기-승인이라 별도 stage 없음
- **빈 ontology 안내**: "vault 열기" / "빌더 열기" CTA — cloud LLM 추출 trigger 없음

### AI agent partner (`mcp/`)

> Phase 3 — Claude Code 같은 LLM agent 가 stdin/stdout JSON-RPC 로 ontology 를 read/write.

- **패키지**: `mcp/` v0.2.0, `@modelcontextprotocol/sdk@^1.0.0` 의존
- **등록**: `.mcp.json.example` 복사 후 `OMOT_VAULT=./docs/ontology` (또는 사용자 vault) 설정
- **7 도구**:

| 도구 | 동작 |
|---|---|
| `list_concepts` | vault 의 모든 노드 (kind 필터 + limit) |
| `get_concept` | 단일 slug 의 frontmatter + body excerpt + 이웃 |
| `find_evidence` | title 부분매칭 — frontmatter + body 검색 |
| `find_backlinks` | 특정 slug 를 가리키는 노드들 (frontmatter array 키 + body wikilink/mdlink) |
| `add_concept` | 새 `.md` 노드 작성 — 기존 slug 면 throw |
| `add_relation` | 두 slug 사이 edge (depends_on / relates / contains / describes) |
| `patch_concept` | 기존 노드 frontmatter (key 단위 patch) + body 갱신 |

- **Dogfood vault**: `docs/ontology/` — 이 프로젝트 자기 mental model. 1 project + 8 domain + 7 capability + 4 element + 1 vault-readme = 21 노드.

### 인증 / 계정

#### `/login`
- email + password
- Google OAuth (popup)
- 데모 로그인 (read-only 데모 워크스페이스)
- 비밀번호 재설정 link

#### `/signup`
- displayName + email + password (8자+) + 확인
- 회원가입 후 자동 로그인

#### `/reset-password`
- 이메일 → Firebase 비밀번호 재설정 메일 발송

#### `/account` (게스트는 `/login?next=/account` 로 redirect)
- **내 정보**: 이름 · 이메일 · 로그인 방식 (provider)
- **비밀번호 변경**: 현재 + 신규 + 확인 (Firebase email/password 사용자만)
- **비밀번호 재설정 메일** 재전송
- 로그아웃은 PublicAccountMenu 에서

### 운영 / 설정

#### `/diagnostics/insights` — 오늘 챙길 곳
- **stale 프로젝트** (30일+ 무수정)
- **orphan** (in/out edge 0)
- **promotion 후보** (fan-in 높은 비-허브)
- 각 항목 → 편집 / 상세 / 토폴로지 jump

#### `/settings` — 정리 허브
- iOS Settings 결의 grouped list, drill-in
- 그룹: 지도 정비 (categories · statuses · 가져오기 · ontology) · 오늘 점검 (insights)

#### `/settings/categories` · `/settings/statuses` · `/settings/import` · `/settings/ontology` · `/settings/ontology/history`
- 카테고리 라벨 / 설명 / 톤 (indigo · amber · neutral) / 캔버스 영역 편집
- 상태 lifecycle 라벨 / dot 색 / 정렬
- CSV 일괄 업로드 (mode-aware)
- 활성 TBox 클래스 / 관계 read-only
- TBox 버전 이력 snapshot list

---

## 3. 기능 그룹별 정리

### 3.1 Vault Local-First

| 기능 | 진입점 | 효과 |
|---|---|---|
| 폴더 선택 (FSA) | `/docs` LocalVaultPicker | OS 폴더 → manifest |
| Manifest 빌드 | 자동 (선택 시) | 프론트매터 · 백링크 · 헤딩 · excerpt |
| Fingerprint 변경 감지 | 자동 (탭 포커스 시) | IDE 편집 후 돌아오면 재스캔 (debounce 2s) |
| Handle 영속화 | IndexedDB (`local-fs-handle`) | 새로고침 후 재승인만 누르면 복원 |
| createDoc / saveDoc / deleteDoc / renameDoc | 명령 팔레트 / 인라인 편집 | mode-aware mutation |
| `updateFrontmatter` | useProjectMutations | 본문 보존 + frontmatter 패치 |
| Backlink rewrite | renameDoc 시 best-effort | 다른 파일의 `[[oldSlug]]`, `[text](old.md)` 자동 치환 |
| Scaffold | 명령 팔레트 | 빈 vault 에 README + projects/ + 샘플 |

### 3.2 Mode-Aware Adapters

| Hook | 책임 |
|---|---|
| `useDataSourceMode()` | local / cloud / static 결정 |
| `useProjects(accountId)` | mode 별 프로젝트 read (sync local / subscribe cloud) |
| `useProjectMutations()` | mode 별 CRUD (vault file write / Firestore upsert) |
| `useOntologyInsight(accountId)` | **mission v2 신설** — local: vault frontmatter stub 변환, cloud: knowledgePublic projection. `/` ontology hub 가 vault 활성 시 자동 vault 모드로 |
| `TaxonomyProvider` | local/static 모드는 defaults, cloud 만 subscribe |
| `useLocalVault()` | manifest + handle + 명령들 |
| `useVaultOntology()` | vault 매니페스트 → OntologyStubNode/Edge 변환 |

**적용 surface**: HomePage / OntologyViewPage (`/`) / ProjectSelectorPage / ProjectDetailPage / ProjectForm / KnowledgeDocumentNewPage / MountedGlobalSearch / DependencyPicker / TaxonomyProvider

### 3.3 AI Agent Partner (mission v2 신설)

| 항목 | 설명 |
|---|---|
| MCP 서버 | `mcp/` 패키지, stdin/stdout JSON-RPC, 7 도구 |
| 등록 | `.mcp.json.example` 복사 → Claude Code 재시작 |
| Vault | `OMOT_VAULT` env (default cwd) — 사용자 vault 또는 `docs/ontology/` (dogfood) |
| 호환 | 어떤 vault 든 `kind:` frontmatter 가진 `.md` 만 노드. 기존 ontology format 그대로 |

### 3.4 검색

| 종류 | 단축키 | 진입점 |
|---|---|---|
| 프로젝트 SearchPalette | `⌘K` (홈) | 토폴로지 / 프로젝트 화면 |
| 글로벌 검색 (ontology + 문서 + 프로젝트) | `⇧⌘K` | 모든 페이지 |

**기능**: 한·영 fuzzy match · kind 필터 칩 · project 필터 칩 · 키보드 nav (↑↓ Enter Esc) · 빈 query 시 source 별 샘플 표시.

### 3.5 Frontmatter 파서

| 형식 | 예시 |
|---|---|
| Scalar | `name: foo` / `count: 42` / `active: true` |
| Quoted | `desc: "hello: world"` |
| Inline list | `tags: [a, b, c]` |
| Block list | `items:\n  - a\n  - b` |
| **Inline object** | `pos: { x: 1, y: 2 }` |
| **Block object** | `pos:\n  x: 1\n  y: 2` |

object value 안에서는 `'true'/'false'/숫자` 자동 typed. `applyFrontmatterUpdates()` 로 본문 보존하며 패치 (null = key 삭제).

scripts/build-docs-vault.mjs 와 src/shared/lib/parse-frontmatter.ts 와 mcp/src/parser.mjs 가 capability 동기화.

### 3.6 Vault Frontmatter → Ontology Stub

frontmatter 키:
- `kind:` (project / capability / element / domain / decision / workflow / ...)
- `title:` (또는 # 첫 헤딩 / 파일명 fallback)
- `domain:` (단일 domain 노드 후보)
- `capabilities: []` / `elements: []` (배열 노드)
- `relates: []` / `dependencies: []` (edge 후보)

→ 출력: `OntologyStubNode[]` + `OntologyStubEdge[]` + warnings. AI 추출 거치지 않은 fast-path. `/`, `/docs`, `/ontology/edit` 모두에서 즉시 가시화.

### 3.7 V1.1 Wikidata Statement Annotation (mission v2 신설)

`KnowledgeGraphEdge` 에 옵셔널 필드 추가 (additive, breakage 0):

- `qualifiers?: Array<{ propertyId: string; value: QualifierValue }>`
- `rank?: 'preferred' | 'normal' | 'deprecated'`

`QualifierValue` union: string / time (precision year-month-day) / quantity (value+unit) / nodeRef.

legacy edge 는 두 필드 undefined → 코드는 `rank ?? 'normal'` 폴백. `publishKnowledgeProjectionCore` 가 approved → public projection 시 fields-pass-through. 자세히: `docs/ONTOLOGY-MODEL-V2-DRAFT.md` §2.

### 3.8 권한

| 역할 | 동작 |
|---|---|
| 비로그인 / guest | 공개 surface (홈 트리 read) + vault 모드 풀 사용 가능 |
| 데모 세션 | `/login` 데모 버튼 → read-only 데모 데이터 |
| Firebase 인증 사용자 | 자기 데이터 풀 권한 (1인 도구) |
| `admins/{email}` 화이트리스트 | 전역 카테고리 / 진단 / TBox 운영 — 일반 사용자는 자기 공간 풀권 |

`PermissionGate` 컴포넌트가 own-space / membership / admin 분기 처리.

### 3.9 모바일 / 반응형

| 기능 | 위치 | 동작 |
|---|---|---|
| **BottomTabBar** | `src/widgets/bottom-tab-bar/` | 모바일 (md 미만) 화면 하단 고정 탭바 — 지도 · 프로젝트 · 문서 · 정리. 데스크톱은 OperationsNav 가 같은 destination 제공 |
| **GestureHint** | `src/widgets/gesture-hint/` | 터치 디바이스에 토폴로지 첫 진입 시 swipe 제스처 안내 |
| **safe-area / 안전 영역** | OperationsNav 모바일 모드 | iOS 노치 + BottomTabBar 와 충돌 회피 |
| 모바일 detail sheet | `/` 트리 | 데스크톱은 우측 panel, 모바일은 화면 하단 고정 sheet |

### 3.10 테마 / 접근성 / 알림

| 기능 | 위치 | 동작 |
|---|---|---|
| **ThemeToggle (Light/Dark)** | OperationsNav 우측 + `src/features/theme-toggle/` | `html[data-theme="light"]` toggle. 기본 다크. localStorage 영속 |
| **Toast** | `useToast()` (`src/shared/ui/toast.tsx`, sonner 기반) | 50+ 호출처. `show(message, tone)` API. success / error / warning / info |
| **LiveAnnouncer** | `src/shared/ui/live-announcer.tsx` | aria-live region — 토폴로지 노드 선택 / 검색 결과 변경 등을 스크린리더에 announce |
| **Tooltip** | `src/shared/ui` (Radix 기반) | 모든 아이콘 / 단축키 안내 |
| **prefers-reduced-motion** | globals.css base layer | 자동 존중 — Sigma pulse / framer-motion 모두 |

### 3.11 부가 위젯

| 위젯 | 진입점 | 역할 |
|---|---|---|
| **DocsQuickDrawer** | `/topology` 토폴로지 (📁 아이콘) | vault 문서 빠른 미리보기 drawer — pin 한 문서 / 최근 / 트리 inline |
| **WorkspaceOntologyStrip** | `/` `/projects` 헤더 | 현재 ontology 통계 strip — 매치 0 자동 숨김. 미해결 stub chip → `/ontology` (트리 stub list) |
| **ProjectKnowledgeTopologyScene** | `/topology` 노드 선택 시 | 해당 프로젝트의 knowledge graph 상세 scene |
| **OntologyStubList** | `/` (트리 하단) | 미해결 stub 노드 list + 승격 / 폐기 액션 (cloud 모드 callable) |
| **VaultOntologyStubsPanel** | `/` (vault 모드 활성 시 트리 위) | vault frontmatter 만으로 추출된 stub 노드/엣지 시각화 |

### 3.12 단축키

| 키 | 위치 | 효과 |
|---|---|---|
| `⌘K` / `Ctrl+K` | 어디서나 | 검색 팔레트 (프로젝트) |
| `⇧⌘K` | 어디서나 | 글로벌 검색 (ontology + 문서 + 프로젝트) |
| `?` | 어디서나 | 단축키 시트 |
| `Esc` | 모달 / 빌더 | 닫기 / 선택 해제 |
| `N` | `/ontology/edit` | 새 project 노드 |
| `F` | `/ontology/edit` | 전체 화면 toggle |
| `Del` / `Backspace` | `/ontology/edit` | 선택 노드 삭제 |
| `↑` / `↓` | 검색 / 트리 | 항목 이동 |

---

## 4. 데이터 흐름 (mission v2 single-source)

```
md 파일 (vault 또는 cloud)              MCP 서버 (AI agent)
  │                                          │
  ├─→ manifest (vault) / Firestore (cloud)   │
  │                                          │ (read/write)
  ├─→ Project[] ← useProjects (mode-aware)   │
  │                                          ▼
  ├─→ frontmatter → derive-ontology-from-vault → OntologyStub[] (local)
  │                       또는
  │   manual editor / 빌더 → knowledgeApprovedNodes/Edges (cloud)
  │                       또는
  │   AI agent (Claude Code) → MCP add_concept / patch_concept → vault .md (local)
  │
  └─→ 트리 (`/`) / 토폴로지 (`/topology` Sigma) / 빌더 (`/ontology/edit` xyflow)
```

**Mission v2 cleanup 후 사라진 path**:
- ❌ AI 추출 (cloud LLM Gemini/Claude) → knowledgeExtractionJobs/Outputs
- ❌ 검수 큐 (`/review/knowledge`) → knowledgeReviews/ApprovalEvents

이전 데이터는 cold storage 로 보존되지만 더 이상 callable 없어 read-only.

---

## 4-A. demo 데이터 구조 (현재)

`src/shared/mocks/demo-blueprint.ts` 의 `CONTAINER_THEMES`:

- **6 컨테이너** (Demo Workbench / Demo IAM / Demo Knowledge / Demo Vault / Demo Search / Demo Design) — Phase 1.5 슬림
- 각 컨테이너 hub × leaf = **~50 flat projects** (이전 ~2250 에서 슬림)
- cross-container 의존 1건씩 명시 (system boundary 시각화)
- `getDemoGlobalOntology()` 가 6 domain × 4 capability + 3 element = **~42 ontology 노드** + ~42 contains edges
- `knowledgeDocuments` 자동 생성 (각 hub/top-node 별 3-5 문서)

> 잔재: `Demo Knowledge` 의 capabilities 일부에 mission v1 용어 ("검수 큐", "frontmatter 추출", "stub 승격") — T28 (BACKLOG.md) 에서 mission v2 정렬 예정.

## 4-B. 프레임워크 / 빌드타임 surface

| 항목 | 위치 | 동작 |
|---|---|---|
| **app/layout.tsx** | root layout | TaxonomyProvider + ToastProvider + 글로벌 스타일. title template `'%s · oh-my-ontology'` |
| **app/page.tsx** | `/` 진입 | RootEntryPage — 비로그인이면 LandingPage, 그 외 OntologyViewPage |
| **app/topology/page.tsx** | `/topology` 진입 | HomePage (Sigma topology) |
| **app/manifest.ts** | `/manifest.webmanifest` | PWA manifest |
| **app/sitemap.ts** | `/sitemap.xml` | 정적 export 라우트 노출 |
| **app/robots.ts** | `/robots.txt` | 검색엔진 크롤 정책 |
| **app/not-found.tsx** | 404 페이지 | "길을 잃은" 카피 + 홈 CTA |
| **app/error.tsx** | route-level error boundary | "예기치 않은 오류" + 재시도 / 토폴로지 홈 |
| **app/global-error.tsx** | layout-level error boundary | 최후 방어 |
| **app/project/[slug]/opengraph-image.tsx** | OG 이미지 | 프로젝트 상세 공유 시 동적 카드 |
| **app/diagnostics/page.tsx** | redirect | `/diagnostics/insights` 로 client-side replace |
| **app/project/fallback/** | 정적 export 폴백 | unknown slug → client-side Firestore 조회 |

---

## 5. 제약 / 의도된 부재

### Mission v1 시대 제거 (이미 완료)
- **share link** (commit "share-doc cascade 제거" — v2 협업)
- **GitHub webhook 활동 이력** (commit "docs-vault-activity 제거")
- **AI 추출 클라이언트** (commit "ontology-extraction 클라이언트 제거")
- **HTTP push API** (commit "api-keys + receive-doc cascade 제거")
- **dev-admin-bypass** (commit "dev-admin-bypass 인프라 + 41 callsite 정리")
- **/admin/*** 라우트 (deprecated)
- **legacy redirect** (/project/topology, /project/view)

### Mission v2 cleanup 후 사라진 것
- **`/review/knowledge` 검수 큐** — 페이지 + 라우트 + entity callable + functions handler 통째 제거 (Stage 4)
- **AI Cloud Functions** — `extract-gemini.js` + `ontology-extract.js` 통째 삭제 (Stage 3)
- **Cloud LLM 추출 흐름** — `enqueueExtractionJob` / `processExtractionJob` / `reclaimStaleExtractionJobs` 제거 (Stage 3)
- **`applyReviewAction` callable** — 제거 (Stage 4)
- **"분석 시작" UI CTA** — 4 view 에서 모두 제거 (Stage 1)
- **`approveKnowledgeOutput` / `rejectKnowledgeOutput` httpsCallable wrapper** — 제거 (Stage 4)
- **dual stepper 의 "분석 stage"** — KnowledgeDocumentDetailPage 4단계 → 2단계 (Stage 4)

### 의도된 부재
- **Multi-account**: 없음 — `accountId = null` 고정 (v2 협업 단계로 보류)
- **외부 IAM**: 없음 — Firebase Auth (email/password + Google OAuth) 만
- **firebase deploy**: user 정책상 안 함. mission v2 추가 cleanup 으로 `functions/` 폴더 자체 폐기 (vault 자기-승인이라 publish/promote/dismiss 게이트 불필요)

---

## 6. 검증 (mission v2 phase 머지 시점, 2026-05-01)

- tsc 0 errors
- eslint 0 errors (warnings 79 — 거의 모두 기존)
- vitest **118 files / 848 tests pass** (V1.1 5 새 test 포함)
- MCP server stdin/stdout JSON-RPC: initialize → tools/list (7 도구) → tools/call 모두 정상
- MCP parser smoke 7/7 pass
- `node --check functions/index.js` syntax OK
- Playwright MCP browser-level QA (15 라우트): 모든 mission v2 surface console error 0, mission v2 title 정렬

## 누적 cleanup 통계 (mission v2 phase)

- 7 PR 머지 (#5-#11)
- 누적 -5,833 라인 정리 (PR #5 -3,729 + PR #6 -2,096 + PR #7 -8 + 작은 PR 합산)
- functions/index.js: 2,012 → 543 줄 (-73%)

---

## 7. 어디서부터 손대야 할지 — 사용자 워크플로

```
1. 새 사용자 (로그인 없이):
   /docs → "내 PC 마크다운 폴더 열기"
   → vault 활성 → / 트리 + /topology 토폴로지 + /projects 자동 인지

2. AI agent (Claude Code) 등록 (옵션):
   .mcp.json.example 복사 → OMOT_VAULT 설정 → Claude Code 재시작
   → mcp__oh-my-ontology__* 7 도구 사용 가능

3. 새 프로젝트 추가:
   (a) vault 직접:
       projects/my-project.md 작성
       ---
       kind: project
       title: 내 프로젝트
       category: in-progress
       status: developing
       dependencies: [auth, billing]
       ---
       → 자동으로 /, /topology, /projects 에 등장

   (b) UI 빠른 생성:
       /projects → "새 프로젝트" 클릭 → ProjectQuickCreatePanel
       → vault `.md` 자동 생성 (mode-aware)

   (c) AI agent (MCP):
       agent 가 코드 분석 후 mcp__oh-my-ontology__add_concept 호출
       → vault `.md` 직접 작성

4. 온톨로지 개념 추가:
   (a) frontmatter 기반 (사람):
       문서에 kind: capability + relates: [...] 추가
       → / 트리에 stub 으로 자동 등장

   (b) 빌더 직접 (사람):
       /ontology/edit → palette → 노드 클릭 → 핸들 drag → 저장

   (c) AI agent (MCP):
       mcp__oh-my-ontology__add_concept / add_relation / patch_concept
       → vault frontmatter 자동 갱신 → / 트리 자동 갱신

5. 둘러보기:
   ⇧⌘K (글로벌 검색) → kind 필터 → 점프
   / → 트리 + ego graph 탐색
   /topology → Sigma 시각 네트워크
   /ontology/insights → 활동 / 허브 / orphan
```
