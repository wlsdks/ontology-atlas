# CLAUDE.md

본 프로젝트의 작업 가이드는 [`AGENTS.md`](AGENTS.md) 가 canonical 이다. 다른 AI 도구도 같은 내용을 본다.

@AGENTS.md

## Claude Code 전용 추가

위 가이드 외에 Claude Code 가 자동으로 읽는 보조 파일:

- `.claude/rules/*.md` — 세부 작업 규율 (architecture · design · git · testing · local-first · auth · forbidden). 모두 자동 로드.
- `.claude/settings.json` — hooks · permissions (있을 때만).
- `.claude/skills/*` — 커스텀 스킬 (있을 때만).
- `.claude/agents/chief.md` — **카운슬 팀장** (fable). 소집 여부·자리 선택·순서·충돌
  해소·결정 기록을 소유하되 **코드는 못 고친다**. 결정은 권고, 서명은 사람.
- `.claude/agents/po-*.md` — **상주 PO 카운슬 5인** (`po-evidence` 근거 ·
  `po-craft` 결 · `po-steward` 지킴이 · `po-wedge` 해자 · `po-leverage` 지렛대).
  `/po-council` 스킬이 소집 프로토콜(병렬 독립 의견 → 반박 1라운드 → 책임자 1인
  결정 + 반대 의견 기록)을 담는다. 비싸거나 되돌리기 어려운 결정에만 소집한다.
- `.claude/agents/design-*.md` — **상주 디자인 벤치 8석** (`design-lead` 위계 ·
  `design-system` 체계 · `design-interaction` 상호작용 · `design-motion` 모션 ·
  `design-infoviz` 도해 · `design-workbench` 작업대 · `design-responsive` 반응형 · `design-handoff` 핸드오프).
  `/design-council` 스킬이 소집한다 — 변경이 닿는 자리만 부르되 위계·체계는 상시
  참석. 전원 공개 발행 원칙만 인용하고 자산 모방은 절대 금지.
- `/po-pass` — **매일 쓰는 경로**. 원장 읽기 → 현상↔문제 판별 3시험 → 6행 자가
  채점 → 18점 미만·치명적 0·트리거면 `/po-council` 로 기계적 승격.
- `/user-walkthrough` — 여정 전체를 걷는다. 근거는 **패턴 인식**이고 규율은 패턴
  이름을 대는 것. 물건 안의 것은 판정하고, 사람 안의 것(원할지)은 주장하지 않는다.
- `docs/DECISIONS.md` — **결정 원장**. 소집 전에 읽고(선행 결정 · 반증 조건 관측
  여부), 끝나면 덧붙인다. 기록 없는 소집은 끝나지 않은 소집이다.
- `/design-audit` — 프론트 구현 후 **재서 확인하는** 마지막 관문(겹침·치수 편차·
  토큰 이탈). 비전 모델은 이 결함들을 못 잡으므로 스크린샷은 증거이지 판정이 아니다.
- `.claude/agents/design-guardian.md` — **상주 디자인 가디언** subagent. UI/디자인
  변경 전 검토·변경 후 검증·"AI 느낌" 제거 패스에 이 agent 를 호출한다 (Agent tool,
  `subagent_type: "design-guardian"`). 공개 발행 원칙(Apple HIG · Toss 공개 발표 ·
  Rams · Tufte)만 인용, 자산 모방 금지, 스크린샷 기반 검증 + 직접 코드 적용까지.

## CLAUDE.md / AGENTS.md 동기화 정책

- AGENTS.md 가 single source of truth.
- 이 파일은 thin wrapper — `@AGENTS.md` 한 줄로 본문을 가져온다. 필요시 Claude Code 전용 섹션만 여기 추가.
- AGENTS.md 를 수정해도 이 파일은 그대로 일관성을 유지한다.
