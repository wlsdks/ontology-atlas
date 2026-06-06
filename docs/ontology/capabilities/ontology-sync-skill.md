---
slug: capabilities/ontology-sync-skill
kind: capability
title: Ontology-Sync Agent Skill (.claude/skills/ontology-sync)
domain: ai-agent-partner
elements: [.claude/skills/ontology-sync/SKILL.md]
dependencies: [capabilities/mcp-server]
---

# Ontology-Sync Agent Skill

Claude Code 가 코드 변경 후 자동으로 호출하는 user-invocable skill.
`.claude/skills/ontology-sync/SKILL.md` 한 파일이 곧 surface — 새 capability /
element / domain 가 등장하면 MCP write 도구 (`add_concept` /
`patch_concept` / `add_relation`) 로 vault 에 반영하라는 워크플로를 LLM 에게
지시한다.

MCP 서버가 *런타임 도구* 라면 이 skill 은 *사용 규약* — read-then-write,
중복 slug 회피, 5 줄 changelog reply, dry-run rename 같은 실패 모드 가드를
명시적으로 박아둬서 매번 LLM 이 재발견하지 않게 한다.

## 어디에 매여 있나

- `domains/ai-agent-partner` — agent 가 vault 와 상호작용하는 surface 군.
- `capabilities/mcp-server` — 이 skill 이 호출하는 24 도구의 출처.
- `.claude/skills/ontology-sync/SKILL.md` — 본문.
