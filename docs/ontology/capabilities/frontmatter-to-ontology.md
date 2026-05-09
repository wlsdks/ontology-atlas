---
slug: capabilities/frontmatter-to-ontology
kind: capability
title: Frontmatter → Ontology Stub
domain: ontology-core
elements:
  - src/shared/lib/parse-frontmatter.ts
  - src/entities/docs-vault/lib/derive-ontology-from-vault.ts
relates:
  - domains/vault-local-first
  - domains/ontology-core
---

# Frontmatter → Ontology Stub

vault 의 `.md` 파일 frontmatter 를 직접 읽어 OntologyStub (nodes + edges + warnings) 으로
변환. AI 추출 / 검수 큐 거치지 않는 fast-path. 이게 mission "frontmatter 가 자기-승인" 의 코드 표현.

지원 frontmatter 키:
- `kind:` — canonical 5: project / domain / capability / element / document
- `title:`, `domain:`
- `capabilities: []`, `elements: []` — 배열 노드
- `relates: []`, `dependencies: []`, `contains: []` — edge 후보

CLI/MCP writer 가 남기는 folder-prefixed ref (`domains/foo`,
`capabilities/bar`, `elements/baz`) 는 웹 파생 단계에서도 같은 node id 로 해석한다.
예: `domain: domains/incident-intake` 는 `domain:incident-intake`,
`dependencies: [capabilities/storage]` 는 `capability:storage` 로 연결된다. 이
정규화가 깨지면 19개 vault doc 이 31개 ontology node 처럼 부풀고 unknown/stub
중복이 생기므로 contract test 로 고정한다.

scripts/build-docs-vault.mjs 와 src/shared/lib/parse-frontmatter.ts 가 capability 동기화.
