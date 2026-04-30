# oh-my-ontology

> Markdown 문서에서 지식 그래프를 자동으로 키우는 오픈소스 온톨로지 워크벤치.
> An open-source ontology workbench that grows a knowledge graph from your markdown.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)

---

## 무엇인가

`oh-my-ontology` 는 **내가 쓴 글이 곧 그래프가 되는 도구**입니다.

- 도메인에 대해 markdown 문서를 적는다
- 시스템이 문서에서 **개념(node)**, **관계(edge)**, **근거(provenance)** 를 추출한다
- 사람이 검수·승인한다
- 승인된 그래프는 토폴로지 / 트리 / ERD 세 가지 view 로 읽고, ERD 캔버스에서 직접 편집할 수도 있다
- 외부 도구가 쓸 수 있게 공개 발행한다

> "토폴로지는 출구 중 하나, 진짜 척추는 md 문서 → 온톨로지" — 프로젝트 작업 원칙

## 왜 만드는가

- **노트 도구는 "글"** 만 다루고, **그래프 도구는 "구조"** 만 다룬다.
- 사이에 비어 있는 자리가 있다 — *글에서 그래프가 자라는 워크벤치*.
- Palantir Foundry 의 ontology 모델, Notion 의 database, Obsidian 의 graph view 를 한 워크플로 안에 묶는다는 시도.

## 핵심 흐름

```
                ┌────────────┐
                │  markdown  │  사용자가 문서 작성
                └──────┬─────┘
                       │
                       ▼
                ┌────────────┐
                │  Extract   │  LLM 또는 규칙 기반 추출
                └──────┬─────┘
                       │
                       ▼
                ┌────────────┐
                │   Review   │  사람이 후보 검수
                └──────┬─────┘
                       │
                       ▼
            ┌──────────┴──────────┐
            ▼                     ▼
     ┌────────────┐        ┌────────────┐
     │  Approved  │ ◄────► │   Public   │  발행 후 외부 도구가 활용
     │   graph    │        │ projection │
     └────────────┘        └────────────┘
            │
            ├── Topology view (force-directed)
            ├── Tree view (taxonomy)
            └── ERD canvas (직접 편집)
```

## 핵심 기능

- **문서 등록 + 버전 관리** — markdown 을 등록하고 분석 트리거
- **추출 + 후보 생성** — 노드 / 관계 / 근거 후보를 자동 생성
- **검수 큐** — 후보를 한 번에 살펴보고 승인 / 반려
- **승인된 그래프 시각화**
  - 토폴로지 (Sigma.js + ForceAtlas2 + d3-force) — 전체 그래프 탐색
  - 트리 (taxonomy) — 계층 구조 빠르게 파악
  - ERD 캔버스 (xyflow 기반) — 노드 / 관계를 직접 그리며 편집
- **공개 발행** — private approved graph 와 public projection 을 분리해 외부 도구에 안전하게 노출
- **검색 팔레트** (`⌘K`) — 노드·문서·명령 통합 검색
- **다크 / 라이트 테마**

## 빠른 시작

```bash
# 1. 의존성 설치
pnpm install

# 2. 환경 변수 설정 (Firebase 사용 시)
cp .env.example .env.local
# .env.local 을 열어 Firebase 설정값 채움

# 3. 개발 서버
pnpm dev
# → http://localhost:3000

# 4. 테스트 / 타입 체크 / 린트
pnpm test:run
pnpm exec tsc --noEmit
pnpm lint

# 5. 정적 export 빌드
pnpm build
# → out/
```

### 로컬 Firestore 에뮬레이터

```bash
pnpm dev:firestore-emulator      # 별도 터미널 (127.0.0.1:18080)
pnpm seed:emulator               # 시드 데이터 주입
```

`.env.local` 에 다음 추가:

```
NEXT_PUBLIC_FIREBASE_USE_EMULATORS=1
NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST=127.0.0.1:18080
```

## 기술 스택

| 영역          | 선택                                                                  |
| ------------- | --------------------------------------------------------------------- |
| Framework     | Next.js 16 (App Router · `output: 'export'`)                          |
| Language      | TypeScript 5                                                          |
| Style         | Tailwind CSS 4 (CSS-based `@theme`)                                   |
| Visualization | Sigma.js (WebGL) · Graphology · ForceAtlas2 · d3-force · Framer Motion · xyflow |
| Backend       | Firebase (Firestore · Storage · Auth · Hosting · Functions 2nd gen)   |
| State         | Firestore `onSnapshot` 실시간 구독 + React local state / URL state    |
| Architecture  | Feature-Sliced Design (ESLint boundaries 로 import 방향 강제)         |
| Test          | Vitest + Testing Library + jsdom · Playwright (E2E)                   |
| Lint          | ESLint 9 flat config                                                  |
| Package       | pnpm                                                                  |

## 디자인 철학

- **Linear 베이스, 무채색 + 단일 인디고 (`#5e6ad2`)** — AI 생성 UI 클리셰 차단을 위한 극단적 제약.
- **금지 목록**: 보라→핑크 그라디언트, glassmorphism, glow pulse, 움직이는 그라디언트 배경, scale 호버, 둘 이상의 채색 시스템.
- 신호 톤만 예외 (경고 amber, 에러 red, 인디고 정책과 분리).

자세한 토큰 / 모션 / 금지 규칙은 [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md).

## 주요 라우트

```
/                          토폴로지 view (전체 그래프)
/projects                  프로젝트 목록
/project/[slug]            프로젝트 상세
/knowledge                 문서 등록 / 분석
/knowledge/documents       문서 목록
/review/knowledge          검수 큐
/ontology                  승인된 트리 view
/ontology/edit             ERD 캔버스 편집기
/ontology/insights         그래프 인사이트
/ontology/relations        관계 분포
/settings/*                카테고리 / 상태 / API 키 / 임포트
/diagnostics/insights      운영 인사이트
/account                   계정 설정
/login · /signup           인증
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
docs/                      아키텍처 / 데이터 모델 / 디자인 시스템 문서
functions/                 Cloud Functions (2nd gen)
packages/                  내부 패키지
tests/                     Vitest 단위 + Playwright E2E + golden fixtures
scripts/                   시드 / 배포 / 검증 스크립트
```

**Import 방향**: `app → views → widgets → features → entities → shared`

## 로드맵

> 자세한 1원칙 분해와 우선순위는 별도 작업 라운드에서 정리합니다.

### v0.1 (현재 상태)

- 토폴로지 / 트리 / ERD 세 가지 view
- 검수 큐 + 승인된 그래프 저장
- Firebase 기반 multi-account workspace
- 데모 / 시드 데이터로 즉시 체험 가능

### v1.0 (계획) — 1원칙 슬림화

- surface 를 핵심 5개로 단순화 (`/`, `/docs`, `/review`, `/edit`, `/tree`)
- multi-account / demo / portfolio showcase 등 본질 외 기능 정리
- contributor 가 5분 안에 첫 노드를 볼 수 있는 onboarding

### v2.0 (계획) — 협업 / 호스팅

- 협업 워크스페이스 재도입 (server / cloud sync)
- self-host 가이드
- public projection API + SDK

### Backlog

- Local-first 모드 (IndexedDB / SQLite WASM 어댑터)
- Property matrix view (노드 한 개의 모든 속성·관계 표)
- Faceted / sunburst 시각화
- Action types (Palantir 스타일 — entity 변경 명세를 ontology 일부로)

## 키보드 단축키

| Key             | 동작                       |
| --------------- | -------------------------- |
| `⌘K` / `Ctrl+K` | 검색 팔레트 열기 / 닫기    |
| `F`             | 프레젠테이션 모드 토글     |
| `Shift + 클릭`  | 두 노드 사이 최단 경로     |
| `Tab`           | 이웃 순회                  |
| `/`             | 캔버스 검색 포커스         |
| `?`             | 단축키 전체 보기           |
| `Esc`           | 드로어 / 팔레트 닫기       |

## 문서 지도

| 문서                                                    | 읽는 시점                                        |
| ------------------------------------------------------- | ------------------------------------------------ |
| [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md)     | AI 에이전트 / 컨트리뷰터 작업 시작 전            |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)          | 제품 구조 · URL 공간 · 공개/운영 경계            |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md)              | Firestore 스키마 + Security Rules                |
| [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md)        | 디자인 토큰 · 모션 · 금지 규칙                   |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)              | Firebase 배포 절차 · 롤백 · 도메인               |
| [`docs/OPERATIONS-GUIDE.md`](docs/OPERATIONS-GUIDE.md)  | 운영 흐름                                        |
| [`docs/SEED-DATA.md`](docs/SEED-DATA.md)                | 시드 주입 절차                                   |
| [`docs/rules/`](docs/rules/)                            | FSD · git · 네이밍 · 스키마 작업 규율            |

## Contributing

오픈소스 컨트리뷰션을 환영합니다. 본격적인 가이드 (`CONTRIBUTING.md`) 는 v0.1 안정화 후 정리됩니다. 그전까지의 안내:

1. Issue 로 먼저 의도를 공유해 주세요 — 작업 중복 방지.
2. 코드 변경은 새 브랜치에서. PR 단위는 작게.
3. 커밋 메시지는 conventional prefix + 짧은 본문 (`feat: ...`, `fix: ...`, `refactor: ...`, `docs: ...`).
4. 문서가 구현보다 앞섭니다 — 스키마 / 라우트 / 운영 모델 변경은 `docs/` 도 같이 갱신.
5. 테스트가 있는 영역은 PR 에서 통과 확인 (`pnpm test:run`, `pnpm exec tsc --noEmit`, `pnpm lint`).
6. 디자인 변경은 [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md) 의 금지 목록을 지킵니다.

작업 규율 패키지: [`docs/rules/`](docs/rules/).

## 라이선스

[MIT License](LICENSE) — fork·수정·재배포 자유. 자세한 내용은 [`LICENSE`](LICENSE).

## Credits

`oh-my-ontology` 는 다음 오픈소스 프로젝트들 위에 만들어졌습니다:

- [Next.js](https://nextjs.org/) · [TypeScript](https://www.typescriptlang.org/) · [Tailwind CSS](https://tailwindcss.com/)
- [Sigma.js](https://www.sigmajs.org/) · [Graphology](https://graphology.github.io/)
- [xyflow](https://xyflow.com/) (React Flow)
- [Firebase](https://firebase.google.com/)
- [Vitest](https://vitest.dev/) · [Playwright](https://playwright.dev/) · [Testing Library](https://testing-library.com/)
- [Linear](https://linear.app/) — 디자인 영감 (해당 회사와 무관)

영감을 준 제품군: Palantir Foundry · Notion · Obsidian · Neo4j Bloom · TerminusDB.

---

**Repository** · <https://github.com/wlsdks/oh-my-ontology>
