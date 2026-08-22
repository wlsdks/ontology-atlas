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

본문에는 **왜 고쳤는지**를 적는다. 무엇을 고쳤는지는 diff 를 보면 안다. 한 줄 80자 안.

## 브랜치

- `feat/...` · `fix/...` · `docs/...` · `chore/...` · `refactor/...`
- main 브랜치에 직접 push 하지 말 것 — 항상 PR.
- 브랜치명에 회사 codename / 인물 이름 / 다른 서비스 이름 금지.

## 커밋 단위

- 작은 단위로 자주. 한 commit 에 두 가지 이상의 작업이 섞이지 않게.
- 되돌아온 버그를 고치는 커밋과 구조를 정리하는 커밋은 따로 만든다.
- 문서를 먼저 — 스키마 / 라우트 / 운영 방식이 바뀌면 문서를 같은 commit 이나 그 앞 commit 에서 갱신한다.

### 코드를 이렇게 고치면 이 문서도 같이 고친다

**이 표가 왜 `documentation.md` 가 아니라 여기 있나** — 이 표가 필요한 사람은
**코드를 고치는 사람**이다. `.claude/rules/` 의 규칙 중 일부는 매 턴 항상 읽히고
(git · forbidden · local-first), 나머지는 관련 파일을 열 때만 읽힌다.
`documentation.md` 는 `.md` 파일을 열 때만 읽히므로, 이 표를 거기 두면 *이미
문서를 고치기로 마음먹은 사람에게만* "문서를 고쳐라"가 도착한다. 정작 짝지은
문서를 빠뜨릴 사람은 못 본다 (2026-07-31 감사에서 지적됨).

| 코드 변경 | 함께 수정해야 할 문서 |
|---|---|
| 새 라우트 추가·제거 | `docs/ARCHITECTURE.md`(라우트 목록의 정본) + `docs/FEATURES.md` + `docs/DECISIONS.md`(`decisions:check` 가 검사한다) |
| 새 커맨드 / 스크립트 | `README.md` |
| 아키텍처 재구성 | `docs/ARCHITECTURE.md` + `AGENTS.md` |
| 디자인 토큰 추가 | `docs/DESIGN-SYSTEM.md` + `app/globals.css` (램프 스텝이면 `cn.ts` 등록도) |
| MCP 도구 추가·rename | `mcp/README.md` + `docs/ontology/capabilities/mcp-server.md` + dogfood README |
| 새 capability / domain / element 노드 | `docs/ontology/<kind>s/<slug>.md` (dogfood) |
| `.claude/rules/` 로드 조건 변경 | `CLAUDE.md` 표 + `tests/contract/rules-path-scope.contract.test.ts` |

> **`checks:changed` 목록에서 골라 돌리지 마라** (2026-08-21). 실패는 목록이
> 아니라 **고른 것**에서 났다 — 08-20 하루에 CI 두 라운드가 그렇게 탔다.
> `pnpm checks:changed -- --run` 이 전부 돌리고 첫 실패에서 멈춘다.

## PR

- 제목은 위의 영문 prefix 로 시작. 본문은 `Summary` 와 `Test plan` 두 섹션.
- `pnpm exec tsc --noEmit` · `pnpm lint` · `pnpm test:run` 을 돌려서 통과했다고 PR 본문에 적는다.
- 화면이 달라지는 PR 은 고치기 전/후 스크린샷을 붙인다 (다크 모드로 — 앱에는 다크 모드밖에 없다).

## 함부로 하지 말 것

- **푸시 전에 `pnpm checks:changed -- --run` 은 네가 돌린다.** 대신 돌려 주는
  것은 없다 — `pre-push` 훅은 2026-08-22 에 없앴다(너무 느려 끄게 만들었다.
  근거·진 반대: `docs/DECISIONS.md` (94)). 판정은 CI 이고 8분이다. **목록에서
  골라 돌리지 마라** — 여기서 탄 CI 라운드는 전부 고른 데서 났다.
- `--no-verify` 로 남은 hook(`pre-commit`)을 건너뛰지 말 것. 몇 초이고, 생성물이
  입력과 어긋난 채 커밋되는 것을 막는다. 막히면 시키는 명령을 그대로 돌린다.
- `git reset --hard` / `git push --force` 는 사용자가 직접 시켰을 때만.
- main 에 force push 절대 금지.
- **자동 생성된 JSON 의 충돌을 손으로 고치지 말 것.** `src/entities/docs-vault/data/*`
  와 `public/docs-vault/**` 는 `pnpm docs-vault:build` 가 만들어 내는 파일이다.
  충돌 표시(`<<<<<<<` 같은 줄)를 손으로 지우다 JSON 안에 남겨서 타입 검사가
  깨진 적이 있다. 어느 쪽을 골라도 상관없으니 **다시 생성**한다:
  `git checkout --ours src/entities/docs-vault/data public/docs-vault && pnpm docs-vault:build`.
  (같은 입력이면 어느 컴퓨터에서 돌려도 똑같은 결과가 나오도록 보장돼 있다 —
  `docs/DEVELOPMENT-CHECKS.md` "Generated manifest determinism".)
