# oh-my-ontology

> 사람과 AI agent 가 같이 저작하는 codebase ontology workbench.
> A workbench where humans and AI agents grow a codebase ontology — together.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-0.2.0-5e6ad2)](mcp/README.md)

---

## 무엇인가

`oh-my-ontology` 는 **markdown frontmatter 가 곧 그래프** 인 도구입니다.

- vault 폴더 (markdown `.md` 들이 있는 폴더) 를 가리키면 즉시 시작 — 로그인은 옵션
- `.md` 의 frontmatter 에 `kind: capability` / `capabilities: [...]` / `dependencies: [...]` 같은 키를 적으면 그게 *그대로* 노드와 관계
- 사람은 빌더 캔버스 또는 직접 `.md` 편집으로, **AI agent (Claude Code 등) 는 MCP 서버로** 같은 그래프를 read/write
- 같은 ontology 를 **세 시각** 으로 본다 — 트리 (`/`), 토폴로지 (`/topology`), ERD 빌더 (`/ontology/edit`)

> mission v2 (2026-05-01): "사람과 AI agent 가 같이 저작하는 codebase 의 ontology"
>
> 자세히: [`docs/PRODUCT-DIRECTION.md`](docs/PRODUCT-DIRECTION.md)

## 왜 만드는가

- 노트 도구는 **글** 만, 그래프 도구는 **구조** 만 다룬다 — 사이의 빈 자리.
- LLM 이 codebase 를 분석할 때마다 *처음부터* 추론. agent 가 누적 지식을 *공유* 할 surface 가 필요.
- *글에서 ontology 가 자라고, AI agent 가 그 ontology 를 같이 키운다* — 우리만의 차별화.

## 핵심 흐름

```
                 ┌──────────────────┐
                 │   .md vault      │  사용자 또는 AI agent 가 작성
                 │   (frontmatter)  │
                 └────────┬─────────┘
                          │
              ┌───────────┴────────────┐
              │                        │
              ▼                        ▼
       ┌────────────┐           ┌────────────┐
       │   사람     │           │  AI agent  │
       │ 빌더 캔버스│           │   (MCP)    │
       │ /docs 편집 │           │ Claude Code│
       └────────────┘           └────────────┘
              │                        │
              └───────────┬────────────┘
                          ▼
                 ┌──────────────────┐
                 │  ontology graph  │
                 │ frontmatter 자체 │
                 │ 가 자기-승인     │
                 └────────┬─────────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        ┌─────────┐ ┌──────────┐ ┌──────────┐
        │  Tree   │ │ Topology │ │   ERD    │
        │   (/)   │ │(/topology│ │ (/edit)  │
        │ ontology│ │  Sigma)  │ │ (xyflow) │
        └─────────┘ └──────────┘ └──────────┘
```

## 핵심 기능

- **vault frontmatter → ontology stub** — `kind:` 가진 `.md` 가 즉시 노드. `capabilities`, `elements`, `relates`, `dependencies`, `domain` 등 frontmatter 키가 곧 관계
- **AI agent partner (MCP)** — `mcp/` 패키지가 Claude Code 같은 LLM agent 와 stdin/stdout JSON-RPC 로 7 도구 노출 (`list_concepts` · `get_concept` · `find_evidence` · `find_backlinks` · `add_concept` · `add_relation` · `patch_concept`)
- **Mode-aware data source** — local (vault 활성) / cloud (Firebase 로그인) / static (둘 다 없음). 사용자에겐 단일 UX, 호출자 코드는 mode 분기 추상화
- **3 view** — tree (`/` 의 계층), topology (`/topology` Sigma WebGL), builder (`/ontology/edit` xyflow ERD canvas + .md 내보내기)
- **TBox versioning** — schema 의 git. 모든 fact 가 작성 시점 schema snapshot 을 frozen reference 로 가짐
- **Search** — `⌘K` 프로젝트 / `⇧⌘K` 글로벌 (ontology + 문서 + 프로젝트)
- **다크 / 라이트 테마** + 모바일 BottomTabBar + 한국어 UI

## 빠른 시작

### Local-first (로그인 0)

```bash
# 1. 의존성 설치
pnpm install

# 2. 개발 서버
pnpm dev
# → http://localhost:3000

# 3. /docs 진입 → "내 PC 마크다운 폴더 열기" → 즉시 사용
```

### AI agent (Claude Code) 등록

프로젝트 root 의 `.mcp.json` (예시: `.mcp.json.example` 복사):

```json
{
  "mcpServers": {
    "oh-my-ontology": {
      "command": "node",
      "args": ["./mcp/src/index.js"],
      "env": { "OMOT_VAULT": "./docs/ontology" }
    }
  }
}
```

Claude Code 재시작 → tool 메뉴에 `mcp__oh-my-ontology__*` 7 도구 등장. 자세히: [`mcp/README.md`](mcp/README.md).

### 검증 / 빌드

```bash
pnpm test:run                 # vitest 117 files / 843 tests
pnpm exec tsc --noEmit
pnpm lint
pnpm build                    # 정적 export → out/
```

### Firebase (옵션)

cloud sync 가 필요할 때만:

```bash
cp .env.example .env.local    # Firebase 설정 채움
```

로컬 emulator:

```bash
pnpm dev:firestore-emulator   # 별도 터미널 (127.0.0.1:18080)
pnpm seed:emulator            # 시드 주입
```

`.env.local` 에 `NEXT_PUBLIC_FIREBASE_USE_EMULATORS=1` 추가.

## Dogfooding — 이 프로젝트 자기 ontology

이 repo 는 자기 자신의 mental model 을 `docs/ontology/` 에 vault 로 갖고 있습니다 (1 project + 8 domain + 6 capability + 4 element = 20 노드). `pnpm dev` 후 `/docs/` 에서 `docs/ontology/` 폴더 선택 → `/` 트리에서 즉시 노출. AI agent 가 MCP 로 같은 vault 를 query 할 때도 같은 데이터.

## 기술 스택

| 영역          | 선택                                                                  |
| ------------- | --------------------------------------------------------------------- |
| Framework     | Next.js 16 (App Router · `output: 'export'`)                          |
| Language      | TypeScript 5                                                          |
| Style         | Tailwind CSS 4 (CSS-based `@theme`)                                   |
| Visualization | Sigma.js (WebGL) · Graphology · ForceAtlas2 · xyflow                  |
| Local-first   | File System Access API + IndexedDB                                    |
| AI agent      | `@modelcontextprotocol/sdk` (stdin/stdout JSON-RPC server)            |
| Backend       | Firebase (Firestore · Storage · Auth · Hosting) — 옵션                |
| Architecture  | Feature-Sliced Design (ESLint boundaries 강제)                        |
| Test          | Vitest + Testing Library + jsdom · Playwright (E2E)                   |
| Lint          | ESLint 9 flat config                                                  |
| Package       | pnpm                                                                  |

## 디자인 철학

- **Linear 베이스, 무채색 + 단일 인디고 (`#5e6ad2`)** — AI 생성 UI 클리셰 차단을 위한 극단적 제약
- **금지 목록**: 보라→핑크 그라디언트, glassmorphism, glow pulse, 움직이는 그라디언트 배경, scale 호버, 둘 이상의 채색 시스템
- 신호 톤만 예외 (경고 amber, 에러 red, 인디고 정책과 분리)

자세한 토큰 / 모션 / 금지 규칙: [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md).

## 주요 라우트

```
/                          ontology 트리 hub (vault 활성 시 자동 vault 데이터)
/topology                  토폴로지 view (Sigma WebGL)
/projects                  프로젝트 목록 (mode-aware)
/project/[slug]            프로젝트 상세
/docs                      vault picker / vault 활성 시 문서 surface
/knowledge                 cloud 모드 문서 등록
/knowledge/documents       cloud 모드 문서 목록
/ontology/edit             ERD 캔버스 (xyflow + frontmatter md 내보내기)
/ontology/insights         그래프 인사이트
/ontology/relations        관계 분포
/settings/*                카테고리 / 상태 / 가져오기
/diagnostics/insights      운영 인사이트
/account                   계정 설정 (Firebase 로그인 시)
/login · /signup           Firebase Auth (옵션)
```

## 프로젝트 구조

```
app/                       Next.js 라우팅 (얇은 래퍼)
src/                       FSD 레이어
  ├── app/                 providers · 초기화
  ├── views/               페이지 컴포넌트
  ├── widgets/             복합 UI 블록
  ├── features/            인터랙션 단위
  ├── entities/            비즈니스 엔티티
  └── shared/              재사용 기반 (UI · lib · config · api)
mcp/                       MCP 서버 패키지 (AI agent partner surface)
docs/                      장기 문서 (architecture / data-model / design / deployment)
docs/ontology/             이 프로젝트 자기 ontology vault (dogfood)
tests/                     Vitest 단위 + Playwright E2E
scripts/                   시드 / 배포 / 검증 스크립트
.claude/rules/             세부 작업 규율 (Claude Code 자동 로드)
```

**Import 방향**: `app → views → widgets → features → entities → shared`. 역방향은 ESLint 가 차단.

## 로드맵

자세한 단계: [`docs/PRODUCT-DIRECTION.md`](docs/PRODUCT-DIRECTION.md).

### v0.x (현재)

- ✅ Phase 1 — UI 정체성 정렬 (`/` ontology hub, `/topology` 분리)
- ✅ Phase 2 — local-first vault (File System Access + IndexedDB 영속)
- ✅ Phase 3 — AI agent partner (MCP 서버, dogfood vault)
- ✅ mission v2 cleanup — cloud LLM extraction 흐름 / 검수 큐 surface 제거
- 다음: V1.1 spec 진행 (statement qualifiers + rank, Wikidata 영감)

### v1.x (계획)

- V1.1 — `qualifiers?[]` + `rank?` (additive, breakage 0)
- V1.2 — `knowledgeApprovedLiterals` (atomic property)
- V1.3 — evidence rich references (retrievedAt / extractionModelId)
- V1.4 — `OntologyActionType` (Palantir 영감)
- V1.5 — relation cardinality

### v2.0 (계획)

- V1.x 통합 `KnowledgeStatement` 모델 — RDF-star 호환
- 협업 워크스페이스 (multi-vault sync)
- self-host 가이드 + npm distribution

## 키보드 단축키

| Key             | 동작                                       |
| --------------- | ------------------------------------------ |
| `⌘K` / `Ctrl+K` | 검색 팔레트 (프로젝트)                     |
| `⇧⌘K`           | 글로벌 검색 (ontology + 문서 + 프로젝트)   |
| `?`             | 단축키 시트                                |
| `F`             | 빌더 전체 화면 토글                        |
| `N`             | 빌더에서 새 project 노드                   |
| `Del` / `⌫`     | 빌더에서 선택 노드 삭제                    |
| `Esc`           | 모달 / 팔레트 닫기 / 선택 해제             |

## 문서 지도

| 문서                                                          | 읽는 시점                                        |
| ------------------------------------------------------------- | ------------------------------------------------ |
| [`AGENTS.md`](AGENTS.md) / [`CLAUDE.md`](CLAUDE.md)           | AI 도구 / contributor 작업 시작 전 (canonical)   |
| [`docs/PRODUCT-DIRECTION.md`](docs/PRODUCT-DIRECTION.md)      | mission v2 방향 (필수)                           |
| [`docs/FEATURES.md`](docs/FEATURES.md)                        | 사용자가 *지금* 사용 가능한 기능 전수            |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                | 제품 구조 · URL 공간 · 공개/운영 경계            |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md)                    | Firestore 스키마 + Security Rules                |
| [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md)              | 디자인 토큰 · 모션 · 금지 규칙                   |
| [`docs/MODE-AWARE-CRUD.md`](docs/MODE-AWARE-CRUD.md)          | local/cloud/static 분기 contributor 가이드       |
| [`docs/ONTOLOGY-MODEL-V2-DRAFT.md`](docs/ONTOLOGY-MODEL-V2-DRAFT.md) | V1.x → V2 ontology 모델 진화 spec          |
| [`docs/MISSION-CLEANUP-CANDIDATES.md`](docs/MISSION-CLEANUP-CANDIDATES.md) | mission v2 정렬 4-stage 정리 (완료) |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md)                      | 사용자 가시 변화 시간순                          |
| [`mcp/README.md`](mcp/README.md)                              | MCP 서버 7 도구 + Claude Code 등록               |
| [`.claude/rules/`](.claude/rules/)                            | FSD · git · 디자인 · testing · auth 작업 규율    |

## Contributing

오픈소스 컨트리뷰션을 환영합니다.

1. Issue 로 의도 공유 — 작업 중복 방지
2. 새 브랜치 + 작은 PR 단위
3. 커밋 메시지 — 영문 conventional prefix + 한국어 본문 (`feat:` / `fix:` / `refactor:` / `docs:` …)
4. **Docs-first** — 스키마 / 라우트 / 운영 모델 변경은 `docs/` 도 같이 갱신
5. 검증 — `pnpm test:run`, `pnpm exec tsc --noEmit`, `pnpm lint` 모두 통과
6. 디자인 — [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md) 의 금지 목록 준수

## 라이선스

[MIT License](LICENSE) — fork·수정·재배포 자유.

## Credits

오픈소스 의존:

- [Next.js](https://nextjs.org/) · [TypeScript](https://www.typescriptlang.org/) · [Tailwind CSS](https://tailwindcss.com/)
- [Sigma.js](https://www.sigmajs.org/) · [Graphology](https://graphology.github.io/) · [xyflow](https://xyflow.com/)
- [Firebase](https://firebase.google.com/) (옵션)
- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol) — AI agent partner
- [Vitest](https://vitest.dev/) · [Playwright](https://playwright.dev/) · [Testing Library](https://testing-library.com/)
- [Linear](https://linear.app/) — 디자인 영감 (해당 회사와 무관)

영감을 준 모델: Wikidata · Palantir Foundry · OWL/RDF · Property Graph · Notion · Obsidian.

---

**Repository** · <https://github.com/wlsdks/oh-my-ontology>
