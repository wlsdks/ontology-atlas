---
uid: 2a62e2be-ce8e-4923-8883-da0630e64152
slug: capabilities/construction-review
kind: capability
title: Construction Qualification Review
display_ko: 온톨로지 구축 검수
display_en: Construction Qualification Review
domain: domains/project-portfolio
elements: [elements/project-detail]
path: src/entities/construction-review
created_by: "agent:unknown"
relation_notes: { elements/project-detail: Construction qualification is opened and judged inside the existing project-detail workbench. }
---

검증된 ontology construction artifact를 프로젝트 상세에서 결론부터 읽고, 같은 digest-bound 근거와 exact plan을 필요할 때 펼쳐 판단하는 능력이다. malformed, 다른 project, digest 또는 plan 불일치는 정상 판정처럼 보이지 않고 실패 닫으며, 파일은 session 밖에 저장하거나 vault에 쓰지 않는다.