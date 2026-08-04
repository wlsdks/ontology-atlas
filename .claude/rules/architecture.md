---
paths:
  - "src/**"
  - "app/**"
  - "next.config.ts"
  - "eslint.config.mjs"
---

# Architecture rules

> **조건부 로드** — `src/**` · `app/**` · 설정 파일을 읽을 때 실린다(위 `paths:`).
> Codex 등 자동 로드가 없는 도구는 `AGENTS.md` 가 이 파일을 가리킬 때 직접 읽는다.

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
- **`/` 가 무엇을 보여줄지는 접속한 사람에 따라 갈린다** (2026-07-30,
  「root-first-open」 결정을 뒤집은 구현). 볼트를 아직 안 고른 웹 방문자에게는
  **관문**(gateway — 제품을 소개하고 앱 내려받기로 안내하는 화면, `/download`
  와 같은 뷰)을 보여준다. 볼트를 이미 연 웹 사용자와 설치된 앱에는 지금까지대로
  지도 / 첫 실행 화면을 보여준다. 어느 쪽인지 판정하는 함수는
  `isGatewaySurface()` 하나뿐이다 — 앱 껍데기(크롬: 상·하단 바와 사이드 레일
  같은 테두리 UI)의 판정과 루트 페이지의 내용 분기가 **같은 함수**를 써야
  껍데기와 내용이 서로 다른 화면을 그리지 않는다.
  ⚠️ 설치된 앱도 `/` 를 연다. 그래서 `/` 를 통째로 관문으로 만들면 **이미 앱을
  설치한 사람에게 앱을 내려받으라고 권하게 된다.** root-first-open 의 그 절반은
  여전히 유효하다.
- **「지도」라고 말하는 링크는 `/topology` 를 가리킨다.** 전환 전에는 두 주소가
  같은 화면이라 아무 쪽이나 써도 아무도 몰랐다. 게이트:
  `tests/contract/map-destination-route.contract.test.ts`.
- 살아있는 라우트: `/`, `/topology/`, `/docs/`, `/ontology/`,
  `/ontology/studio/` (공방 (Compass Stage) — 노드에 의미를 채워 넣는 쓰기 화면.
  한때 이 화면에만 허용했던 게임풍 예외는 2026-07-24 에 폐기했고 지금은 앱 전역
  규칙을 그대로 따른다. `design.md` 참고),
  `/ontology/insights/`, `/projects/`, `/project/[slug]/`,
  `/project/[slug]/edit/`, `/project/new/`, `/project/fallback/`, `/git/`
  (볼트 git 기록 — 데스크톱 전용 목적지), `/download/`
  (macOS 데스크톱 앱 배포), `/guide/` · `/guide/[segment]/` · `/changelog/`
  (관문의 읽을거리 — 볼트 안 마크다운을 그린다. `/guide` 는 `docs/guide/*.md`
  **여러 장**이고 순서·슬러그의 단일 출처는
  `src/views/gateway-doc/model/guide-pages.ts` 다. `/changelog` 는
  `docs/CHANGELOG.md`. `docs` 가 아니라 `guide` 인 이유는 `/docs` 가 이미
  문서함이기 때문 — 2026-07-30 원장). `/ontology/edit/` (구 xyflow ERD 빌더) 는
  2026-07-24 은퇴 — 공방이 조립/연결/미리보기/쓰기를 모두 덮으면서
  얇은 클라이언트 리다이렉트(→ `/ontology/studio`, `?node=` 딥링크 전달)만
  남았다. R10 (auth + cloud surface 영구 제거) 이후 외 namespace (`/login`,
  `/signup`, `/account`, `/reset-password`, `/settings/*`, `/admin/*`,
  `/review/*`, `/diagnostics/*`, `/knowledge/*`) 부활 금지.
  `/ontology/relations` 도 R12 에서 제거되어 그 분포 정보는
  `/ontology/insights` 안으로 통합되었다.
- 모든 라우트는 next-intl `[locale]` prefix 자동 추가 (en / ko 두 locale).

## 단일 진실원 원칙

- vault frontmatter 가 ontology 의 진실원. 별도 store / DB 도입 금지.
- 동일 개념을 두 입력 경로에서 동시에 진실원으로 두지 말 것.
- 빌드타임 dogfood 매니페스트 (`docs/ontology/`) 는 vault 미선택 사용자를 위한
  fallback — 사용자 vault 와 충돌 시 사용자 vault 우선.

## 아직 화면에 안 그려진 것의 데이터는 미리 만들지 않는다 (2026-07-28, D4 처방)

- **화면을 그리는 조건과 그 화면의 데이터를 계산하는 조건이 같아야 한다.**
  `{open && <Card model={model} />}` 처럼 열렸을 때만 그리는 화면인데 그
  `model` 은 `open` 조건 없이 `useMemo` 로 계산하면, **아직 열지도 않은 화면의
  계산 비용을 가장 잦은 상호작용이 매번 대신 낸다.**
- 실측: 지도 노드를 한 번 클릭할 때 연결 재구성이 11회 돌았고, 그중 9회가
  **아직 열지도 않은** 「전체 상세」의 몫이었다 — 깊이 3 BFS 와 이웃 행마다
  도는 엣지 전수 순회가 거기 들어 있다. `if (!open) return null;` 한 줄을 넣으니
  2회가 됐다 (`src/views/home/model/use-full-detail-a1-model.ts`).
- **미리 준비해 두고 싶으면 코드 청크만 미리 받아 둔다.** lazy 컴포넌트의
  `import()` 를 미리 부르는 것은 싸고 화면이 뜨는 프레임을 지켜 준다. 반면
  **모델 계산을 미리 해 두면 그 비용이 클릭하는 그 프레임에 그대로 붙는다.**
  둘을 헷갈리지 말 것.
- **이걸 지키는 검사(게이트 — 위반을 자동으로 막는 검사)는 밀리초가 아니라
  실행 횟수로 잠근다.** 몇 ms 안에 끝나야 한다는 기준은 기계마다 달라 들쭉날쭉
  실패하지만, "닫혀 있으면 순회 0회"는 어느 기계에서나 참이다. 순회 함수를
  `vi.mock` 으로 감싸 몇 번 불렸는지 세는 훅 단위 테스트가 그 형식이다
  (`src/views/home/model/use-full-detail-a1-model.test.ts`).

## i18n 라우팅 가드

- 인-앱 라우트 이동은 `@/i18n/navigation` 의 `Link` / `useRouter` /
  `usePathname` 사용 — 자동 locale prefix 보존.
- `useSearchParams` 는 locale-agnostic 이라 `next/navigation` 에서 그대로 import.
- locale-redirect 같은 의도적인 cross-locale 이동만 raw `next/navigation` router 사용.

## 회귀 방지

- firebase / 백엔드 SDK 는 R10b 에서 의존성 자체가 제거됐다 — local-first 정적
  export 는 어떤 cloud SDK 도 번들에 넣지 않는다. SDK 재도입 금지 원칙은
  `forbidden.md` 가 유지한다 (구 번들 청크 가드 `check-bundle.mjs` 는 웹 호스팅이
  GitHub Pages 단일로 정리되면서 제거됨).
- ESLint 에 entity 의 barrel 파일과 api 폴더를 분리하라는 옛 룰이 일부 남아 있다.
  지금은 api 폴더 자체가 없어서 아무것도 안 걸리지만, 나중에 cloud collab 단계에서
  다시 만들 때를 대비해 룰만 남겨 뒀다.
