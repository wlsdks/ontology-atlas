---
slug: capabilities/ontology-bootstrap-skill
kind: capability
title: Ontology-Bootstrap Skill (.claude/skills/ontology-bootstrap)
display_ko: 빈 지도 자동 채우기
display_en: Fill an Empty Map
display: Ontology-Bootstrap Skill
domain: ai-agent-partner
elements: [.agents/skills/ontology-bootstrap/guides/meaning-extraction.md, .agents/skills/ontology-bootstrap/SKILL.md, mcp/src/meaning-evaluation.mjs, scripts/evaluate-meaning-corpus.mjs]
---

# Ontology Bootstrap Skill

`ontology-bootstrap`은 비어 있거나 starter-only인 vault에서 첫 공유 온톨로지를 만드는 Atlas-only 에이전트 워크플로다. 저장소 폴더를 라벨링하는 기능이 아니라, `index_project`가 반환한 semantic evidence와 extraction contract를 사람이 검토할 수 있는 의미 모델로 변환한다.

## Meaning contract

- `observed`: MCP가 직접 반환한 문서, 경로, 패키지, import 사실
- `proposed`: observed evidence에서 해석했지만 아직 승인되지 않은 의미
- `shared`: 사용자가 승인해 vault에 저장한 개념

추출 순서는 project outcome → stable responsibility domains → observable implementation-independent capabilities → concrete elements → typed relations다. 각 domain/capability에는 비순환 정의, 포함/제외 경계, source citation, confidence, counterevidence 또는 uncertainty가 필요하다. 폴더·패키지·팀·기술·README 섹션은 독립적인 의미 증거가 없으면 business concept가 아니라 implementation evidence로 남는다.

모든 competency question에 답하고 unsupported assertion, citation gap, implementation leakage, undefined/circular concept를 0으로 만든 뒤 사용자 승인을 받는다. semantic evidence가 없거나 MCP 계약이 stale하거나 vault가 분석 대상과 불일치하면 쓰지 않고 fail closed 한다.

Muse forward-test에서는 2,000개 파일과 41개 구현 요소를 읽고 5개 domain 및 13개 capability를 출처와 함께 제안했다. unsupported assertion 0, citation gap 0, implementation-name leakage 0, circular concept 0, competency question 5/5였으며, 활성 vault가 Muse와 달라 쓰기 단계는 중단했다.