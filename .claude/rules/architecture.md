# Architecture rules

> Auto-loaded for Claude Code. Other agents pull this from `AGENTS.md` reference.

## Feature-Sliced Design layers

```
app/                       Next.js 라우팅 (얇은 래퍼). 페이지 단의 metadata 와 entry 만.
src/
  ├── app/                 providers · 초기화 코드 (FirebaseProvider, ToastProvider 등)
  ├── views/               페이지 컴포넌트 (route 1:1 또는 그룹)
  ├── widgets/             여러 features / entities 를 조합한 복합 UI 블록
  ├── features/            한 가지 사용자 인터랙션 단위 (form · picker · 검색)
  ├── entities/            비즈니스 엔티티 (project · category · knowledge-document …)
  └── shared/              UI primitives · lib · config · api · types
```

**Import 방향**: `app → views → widgets → features → entities → shared`.

- 역방향 (예: `entities` 가 `widgets` import) 금지.
- 동일 레이어 안에서 cross-import 도 가급적 피한다 — 공통화가 필요하면 한 단계 아래로 끌어내린다.
- ESLint 가 `eslint-plugin-boundaries` 로 강제. 위반 시 빌드 깨짐.

## Next.js 정적 export 제약

- `next.config.ts` 의 `output: 'export'` 가 default. 서버 런타임에 의존하는 코드 (RSC fetch streams, dynamic API routes) 는 쓰지 말 것.
- Build-time fetch 가 필요한 경우 `OMOT_BUILD_PROJECT_SOURCE=firestore` 환경변수로 명시 opt-in.
- App Router 만 사용. `pages/` 라우터 도입 금지.

## URL 계약

- 새 라우트는 `app/` 아래에만. `src/views/` 의 페이지 컴포넌트가 1:1 대응.
- `/admin/*` 네임스페이스는 폐기. 새 라우트는 `/settings/*`, `/review/*`, `/diagnostics/*`, `/knowledge/*` 등 기능별로.
- query 키는 `src/shared/lib/account-scope.ts` 의 상수를 공유 (`?account=`, `?pj=`).

## 데이터 경계

- 공개 surface 와 운영 surface 의 경계는 **데이터 모델** 로 구분 (URL 네임스페이스 아님).
- `knowledgeApprovedNodes/Edges` (private canonical) ↔ `knowledgePublicNodes/Edges` (public projection).
- raw markdown 은 Storage `knowledge-documents/` 에. Firestore 가 아닌 Storage 가 단일 진실원.
- 권한은 Firestore rules 가 1차 게이트.

## 단일 진실원 원칙

- 동일 개념을 두 컬렉션 / 두 화면 / 두 입력 경로에서 동시에 진실원으로 두지 말 것.
- 새 컬렉션을 추가하기 전에 기존 컬렉션을 확장 가능한지 먼저 검토.
- 스키마 변경은 docs-first — `docs/DATA-MODEL.md` 와 `firestore.rules` 를 같이 갱신.

## Entity barrel vs api 분리 (PR #99 이후)

mission v2 의 *"local-first 첫 paint firebase 0"* 약속을 코드로 보장하기 위한 import 규율.

### 규칙

- `@/entities/<x>` (메인 barrel) 은 **firebase 의존 0** — type, lib, pure helper, default constants 만 export.
- `@/entities/<x>/api` 는 firestore subscribe / mutation 함수의 진입점 — 호출자가 명시적으로 이 경로를 적어야 한다.
- mapper (`<x>/model/mapper.ts`) 는 `instanceof Timestamp` 대신 `@/shared/lib/firestore-timestamp-coerce` 의 `coerceFirestoreDate(value)` 사용. firebase 의존 0 유지.

### import 분기 가이드

```ts
// ✅ 정적 import — 모든 페이지 첫 paint 청크에 들어가도 OK
import type { Project } from '@/entities/project';
import { getProjectDetailHref } from '@/entities/project/lib/detail-href';

// ✅ cloud-mode-only 페이지 (settings/*, knowledge/documents 등) — 정적 import OK
import { subscribeProjects } from '@/entities/project/api';

// ✅ mode-aware feature / hook — useEffect / 핸들러 안 dynamic import
useEffect(() => {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;
  void import('@/entities/project/api')
    .then(({ subscribeProjects }) => {
      if (cancelled) return;
      unsubscribe = subscribeProjects(...);
    })
    .catch((err) => {
      // chunk fetch 실패 시 명시적 fallback (영원히 loading 방지)
      if (cancelled) return;
      console.warn('[<call-site>] firebase chunk load failed', err);
      setError('...');
    });
  return () => { cancelled = true; unsubscribe?.(); };
}, [...]);

// ❌ 금지 — 메인 barrel 에서 api 함수 가져오기 (현재는 export 자체가 없음).
// 새 api 함수 추가 시 절대 메인 barrel 에 export 하지 말 것.
import { subscribeProjects } from '@/entities/project';
```

### 회귀 방지

- ESLint 룰: `eslint.config.ts` 의 `no-restricted-imports` 가 `@/entities/<x>` 의 api 함수 import 패턴을 막는다.
- 빌드 측정: `pnpm bundle:check` 가 user-facing 라우트 (`/`, `/topology`, `/docs` …) 의 firebase chunk 를 측정. 0 이 아니면 fail.
