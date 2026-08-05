# CLAUDE.md

작업 가이드의 정본은 [`AGENTS.md`](AGENTS.md) 다. 이 파일은 그것을 불러오고,
**Claude Code 만 볼 수 있는 것**을 덧붙인다.

@AGENTS.md

## 어느 도구가 무엇을 읽나 — 새 파일을 놓기 전에 본다

두 도구의 시야가 겹치지 않는다. 잘못 놓으면 **아무 에러 없이** 한쪽이 규칙을
못 본 채 일한다.

| | Claude Code | Codex |
|---|---|---|
| `AGENTS.md` | 이 파일의 `@AGENTS.md` 임포트로 | **직접** — 단 `project_doc_max_bytes`(기본 32 KiB)까지만 |
| `CLAUDE.md` · `.claude/**` | 읽는다 | **안 읽는다** |
| `.agents/skills/**` · `.agents/agents/**` | — | 읽는다 |
| `.codex/**` | — | 읽는다 (`config.toml` · `hooks.json`) |

**두 트리는 같은 모양이다** — `<루트>/skills/` 와 `<루트>/agents/` 가 양쪽에 있고
짝끼리 바이트 동일하다. 그래서 스킬이 자리 브리프를 가리킬 때 **상대 경로 한 줄**
(`../../agents/po-*.md`)이면 충분하다: `.claude/skills/…` 에서는 `.claude/agents/`
로, `.agents/skills/…` 에서는 `.agents/agents/` 로 각자 풀린다. **스킬 본문에
도구 이름을 적지 않는다** — 두 벌이 바이트 동일해야 하므로 사본마다 다른 경로를
쓸 수 없고, 이름으로 분기하면 각 도구가 남의 경로를 읽게 된다. 분기가 필요하면
**능력**으로 한다("서브에이전트를 병렬로 띄울 수 있나"). 게이트:
`tests/contract/{po,design}-council.contract.test.ts`.

여기서 나오는 규율 셋:

1. **두 도구가 다 지켜야 하는 규칙은 `AGENTS.md` 에 있어야 한다.** `.claude/rules/`
   에만 쓴 규칙은 Codex 에게 존재하지 않는다.
2. **`AGENTS.md` 는 32 KiB 를 넘으면 안 된다.** Codex 는 초과분을 **경고 없이,
   문장 중간에서 자른다** — 화면에도 로그에도 신호가 없다. 실제로 39,617B 까지
   자랐을 때 볼트 쓰기 루프와 frontmatter 스키마 표가 통째로 절단선 뒤에 있었다
   (2026-07-31 실측). 그래서 여기 무엇을 더하면 **다른 무엇이 밀려난다**.
   `pnpm agents:check` 가 상한 초과를 막고, 여유가 10% 아래로 내려가면 넘기 전에
   경고한다.
3. **스킬도 자리 브리프도 두 벌이고 같아야 한다.** `.claude/skills/<name>/` ↔
   `.agents/skills/<name>/`, `.claude/agents/<seat>.md` ↔
   `.agents/agents/<seat>.md` 는 바이트 동일해야 하며, `pnpm agents:check` 의
   `skill-copy` · `agent-copy` 가 어긋남과 **한쪽에만 있는 파일**을 잡는다.
   사본이 둘인데 게이트가 없으면 어긋나는 쪽이 기본값이다 — 실제로
   `?guides=off` 지시가 `.claude` 쪽에만 들어가 Codex 는 첫 방문 안내에 덮인
   화면을 재고 있었고, 카운슬 자리 15개는 `.claude/agents/` 에만 있는데 두
   카운슬 스킬이 그것들을 **이름으로만** 불러서 Codex 세션은 부를 수도 읽을 수도
   없는 이름을 받고 즉흥으로 때웠다(2026-08-04 실측). **자리를 새로 만들면 두
   트리에 같이 넣는다.** 셋째 사본은 만들지 않는다.

## Claude Code 전용

- `.claude/rules/*.md` — 세부 규율 10종. **셋만 상주하고 일곱은 조건부다**
  (frontmatter `paths:`). 규칙을 지운 게 아니라 필요할 때만 싣는다 — 매 턴
  73KB 였던 것이 13.6KB 가 됐다.

  ⚠️ **조건부라고 공짜가 아니다** (2026-08-05 실측). `design.md` 는 `.tsx` 를
  열기만 해도 실리는데 **63.4KB** 였고 — AGENTS.md(31.7KB)보다 크다 — 그중
  **43%가 게이트 고고학**이었다. 버튼 하나 고치는 턴마다 「그림자는 왜 `var(`
  면제가 아닌가」를 통째로 싣고 있었다는 뜻이다. 갈라서 `design-gates.md` 로
  옮겼고 `design.md` 는 48.8KB 가 됐다. **조건부 규칙이 커지면 그 조건에 걸리는
  모든 턴이 값을 치른다** — 규칙(무엇)과 사연(왜)을 같은 파일에 쌓지 마라.

  | | 규칙 | 언제 실리나 |
  |---|---|---|
  | 상주 | `forbidden` · `git` · `local-first` | 항상. **파일을 열기 전에** 내려야 하는 판단이라서다 — `npm publish` 를 실행할지, 백엔드를 도입할지, 어떻게 커밋할지는 아무 파일도 안 읽고 결정된다 |
  | 조건부 | `design` | `src/**/*.tsx` · `app/**/*.css` 등 UI 파일을 읽을 때 |
  | 조건부 | `design-gates` | `eslint.config.mjs` · `tests/contract/**` · `scripts/check-*.mjs` — **게이트를 고칠 때만** |
  | 조건부 | `architecture` | `src/**` · `app/**` · `next.config.ts` |
  | 조건부 | `testing` | `**/*.test.*` · `tests/**` · 테스트 설정 |
  | 조건부 | `surfaces` | `src/shared/lib/tauri-*.ts` · `src-tauri/**` · `tests/e2e/**` |
  | 조건부 | `documentation` | `docs/**/*.md` · 루트 `*.md` |
  | 조건부 | `codegraph` | `src/**` · `mcp/**` · `cli/**` 등 코드를 읽을 때. 세션 시작 트리거 요약은 `AGENTS.md` "Code intelligence" 절(상주)에 |

  ⚠️ **아무 파일도 안 맞는 글롭은 조용히 사라진 규칙이다.** 파일도 있고
  YAML 도 유효하고 에러도 안 나는데 규칙만 존재하지 않게 된다(첫 적용 때
  `i18n/**` 이 0개였다 — 실 위치는 `src/i18n`). 디렉터리를 옮기면
  `tests/contract/rules-path-scope.contract.test.ts` 가 먼저 터진다.
  상주 목록을 늘리려면 그 테스트의 `ALWAYS_LOADED` 에 이유와 함께 적어야
  한다 — 73KB 로 되돌아가는 길을 무료로 두지 않는다.
- `.claude/agents/*.md` — 상주 심사진: 팀장(`chief`) · PO 카운슬 5인(`po-*`) ·
  디자인 벤치 8석(`design-*`) · 평결을 코드로 적용하는 `design-guardian`.
  소집될 때만 로드된다.
- `.claude/settings.json` — hooks · permissions.
- `.claude/hooks/` — npm publish 차단 · SessionStart 볼트 census.

스킬(`/po-pass` · `/po-council` · `/design-council` · `/design-audit` ·
`/design-system-audit` · `/design-build` ·
`/user-walkthrough` · `/motion-verify` · `/responsive-sweep` · `/gate-probe` ·
`/ontology-sync` · `/ontology-bootstrap` · `/ontology-extract` ·
`/ontology-absorb-confluence` · `/ontology-field-trial` · `/parallel-brief`)은 **양쪽 다 읽으므로** 전용이 아니다 — 위 3번
규율의 대상이다. 소집 트리거와 프로토콜의 정본은 `AGENTS.md`, 결정과 진
반대 의견은 `docs/DECISIONS.md` 에 남는다.

## 동기화 정책

`AGENTS.md` 가 single source of truth 이고 이 파일은 얇은 래퍼다. 그러니
**`AGENTS.md` 를 고쳐도 이 파일은 손댈 필요가 없다** — 여기 적는 것은 위 표가
바뀔 때뿐이다.

⚠️ `@AGENTS.md` 임포트는 **조직화이지 절감이 아니다.** 임포트된 파일도 세션
시작에 그대로 컨텍스트에 들어간다. "임포트니까 싸다"는 가정으로 본문을 키우지
않는다.
