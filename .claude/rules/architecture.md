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
- **`/` 는 묻는 사람이 정한다** (2026-07-30, 「root-first-open」 뒤집기 구현).
  볼트 없는 웹 방문자 → **관문(얼굴)**, `/download` 와 같은 뷰. 볼트를 연 웹
  사용자와 설치된 앱 → 그대로(지도 / 첫 실행). 판정 단일 출처는
  `isGatewaySurface()` — 셸의 크롬 판정과 루트의 내용 분기가 **같은 함수**를
  써야 크롬과 내용이 어긋나지 않는다.
  ⚠️ 설치된 앱이 `/` 를 열므로 통째로 관문으로 만들면 **이미 설치한 사람에게
  설치를 권한다**. root-first-open 의 그 절반은 여전히 유효하다.
- **「지도」라고 말하는 링크는 `/topology` 를 가리킨다.** 전환 전에는 두 주소가
  같은 화면이라 아무 쪽이나 써도 아무도 몰랐다. 게이트:
  `tests/contract/map-destination-route.contract.test.ts`.
- 살아있는 라우트: `/`, `/topology/`, `/docs/`, `/ontology/`,
  `/ontology/studio/` (공방 (Compass Stage) — 노드 의미 완성 쓰기 표면; 구 게임 예외는
  2026-07-24 폐기, 앱 전역 헌장 준수, `design.md` 참고),
  `/ontology/insights/`, `/projects/`, `/project/[slug]/`,
  `/project/[slug]/edit/`, `/project/new/`, `/project/fallback/`, `/download/`
  (macOS 데스크톱 앱 배포), `/guide/` · `/changelog/` (관문의 읽을거리 —
  볼트 안 `docs/GUIDE.md` · `docs/CHANGELOG.md` 를 그린다. `docs` 가 아니라
  `guide` 인 이유는 `/docs` 가 이미 문서함이기 때문 — 2026-07-30 원장). `/ontology/edit/` (구 xyflow ERD 빌더) 는
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

## 화면에 없는 표면의 모델은 만들지 않는다 (2026-07-28, D4 처방)

- **렌더 게이트와 파생 게이트가 같은 조건을 봐야 한다.** `{open && <Card
  model={model} />}` 처럼 열림 조건으로 그려지는 표면의 `model` 을 그 조건
  없이 `useMemo` 로 만들면, **가장 잦은 상호작용이 가장 비싼 파생을 매번
  선불로 낸다.**
- 실측 사례: 지도 노드 클릭 1회에 연결 재구성이 11회 돌았고 그중 9회가
  **아직 열지 않은** 「전체 상세」 몫이었다 — 깊이 3 BFS + 이웃 행마다 도는
  엣지 전수 순회 포함. 게이트 한 줄(`if (!open) return null;`)로 2회가 됐다
  (`src/views/home/model/use-full-detail-a1-model.ts`).
- **미리 만들어 두고 싶으면 청크만 예열한다.** lazy 컴포넌트의 `import()`
  예열은 값이 싸고 등장 프레임을 지켜 주지만, **모델 파생 예열은 클릭 프레임에
  값을 청구**한다. 둘을 헷갈리지 말 것.
- **게이트는 ms 가 아니라 횟수로 잠근다.** 성능 예산은 기계마다 달라 플레이크가
  되지만 "닫혀 있으면 순회 0회"는 어느 기계에서나 참이다. 순회 함수를 `vi.mock`
  으로 세는 훅 단위 테스트가 형식이다
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
- ESLint 가 entity barrel ↔ api 분리 룰 (legacy) 을 일부 강제 — 현재는 api 폴더가
  사라졌지만 룰은 남아 미래 cloud collab 단계에서 재도입 시 가드 역할.
