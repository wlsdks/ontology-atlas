---
slug: capabilities/session-start-ontology-context
kind: capability
title: SessionStart Ontology Context Injection (.claude/hooks/inject-ontology-summary.sh)
domain: ai-agent-partner
elements: [.claude/hooks/inject-ontology-summary.sh]
dependencies: [capabilities/cli-developer-entry]
relates: [capabilities/ontology-sync-skill]
---

# SessionStart Ontology Context Injection

Claude Code 가 새 세션을 열 때 한 번 실행되어 현재 디렉토리의 ontology
vault 요약 (총 노드 수 · kind 분포 · 첫 8 노드 샘플) 을 agent system
context 에 inject 한다. 매 prompt 마다 사용자가 "ontology 활용해" 라고
알려주지 않아도 agent 가 작업 첫 순간부터 vault 를 인지한다.

## 어디에 매여 있나

- `domains/ai-agent-partner` — agent 가 vault 와 상호작용하는 surface 군.
- `capabilities/cli-developer-entry` — vault 요약을 만들 때 `oh-my-ontology
  list --json` CLI 를 호출. CLI 가 없으면 silent 종료.
- `capabilities/ontology-sync-skill` — 이 hook 이 vault 인식만 시키고,
  실제 read/write 는 `/ontology-sync` skill 또는 MCP 도구로 위임.
- `.claude/hooks/inject-ontology-summary.sh` — 본문.

## Vault 결정 우선순위

1. `OMOT_VAULT` 환경 변수 (사용자가 명시)
2. `<cwd>/docs/ontology` — dogfood 패턴
3. `<cwd>/vault` — `cli init` default
4. `<cwd>` 자체에 frontmatter `kind:` 가진 `.md` 가 있으면 cwd

어느 후보도 못 잡으면 silent exit (vault 없는 repo 에서 noise 차단).
