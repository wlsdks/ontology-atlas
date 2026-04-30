# Narnia (Aslan Project Map)

> Markdown 문서를 바탕으로 프로젝트별 온톨로지를 키우고, 작업 공간 전체를 한 장의 지도로 읽는 공개 서비스.

**Live** · https://aslan-project-map.web.app
**설계 문서** · [`docs/superpowers/specs/2026-04-12-aslan-project-map-design.md`](docs/superpowers/specs/2026-04-12-aslan-project-map-design.md)
**Planned Knowledge Subsystem v2** · [`docs/superpowers/specs/2026-04-17-document-knowledge-subsystem-v2.md`](docs/superpowers/specs/2026-04-17-document-knowledge-subsystem-v2.md)
**Planned Knowledge 구현 계획** · [`docs/superpowers/plans/2026-04-17-phase-2a-knowledge-subsystem-foundation-v2.md`](docs/superpowers/plans/2026-04-17-phase-2a-knowledge-subsystem-foundation-v2.md)
**Planned Knowledge Backend Contract** · [`docs/superpowers/specs/2026-04-17-knowledge-backend-contract-v1.md`](docs/superpowers/specs/2026-04-17-knowledge-backend-contract-v1.md)

---

## 이 서비스가 하는 일

단순 프로젝트 목록이 아닙니다. 이 서비스는 **문서에서 연결이 자라는 구조**를 프로젝트와 작업 공간 단위로 읽히게 하는 것을 목표로 합니다.

- **서비스 첫 화면** (`/`) — 비로그인 사용자는 여기서 로그인, 회원가입, 데모 로그인을 시작합니다.
- **전체 지도** (`/`) — 로그인된 사용자는 같은 루트 경로에서 작업 공간 전체 토폴로지를 바로 봅니다.
- **프로젝트 목록** (`/projects`) — 프로젝트를 고르고, owner는 여기서 새 프로젝트를 시작할 수 있습니다.
- **개별 프로젝트** (`/project/{slug}/`) — 특정 프로젝트를 문서와 연결 이유 중심으로 읽는 화면입니다. `/project/view?slug=...` legacy URL 은 canonical 로 자동 redirect.
- **문서 기반 연결** — 프로젝트 상세와 드로어에서 어떤 문서가 이 프로젝트를 설명하는지 바로 확인할 수 있습니다.
- **공개 surface 인라인 편집** — 자기 계정의 주인은 공개 화면을 보다가 바로 같은 화면에서 프로젝트 정보 수정, 문서 등록, 문서 검토로 이어집니다 (Notion / Obsidian 모델 — 별도 "관리자" surface 없음).
- **문서 운영 흐름** (`/knowledge/*`, `/review/knowledge`) — 문서 등록, 버전 업로드, 추출, 연결 검토, 공개 반영까지 한 흐름으로 진행합니다.
- **보조 탐색 도구** — 검색 팔레트(`⌘K`), 프레젠테이션 모드(`F`), 포트폴리오 모드, 가이드 투어를 제공합니다. `Shift + 클릭` 두 노드 사이 최단 경로 찾기, `Tab` 이웃 순회, `/` 캔버스 검색 포커스, `?` 로 단축키 전체 보기.

## 핵심 도메인

- **작업 공간(Account / Workspace)** — 내가 운영하는 데이터 묶음입니다. 예: `sandbox-lab`
- **전체 지도** — 작업 공간 안의 모든 프로젝트를 묶어 보는 공개 화면입니다.
- **프로젝트** — 가장 큰 작업 단위입니다.
- **프로젝트 내부** — 영역, 노드, 관련 문서가 프로젝트를 설명합니다.
- **문서** — 프로젝트와 연결 이유를 키우는 근거입니다.
- **권한** — 게스트는 읽기만 가능합니다. 자기 계정 안에서는 자기 자산을 직접 수정합니다 — "관리자 / 운영자" 라는 별도 역할은 없습니다. 다른 계정에 멤버로 참여하면 그 안에서도 같은 모양의 인라인 편집이 가능합니다.

---

## 디자인 철학

Linear 베이스. **흑백 + 단일 인디고(`#5e6ad2`)** 라는 극단적 제약으로 AI 생성 UI 클리셰를 원천 차단합니다. Hub 노드에 인디고, Layer 0 컨테이너(=Project)에만 보조 앰버(`#d4b478`) 를 허용해 3-계층 위계를 한눈에 읽히게 합니다 (Hub · Container 가 동시에 같은 뷰에 나오지 않음 — iter 10 결정). 카테고리 구분은 색이 아닌 **보더 스타일**(작업중: 인디고 언더라인, 예정: dashed)로 처리합니다.

**절대 하지 않는 것**: 보라→핑크 그라디언트 · glassmorphism · glow pulse · 오로라 배경 · scale 호버 · 둘 이상의 채색 시스템.

상세: [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md)

---

## 기술 스택

| 영역          | 선택                                                     |
| ------------- | -------------------------------------------------------- |
| Framework     | Next.js 16 (App Router, `output: 'export'`)              |
| Language      | TypeScript 5                                             |
| Style         | Tailwind CSS 4 (CSS-based `@theme`)                      |
| Visualization | Sigma.js(WebGL) · Graphology · ForceAtlas2 · d3-force · Framer Motion |
| Backend       | Firebase (Firestore · Storage · Auth · Hosting)          |
| State         | Firestore `onSnapshot` 실시간 구독 + React local state / URL state |
| Architecture  | Feature-Sliced Design (ESLint boundaries로 경계 강제)    |
| Test          | Vitest + Testing Library + jsdom · Playwright (E2E)      |
| Package       | pnpm                                                     |

---

## 빠른 시작

```bash
# 1. 의존성 설치
pnpm install

# 2. Firebase 환경변수 설정
cp .env.example .env.local
# .env.local을 열어 Firebase Console의 실제 값으로 채운다

# 3. 개발 서버
pnpm dev                              # http://localhost:3000

# 4. 테스트
pnpm test                             # watch 모드
pnpm test:run                         # 1회 실행

# 5. 프로덕션 빌드 (정적 export)
pnpm build                            # → out/

# 6. 타입·린트 검사
pnpm exec tsc --noEmit
pnpm lint
```

### 로컬 Firebase 에뮬레이터로 작업하기

```bash
pnpm dev:firestore-emulator           # 별도 터미널 (127.0.0.1:18080)
pnpm seed:emulator                    # 시드 데이터 주입
```

`.env.local`에 `NEXT_PUBLIC_FIREBASE_USE_EMULATORS=1` + `NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST=127.0.0.1:18080`.

---

## 주요 경로

```
/                               서비스 첫 화면 / 로그인 후 전체 지도
/projects                       프로젝트 목록 (권한 시 인라인 새 프로젝트 액션)
/project/[slug]/                개별 프로젝트 (canonical, 권한 시 인라인 편집)
/project/[slug]/edit            프로젝트 전체 편집
/project/new                    새 프로젝트
/project/view?slug=...          legacy redirect
/knowledge/*                    문서 등록 / 추출
/review                         검토 큐 허브
/review/knowledge               연결 검토 워크스페이스
/settings/categories            카테고리 / 배치 편집
/settings/statuses              상태 편집
/settings/api-keys              API 키 관리
/settings/import                프로젝트 임포트
/diagnostics/insights           운영 지표
/diagnostics/migrate            데이터 마이그레이션
/docs                           Docs Vault
/login, /signup, /account       단일 로그인 / 회원가입 / 계정 설정
/dev/login                      개발 빌드 우회 로그인
```

> 과거 `/admin/*` 네임스페이스는 폐기됐습니다. 이전 URL 들은 모두 위 새 위치로 redirect 됩니다 (compatibility). 이행 계획은 [`docs/superpowers/plans/2026-04-25-admin-namespace-removal.md`](docs/superpowers/plans/2026-04-25-admin-namespace-removal.md).

## 프로젝트 구조

```
app/                         Next.js 라우팅 (얇은 래퍼)
src/                         FSD 레이어
  ├── app/                   providers, 초기화
  ├── views/                 페이지 컴포넌트
  ├── widgets/               복합 UI 블록
  ├── features/              인터랙션 단위
  ├── entities/              비즈니스 엔티티
  └── shared/                재사용 기반
docs/                        문서
tests/                       Playwright E2E
scripts/                     시드·배포 보조 스크립트
```

**Import 방향**: `app → views → widgets → features → entities → shared`

---

## 운영 Ontology — Aslan 계정 시드 결과

운영 Aslan 워크스페이스 (`account=aslan`) 의 ontology 는 두 진영의 데이터 합산:

- **Legacy ASLAN_TREE** (1차 시드, `scripts/push-aslan-prod.mjs`) — 502 노드 / 977 엣지 (project / hub / 4-layer 계층)
- **Track D fixture seed** (자율 루프 cycle 22~36, 11 fixture) — 234 노드 / 233 엣지

| Fixture | 프로젝트 | 노드 / 엣지 |
| --- | --- | --- |
| `01-design-system` | 디자인 시스템 자체 (mini spec) | 5 / 4 |
| `02-aslan-builder` | Drag-and-drop AI agent builder | 14 / 15 |
| `03-aslan-iam` | Kotlin · Spring Boot · 헥사고날 IAM | 16 / 17 |
| `04-aslan-verse-web` | Vite · React 19 · xyflow 시각화 | 17 / 17 |
| `05-reactor` | Spring AI ReAct agent runtime | 26 / 26 |
| `06-reactor-admin` | React 19 · admin SPA | 24 / 23 |
| `07-reactor-web` | React 19 · SSE 채팅 UI | 23 / 22 |
| `08-paravel-app` | RN · Expo 사내 커뮤니티 슈퍼앱 | 30 / 29 |
| `09-paravel-backend` | Kotlin · Spring Boot 4 · DDD 9 BC | 30 / 29 |
| `10-pick` | 실시간 강의 참여 플랫폼 | 29 / 30 |
| `11-mcp-servers` | atlassian / clipping / swagger MCP 3 종 | 25 / 25 |

추가로 **Cross-project depends_on / uses 7 edge** (자율 루프 cycle 44, `seed-aslan-cross-project-edges.mjs`):

- `reactor-admin` → `reactor` (depends_on)
- `reactor-web` → `reactor` (depends_on)
- `mcp-servers` → `reactor` (uses)
- `paravel-app` → `paravel-backend` (depends_on)
- `paravel-app` → `aslan-iam` (depends_on)
- `paravel-backend` → `aslan-iam` (depends_on)
- `aslan-verse-web` → `aslan-iam` (depends_on)

**합계** (운영 admin SDK 검증): 720+ 노드 / 1185 엣지 / 7 type 분포 (belongs_to 546 / implements 410 / contains 66 / uses 50 / describes 13 / depends_on 12).

운영 진입: <https://aslan-project-map.web.app/ontology/?account=aslan>

### 시드 헬퍼 3 종

- [`scripts/aslan-reset-password.mjs`](scripts/aslan-reset-password.mjs) — Auth user `aslan@narnia.dev` 비밀번호만 재설정 (ASLAN_TREE 재시드 X)
- [`scripts/seed-aslan-ontology-fixture.mjs`](scripts/seed-aslan-ontology-fixture.mjs) — golden fixture id 받아 `knowledgeApprovedNodes/Edges` 시드 (Admin SDK + idempotent)
- [`scripts/seed-aslan-cross-project-edges.mjs`](scripts/seed-aslan-cross-project-edges.mjs) — 12 외부 프로젝트 간 cross-project edge 시드

### Golden Fixture 채점 자동화

```bash
pnpm verify:golden    # 11 fixture self-sanity F1=1.0 검증 (CI / pre-commit)
pnpm score:golden     # 사용자 호출 (default threshold 1.0)
pnpm setup:hooks      # .githooks/pre-commit 활성화 (1 회)
```

`tests/fixtures/golden-ontology/` 의 fixture 변경 시 pre-commit 이 자동으로 무결성 차단.

### E2E 시각 회귀 baseline (1 회 운영 캡처)

`tests/e2e/topology-visual-regression.spec.ts` 는 홈 토폴로지의 1440 viewport 첫 프레임 회귀 차단 spec. baseline png 는 진안 운영 환경에서 1 회 캡처 후 commit:

```bash
PLAYWRIGHT_BASE_URL=https://aslan-project-map.web.app \
  pnpm exec playwright test \
  tests/e2e/topology-visual-regression.spec.ts \
  --update-snapshots
git add tests/e2e/*-snapshots/ && git commit
```

상세 절차는 spec 파일 헤더 주석 참조. 운영 ontology e2e 시나리오 (`tests/e2e/aslan-account-ontology.spec.ts`) 도 같은 PLAYWRIGHT_BASE_URL 로 실행.

---

## 문서 지도

| 문서 | 읽는 시점 |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | AI/에이전트가 작업 시작 전 필독 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 현재 제품 구조, 작업 공간 모델, 공개/운영 경계 |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | Firestore 스키마 + Security Rules |
| [`docs/superpowers/specs/2026-04-17-document-knowledge-subsystem-v2.md`](docs/superpowers/specs/2026-04-17-document-knowledge-subsystem-v2.md) | 공개 제품과 분리된 planned knowledge subsystem v2 설계 |
| [`docs/superpowers/plans/2026-04-17-phase-2a-knowledge-subsystem-foundation-v2.md`](docs/superpowers/plans/2026-04-17-phase-2a-knowledge-subsystem-foundation-v2.md) | planned knowledge subsystem foundation 구현 순서와 산출물 |
| [`docs/superpowers/specs/2026-04-17-knowledge-backend-contract-v1.md`](docs/superpowers/specs/2026-04-17-knowledge-backend-contract-v1.md) | planned knowledge extraction/job/evidence/backend 계약 |
| [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md) | 디자인 토큰·모션·금지 규칙 |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Firebase 배포 체크리스트·롤백·도메인 |
| [`docs/ADMIN-GUIDE.md`](docs/ADMIN-GUIDE.md) | owner/editor 기준 운영 흐름 |
| [`docs/SEED-DATA.md`](docs/SEED-DATA.md) | 시드 데이터 주입 절차 |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | 주요 변경 이력 |
| [`docs/rules/`](docs/rules/) | 작업 규율 패키지 (FSD, git, 네이밍, 스키마, 문서) |

---

## 키보드 단축키

| Key | 동작 |
| --- | --- |
| `⌘K` / `Ctrl+K` | 검색 팔레트 열기/닫기 |
| `F` | 프레젠테이션 모드 토글 |
| `Esc` | 드로어 닫기 |

---

## 배포

```bash
pnpm build
firebase deploy --only hosting        # 정적 사이트만
firebase deploy                       # Firestore rules + Storage rules 포함
```

상세 절차·롤백·커스텀 도메인: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

---

## 라이선스

내부 프로젝트 (비공개).
