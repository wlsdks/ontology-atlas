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

기본값은 전체 suite 가 아니라 변경 범위의 가장 작은 신뢰 가능한 검증이다. 먼저 `pnpm checks:changed` 또는 `pnpm checks:changed -- <path...>` 로 추천된 직접 테스트 / contract / integration subset 을 실행한다. 변경 파일 옆에 명확한 test 파일이 있으면 그 파일을 먼저 돌린다.

전체 검증은 다음 조건에서만 escalation 한다:

- `pnpm exec tsc --noEmit` — shared 타입, public API, route boundary, Next/TS config, 광범위 refactor 변경.
- `pnpm lint` — ESLint config, import boundary, 다수 파일의 구조 이동, lint rule 에 닿는 변경.
- `pnpm test:run` — shared primitive / global provider / test setup 변경, focused mapping 이 없지만 영향 범위가 넓은 변경.
- `pnpm exec playwright test <spec>` — route, navigation, browser workflow, visual interaction 변경. 전체 Playwright 는 여러 route/workflow 를 동시에 건드릴 때만.
- `pnpm build` / desktop packaging checks — static export, Next config, bundle/release/download/macOS packaging surface 변경.

최종 보고에는 실행한 검증과 왜 그 범위가 충분한지 짧게 남긴다. "습관적으로 전체 test" 는 하지 않는다.

## 회귀 차단

- 회귀 fix 한 commit 에는 **그 회귀를 잡는 단위 test** 를 같이 추가한다.
- E2E 는 시각 회귀 (visual regression) 까지 다룰 때만 baseline 갱신 — 운영 환경에서 한 번 캡처 후 commit.

## Cross-package contract test (R11 패턴)

**언제 쓰나**: `mcp/` 같은 *별도 npm package* 와 `src/` 의 모듈이 *같은 동작* 을 보장해야 할 때. mcp 가 publish 의도라 물리적 단일 모듈 통합 불가능 → 같은 fixture 매트릭스 + 양 측 import 후 동일 결과 강제.

**현재 적용 사례**:
- `tests/contract/parse-frontmatter.contract.test.ts` — `src/shared/lib` (런타임) · `mcp/src/parser.mjs` · `scripts/lib` (빌드+CLI) **3-way** parser drift 차단. 12 fixture × 3 parser = 36 case.
- `tests/contract/validate-vault-document.contract.test.ts` — `src/shared/lib` (런타임+UI) · `mcp/src/validate.mjs` (AI agent surface) **2-way** validator drift 차단. 8 fixture × 2 validator = 16 case.

**패턴**:
1. `tests/fixtures/<topic>-cases.mjs` — input/expected 매트릭스. 단일 진실원.
2. `tests/contract/<topic>.contract.test.ts` — 같은 fixture 를 양 측 함수에 적용해 동일 결과 비교. 정확한 message phrasing 차이는 허용, 핵심 contract (codes/structure) 는 strict.
3. `vitest.config.ts` 의 `include` 에 `tests/contract/**/*.test.ts` 포함 (이미 등록).

**원칙**:
- 한 쪽 코드 추가/변경/제거 시 contract test 가 즉시 차단 → 의도적 contract 변경이면 fixture 도 같이 갱신, 의도 안 했으면 drift 회귀.
- 관련 파일 수정 시 contract test 도 함께 review.
