# Phase 0+1 구현 계획 — 프로젝트 초기화 & FSD 골격

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js 14+ (App Router) 프로젝트를 pnpm으로 초기화하고, FSD(Feature-Sliced Design) 디렉토리 골격 + shared 레이어 + Linear 디자인 토큰 + Firebase 클라이언트 초기화 + 완전한 문서 스켈레톤까지 구축한다. 완료 시 "Aslan Project Map" 히어로 한 줄이 렌더되는 정적 빌드 가능한 Next.js 앱이 된다.

**Architecture:** Next.js App Router + 정적 export, FSD 레이어(`app → views → widgets → features → entities → shared`)를 `src/` 하위에 배치. 루트 `app/`은 Next.js 라우팅용 얇은 래퍼. ESLint `boundaries` 플러그인으로 레이어 import 방향 자동 검증. 테스트는 Vitest.

**Tech Stack:** Next.js 14+, TypeScript, Tailwind CSS, pnpm, Vitest, Firebase v10+ (Firestore/Storage/Auth), shadcn/ui, Inter Variable 폰트, eslint-plugin-boundaries, Framer Motion, React Flow (xyflow).

**Reference:** `docs/superpowers/specs/2026-04-12-aslan-project-map-design.md` (설계 문서)

---

## 작업 브랜치 전략

- 이 plan 전체는 브랜치 `feature/phase-0-scaffold` (Task 1-8)와 `feature/phase-1-fsd-skeleton` (Task 9-24)에서 작업.
- 각 브랜치는 완료 후 main으로 merge.
- 파괴적 git 작업은 반드시 사용자 확인.

---

## 파일 구조 (최종 모습)

```
project-map/
├── app/
│   ├── layout.tsx                ← Next.js 라우팅 래퍼
│   ├── page.tsx                   ← src/views/home 재노출
│   └── globals.css
├── src/
│   ├── app/
│   │   └── providers/
│   │       ├── FirebaseProvider.tsx
│   │       └── index.ts
│   ├── views/
│   │   └── home/
│   │       ├── ui/HomePage.tsx
│   │       └── index.ts
│   ├── widgets/                  (빈 디렉토리 + .gitkeep)
│   ├── features/                 (빈 디렉토리 + .gitkeep)
│   ├── entities/                 (빈 디렉토리 + .gitkeep)
│   └── shared/
│       ├── api/firebase.ts
│       ├── config/env.ts
│       ├── lib/
│       │   ├── cn.ts
│       │   ├── cn.test.ts
│       │   ├── slugify.ts
│       │   ├── slugify.test.ts
│       │   ├── format-date.ts
│       │   └── format-date.test.ts
│       ├── ui/
│       │   ├── button.tsx
│       │   ├── card.tsx
│       │   └── badge.tsx
│       └── types/index.ts
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DATA-MODEL.md
│   ├── DESIGN-SYSTEM.md
│   ├── DEPLOYMENT.md
│   ├── ADMIN-GUIDE.md
│   ├── SEED-DATA.md
│   ├── CHANGELOG.md
│   └── rules/
│       ├── README.md
│       ├── architecture-fsd.md
│       ├── git-workflow.md
│       ├── naming.md
│       ├── firestore-schema.md
│       └── documentation.md
├── .env.example
├── .eslintrc.json
├── CLAUDE.md
├── README.md
├── next.config.mjs
├── package.json
├── pnpm-lock.yaml
├── postcss.config.mjs
├── tailwind.config.ts
├── tsconfig.json
└── vitest.config.ts
```

---

# Phase 0 — 프로젝트 초기화 & 문서 스켈레톤

브랜치: `feature/phase-0-scaffold`

## Task 1: Next.js 프로젝트 초기화

**Files:**

- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `.eslintrc.json`

- [ ] **Step 1: feature 브랜치 생성**

```bash
git checkout main
git checkout -b feature/phase-0-scaffold
```

- [ ] **Step 2: `create-next-app`으로 Next.js 프로젝트를 현재 디렉토리에 생성**

```bash
pnpm create next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir=false \
  --import-alias="@/*" \
  --use-pnpm
```

프롬프트가 나오면:

- "Would you like to use Turbopack for next dev?" → **No**
- 기존 파일이 존재한다는 경고에 → **Yes** (진행)

Expected: `package.json`, `tsconfig.json`, `app/`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs` 생성됨.

- [ ] **Step 3: 설치 성공 검증**

```bash
pnpm --version
ls app/ package.json next.config.mjs tailwind.config.ts
```

Expected: 위 파일들 모두 존재.

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "chore: Next.js 프로젝트 초기화 (App Router, TypeScript, Tailwind)"
```

---

## Task 2: 핵심 의존성 설치

**Files:**

- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: 런타임 의존성 설치**

```bash
pnpm add firebase @xyflow/react framer-motion zod clsx class-variance-authority tailwind-merge lucide-react react-markdown remark-gfm nanoid browser-image-compression zustand
```

- [ ] **Step 2: 개발 의존성 설치**

```bash
pnpm add -D \
  vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom \
  eslint-plugin-boundaries \
  prettier prettier-plugin-tailwindcss \
  @types/node
```

- [ ] **Step 3: 설치 확인**

```bash
pnpm list --depth=0 | grep -E "firebase|@xyflow|framer-motion|vitest|eslint-plugin-boundaries"
```

Expected: 각 패키지가 목록에 존재.

- [ ] **Step 4: 커밋**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: 핵심 런타임 및 개발 의존성 추가"
```

---

## Task 3: Next.js 정적 export 설정 & 환경변수 템플릿

**Files:**

- Modify: `next.config.mjs`
- Create: `.env.example`

- [ ] **Step 1: `next.config.mjs` 갱신 — 정적 export 활성화**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
```

- [ ] **Step 2: `.env.example` 생성**

```bash
# Firebase Web SDK 설정 (Firebase Console → 프로젝트 설정 → 일반 → 내 앱 → SDK 설정 및 구성)
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=aslan-project-map.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=aslan-project-map
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=aslan-project-map.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

파일 생성 후 `.env.local`을 진안이 직접 만들어 실제 값을 채운다 (`.gitignore`에 포함됨).

- [ ] **Step 3: 빌드 테스트**

```bash
pnpm build
```

Expected: 빌드 성공, `out/` 디렉토리에 정적 파일 생성.

- [ ] **Step 4: 커밋**

```bash
git add next.config.mjs .env.example
git commit -m "chore: 정적 export 설정 및 Firebase 환경변수 템플릿 추가"
```

---

## Task 4: Vitest 설정

**Files:**

- Create: `vitest.config.ts`, `vitest.setup.ts`
- Modify: `package.json` (scripts), `tsconfig.json`

- [ ] **Step 1: `vitest.config.ts` 생성**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
```

- [ ] **Step 2: `vitest.setup.ts` 생성**

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: `package.json`의 `scripts`에 test 명령 추가**

`package.json`을 열고 `scripts` 섹션에 추가:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest",
  "test:run": "vitest run"
}
```

- [ ] **Step 4: `tsconfig.json`에 vitest 타입 추가**

`compilerOptions.types`에 추가 (없으면 배열 생성):

```json
"compilerOptions": {
  "types": ["vitest/globals", "@testing-library/jest-dom"]
}
```

- [ ] **Step 5: Vitest 동작 확인 — 임시 샘플 테스트**

임시 파일 `sanity.test.ts` 생성:

```typescript
import { describe, it, expect } from "vitest";

describe("sanity", () => {
  it("adds numbers", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `pnpm test:run sanity.test.ts`
Expected: `✓ sanity > adds numbers` 통과.

- [ ] **Step 6: 샘플 테스트 삭제 & 커밋**

```bash
rm sanity.test.ts
git add vitest.config.ts vitest.setup.ts package.json tsconfig.json
git commit -m "chore: Vitest 테스트 환경 구성 (jsdom, testing-library)"
```

---

## Task 5: CLAUDE.md & README.md 작성

**Files:**

- Create: `CLAUDE.md`, `README.md`

- [ ] **Step 1: `CLAUDE.md` 작성 — AI 작업 가이드**

```markdown
# CLAUDE.md — Aslan Project Map 작업 가이드

> 이 파일은 Claude(또는 다른 AI 에이전트)가 이 프로젝트에서 작업할 때 읽어야 하는 지침서다.

## 프로젝트 개요

**Aslan Project Map** — 아슬란의 프로젝트·도메인·서비스를 인터랙티브 토폴로지로 시각화하는 공개 웹사이트. 방문자는 전체 프로젝트 구조를 돌아볼 수 있고, 화이트리스트 어드민만 `/admin`에서 편집할 수 있다.

**주요 문서**:

- `docs/superpowers/specs/2026-04-12-aslan-project-map-design.md` — 설계 문서 (13개 섹션, 모든 결정사항)
- `docs/ARCHITECTURE.md` — 아키텍처 상세
- `docs/DATA-MODEL.md` — Firestore 스키마 + Security Rules
- `docs/DESIGN-SYSTEM.md` — Linear 베이스 디자인 시스템 적용
- `docs/DEPLOYMENT.md` — Firebase Hosting 배포 절차
- `docs/design-references/DESIGN-linear.md` — Linear 원본 사양 (MIT)

## 규율 패키지

모든 작업 규칙은 `docs/rules/`에 있다. 시작 전 읽어볼 것:

- [`docs/rules/architecture-fsd.md`](docs/rules/architecture-fsd.md) — FSD 레이어 규칙
- [`docs/rules/git-workflow.md`](docs/rules/git-workflow.md) — 브랜치·커밋 규칙
- [`docs/rules/naming.md`](docs/rules/naming.md) — 파일·변수 네이밍
- [`docs/rules/firestore-schema.md`](docs/rules/firestore-schema.md) — 스키마 변경 프로세스
- [`docs/rules/documentation.md`](docs/rules/documentation.md) — 문서 유지 규칙

## 기술 스택

- **Framework**: Next.js 14+ (App Router, `output: 'export'`)
- **Language**: TypeScript
- **Style**: Tailwind CSS + shadcn/ui
- **Visualization**: React Flow (@xyflow/react), Framer Motion
- **Backend**: Firebase (Firestore / Storage / Auth / Hosting)
- **Test**: Vitest + Testing Library
- **Package Manager**: pnpm

## 아키텍처 요약 (FSD + Next.js)
```

app/ ← Next.js 라우팅 전용 (얇은 래퍼)
src/
app/ ← FSD app 레이어 (providers, 초기화)
views/ ← FSD pages 레이어 (페이지 컴포넌트)
widgets/ ← 복합 UI 블록
features/ ← 사용자 인터랙션 단위
entities/ ← 비즈니스 엔티티 (Project, Admin)
shared/ ← 재사용 기반 (ui, lib, api, config)

```

**Import 방향**: `app → views → widgets → features → entities → shared` (역방향 금지).
ESLint `eslint-plugin-boundaries`가 자동 검증한다.

## 작업 원칙
1. **문서가 생명선** — 구조 변경 시 코드와 문서를 같이 수정
2. **작업 단위마다 커밋** — 큰 덩어리 커밋 금지
3. **한글 커밋 메시지** — `타입: 한글 설명` (타입은 영어)
4. **브랜치**: `feature/{english-kebab-case}` 로 통일
5. **파괴적 작업**(reset --hard, force push 등)은 반드시 사용자 확인
6. **TDD 우선** — 테스트 먼저, 구현 나중 (특히 `shared/lib`, `entities/*/model`)

## 핵심 결정 (절대 바꾸지 말 것 — 바꾸려면 설계 문서 먼저 수정)
- **디자인**: Linear 베이스, AI 클리셰 절대 금지 (glow/gradient/glassmorphism/scale hover)
- **색**: 시스템은 무채색 + 단일 인디고(`#5e6ad2`). 허브 노드(IAM/Reactor)만 유일한 채색.
- **카테고리 구분**: 색이 아닌 보더 스타일 (작업중: 인디고 언더라인 / 예정: dashed)
- **데이터**: Firestore `projects` 컬렉션, `slug`를 문서 ID로 사용
- **Auth**: Firebase Auth Google + `admins/{email}` 화이트리스트 (Console에서 수동 등록)

## 폴더 찾아가기 (Quick Map)
- 프로젝트 CRUD 로직 → `src/entities/project/api/`
- 토폴로지 렌더 → `src/widgets/topology-canvas/`
- 노드 디자인 → `src/features/project-node-render/`
- 어드민 가드 → `src/features/admin-auth/`
- Firebase 초기화 → `src/shared/api/firebase.ts`
- 디자인 토큰 → `tailwind.config.ts`
```

- [ ] **Step 2: `README.md` 작성 — 사람용 진입점**

기존 `README.md` 내용 덮어쓰기:

````markdown
# Aslan Project Map

아슬란의 프로젝트·도메인·서비스를 인터랙티브 토폴로지로 시각화하는 공개 웹사이트.

**Live**: (배포 후 추가)
**설계 문서**: [`docs/superpowers/specs/2026-04-12-aslan-project-map-design.md`](docs/superpowers/specs/2026-04-12-aslan-project-map-design.md)

## 빠른 시작

```bash
# 1. 의존성 설치
pnpm install

# 2. Firebase 환경변수 설정
cp .env.example .env.local
# .env.local을 열어 Firebase Console에서 받은 값으로 채운다

# 3. 개발 서버
pnpm dev
# → http://localhost:3000

# 4. 테스트
pnpm test

# 5. 프로덕션 빌드 (정적 export)
pnpm build
# → out/ 디렉토리에 정적 파일 생성
```
````

## 문서 지도

| 문서                                             | 역할                              |
| ------------------------------------------------ | --------------------------------- |
| [`CLAUDE.md`](CLAUDE.md)                         | AI 작업 가이드 — 작업 전 필독     |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)   | 전체 아키텍처                     |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md)       | Firestore 스키마 + Security Rules |
| [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md) | 디자인 시스템 (Linear 베이스)     |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)       | 배포 절차                         |
| [`docs/ADMIN-GUIDE.md`](docs/ADMIN-GUIDE.md)     | 어드민 사용법                     |
| [`docs/SEED-DATA.md`](docs/SEED-DATA.md)         | 시드 데이터 주입                  |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md)         | 주요 변경 이력                    |
| [`docs/rules/`](docs/rules/)                     | 작업 규율 패키지                  |

## 기술 스택

Next.js 14+ / TypeScript / Tailwind CSS / Firebase / React Flow / Framer Motion / pnpm

## 라이선스

TBD (내부 프로젝트)

````

- [ ] **Step 3: 커밋**

```bash
git add CLAUDE.md README.md
git commit -m "docs: CLAUDE.md 및 README.md 작성"
````

---

## Task 6: docs/ 스켈레톤 문서 생성

**Files:**

- Create: `docs/ARCHITECTURE.md`, `docs/DATA-MODEL.md`, `docs/DESIGN-SYSTEM.md`, `docs/DEPLOYMENT.md`, `docs/ADMIN-GUIDE.md`, `docs/SEED-DATA.md`, `docs/CHANGELOG.md`

- [ ] **Step 1: `docs/ARCHITECTURE.md` 생성**

```markdown
# Architecture

> 이 문서는 설계 문서 [`docs/superpowers/specs/2026-04-12-aslan-project-map-design.md`](superpowers/specs/2026-04-12-aslan-project-map-design.md)의 섹션 2·5·6을 기반으로 유지된다. 구조 변경 시 이 문서도 반드시 갱신한다.

## 전체 구조

(설계 문서 섹션 2 참조)

## FSD 레이어 구성

(설계 문서 섹션 6 참조)

## 페이지 & 컴포넌트

(설계 문서 섹션 5 참조)

## 확장성 트리거

- 프로젝트 수 25개 돌파 시 단일 캔버스 → 탭 분리 재검토
- 트래픽 10k/일 돌파 시 Firebase Blaze 플랜 업그레이드 검토

## 변경 이력

- 2026-04-12 초기 작성 (Phase 0)
```

- [ ] **Step 2: `docs/DATA-MODEL.md` 생성**

```markdown
# Data Model

> 이 문서는 설계 문서 섹션 4를 기반으로 유지된다. 컬렉션 스키마를 변경할 때 반드시 이 문서를 먼저 갱신한다. 변경 프로세스는 [`docs/rules/firestore-schema.md`](rules/firestore-schema.md)를 따른다.

## Firestore 컬렉션

(설계 문서 섹션 4.1-4.4 참조)

## Security Rules

(설계 문서 섹션 4.5 참조 — `firestore.rules` 파일은 Phase 2에서 생성)

## Storage 구조

(설계 문서 섹션 4.6-4.7 참조)

## 변경 이력

- 2026-04-12 초기 작성 (Phase 0)
```

- [ ] **Step 3: `docs/DESIGN-SYSTEM.md` 생성**

```markdown
# Design System

> 이 문서는 설계 문서 섹션 3을 기반으로 유지된다. Linear 원본 사양은 [`docs/design-references/DESIGN-linear.md`](design-references/DESIGN-linear.md)를 참고.

## 디자인 토큰

Tailwind 설정(`tailwind.config.ts`)이 실제 구현이며, 이 문서는 근거와 원칙을 기록한다.

## 절대 규칙 (Don'ts)

설계 문서 섹션 3.6 참조:

- 보라→핑크 그라디언트 금지
- glassmorphism 금지
- glow pulse / neon 금지
- 움직이는 그라디언트 배경 금지
- scale 기반 호버 효과 금지
- 둘 이상의 채색 시스템 금지 (단일 인디고 원칙)

## 변경 이력

- 2026-04-12 초기 작성 (Phase 0)
```

- [ ] **Step 4: `docs/DEPLOYMENT.md` 생성**

````markdown
# Deployment

> Firebase Hosting 기반 정적 배포. 상세 절차는 Phase 7 구현 시 확정된다.

## 사전 준비

1. Firebase CLI 설치 (`pnpm add -g firebase-tools`)
2. `firebase login`
3. Firebase Console에서 `aslan-project-map` 프로젝트 선택
4. `.env.local`에 Firebase 설정 입력 (`.env.example` 참고)

## 배포 커맨드

```bash
pnpm build             # out/ 디렉토리 생성
firebase deploy        # Firebase Hosting에 업로드
```
````

## 환경변수

`.env.local`에 다음이 모두 채워져야 한다:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

## 트러블슈팅

(Phase 7 구현 시 채움)

## 변경 이력

- 2026-04-12 초기 작성 (Phase 0)

````

- [ ] **Step 5: `docs/ADMIN-GUIDE.md` 생성**

```markdown
# Admin Guide

> 어드민(진안)이 프로젝트 데이터를 관리하는 방법. 본격 구현은 Phase 5.

## 로그인
1. `/admin` 접속
2. "Google로 로그인" 버튼 클릭
3. Firebase Console에서 미리 등록한 이메일로 로그인 → 자동으로 대시보드 진입

## 화이트리스트 관리
Firebase Console → Firestore → `admins/{이메일}` 문서 직접 생성.
필드: `addedAt` (서버 타임스탬프), `note` (선택)

## 프로젝트 편집
(Phase 5 구현 시 채움)

## 변경 이력
- 2026-04-12 초기 작성 (Phase 0)
````

- [ ] **Step 6: `docs/SEED-DATA.md` 생성**

````markdown
# Seed Data

> 초기 프로젝트 목록을 Firestore에 주입하는 스크립트. 본격 구현은 Phase 6.

## 실행

```bash
pnpm seed
```
````

## 사전 준비

1. Firebase Console → 프로젝트 설정 → 서비스 계정 → "새 비공개 키 생성" → JSON 다운로드
2. 다운로드한 파일을 `serviceAccountKey.json`으로 저장 (프로젝트 루트)
3. **이 파일은 절대 Git에 커밋 금지** — `.gitignore`에 포함됨

## 시드 데이터 구조

설계 문서 섹션 4.8 참조.

## 변경 이력

- 2026-04-12 초기 작성 (Phase 0)

````

- [ ] **Step 7: `docs/CHANGELOG.md` 생성**

```markdown
# Changelog

> 주요 변경 이력. 구조 변경·마이그레이션·기능 릴리즈를 날짜별로 기록.

## [Unreleased]
### Added
- Phase 0: 프로젝트 초기화 (Next.js 14 + TypeScript + Tailwind + pnpm)
- 문서 스켈레톤 (`docs/` 전체)
- 규율 패키지 (`docs/rules/`)
- CLAUDE.md 및 README.md

## 2026-04-12
- 초기 설계 문서 작성 (`docs/superpowers/specs/2026-04-12-aslan-project-map-design.md`)
````

- [ ] **Step 8: 커밋**

```bash
git add docs/ARCHITECTURE.md docs/DATA-MODEL.md docs/DESIGN-SYSTEM.md docs/DEPLOYMENT.md docs/ADMIN-GUIDE.md docs/SEED-DATA.md docs/CHANGELOG.md
git commit -m "docs: 프로젝트 문서 스켈레톤 작성 (ARCHITECTURE, DATA-MODEL, DESIGN-SYSTEM, DEPLOYMENT, ADMIN-GUIDE, SEED-DATA, CHANGELOG)"
```

---

## Task 7: docs/rules/ 규율 패키지 작성

**Files:**

- Create: `docs/rules/README.md`, `docs/rules/architecture-fsd.md`, `docs/rules/git-workflow.md`, `docs/rules/naming.md`, `docs/rules/firestore-schema.md`, `docs/rules/documentation.md`

- [ ] **Step 1: `docs/rules/README.md` 생성**

```markdown
# Rules Package

프로젝트 작업에 적용되는 규율 모음. 작업 전 해당 규칙을 먼저 확인한다.

| 파일                                         | 내용                                              |
| -------------------------------------------- | ------------------------------------------------- |
| [`architecture-fsd.md`](architecture-fsd.md) | FSD 레이어 규칙, import 방향, 슬라이스 Public API |
| [`git-workflow.md`](git-workflow.md)         | 브랜치 생성·커밋·merge 규칙                       |
| [`naming.md`](naming.md)                     | 파일·변수·컴포넌트 네이밍 컨벤션                  |
| [`firestore-schema.md`](firestore-schema.md) | 스키마 변경 프로세스                              |
| [`documentation.md`](documentation.md)       | 문서 유지 규칙                                    |

## 원칙

- 규칙 변경 시 이 폴더의 관련 파일 + `CLAUDE.md` 링크 일관성 확인
- 규칙이 깨진 경우 린트·CI·리뷰어 중 누군가가 잡아야 함
```

- [ ] **Step 2: `docs/rules/architecture-fsd.md` 생성**

```markdown
# FSD 아키텍처 규칙

## 레이어 (상위 → 하위)
```

app → views → widgets → features → entities → shared

````

## Import 방향 규칙
- **상위는 하위만 import** 가능 (역방향 금지)
- **같은 레이어끼리 직접 import 금지** — 조립은 상위 레이어에서
- 검증: ESLint `eslint-plugin-boundaries` 플러그인이 빌드 시 자동 체크

## Public API 원칙
각 슬라이스는 루트 `index.ts`로만 외부에 노출.

```ts
// ✅ 허용
import { ProjectCard } from '@/entities/project';

// ❌ 금지 (내부 경로 직접 접근)
import { ProjectCard } from '@/entities/project/ui/ProjectCard';
````

## 판단 기준 — 이 코드는 어디로 가나?

| 코드 성격                     | 레이어          | 예시                              |
| ----------------------------- | --------------- | --------------------------------- |
| Next.js 라우팅 파일           | `app/` (루트)   | `app/project/[slug]/page.tsx`     |
| 앱 초기화·providers           | `src/app/`      | `FirebaseProvider`                |
| 페이지 구성(여러 widget 조합) | `src/views/`    | `HomePage`, `ProjectDetailPage`   |
| 여러 feature를 조립한 UI 블록 | `src/widgets/`  | `TopologyCanvas`, `ProjectDrawer` |
| 사용자 한 행동 단위           | `src/features/` | `project-edit`, `admin-auth`      |
| 비즈니스 도메인 개체          | `src/entities/` | `Project`, `Admin`                |
| 도메인과 무관한 공통 자원     | `src/shared/`   | `Button`, `cn()`, `firebase.ts`   |

## `app/` vs `src/app/`

- **루트 `app/`**: Next.js 라우팅 전용. 파일은 얇게 — 내부적으로 `src/views/*`를 import만.
- **`src/app/`**: FSD app 레이어. providers, 전역 초기화 코드.

## 작업 흐름

1. 새 기능 시작 → 어느 레이어에 들어갈지 먼저 결정
2. 여러 레이어에 걸친 기능이면 → 각 레이어의 슬라이스로 분리
3. 의심스러우면 → `shared/`는 가장 안전한 선택

````

- [ ] **Step 3: `docs/rules/git-workflow.md` 생성**

```markdown
# Git Workflow 규칙

## 브랜치
- **네이밍**: `feature/{english-kebab-case}` 로 통일. 타입 구분 prefix 없음.
  - 예: `feature/initial-design-spec`, `feature/project-node-component`, `feature/fix-admin-auth`
- **한글 금지**, 영문 kebab-case만
- 브랜치 생성은 자유, **삭제는 사전 확인**

## 커밋
- **작업 단위마다 커밋** — 큰 덩어리 금지
- **메시지 형식**: `타입: 한글 설명`
  - 타입: 영어 (`feat`, `fix`, `docs`, `refactor`, `chore`, `style`, `test`)
  - 설명: 한글로 "무엇을 왜"
- **예시**:
  - `feat: 프로젝트 노드 컴포넌트 추가`
  - `fix: 어드민 인증 가드 리디렉션 경로 수정`
  - `docs: FSD 아키텍처 규칙 업데이트`
  - `chore: Next.js 정적 export 설정 추가`

## Merge
- main으로 merge — 기본 merge commit (`--no-ff` 권장 — 브랜치 히스토리 유지)
- squash는 사용자가 요청할 때만

## 금지 행위 (사전 확인 없이 절대 금지)
- `git reset --hard`
- `git push --force` / `--force-with-lease`
- 브랜치 삭제 (`branch -D`, `branch -d`)
- `checkout .`, `restore .`, `clean -f`
- main에 직접 커밋 (항상 브랜치 경유)
- `--no-verify` (hook 건너뛰기)

## Co-author
AI가 생성한 커밋은 항상:
````

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>

```

```

- [ ] **Step 4: `docs/rules/naming.md` 생성**

```markdown
# 네이밍 규칙

## 디렉토리

- **kebab-case**: `src/features/project-node-render/`, `src/widgets/topology-canvas/`

## 파일

- **컴포넌트**: PascalCase + `.tsx` — `ProjectNode.tsx`, `HomePage.tsx`
- **훅**: camelCase, `use` prefix — `useProject.ts`, `useAdmin.ts`
- **유틸리티**: camelCase 또는 kebab-case — `cn.ts`, `format-date.ts` (이 프로젝트는 kebab-case 선호)
- **테스트**: 같은 이름 + `.test.ts` — `slugify.ts` → `slugify.test.ts`
- **Public API**: `index.ts` (각 슬라이스 루트)

## 변수 / 함수

- **camelCase**: `projectCount`, `formatDate`
- **Boolean**: `is/has/can` prefix — `isHub`, `hasAdmin`, `canEdit`

## 타입 / 인터페이스

- **PascalCase**: `Project`, `AdminUser`
- **접미사 X** — `ProjectProps`, `ProjectInterface` 대신 `Project`와 `ProjectProps`처럼 의미로 구분
- **Enum 대신 union literal**: `type Status = 'idea' | 'live' | ...`

## 상수

- **UPPER_SNAKE_CASE**: `MAX_PROJECTS`, `DEFAULT_LOCALE`

## CSS 클래스

- Tailwind 유틸리티 우선. 커스텀 클래스 불가피할 때만 `kebab-case`.

## Firestore 필드

- **camelCase**: `createdAt`, `isHub`, `launchedAt` (설계 문서 섹션 4.2 따름)
```

- [ ] **Step 5: `docs/rules/firestore-schema.md` 생성**

```markdown
# Firestore 스키마 변경 프로세스

## 원칙

스키마 변경은 **문서가 먼저**다. 코드 수정보다 먼저 `docs/DATA-MODEL.md`에 변경을 반영한다.

## 변경 유형

1. **필드 추가** — 기존 데이터와 호환. `docs/DATA-MODEL.md`에 필드 추가 후 코드 수정.
2. **필드 삭제** — 기존 필드 제거 전, 참조하는 코드가 없음을 확인. 데이터도 수동 정리 필요.
3. **필드 타입 변경** — 마이그레이션 스크립트 작성. `scripts/migrations/` 디렉토리 사용.
4. **컬렉션 추가** — Security Rules도 같이 수정.
5. **컬렉션 이름 변경** — 데이터 마이그레이션 + Rules 수정 + 코드 대규모 수정. 가급적 피함.

## 체크리스트

- [ ] `docs/DATA-MODEL.md` 갱신
- [ ] 설계 문서 (`docs/superpowers/specs/*`) 업데이트 (Data Model 섹션)
- [ ] `entities/*/model` 타입 수정
- [ ] `entities/*/api` CRUD 함수 시그니처 확인
- [ ] `firestore.rules` 수정 (권한 영향 시)
- [ ] 시드 스크립트 (`scripts/seed.ts`) 갱신
- [ ] 테스트 추가/수정
- [ ] `docs/CHANGELOG.md`에 기록

## Security Rules 수정 시

- 로컬 Emulator로 반드시 테스트 후 배포 (`firebase emulators:start --only firestore`)
- 공격 시나리오 테스트: 비로그인 쓰기, 비인가 이메일 쓰기, 본인 외 admins 접근
```

- [ ] **Step 6: `docs/rules/documentation.md` 생성**

```markdown
# 문서 유지 규칙

## 원칙

**문서화가 프로젝트의 생명선**이다. 코드만 고치고 문서 안 고치면 안 된다.

## 문서 우선 순위

| 문서                       | 우선도 | 언제 수정?                                                |
| -------------------------- | ------ | --------------------------------------------------------- |
| `CLAUDE.md`                | ⭐⭐⭐ | 작업 방식·규칙·주요 결정 변경 시                          |
| `README.md`                | ⭐⭐⭐ | 빠른 시작·커맨드·진입점 변경 시                           |
| `docs/superpowers/specs/*` | ⭐⭐⭐ | 설계 자체가 변경될 때 (단, 구현 결정은 보통 여기 안 적음) |
| `docs/ARCHITECTURE.md`     | ⭐⭐   | 전체 구조·파일 배치 변경 시                               |
| `docs/DATA-MODEL.md`       | ⭐⭐⭐ | Firestore 스키마 변경 시 **반드시 먼저**                  |
| `docs/DESIGN-SYSTEM.md`    | ⭐⭐   | 디자인 토큰·컴포넌트 규칙 변경 시                         |
| `docs/DEPLOYMENT.md`       | ⭐⭐   | 배포 절차·환경변수 변경 시                                |
| `docs/ADMIN-GUIDE.md`      | ⭐     | 어드민 UX 변경 시                                         |
| `docs/SEED-DATA.md`        | ⭐     | 시드 스크립트 변경 시                                     |
| `docs/CHANGELOG.md`        | ⭐⭐   | 주요 변경마다 날짜 추가                                   |
| `docs/rules/*`             | ⭐⭐   | 규율 자체가 진화할 때                                     |

## 코드-문서 쌍

- Firestore 스키마 변경 → `docs/DATA-MODEL.md`
- 새 환경변수 → `docs/DEPLOYMENT.md` + `.env.example`
- 새 커맨드 → `README.md`
- 아키텍처 재구성 → `docs/ARCHITECTURE.md` + `CLAUDE.md`
- 디자인 토큰 추가 → `docs/DESIGN-SYSTEM.md`

## 자주 하는 실수

- 구현만 하고 CHANGELOG 누락 → 리뷰 시 지적
- `.env.example` 업데이트 누락 → 다음 세션에서 환경 구성 실패
- 설계 결정을 구두로만 기록 → 3세션 후 컨텍스트 상실
```

- [ ] **Step 7: 커밋**

```bash
git add docs/rules/
git commit -m "docs: 규율 패키지 작성 (FSD, git workflow, naming, firestore schema, documentation)"
```

---

## Task 8: Phase 0 완료 & main merge

**Files:** (브랜치 merge만)

- [ ] **Step 1: 브랜치 상태 확인**

```bash
git status
git log --oneline -10
```

Expected: Task 1-7의 커밋이 모두 브랜치에 있음, working tree clean.

- [ ] **Step 2: Phase 0 성과 확인**

```bash
pnpm build
```

Expected: 빌드 성공, `out/` 생성됨.

- [ ] **Step 3: main으로 merge (사용자 확인 필수)**

> ⚠️ **사용자에게 확인**: "Phase 0 완료. main으로 merge해도 될까요?"

확인 받은 후:

```bash
git checkout main
git merge feature/phase-0-scaffold --no-ff -m "Merge branch 'feature/phase-0-scaffold'

Phase 0 완료: Next.js 프로젝트 초기화 + 문서 스켈레톤 + 규율 패키지.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: merge 검증**

```bash
git log --oneline --graph -15
```

---

# Phase 1 — FSD 골격 & shared 레이어

브랜치: `feature/phase-1-fsd-skeleton`

## Task 9: FSD 디렉토리 구조 생성

**Files:**

- Create: `src/app/providers/.gitkeep`, `src/views/.gitkeep`, `src/widgets/.gitkeep`, `src/features/.gitkeep`, `src/entities/.gitkeep`, `src/shared/api/.gitkeep`, `src/shared/config/.gitkeep`, `src/shared/lib/.gitkeep`, `src/shared/ui/.gitkeep`, `src/shared/types/.gitkeep`
- Modify: `tsconfig.json` (경로 별칭)

- [ ] **Step 1: 새 브랜치 생성**

```bash
git checkout main
git checkout -b feature/phase-1-fsd-skeleton
```

- [ ] **Step 2: FSD 디렉토리 생성**

```bash
mkdir -p src/app/providers
mkdir -p src/views src/widgets src/features src/entities
mkdir -p src/shared/api src/shared/config src/shared/lib src/shared/ui src/shared/types
```

- [ ] **Step 3: 각 디렉토리에 `.gitkeep` 파일 생성 (Git 추적을 위해)**

```bash
touch src/app/providers/.gitkeep
touch src/views/.gitkeep
touch src/widgets/.gitkeep
touch src/features/.gitkeep
touch src/entities/.gitkeep
touch src/shared/api/.gitkeep
touch src/shared/config/.gitkeep
touch src/shared/lib/.gitkeep
touch src/shared/ui/.gitkeep
touch src/shared/types/.gitkeep
```

- [ ] **Step 4: `tsconfig.json`의 `paths`에 FSD 별칭 추가**

기존 `compilerOptions.paths`를 다음으로 교체 (없으면 추가):

```json
"paths": {
  "@/*": ["./*"],
  "@/app/*": ["./src/app/*"],
  "@/views/*": ["./src/views/*"],
  "@/widgets/*": ["./src/widgets/*"],
  "@/features/*": ["./src/features/*"],
  "@/entities/*": ["./src/entities/*"],
  "@/shared/*": ["./src/shared/*"]
}
```

- [ ] **Step 5: 타입 체크**

```bash
pnpm exec tsc --noEmit
```

Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/ tsconfig.json
git commit -m "feat: FSD 디렉토리 구조 및 tsconfig 경로 별칭 설정"
```

---

## Task 10: ESLint boundaries 플러그인으로 FSD 경계 검증 설정

**Files:**

- Modify: `.eslintrc.json`

- [ ] **Step 1: `.eslintrc.json` 업데이트**

기존 파일 내용을 다음으로 교체:

```json
{
  "extends": ["next/core-web-vitals", "next/typescript"],
  "plugins": ["boundaries"],
  "settings": {
    "boundaries/elements": [
      { "type": "app", "pattern": "src/app/*" },
      { "type": "views", "pattern": "src/views/*" },
      { "type": "widgets", "pattern": "src/widgets/*" },
      { "type": "features", "pattern": "src/features/*" },
      { "type": "entities", "pattern": "src/entities/*" },
      { "type": "shared", "pattern": "src/shared/*" }
    ]
  },
  "rules": {
    "boundaries/element-types": [
      2,
      {
        "default": "disallow",
        "rules": [
          {
            "from": "app",
            "allow": ["views", "widgets", "features", "entities", "shared"]
          },
          {
            "from": "views",
            "allow": ["widgets", "features", "entities", "shared"]
          },
          { "from": "widgets", "allow": ["features", "entities", "shared"] },
          { "from": "features", "allow": ["entities", "shared"] },
          { "from": "entities", "allow": ["shared"] },
          { "from": "shared", "allow": ["shared"] }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: lint 명령 실행하여 에러 없이 통과 확인**

```bash
pnpm lint
```

Expected: 경고·에러 없음 (아직 위반할 코드가 없으므로).

- [ ] **Step 3: 커밋**

```bash
git add .eslintrc.json
git commit -m "chore: eslint-plugin-boundaries로 FSD 레이어 import 방향 검증 설정"
```

---

## Task 11: FSD 경계 검증 동작 확인 (고의 위반 테스트)

**Files:**

- Create: (임시) `src/entities/_sanity.ts`, (임시) `src/shared/_bad-import.ts`

- [ ] **Step 1: 의도적으로 잘못된 import 생성 — `shared`가 `entities`를 import 시도**

임시 파일 `src/entities/_sanity.ts`:

```typescript
export const HELLO = "hello";
```

임시 파일 `src/shared/_bad-import.ts`:

```typescript
// 이건 금지되어야 함 — shared가 상위 레이어를 import
import { HELLO } from "@/entities/_sanity";
export const BAD = HELLO;
```

- [ ] **Step 2: lint 실행 — 에러가 발생해야 함**

```bash
pnpm lint
```

Expected: `boundaries/element-types` 규칙 위반 에러. 비슷한 메시지:

```
error: Importing elements of type 'entities' is not allowed from elements of type 'shared'
```

- [ ] **Step 3: 검증 성공 → 임시 파일 삭제**

```bash
rm src/entities/_sanity.ts src/shared/_bad-import.ts
pnpm lint
```

Expected: 이제 lint 통과.

- [ ] **Step 4: 커밋 생략** (임시 파일만 삭제, 실제 변경 없음)

---

## Task 12: shared/lib/cn.ts — TDD

**Files:**

- Create: `src/shared/lib/cn.ts`, `src/shared/lib/cn.test.ts`

- [ ] **Step 1: 실패하는 테스트 먼저 작성**

`src/shared/lib/cn.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins string classes", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("skips falsy values", () => {
    expect(cn("a", false, "b", null, undefined, "c")).toBe("a b c");
  });

  it("merges conflicting tailwind utilities (later wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles conditional object form", () => {
    expect(cn("base", { active: true, disabled: false })).toBe("base active");
  });
});
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

```bash
pnpm test:run src/shared/lib/cn.test.ts
```

Expected: FAIL — `cn` 모듈 없음.

- [ ] **Step 3: 최소 구현**

`src/shared/lib/cn.ts`:

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test:run src/shared/lib/cn.test.ts
```

Expected: 4개 테스트 모두 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/shared/lib/cn.ts src/shared/lib/cn.test.ts
git commit -m "feat: shared/lib/cn 유틸리티 추가 (clsx + tailwind-merge 통합)"
```

---

## Task 13: shared/lib/slugify.ts — TDD

**Files:**

- Create: `src/shared/lib/slugify.ts`, `src/shared/lib/slugify.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`src/shared/lib/slugify.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it("converts spaces to hyphens", () => {
    expect(slugify("Aslan Maps")).toBe("aslan-maps");
  });

  it("lowercases", () => {
    expect(slugify("IAM Admin")).toBe("iam-admin");
  });

  it("trims leading/trailing whitespace", () => {
    expect(slugify("  Reactor  ")).toBe("reactor");
  });

  it("collapses multiple spaces", () => {
    expect(slugify("Aslan     Studio")).toBe("aslan-studio");
  });

  it("strips special characters", () => {
    expect(slugify("Aslan Maps!@#$")).toBe("aslan-maps");
  });

  it("preserves hyphens", () => {
    expect(slugify("pre-existing-slug")).toBe("pre-existing-slug");
  });

  it("preserves Korean characters", () => {
    expect(slugify("뉴스 클리핑")).toBe("뉴스-클리핑");
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm test:run src/shared/lib/slugify.test.ts
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 최소 구현**

`src/shared/lib/slugify.ts`:

```typescript
/**
 * URL 친화적 slug 생성. 한글 보존, 공백은 하이픈으로, 특수문자 제거.
 */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "") // 문자·숫자·공백·하이픈만 유지
    .replace(/\s+/g, "-") // 공백 → 하이픈
    .replace(/-+/g, "-"); // 중복 하이픈 정리
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test:run src/shared/lib/slugify.test.ts
```

Expected: 7개 테스트 모두 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/shared/lib/slugify.ts src/shared/lib/slugify.test.ts
git commit -m "feat: shared/lib/slugify 유틸리티 추가 (한글·영문 kebab-case 변환)"
```

---

## Task 14: shared/lib/format-date.ts — TDD

**Files:**

- Create: `src/shared/lib/format-date.ts`, `src/shared/lib/format-date.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`src/shared/lib/format-date.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatDate } from "./format-date";

describe("formatDate", () => {
  it("formats ISO date to Korean short form", () => {
    expect(formatDate(new Date("2026-04-12"))).toBe("2026.04.12");
  });

  it("accepts ISO string input", () => {
    expect(formatDate("2026-01-05")).toBe("2026.01.05");
  });

  it("pads single-digit month/day with zero", () => {
    expect(formatDate(new Date("2026-03-07"))).toBe("2026.03.07");
  });

  it("returns empty string for invalid input", () => {
    expect(formatDate("not-a-date")).toBe("");
  });

  it("returns empty string for null/undefined", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm test:run src/shared/lib/format-date.test.ts
```

Expected: FAIL.

- [ ] **Step 3: 최소 구현**

`src/shared/lib/format-date.ts`:

```typescript
/**
 * 한국식 짧은 날짜 표기 (YYYY.MM.DD).
 * 유효하지 않은 입력은 빈 문자열 반환.
 */
export function formatDate(input: Date | string | null | undefined): string {
  if (input === null || input === undefined) return "";
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test:run src/shared/lib/format-date.test.ts
```

Expected: 5개 테스트 모두 통과.

- [ ] **Step 5: 전체 shared/lib 테스트 일괄 실행**

```bash
pnpm test:run src/shared/lib
```

Expected: 모든 lib 테스트 (cn, slugify, format-date) 통과.

- [ ] **Step 6: 커밋**

```bash
git add src/shared/lib/format-date.ts src/shared/lib/format-date.test.ts
git commit -m "feat: shared/lib/format-date 유틸리티 추가 (YYYY.MM.DD 한국식 표기)"
```

---

## Task 15: Tailwind에 Linear 디자인 토큰 적용

**Files:**

- Modify: `tailwind.config.ts`, `app/globals.css`

- [ ] **Step 1: `tailwind.config.ts` 교체**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Linear 베이스 — 배경
        canvas: "#08090a",
        panel: "#0f1011",
        elevated: "#191a1b",
        secondary: "#28282c",

        // Linear 베이스 — 텍스트
        "text-primary": "#f7f8f8",
        "text-secondary": "#d0d6e0",
        "text-tertiary": "#8a8f98",
        "text-quaternary": "#62666d",

        // 인디고 악센트 (유일한 채색)
        "indigo-brand": "#5e6ad2",
        "indigo-accent": "#7170ff",
        "indigo-hover": "#828fff",

        // 상태
        "status-success": "#27a644",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
      },
      fontWeight: {
        // Linear의 시그니처 510 weight
        signature: "510",
      },
      letterSpacing: {
        hero: "-0.022em", // ~ -1.584px at 72px
        display: "-0.022em", // ~ -1.056px at 48px
        section: "-0.020em",
        card: "-0.015em",
      },
      borderColor: {
        subtle: "rgba(255,255,255,0.05)",
        default: "rgba(255,255,255,0.08)",
        strong: "rgba(255,255,255,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: `app/globals.css` 교체**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    background-color: #08090a;
    color: #f7f8f8;
    font-feature-settings: "cv01", "ss03";
  }

  body {
    @apply bg-canvas text-text-primary antialiased;
  }
}
```

- [ ] **Step 3: 빌드 확인**

```bash
pnpm build
```

Expected: 빌드 성공.

- [ ] **Step 4: 커밋**

```bash
git add tailwind.config.ts app/globals.css
git commit -m "feat: Tailwind에 Linear 디자인 토큰 적용 (색·타이포·보더)"
```

---

## Task 16: Inter Variable & JetBrains Mono 폰트 설정

**Files:**

- Modify: `app/layout.tsx`

- [ ] **Step 1: `app/layout.tsx` 갱신**

```tsx
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Aslan Project Map",
  description: "아슬란의 프로젝트·도메인·서비스 토폴로지",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
pnpm build
```

Expected: 성공. Next.js가 Google Fonts를 self-host로 다운로드.

- [ ] **Step 3: 커밋**

```bash
git add app/layout.tsx
git commit -m "feat: Inter Variable 및 JetBrains Mono 폰트 설정 (next/font)"
```

---

## Task 17: shared/config/env.ts — 타입 세이프 환경변수 로더

**Files:**

- Create: `src/shared/config/env.ts`, `src/shared/config/index.ts`

- [ ] **Step 1: `src/shared/config/env.ts` 생성**

```typescript
import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
});

const parsed = envSchema.safeParse({
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});

if (!parsed.success) {
  console.warn(
    "[env] Firebase 환경변수가 누락되었거나 잘못되었습니다. .env.example을 참고해 .env.local을 설정하세요.\n",
    parsed.error.flatten().fieldErrors,
  );
}

export const env = parsed.success
  ? parsed.data
  : ({
      NEXT_PUBLIC_FIREBASE_API_KEY: "",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "",
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "",
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "",
      NEXT_PUBLIC_FIREBASE_APP_ID: "",
    } as const);
```

> **참고**: 빌드 시점에 `.env.local`이 없을 수 있으므로 **빌드 실패 대신 경고**만 한다. 실제 사용 시점(Firebase SDK 초기화)에서 빈 값이면 SDK가 에러를 던진다.

- [ ] **Step 2: `src/shared/config/index.ts` 생성 — Public API**

```typescript
export { env } from "./env";
```

- [ ] **Step 3: 타입 체크**

```bash
pnpm exec tsc --noEmit
```

Expected: 오류 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/shared/config/
git commit -m "feat: shared/config/env 환경변수 로더 추가 (zod 검증)"
```

---

## Task 18: shared/api/firebase.ts — Firebase 클라이언트 초기화

**Files:**

- Create: `src/shared/api/firebase.ts`, `src/shared/api/index.ts`

- [ ] **Step 1: `src/shared/api/firebase.ts` 생성**

```typescript
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getAuth, type Auth } from "firebase/auth";
import { env } from "@/shared/config";

const firebaseConfig = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getFirebaseApp(): FirebaseApp {
  const existing = getApps()[0];
  if (existing) return existing;
  return initializeApp(firebaseConfig);
}

export const firebaseApp: FirebaseApp = getFirebaseApp();
export const firestore: Firestore = getFirestore(firebaseApp);
export const storage: FirebaseStorage = getStorage(firebaseApp);
export const auth: Auth = getAuth(firebaseApp);
```

- [ ] **Step 2: `src/shared/api/index.ts` 생성 — Public API**

```typescript
export { firebaseApp, firestore, storage, auth } from "./firebase";
```

- [ ] **Step 3: 빌드 확인**

```bash
pnpm build
```

Expected: 성공. (환경변수가 없어도 빌드는 되지만 런타임에서 경고)

- [ ] **Step 4: 커밋**

```bash
git add src/shared/api/
git commit -m "feat: shared/api/firebase — Firebase 클라이언트 싱글톤 초기화"
```

---

## Task 19: shared/ui — shadcn/ui 설치 및 기초 컴포넌트 (Button, Card, Badge)

**Files:**

- Create: `components.json`, `src/shared/ui/button.tsx`, `src/shared/ui/card.tsx`, `src/shared/ui/badge.tsx`, `src/shared/ui/index.ts`

- [ ] **Step 1: shadcn/ui 초기화**

```bash
pnpm dlx shadcn@latest init
```

프롬프트 답변:

- "Which style would you like to use?" → **Default**
- "Which color would you like to use as base color?" → **Zinc** (Linear 다크 톤과 가장 가까움)
- "Would you like to use CSS variables for colors?" → **Yes**
- "Where is your tailwind.config.ts?" → 기본값 (엔터)
- "Where is your global CSS?" → `app/globals.css`
- "Where is your tsconfig file?" → `./tsconfig.json`
- "Configure the import alias for components?" → `@/shared/ui`
- "Configure the import alias for utils?" → `@/shared/lib/cn`
- "Are you using React Server Components?" → **Yes**

Expected: `components.json` 생성됨.

> **주의**: shadcn이 생성하는 경로가 `@/shared/ui/...`여야 함. 기본 `@/components/ui`로 되면 `components.json`에서 `aliases.ui`를 `@/shared/ui`로 수정.

- [ ] **Step 2: `components.json` 확인 및 필요 시 수정**

열어서 다음 필드 확인:

```json
{
  "aliases": {
    "components": "@/shared/ui",
    "utils": "@/shared/lib/cn",
    "ui": "@/shared/ui"
  }
}
```

다르면 위 값으로 수정.

- [ ] **Step 3: Button, Card, Badge 컴포넌트 설치**

```bash
pnpm dlx shadcn@latest add button card badge
```

Expected: `src/shared/ui/button.tsx`, `card.tsx`, `badge.tsx` 생성됨.

- [ ] **Step 4: `src/shared/ui/index.ts` Public API 작성**

```typescript
export { Button, buttonVariants } from "./button";
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from "./card";
export { Badge, badgeVariants } from "./badge";
```

- [ ] **Step 5: `globals.css`에서 shadcn가 덮어쓴 스타일 복구 확인**

shadcn init이 `globals.css`를 덮어썼을 수 있음. 다음 섹션이 유지돼야 함:

```css
@layer base {
  html {
    background-color: #08090a;
    color: #f7f8f8;
    font-feature-settings: "cv01", "ss03";
  }

  body {
    @apply bg-canvas text-text-primary antialiased;
  }
}
```

shadcn의 `:root` CSS 변수 블록은 유지하되, `html`/`body` 블록은 위 내용으로 보강.

- [ ] **Step 6: 빌드 확인**

```bash
pnpm build
```

Expected: 성공.

- [ ] **Step 7: lint 확인 (FSD 경계 위반 없는지)**

```bash
pnpm lint
```

Expected: 에러 없음.

- [ ] **Step 8: 커밋**

```bash
git add components.json src/shared/ui/ app/globals.css
git commit -m "feat: shadcn/ui 설치 및 Button·Card·Badge 컴포넌트 추가"
```

---

## Task 20: src/app/providers — FirebaseProvider

**Files:**

- Create: `src/app/providers/FirebaseProvider.tsx`, `src/app/providers/index.ts`

- [ ] **Step 1: `src/app/providers/FirebaseProvider.tsx` 생성**

Phase 1에서는 단순히 Firebase 초기화를 트리거만 한다. Auth 상태 관리는 Phase 2에서 추가.

```tsx
"use client";

import { type ReactNode, useEffect } from "react";
import { firebaseApp } from "@/shared/api";

interface Props {
  children: ReactNode;
}

export function FirebaseProvider({ children }: Props) {
  useEffect(() => {
    // Firebase 초기화 트리거 (싱글톤이므로 참조만 해도 초기화됨)
    if (firebaseApp) {
      // no-op: 초기화가 이뤄짐
    }
  }, []);

  return <>{children}</>;
}
```

- [ ] **Step 2: `src/app/providers/index.ts` Public API**

```typescript
export { FirebaseProvider } from "./FirebaseProvider";
```

- [ ] **Step 3: 타입 체크 & lint**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/app/providers/
git commit -m "feat: src/app/providers/FirebaseProvider 기초 스켈레톤 추가"
```

---

## Task 21: 루트 layout 배선 — Providers 래핑

**Files:**

- Modify: `app/layout.tsx`

- [ ] **Step 1: `app/layout.tsx` 갱신**

```tsx
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { FirebaseProvider } from "@/src/app/providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Aslan Project Map",
  description: "아슬란의 프로젝트·도메인·서비스 토폴로지",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <FirebaseProvider>{children}</FirebaseProvider>
      </body>
    </html>
  );
}
```

> **참고**: `@/src/app/providers`는 Task 9에서 설정한 경로 별칭 `@/app/*`을 쓰면 더 깔끔하지만 루트 `app/`과 혼동 방지를 위해 여기선 전체 경로 유지. 필요 시 `@/app-providers`로 별칭 하나 더 추가.

- [ ] **Step 2: 타입 체크 & lint**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

- [ ] **Step 3: 커밋**

```bash
git add app/layout.tsx
git commit -m "feat: 루트 layout에 FirebaseProvider 래핑 추가"
```

---

## Task 22: src/views/home — 히어로 페이지 + 루트 page 배선

**Files:**

- Create: `src/views/home/ui/HomePage.tsx`, `src/views/home/index.ts`
- Modify: `app/page.tsx`

- [ ] **Step 1: `src/views/home/ui/HomePage.tsx` 생성**

```tsx
export function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="max-w-2xl">
        <h1 className="font-sans text-6xl font-signature tracking-hero text-text-primary md:text-7xl">
          Aslan Project Map
        </h1>
        <p className="mt-6 text-lg text-text-secondary">
          아슬란의 프로젝트·도메인·서비스를 한 장의 토폴로지로.
        </p>
        <p className="mt-2 font-mono text-sm text-text-tertiary">
          Phase 1 baseline — 2026-04-12
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: `src/views/home/index.ts` Public API**

```typescript
export { HomePage } from "./ui/HomePage";
```

- [ ] **Step 3: `app/page.tsx` 갱신 — views/home 재노출**

```tsx
import { HomePage } from "@/src/views/home";

export default function Page() {
  return <HomePage />;
}
```

- [ ] **Step 4: 타입 체크 & lint**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add src/views/home/ app/page.tsx
git commit -m "feat: views/home 히어로 페이지 및 루트 page 배선"
```

---

## Task 23: 개발 서버 수동 검증

**Files:** (변경 없음)

- [ ] **Step 1: 개발 서버 실행**

```bash
pnpm dev
```

- [ ] **Step 2: 브라우저에서 `http://localhost:3000` 접속**

확인 사항:

- 검은 배경 (`#08090a`)
- "Aslan Project Map" 히어로가 흰색으로 크게 표시
- 부제가 `text-secondary` 톤으로 보임
- 마지막 줄이 mono 폰트로 보임
- 콘솔에 에러 없음 (Firebase 환경변수 경고는 OK — `.env.local` 아직 없음)

- [ ] **Step 3: 빌드 검증**

```bash
pnpm build
```

Expected: 성공. `out/` 디렉토리에 정적 파일 생성.

- [ ] **Step 4: 빌드 결과물 확인**

```bash
ls out/
```

Expected: `index.html`, `_next/`, `404.html` 등 존재.

- [ ] **Step 5: 커밋할 변경 없음 — 단지 검증 단계**

---

## Task 24: Phase 1 완료 & main merge

**Files:** (브랜치 merge만)

- [ ] **Step 1: 전체 테스트 실행**

```bash
pnpm test:run
```

Expected: 모든 테스트 통과 (shared/lib/\* 16개 테스트).

- [ ] **Step 2: 전체 lint & 타입 체크**

```bash
pnpm lint && pnpm exec tsc --noEmit
```

Expected: 모두 통과.

- [ ] **Step 3: CHANGELOG 업데이트**

`docs/CHANGELOG.md`의 `## [Unreleased]` 섹션에 추가:

```markdown
## [Unreleased]

### Added

- Phase 0: 프로젝트 초기화 (Next.js 14 + TypeScript + Tailwind + pnpm)
- 문서 스켈레톤 (`docs/` 전체)
- 규율 패키지 (`docs/rules/`)
- CLAUDE.md 및 README.md
- Phase 1: FSD 디렉토리 골격 (`src/`)
- ESLint FSD 경계 검증 (`eslint-plugin-boundaries`)
- shared/lib 유틸리티 3종 (cn, slugify, format-date) + 테스트
- Tailwind Linear 디자인 토큰
- Inter Variable + JetBrains Mono 폰트
- shared/config/env — 타입 세이프 환경변수 로더
- shared/api/firebase — Firebase 클라이언트 초기화
- shadcn/ui 기초 컴포넌트 (Button, Card, Badge)
- FirebaseProvider + views/home 히어로
```

- [ ] **Step 4: CHANGELOG 커밋**

```bash
git add docs/CHANGELOG.md
git commit -m "docs: CHANGELOG에 Phase 0-1 완료 기록"
```

- [ ] **Step 5: main merge (사용자 확인 필수)**

> ⚠️ **사용자에게 확인**: "Phase 1 완료. main으로 merge해도 될까요?"

```bash
git checkout main
git merge feature/phase-1-fsd-skeleton --no-ff -m "Merge branch 'feature/phase-1-fsd-skeleton'

Phase 1 완료: FSD 골격, shared 레이어, Linear 디자인 토큰, Firebase 초기화, 기초 UI 컴포넌트, 히어로 페이지.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: 완료 검증**

```bash
git log --oneline --graph -25
pnpm build
ls out/index.html
```

Expected: main에 모든 커밋이 병합됨. 빌드 성공.

---

## Self-Review 체크리스트 (plan 작성자용)

- [x] **Spec 커버리지**: Phase 0 + Phase 1의 모든 요구사항이 Task로 분해됨
- [x] **플레이스홀더 없음**: 모든 Task가 실행 가능한 구체 코드·커맨드 포함
- [x] **타입 일관성**: `env`, `firebaseApp`, `firestore` 등 시그니처 일치
- [x] **파일 경로 정확**: 모든 Task가 exact path 명시
- [x] **Phase 2 의존성 명확**: 다음 plan은 `entities/project` + `features/admin-auth`부터 시작

## 이 plan이 커버하지 않는 것 (다음 plan에서)

- Phase 2: entities/project + entities/admin + features/admin-auth + Firestore Security Rules
- Phase 3-8: 나머지 전부

## 다음 단계

이 plan 완료 후 **Phase 2 plan 작성** — `docs/superpowers/plans/<날짜>-phase-2-entities.md`
