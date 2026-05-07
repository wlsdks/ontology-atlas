---
slug: README
kind: vault-readme
title: oh-my-ontology — 자기 ontology vault
---

# oh-my-ontology — 자기 ontology vault

이 디렉토리는 **이 프로젝트 자신의 ontology** 다. dogfooding — 이 서비스를 만드는 데
필요한 mental model 을 이 서비스의 데이터 형식 (frontmatter md) 으로 표현.

## 구조

```
docs/ontology/
├── project.md            — root project 노드 (oh-my-ontology)
├── domains/              — 도메인 6개 (vault, ontology-core, views, ai-agent-partner, mode-aware-adapters, onboarding-ux)
├── capabilities/         — capability 14개 (frontmatter → ontology, mode-aware adapter, mcp-server, cli-developer-entry …)
└── elements/             — element 4개 (코드 디렉토리 / 라이브러리)
```

총 26 노드. 정확한 census 는 `oh-my-ontology list` 또는 mcp `list_kinds` 호출.

## 사용

### 사람이 읽을 때
파일을 직접 열거나, `pnpm dev` 후 `/docs/` 에서 vault picker 로 이 디렉토리 선택.

### Claude Code 같은 AI agent 가 읽을 때
MCP 서버 등록 — `mcp/README.md` 의 `.mcp.json` 예시 참고.

19 도구 (read 11 + write 8):
- **read** — `list_concepts` · `get_concept` · `get_concepts` · `find_evidence` · `find_backlinks` · `find_path` · `list_kinds` · `find_orphans` · `query_concepts` · `analyze_repo_structure` · `infer_imports`
- **write** — `add_concept` · `add_concepts` · `add_relation` · `add_relations` · `patch_concept` · `delete_concept` · `rename_concept` · `merge_concepts`

agent UX: 단일 도구 (`add_concept` / `add_relation` / `get_concept`) 의 description 이 batch 짝 (`add_concepts` / `add_relations` / `get_concepts`) cross-reference. 5+ 노드 land 는 batch 쓰면 K → 1 round-trip.

## 갱신

- 새 도메인이 생기면 `domains/<slug>.md` 추가
- 새 capability — `capabilities/<slug>.md`. frontmatter `domain: <domain-slug>`
- 새 element (코드 모듈) — `elements/<slug>.md`. frontmatter `path: src/...`

빈 codebase 부트스트랩은 `oh-my-ontology bootstrap [repo]` 한 줄로 (analyze 노드 + infer-imports 의 depends_on edges 합본).

이 vault 는 **frontmatter 만으로 ontology 표현 가능** 을 보여준다. 본문은 사람이 읽을 때 도움.
