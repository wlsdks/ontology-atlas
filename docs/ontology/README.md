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
├── domains/              — 도메인 8개 (vault, ontology-core, views, ai-partner …)
├── capabilities/         — capability 노드 (frontmatter → ontology, mode-aware adapter …)
└── elements/             — element 노드 (코드 디렉토리 / 라이브러리 / 데이터 모델)
```

## 사용

### 사람이 읽을 때
파일을 직접 열거나, `pnpm dev` 후 `/docs/` 에서 vault picker 로 이 디렉토리 선택.

### Claude Code 같은 AI agent 가 읽을 때
MCP 서버 등록 — `mcp/README.md` 의 `.mcp.json` 예시 참고.
도구: `list_concepts`, `get_concept`, `find_evidence`, `add_concept`, `add_relation`.

## 갱신

- 새 도메인이 생기면 `domains/<slug>.md` 추가
- 새 capability — `capabilities/<slug>.md`. frontmatter `domain: <domain-slug>`
- 새 element (코드 모듈) — `elements/<slug>.md`. frontmatter `path: src/...`

이 vault 는 **frontmatter 만으로 ontology 표현 가능** 을 보여준다. 본문은 사람이 읽을 때 도움.
