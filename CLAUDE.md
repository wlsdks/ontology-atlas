# CLAUDE.md

본 프로젝트의 작업 가이드는 [`AGENTS.md`](AGENTS.md) 가 canonical 이다. 다른 AI 도구도 같은 내용을 본다.

@AGENTS.md

## Claude Code 전용 추가

위 가이드 외에 Claude Code 가 자동으로 읽는 보조 파일:

- `.claude/rules/*.md` — 세부 작업 규율 (architecture · design · git · testing · local-first · auth · forbidden). 모두 자동 로드.
- `.claude/settings.json` — hooks · permissions (있을 때만).
- `.claude/agents/*.md` — 상주 심사진: 팀장(`chief`) · PO 카운슬 5인(`po-*`) · 디자인 벤치 8석(`design-*`) · 평결을 코드로 적용하는 `design-guardian`.
- `.claude/skills/*` — `/po-pass`(매일 쓰는 단독 경로) · `/po-council` · `/design-council` · `/design-audit` · `/user-walkthrough` · `/motion-verify` · `/responsive-sweep`. 소집 트리거와 프로토콜은 AGENTS.md 가 정본이고, 결정과 진 반대 의견은 `docs/DECISIONS.md` 에 남는다.

## CLAUDE.md / AGENTS.md 동기화 정책

- AGENTS.md 가 single source of truth.
- 이 파일은 thin wrapper — `@AGENTS.md` 한 줄로 본문을 가져온다. 필요시 Claude Code 전용 섹션만 여기 추가.
- AGENTS.md 를 수정해도 이 파일은 그대로 일관성을 유지한다.
