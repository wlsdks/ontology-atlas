# Git workflow

> Auto-loaded.

## 커밋 메시지

- **형식**: 영문 conventional prefix + 한국어 (또는 영어) 본문.
- 허용 prefix: `feat:` · `fix:` · `docs:` · `refactor:` · `chore:` · `test:` · `style:` · `perf:`
- 한글 prefix (`정리`, `구조`, `루프` 등) 는 쓰지 않는다.
- 예시:
  - `feat: 검색 팔레트 모바일 시트로 분리`
  - `fix: 다크 모드 alpha 토큰 :root emit 회귀 정정`
  - `docs: 라이트 모드 토글 가이드 추가`
  - `refactor: vault-ontology 를 mode-aware 어댑터 hook 으로 통합`

본문은 변경의 **왜** 를 적는다. 무엇은 diff 가 알려준다. 줄당 80자 안.

## 브랜치

- `feat/...` · `fix/...` · `docs/...` · `chore/...` · `refactor/...`
- main 브랜치에 직접 push 하지 말 것 — 항상 PR.
- 브랜치명에 회사 codename / 인물 이름 / 다른 서비스 이름 금지.

## 커밋 단위

- 작은 단위로 자주. 한 commit 에 두 가지 이상의 작업 단위가 섞이지 않게.
- 회귀 fix 와 리팩터링은 분리.
- Docs-first — 스키마 / 라우트 / 운영 모델 변경은 같은 commit 또는 그 이전 commit 에 docs 를 갱신.

### 코드를 이렇게 고치면 이 문서도 같이 고친다

**이 표가 왜 여기(상주) 있고 `documentation.md`(조건부)에 없는가** — 이 표가
필요한 사람은 **코드를 고치는 사람**이다. `documentation.md` 는 `.md` 를 열
때만 실리므로, 거기 두면 *이미 문서를 고치기로 한 사람에게만* "문서를 고쳐라"가
실린다. 정작 짝을 빠뜨릴 사람에게는 안 실린다 (2026-07-31 감사 지적).

| 코드 변경 | 함께 수정해야 할 문서 |
|---|---|
| 새 라우트 추가·제거 | `docs/ARCHITECTURE.md`(인벤토리 정본) + `docs/FEATURES.md` + `docs/DECISIONS.md`(`decisions:check` 가 강제) |
| 새 커맨드 / 스크립트 | `README.md` |
| 아키텍처 재구성 | `docs/ARCHITECTURE.md` + `AGENTS.md` |
| 디자인 토큰 추가 | `docs/DESIGN-SYSTEM.md` + `app/globals.css` (램프 스텝이면 `cn.ts` 등록도) |
| MCP 도구 추가·rename | `mcp/README.md` + `docs/ontology/capabilities/mcp-server.md` + dogfood README |
| 새 capability / domain / element 노드 | `docs/ontology/<kind>s/<slug>.md` (dogfood) |
| `.claude/rules/` 로드 조건 변경 | `CLAUDE.md` 표 + `tests/contract/rules-path-scope.contract.test.ts` |

## PR

- title 은 conventional prefix 로 시작. 본문은 `Summary` + `Test plan` 두 섹션.
- 검증: `pnpm exec tsc --noEmit` · `pnpm lint` · `pnpm test:run` 통과를 PR 본문에 명시.
- 디자인 변경 PR 은 before/after 스크린샷 첨부 (다크 — 앱은 다크 단일).

## 함부로 하지 말 것

- `--no-verify` 로 hook 우회 금지.
- `git reset --hard` / `git push --force` 는 user 명시 명령 후만.
- main 에 force push 절대 금지.
- **생성물 JSON 충돌을 손으로 편집하지 말 것.** `src/entities/docs-vault/data/*`
  와 `public/docs-vault/**` 는 `pnpm docs-vault:build` 산출물이다. 충돌 마커를
  손으로 지우다 JSON 안에 남겨 타입 검사가 깨진 전례가 있다. 어느 쪽을 취해도
  되니 **다시 생성**한다:
  `git checkout --ours src/entities/docs-vault/data public/docs-vault && pnpm docs-vault:build`.
  (결정성 계약 덕에 재생성 결과는 어느 머신에서나 같은 바이트다 —
  `docs/DEVELOPMENT-CHECKS.md` "Generated manifest determinism".)
