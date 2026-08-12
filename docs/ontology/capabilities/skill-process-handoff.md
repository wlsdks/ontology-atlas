---
uid: 1983a68d-8812-4210-83a3-a3cc6b54d21f
slug: capabilities/skill-process-handoff
kind: capability
title: Agent Skill Process Inspection and Handoff
display_ko: 에이전트 스킬 절차 검수와 인계
display_en: Agent Skill Process Inspection and Handoff
domain: domains/agent-integration
elements: [elements/agent-skill-process-contract]
path: src/views/agent-skills/ui/AgentSkillsPage.tsx
created_by: "agent:unknown"
relation_notes: { elements/agent-skill-process-contract: "The capability is implemented by the exact process IR, diagnostics, semantic-label, and canonical packet contract." }
---

SKILL.md의 명시적 번호 절차를 exact text, 원문 순서, line span, source digest로 읽고 canonical packet으로 사용자가 승인한 source-hidden agent에게 인계하는 능력이다. truncated 또는 unsupported source와 digest tamper는 실패 닫고, 의미 overlay는 합격한 명시 문법만 텍스트 라벨로 보이며 inferred edge는 만들지 않는다.