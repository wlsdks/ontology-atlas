# CLAUDE.md

본 프로젝트의 작업 가이드는 [`AGENTS.md`](AGENTS.md) 가 canonical 이다. 다른 AI 도구도 같은 내용을 본다.

@AGENTS.md

## Claude Code 전용 추가

위 가이드 외에 Claude Code 가 자동으로 읽는 보조 파일:

- `.claude/rules/*.md` — 세부 작업 규율 (architecture · design · git · testing · local-first · auth · forbidden). 모두 자동 로드.
- `.claude/settings.json` — hooks · permissions (있을 때만).
- `.claude/skills/*` — 커스텀 스킬 (있을 때만).
- `.claude/agents/design-guardian.md` — **상주 디자인 가디언** subagent. UI/디자인
  변경 전 검토·변경 후 검증·"AI 느낌" 제거 패스에 이 agent 를 호출한다 (Agent tool,
  `subagent_type: "design-guardian"`). 공개 발행 원칙(Apple HIG · Toss 공개 발표 ·
  Rams · Tufte)만 인용, 자산 모방 금지, 스크린샷 기반 검증 + 직접 코드 적용까지.

## CLAUDE.md / AGENTS.md 동기화 정책

- AGENTS.md 가 single source of truth.
- 이 파일은 thin wrapper — `@AGENTS.md` 한 줄로 본문을 가져온다. 필요시 Claude Code 전용 섹션만 여기 추가.
- AGENTS.md 를 수정해도 이 파일은 그대로 일관성을 유지한다.
