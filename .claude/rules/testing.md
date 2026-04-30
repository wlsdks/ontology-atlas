# Testing & verification

> Auto-loaded.

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
pnpm test:run                        # 1회 실행 (CI / pre-commit 용)
pnpm test src/path/to/file.test.ts   # 특정 파일
pnpm test:run -t "specific case"     # 특정 it 블록
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

## 검증 체크리스트 (PR 전)

```bash
pnpm exec tsc --noEmit          # 타입 0 errors
pnpm lint                       # 0 errors (warnings 는 OK 하지만 새로 추가 금지)
pnpm test:run                   # 모든 단위 test 통과
pnpm exec playwright test       # 변경한 영역의 e2e 가 있으면
```

## 회귀 차단

- 회귀 fix 한 commit 에는 **그 회귀를 잡는 단위 test** 를 같이 추가한다.
- E2E 는 시각 회귀 (visual regression) 까지 다룰 때만 baseline 갱신 — 운영 환경에서 한 번 캡처 후 commit.
