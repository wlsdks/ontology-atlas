# Architecture rules

> Auto-loaded for Claude Code. Other agents pull this from `AGENTS.md` reference.

## Feature-Sliced Design layers

```
app/                       Next.js 라우팅 (얇은 래퍼). 페이지 단의 metadata 와 entry 만.
src/
  ├── app/                 providers · 초기화 코드 (TaxonomyProvider, ToastProvider 등)
  ├── views/               페이지 컴포넌트 (route 1:1 또는 그룹)
  ├── widgets/             여러 features / entities 를 조합한 복합 UI 블록
  ├── features/            한 가지 사용자 인터랙션 단위 (form · picker · 검색)
  ├── entities/            비즈니스 엔티티 (project · category · ontology-class …)
  └── shared/              UI primitives · lib · config · types
```

**Import 방향**: `app → views → widgets → features → entities → shared`.

- 역방향 (예: `entities` 가 `widgets` import) 금지.
- 동일 레이어 안에서 cross-import 도 가급적 피한다 — 공통화가 필요하면 한 단계 아래로 끌어내린다.
- ESLint 가 `eslint-plugin-boundaries` 로 강제. 위반 시 빌드 깨짐.

## Next.js 정적 export 제약

- `next.config.ts` 의 `output: 'export'` 가 default. 서버 런타임에 의존하는
  코드 (RSC fetch streams, dynamic API routes) 는 쓰지 말 것.
- Build-time fetch 는 vault 매니페스트 (`docs/ontology/`) 만 사용. 외부 API
  fetch 신규 도입 금지 — local-first 원칙.
- App Router 만 사용. `pages/` 라우터 도입 금지.

## URL 계약

- 새 라우트는 `app/[locale]/` 아래에만. `src/views/` 의 페이지 컴포넌트가 1:1 대응.
- 살아있는 라우트: `/`, `/topology/`, `/docs/`, `/ontology/`, `/ontology/edit/`,
  `/ontology/insights/`, `/projects/`, `/project/[slug]/`,
  `/project/[slug]/edit/`, `/project/new/`, `/project/fallback/`, `/download/`
  (macOS 데스크톱 앱 배포). R10 (auth +
  cloud surface 영구 제거) 이후 외 namespace (`/login`, `/signup`, `/account`,
  `/reset-password`, `/settings/*`, `/admin/*`, `/review/*`, `/diagnostics/*`,
  `/knowledge/*`) 부활 금지. `/ontology/relations` 도 R12 에서 제거되어 그
  분포 정보는 `/ontology/insights` 안으로 통합되었다.
- 모든 라우트는 next-intl `[locale]` prefix 자동 추가 (en / ko 두 locale).

## 단일 진실원 원칙

- vault frontmatter 가 ontology 의 진실원. 별도 store / DB 도입 금지.
- 동일 개념을 두 입력 경로에서 동시에 진실원으로 두지 말 것.
- 빌드타임 dogfood 매니페스트 (`docs/ontology/`) 는 vault 미선택 사용자를 위한
  fallback — 사용자 vault 와 충돌 시 사용자 vault 우선.

## i18n 라우팅 가드

- 인-앱 라우트 이동은 `@/i18n/navigation` 의 `Link` / `useRouter` /
  `usePathname` 사용 — 자동 locale prefix 보존.
- `useSearchParams` 는 locale-agnostic 이라 `next/navigation` 에서 그대로 import.
- locale-redirect 같은 의도적인 cross-locale 이동만 raw `next/navigation` router 사용.

## 회귀 방지

- 빌드 측정: `pnpm bundle:check` 가 user-facing 라우트 (`/`, `/topology`, `/docs`,
  …) 에 firebase SDK chunk 가 들어가지 않는지 검증. R10b 에서 firebase deps 자체를
  제거했으므로 chunk 0 이 default 통과 조건.
- ESLint 가 entity barrel ↔ api 분리 룰 (legacy) 을 일부 강제 — 현재는 api 폴더가
  사라졌지만 룰은 남아 미래 cloud collab 단계에서 재도입 시 가드 역할.
