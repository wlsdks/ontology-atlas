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
