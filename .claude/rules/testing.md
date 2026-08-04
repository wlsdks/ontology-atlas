---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.test.mjs"
  - "**/*.spec.ts"
  - "tests/**"
  - "vitest.config.ts"
  - "vitest.setup.ts"
  - "playwright.config.ts"
---

# Testing & verification

> **조건부 로드** — 테스트 파일과 테스트 설정을 읽을 때 실린다(위 `paths:`).
> focused-first 원칙은 `AGENTS.md` 상주 본문에도 한 줄로 있다.

## 도구

- 단위 / 컴포넌트: **Vitest** + **Testing Library** + **jsdom** (`vitest.config.ts`, `vitest.setup.ts`)
- E2E: **Playwright** (`playwright.config.ts`, `tests/e2e/*.spec.ts`)

## 우선순위

1. **`shared/lib`, `entities/*/model` 의 순수 로직** — 가장 먼저, 가장 많이 test.
2. **`features/*/model`** — 비즈니스 인터랙션 흐름.
3. **`widgets/`, `views/`** — 복합 UI 는 핵심 인터랙션만 (모든 prop 조합 다 test 안 함).
4. **E2E** — 사용자 journey 와 회귀 차단 위주. 양 적게, 가치 큼.

## Vitest 명령

```bash
pnpm test                            # watch mode
pnpm checks:changed                  # git diff 기준 첫 focused check 추천
pnpm checks:changed -- <path...>     # 계획 중인 파일 세트의 focused check 추천
pnpm test src/path/to/file.test.ts   # 특정 파일
pnpm exec vitest run --changed       # Vitest module graph 기준 changed-file 연관 테스트
pnpm test:run -t "specific case"     # 특정 it 블록
pnpm test:run                        # 전체 unit suite (조건부 escalation)
```

## E2E 명령

```bash
pnpm exec playwright test                            # 전체
pnpm exec playwright test --headed                   # 브라우저 보면서
pnpm exec playwright test tests/e2e/foo.spec.ts      # 특정 spec
pnpm exec playwright test --update-snapshots        # baseline 재생성
```

## TDD 흐름

1. 새 기능 / 버그 fix 전에 **실패하는 test** 부터 짠다.
2. 가장 좁은 범위에서 통과시킨다.
3. 리팩터링은 그 다음 단계.

## Focused-first 검증 원칙

기본은 전체 suite 를 돌리는 게 아니라, 내가 바꾼 범위를 믿을 수 있는 가장 작은 검증이다. 먼저 `pnpm checks:changed` 또는 `pnpm checks:changed -- <path...>` 를 돌려서 이 도구가 추천하는 테스트(그 파일의 직접 테스트 · contract · integration)를 실행한다. 바꾼 파일 옆에 짝이 되는 test 파일이 있으면 그 파일부터 돌린다.

아래 경우에만 전체 검증까지 범위를 넓힌다:

- `pnpm exec tsc --noEmit` — shared 타입, public API, 라우트 경계, Next/TS 설정을 바꿨거나, 여러 곳에 걸친 리팩터를 했을 때.
- `pnpm lint` — ESLint 설정, import 경계, 여러 파일을 옮기는 구조 변경, lint 룰에 닿는 변경.
- `pnpm test:run` — shared primitive · 전역 provider · 테스트 설정을 바꿨을 때, 또는 짝이 되는 테스트는 없는데 영향 범위가 넓을 때.
- `pnpm exec playwright test <spec>` — 라우트, 화면 이동, 브라우저 workflow, 눈에 보이는 상호작용을 바꿨을 때. Playwright 전체는 여러 라우트/workflow 를 동시에 건드릴 때만.
- `pnpm build` / 데스크톱 패키징 검사 — 정적 export, Next 설정, 번들 · 릴리스 · 다운로드 · macOS 패키징을 건드렸을 때.

최종 보고에는 무엇을 돌렸고 왜 그 범위면 충분한지 짧게 적는다. 습관적으로 전체 테스트를 돌리지는 않는다.

## 웹과 앱은 따로 검증한다 (2026-07-27 — 옛 웹↔앱 왕복 검증 폐지)

웹과 앱은 더 이상 같은 화면을 보여주겠다고 약속하지 않는다
(`.claude/rules/surfaces.md`). 그래서 **한쪽에서 확인한 길을 다른 쪽에서 똑같이
따라가 보는 왕복 검증은 하지 않는다** — 두 쪽이 같아야 한다는 약속 자체가
없어졌으니 확인할 것이 없다. 대신 셋으로 나뉜다:

| 대상 | 무엇으로 증명하나 |
|---|---|
| 웹과 앱이 함께 쓰는 화면(지도·문서함·공방·인사이트·프로젝트) | 같은 번들을 쓰므로 웹에서 확인했으면 앱도 통과로 본다. 단 폰트가 그려지는 모양·스크롤·창 테두리를 건드렸으면 설치한 앱에서 한 번 더 재 본다 |
| 데스크톱에서만 되는 것(키체인·git·업데이터·절대 경로) | 설치한 앱에서 잰 것만 인정한다 — 브라우저에서 됐다는 것은 증명이 아니다 |
| 웹 화면 자체 | `pnpm exec playwright test tests/e2e/web-surface-smoke.spec.ts` 3종 |

웹에는 아무도 붙어서 지켜보지 않으므로, 이 스모크 테스트가 웹이 살아 있는지
확인하는 유일한 수단이다. **데스크톱 브리지(`src/shared/lib/tauri-*.ts` ·
`src-tauri/**`)를 건드렸으면 앱만 확인하고 넘어가지 않는다** —
`pnpm checks:changed` 가 이 파일들에 대해 웹 스모크도 같이 권하고, CI 는
`runtime` 이 바뀌기만 해도 스모크를 돌린다.

## 회귀 차단

- 회귀를 고친 commit 에는 **그 회귀를 잡아내는 단위 test** 를 같이 넣는다.
- E2E 는 화면 그림이 바뀌었는지까지 볼 때만 baseline 을 갱신한다 — 운영 환경에서 한 번 캡처한 뒤 commit.
- **화면이나 렌더러를 삭제하면 같은 PR 에서 e2e spec 도 같이 훑어 지운다.** Playwright 가 CI 에 안 걸려 있으면, 이미 삭제된 testid 나 제목을 기다리는 spec 이 아무 신호 없이 남아 썩는다 (2026-07 e2e 정리 — 139개 중 108개가 이미 삭제된 Sigma 렌더러와 옛 `/ontology` 트리 페이지를 겨냥해 실패하고 있었고, 그중 실제 제품 결함은 0건이었다).

## Cross-package contract test (R11 패턴)

**언제 쓰나**: `mcp/` 같은 *별도 package* 와 `src/` 의 모듈이 *똑같이 동작해야* 할 때. mcp 는 따로 배포하는 것이라 하나의 모듈로 합칠 수가 없다. 그래서 같은 입력/기댓값 표를 두고 양쪽에서 각각 import 해 돌린 뒤, 결과가 같은지 강제한다.

**현재 적용 사례**:
- `tests/contract/parse-frontmatter.contract.test.ts` — `src/shared/lib` (런타임) · `mcp/src/parser.mjs` · `scripts/lib` (빌드+CLI) **3-way** parser drift 차단. 12 fixture × 3 parser = 36 case.
- `tests/contract/validate-vault-document.contract.test.ts` — `src/shared/lib` (런타임+UI) · `mcp/src/validate.mjs` (AI agent surface) **2-way** validator drift 차단. 8 fixture × 2 validator = 16 case.

**패턴**:
1. `tests/fixtures/<topic>-cases.mjs` — 입력과 기댓값의 표. 이 표 하나만 진실원이다.
2. `tests/contract/<topic>.contract.test.ts` — 같은 표를 양쪽 함수에 넣고 결과가 같은지 비교한다. 에러 메시지의 문장이 서로 다른 것은 봐주고, 핵심 계약(에러 코드와 자료 구조)은 정확히 같아야 한다.
3. `vitest.config.ts` 의 `include` 에 `tests/contract/**/*.test.ts` 가 들어 있다 (이미 등록됨).

**원칙**:
- 한쪽 코드를 더하거나 고치거나 지우면 contract test 가 바로 막는다. 계약을 일부러 바꾼 것이면 표도 같이 고치고, 그럴 의도가 없었다면 그건 양쪽이 어긋난 회귀다.
- 관련 파일을 고칠 때는 contract test 도 같이 살펴본다.
