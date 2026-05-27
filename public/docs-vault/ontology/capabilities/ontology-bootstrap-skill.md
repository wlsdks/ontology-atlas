---
slug: capabilities/ontology-bootstrap-skill
kind: capability
title: Ontology-Bootstrap Skill (.claude/skills/ontology-bootstrap)
domain: ai-agent-partner
elements: [.claude/skills/ontology-bootstrap/SKILL.md]
---

R16 follow-up — `/ontology-bootstrap` slash skill 의 cold-start counterpart. `/ontology-sync` 가 *이미 자란 vault* 의 incremental sync 라면, 이 skill 은 *fresh init 직후 빈 vault* 를 codebase 에서 *한 번에* 채우는 흐름.

## 흐름 (R+, 3 round-trips)

1. `list_kinds` — vault 가 진짜 cold-start 인지 (≤ 5 nodes) 확인
2. `analyze_repo_structure` 1 회 호출 (mcp 도구, R16 v0.8.0)
   — `package.json` / `README.md` H2 / `src/` 폴더 → deterministic 후보. side effect 0. 후보 slug 는 `domains/*`, `capabilities/*`, `elements/src/...` 로 생성돼 README H2 와 feature folder 이름이 같아도 충돌하지 않음.
3. 후보를 사용자에게 *5 줄 max* 요약 (kind 별 count + 상위 3 + evidence)
4. 사용자 분기 — yes / pick / refine
5. **`add_concepts`** (R+ batch writer, max 50) 1 회 — project + domains + capabilities + elements 일괄 land. 그 다음 **`add_relations`** (R+ batch edge writer, max 50) 1 회 — suggestedRelations 일괄 land. 두 호출 모두 partial result · idempotent.
6. 마무리 — `list_kinds` + 사용자에게 census diff 보여주기 ("vault 5 → 18 nodes")

## 단일 source of truth

skill 자체는 *agent prompt instruction*. 진입은 `add_concepts` / `add_relations` 만 — vault frontmatter 가 유일 진실원. analyze 는 read only.

## Mission align

이전: 사용자 init 후 *수동 add 25 회* (Paravel real-codebase 측정 친구션).
이후 (R+): agent 가 한 번 분석 → 30+ 후보 → 1-click confirm → **batch 2 호출 (add_concepts + add_relations) → 총 3 round-trip 으로 vault 채워짐**. 첫 user *Aha moment*.

## 참조

- `.claude/skills/ontology-bootstrap/SKILL.md` — agent prompt
- `mcp/src/analyze.mjs` — deterministic helper (R16)
- `cli/src/commands/analyze.mjs` — cli wrapper
