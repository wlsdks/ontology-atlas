---
slug: README
kind: vault-readme
title: ontology-atlas — 자기 ontology vault
describes:
  - project
---

# ontology-atlas — 자기 ontology vault

이 디렉토리는 **이 프로젝트 자신의 ontology** 다. dogfooding — 이 서비스를 만드는 데
필요한 mental model 을 이 서비스의 데이터 형식 (frontmatter md) 으로 표현.

여기서 ontology 는 단순한 그래프 그림이 아니라 **프로젝트가 무엇으로 이루어져
있고, 각 개념이 왜 연결되는지에 대한 실행 가능한 의미 모델**이다. `project`,
`domain`, `capability`, `element` 노드와 `contains`, `depends_on`, `relates`,
`describes` 같은 관계를 markdown frontmatter 로 저장하고, CLI/MCP/UI 가 같은
그래프를 읽고 갱신한다.

이 vault 가 표현하려는 1차 대상은 **비즈니스 핵심과 구현 근거가 연결된 의미 모델**이다.
Atlas 는 사업/제품이 무엇을 하려는지, 어떤 capability 가 그 목표를 나르고, 어떤 코드가
그 의미를 구현하거나 증명하는지 한 그래프에서 보여줘야 한다. 비즈니스 용어는 domain
language, ownership, capability boundary, decision path, change impact 를 설명할 때
들어오고, 소스 파일은 그 의미를 실현하거나 증명하는 `element` 로 들어온다. 즉
`domain` / `capability` 는 "무엇이 핵심이고 왜 존재하는가"를 설명하고, `element` 는
"어떤 구현이 그 의미를 실제로 운반하는가"를 증명한다.

## 구조

```
docs/ontology/
├── project.md            — root project 노드 (ontology-atlas)
├── domains/              — 도메인 6개 (vault, ontology-core, views, ai-agent-partner, mode-aware-adapters, onboarding-ux)
├── capabilities/         — capability 33개 (frontmatter → ontology, project ontology indexing, topology direct edit, changes-only review …)
├── documents/            — document 3개 (agent practice notes)
└── elements/             — element 57개 (코드 디렉토리 / UI 모델 / 라이브러리)
```

총 101 노드 (capability 33 · document 3 · domain 6 · element 57 · project 1 · vault-readme 1).
정확한 census 는 `ontology-atlas list` 또는 mcp `list_kinds` 호출.

## 사용

### 사람이 읽을 때
파일을 직접 열거나, `pnpm dev` 후 `/docs/` 에서 vault picker 로 이 디렉토리 선택.

### Claude Code 같은 AI agent 가 읽을 때
MCP 서버 등록 — `mcp/README.md` 의 `.mcp.json` 예시 참고.

24 도구 (read 16 + write 8):
- **read** — `list_concepts` · `get_concept` · `get_concepts` · `find_evidence` · `find_backlinks` · `find_neighbors` · `find_path` · `list_kinds` · `find_orphans` · `query_concepts` · `compile_ontology` · `query_ontology` · `validate_vault` · `analyze_repo_structure` · `infer_imports` · `index_project`
- **write** — `add_concept` · `add_concepts` · `add_relation` · `add_relations` · `patch_concept` · `delete_concept` · `rename_concept` · `merge_concepts`

agent UX: 단일 도구 (`add_concept` / `add_relation` / `get_concept`) 의 description 이 batch 짝 (`add_concepts` / `add_relations` / `get_concepts`) cross-reference. 5+ 노드 land 는 batch 쓰면 K → 1 round-trip.

## 갱신

- 새 도메인이 생기면 `domains/<slug>.md` 추가
- 새 capability — `capabilities/<slug>.md`. frontmatter `domain: <domain-slug>`
- 새 element (코드 모듈) — `elements/<slug>.md`. frontmatter `path: src/...`

빈 codebase 부트스트랩은 `ontology-atlas bootstrap [repo]` 한 줄로 (analyze 노드 + infer-imports 의 depends_on edges 합본).

이 vault 는 **frontmatter 만으로 ontology 표현 가능** 을 보여준다. 본문은 사람이 읽을 때 도움.
