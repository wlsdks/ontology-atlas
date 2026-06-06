---
slug: capabilities/session-start-ontology-context
kind: capability
title: SessionStart Ontology Context Injection (.claude/hooks/inject-ontology-summary.sh)
domain: ai-agent-partner
elements: [.claude/hooks/inject-ontology-summary.sh, elements/agent-activity-hooks]
dependencies: [capabilities/cli-developer-entry]
relates: [capabilities/ontology-sync-skill]
---

# SessionStart Ontology Context Injection

Claude Code / Codex 가 새 세션을 열 때 한 번 실행되어 현재 디렉토리의 ontology
vault 요약 (총 노드 수 · kind 분포 · domain 분포 · 가장 연결 많은 hub 상위
6개) 을 agent system context 에 inject 한다. 매 prompt 마다 사용자가
"ontology 활용해" 라고 알려주지 않아도 agent 가 작업 첫 순간부터 vault 를
인지한다.

이전엔 `list` 의 *알파벳 첫 8개* 를 보여줬는데 — 그건 노이즈였다. 이제
`overview` 로 바꿔, agent 의 첫 인상이 그 코드베이스의 *load-bearing
개념*(degree 상위 hub) 과 domain 분포가 되게 했다. "AI agent 는 구조·의미
를 빠르게 인식한다" 라는 wedge 의 agent 쪽 약속을 message #1 부터 살린다.

`elements/agent-activity-hooks` 는 이 read-first context 의 화면 쪽 짝이다.
SessionStart 에 quiet `planning` heartbeat 를 써서 Atlas 가 agent 의 첫 명령
전에도 Claude Code / Codex 연결 상태를 표시할 수 있게 한다. Bash PreToolUse
에서는 shell command 를 `editing` / `verifying` / `complete` 로 분류해 같은
heartbeat contract 를 갱신한다.

## 어디에 매여 있나

- `domains/ai-agent-partner` — agent 가 vault 와 상호작용하는 surface 군.
- `capabilities/cli-developer-entry` — vault 요약과 heartbeat 를 만들 때
  `ontology-atlas overview --json` / `ontology-atlas agent-activity` CLI 를
  호출. CLI 가 없으면 silent 종료.
- `capabilities/ontology-sync-skill` — 이 hook 이 vault 인식과 live activity
  표시를 돕고, 실제 read/write 는 `/ontology-sync` skill 또는 MCP 도구로 위임.
- `.claude/hooks/inject-ontology-summary.sh` — agent context 주입 hook.
- `elements/agent-activity-hooks` — Atlas UI 가 읽는 live heartbeat writer.

## Vault 결정 우선순위

1. `OATLAS_VAULT` 환경 변수 (사용자가 명시)
2. `<cwd>/docs/ontology` — dogfood 패턴
3. `<cwd>/vault` — `cli init` default
4. `<cwd>` 자체에 frontmatter `kind:` 가진 `.md` 가 있으면 cwd

어느 후보도 못 잡으면 silent exit (vault 없는 repo 에서 noise 차단).
