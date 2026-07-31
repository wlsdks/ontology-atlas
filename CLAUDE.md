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
| `.agents/skills/**` | — | 읽는다 |
| `.codex/**` | — | 읽는다 (`config.toml` · `hooks.json`) |

여기서 나오는 규율 셋:

1. **두 도구가 다 지켜야 하는 규칙은 `AGENTS.md` 에 있어야 한다.** `.claude/rules/`
   에만 쓴 규칙은 Codex 에게 존재하지 않는다.
2. **`AGENTS.md` 는 32 KiB 를 넘으면 안 된다.** Codex 는 초과분을 **경고 없이,
   문장 중간에서 자른다** — 화면에도 로그에도 신호가 없다. 실제로 39,617B 까지
   자랐을 때 볼트 쓰기 루프와 frontmatter 스키마 표가 통째로 절단선 뒤에 있었다
   (2026-07-31 실측). 그래서 여기 무엇을 더하면 **다른 무엇이 밀려난다**.
   `pnpm agents:check` 가 상한 초과를 막고, 여유가 10% 아래로 내려가면 넘기 전에
   경고한다.
3. **스킬은 두 벌이고 같아야 한다.** `.claude/skills/<name>/` 과
   `.agents/skills/<name>/` 은 바이트 동일해야 하며, 같은 게이트가 어긋남을
   잡는다. 사본이 둘인데 게이트가 없으면 어긋나는 쪽이 기본값이다 — 실제로
   `?guides=off` 지시가 `.claude` 쪽에만 들어가 Codex 는 첫 방문 안내에 덮인
   화면을 재고 있었다.

## Claude Code 전용

- `.claude/rules/*.md` — 자동 로드되는 세부 규율 8종: `architecture` ·
  `design` · `documentation` · `forbidden` · `git` · `local-first` ·
  `surfaces` · `testing`.
- `.claude/agents/*.md` — 상주 심사진: 팀장(`chief`) · PO 카운슬 5인(`po-*`) ·
  디자인 벤치 8석(`design-*`) · 평결을 코드로 적용하는 `design-guardian`.
  소집될 때만 로드된다.
- `.claude/settings.json` — hooks · permissions.
- `.claude/hooks/` — npm publish 차단 · SessionStart 볼트 census.

스킬(`/po-pass` · `/po-council` · `/design-council` · `/design-audit` ·
`/user-walkthrough` · `/motion-verify` · `/responsive-sweep` ·
`/ontology-sync` · `/ontology-bootstrap` · `/ontology-extract` ·
`/ontology-absorb-confluence`)은 **양쪽 다 읽으므로** 전용이 아니다 — 위 3번
규율의 대상이다. 소집 트리거와 프로토콜의 정본은 `AGENTS.md`, 결정과 진
반대 의견은 `docs/DECISIONS.md` 에 남는다.

## 동기화 정책

`AGENTS.md` 가 single source of truth 이고 이 파일은 얇은 래퍼다. 그러니
**`AGENTS.md` 를 고쳐도 이 파일은 손댈 필요가 없다** — 여기 적는 것은 위 표가
바뀔 때뿐이다.

⚠️ `@AGENTS.md` 임포트는 **조직화이지 절감이 아니다.** 임포트된 파일도 세션
시작에 그대로 컨텍스트에 들어간다. "임포트니까 싸다"는 가정으로 본문을 키우지
않는다.
