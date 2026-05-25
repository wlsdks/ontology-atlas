---
slug: capabilities/ontology-extract-skill
kind: capability
title: Ontology-Extract Skill (.claude/skills/ontology-extract)
domain: ai-agent-partner
elements: [.claude/skills/ontology-extract/SKILL.md]
---

prose (회의록 · PR 본문 · RFC 초안 · 채팅 로그 · Notion 한 단락) 에서 ontology 가 자라는 흐름. Obsidian 처럼 `[[link]]` 만 자라는 게 아니라 *typed ontology 노드* (capability / element / domain) 가 자란다 — LLM 이 매개라서 가능한 path.

## 다른 두 skill 과의 관계

| Skill | 입력 | 출력 |
|---|---|---|
| [[capabilities/ontology-bootstrap-skill]] | 빈 vault + 코드 (analyze_repo_structure) | 첫 5–15 노드 |
| [[capabilities/ontology-sync-skill]] | code change (git diff) | 코드↔vault drift 0 |
| **이 skill** | **사용자 prose** | **prose 안 개념 → vault 노드** |

bootstrap 은 0→1 cold-start, sync 는 코드 follow, extract 는 사람 생각 follow. mission v3 의 "사용자 + AI agent 공저" 흐름의 *사용자 측* prose 입력 path.

## Workflow 핵심

1. `find_evidence` / `similar_nodes` 로 *기존 vault 와 cross-check* — duplicate 회피가 1차 가치
2. prose 안 명사/동사구를 candidate phrase 로 추출, kind 별 분류
3. **사용자에게 짧은 후보 표 + 진행 옵션** (전부 / 일부 / 취소) — write 전 정지
4. 확인 받은 것만 `add_concept` / `add_concepts` / `patch_concept` / `add_relation`
5. 5 줄 changelog 응답 (`/ontology-sync` 와 동일 shape)

## 가치 지점

- **LLM hallucination 노드 방지** — prose 안 명시된 개념만 후보. AI 가 자동으로 추론 노드 만들면 vault 가 며칠 안에 paraphrase 로 오염.
- **권위 흐름**: 사용자 → AI 단방향. AI 가 추출, 사용자가 결정.
- **trace 보존**: body 에 prose source 인용 명시 권장 ("Extracted from RFC ... §N").

Obsidian 의 wikilink graph + Protégé 의 typed 노드 + Backstage 의 machine surface 의 교집합 자리에서, 이 skill 이 사용자 *prose* 측의 ingress path. mission v3 의 *primary audience* 인 developer + AI agent 둘의 공저 흐름 완성.
