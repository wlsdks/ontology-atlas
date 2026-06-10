---
slug: capabilities/topology-node-significance
kind: capability
title: Topology Node Significance (노드 so-what 평문)
domain: views
elements: [src/views/home/lib/topology-node-significance.ts, src/views/home/ui/TopologyNodePopover.tsx]
---

기획자·C-level 등 비개발자가 토폴로지에서 노드를 클릭했을 때, 그래프 jargon(숫자·`depends_on`)이 아니라 **평문 business 문장**으로 "so what"을 읽게 한다. 결핍 정의: 노드를 봐도 *왜 중요한지·무엇에 기대는지·바뀌면 어디 영향인지*가 안 읽혔다.

## 무엇을 합성하나 (4요소)

이미 있는 그래프 데이터에서 *결정론적으로 파생* — 새 authoring 0:

- **무엇인가** — `kind` + owner domain → "Views 영역에 속한 역량"
- **왜 중요한가** — fan-in 기반 `core`/`supporting`/`leaf` 판정. `core` 임계값은 health-signal 의 `PROMOTION_MIN_FAN_IN`(4) 재사용으로 일관.
- **무엇에 기대나** — 직접 outgoing count + 이웃 이름
- **바뀌면 어디 영향** — 전이 reach(blast-radius)

## 구성

- `buildNodeSignificance(node, model, options?)` — 순수 함수, prose 0(구조만 반환). drawer model 1회 빌드 재사용 → count drift 불가.
- `TopologyNodePopover` 4줄 노출. kind·관계어는 기존 `kinds.*`/`edgeTypes.*` 메시지 재사용(단일 진실원). 문장 보간·select·plural 은 `topology.significance.*` ICU 메시지가 담당.
- **작성형 override (approach C, 얇은 레이어)** — frontmatter `significance:` 가 있으면 "왜 중요한가" 줄을 그걸로 우선. 미지정 키는 파서가 보존하므로 schema 변경 0.

[[capabilities/topology-ontology-inspection]] 의 drawer/inspection 과 짝 — 그쪽이 "전체 상세(에이전트 핸드오프 포함)"라면 이쪽은 "첫 클릭의 평문 의미".