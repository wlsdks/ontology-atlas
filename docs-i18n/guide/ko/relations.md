# 개념 사이의 관계

관계는 온톨로지 지식 그래프에서 종류가 정해진 간선이에요. "이 역량은 저 역량에 의존한다", "이 요소는 저 역량에 속한다" 같은 것들이죠. Atlas에서 관계 하나는 개념 frontmatter의 항목 하나예요. 이 장에서는 관계 유형을 정리하고, 관계를 쓰는 법을 보여 주고, 지도와 코딩 에이전트가 호출하는 MCP 도구(`find_path`, `find_backlinks` 등)가 관계를 어떻게 읽는지 설명해요.

## 구조와 의미

관계는 두 묶음으로 나뉘어요.

- **구조**는 무엇이 무엇을 담는지 말해요. 프로젝트는 도메인을, 도메인은 역량을, 역량은 요소를 담아요. 구조만으로는 트리가 돼요.
- **의미**는 개념들이 서로 어떻게 의존하거나 관련되는지 말해요. 단계와 상관없어요. 한 도메인의 역량이 다른 도메인의 역량에 의존할 수 있고, 두 도메인이 직접 관련될 수도 있어요. 이런 관계 하나가 트리를 그래프로 바꿔요.

## 관계 유형

| 뜻 | frontmatter 키 | 출발 → 도착 | 지도에서 |
|---|---|---|---|
| 프로젝트의 도메인 | `domains: [...]` | 프로젝트 → 도메인 | 프로젝트 둘레의 도메인 |
| 담긴 역량 | `capabilities: [...]` | 프로젝트나 도메인 → 역량 | 도메인 둘레의 원 |
| 담긴 요소 | `elements: [...]` | 프로젝트, 도메인, 역량 → 요소 | 역량 둘레의 점 |
| 도메인 소속 | `domain: <slug>` | 역량이나 요소 → 도메인 | 그 도메인 안에 놓여요 |
| 일반 포함 | `contains: [...]` | 위의 키가 맞지 않을 때, 어떤 개념 → 어떤 개념 | |
| 의존 | `dependencies: [...]` | 어떤 개념 → 그 개념이 필요로 하는 개념 | 필요한 쪽으로 가늘어지는 쐐기 |
| 관련 | `relates: [...]` | 어떤 개념 ↔ 어떤 개념 | 가는 점선 |
| 상위 개념 | `broader: [...]` | 도메인 → 도메인, 역량 → 역량, 요소 → 요소 | 가는 이중선, `is_a`로 표시 |
| 설명 | `describes: [...]` | 문서 → 그 문서가 설명하는 개념 | 문서 패널에 목록으로 |

읽는 쪽은 `dependencies:`를 `depends_on:`으로 써도 받아들이고, 쓰는 쪽은 `dependencies:`로 써요. 방향과 추론 규칙까지 담긴 전체 표는 [Atlas 명세 5절](https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#5-relation-types-and-their-semantics)에 있어요.

`broader`는 같은 종류의 두 개념 사이에 진짜 "~의 한 종류다"라는 주장이 있을 때만 쓰세요. 좁은 쪽 정의에 맞는 것은 모두 넓은 쪽 정의에도 맞아야 해요. 같은 도메인, 비슷한 이름, 폴더 중첩만으로는 부족해요.

## 관계 쓰기

관계는 출발 개념에 한 번만 써요. 도착 개념은 그 관계를 언급할 필요가 없어요.

```markdown
---
uid: 94cf0cde-1e74-497d-ac41-00cdf3a42f0b
slug: capabilities/vault-live-updates
kind: capability
title: Vault live updates
domain: domains/local-vault
dependencies: [capabilities/map-render]
relates: [capabilities/conflict-guard]
relation_notes: { capabilities/map-render: "감지한 파일 변경이 보이려면 지도를 다시 그려야 한다." }
---
```

`relation_notes`에는 관계마다 그 관계가 왜 성립하는지 한 문장씩 적고, 대상의 slug를 키로 써요. MCP 서버나 지도 편집기로 새 `depends_on`을 쓸 때는 이 문장이 꼭 있어야 해요. 다른 관계도 이유를 안다면 적어 두는 게 좋아요. 개념 패널은 이유가 없는 관계를 **이유 없음**으로 표시해요.

값은 slug라서 사람이 파일에서 그래프를 읽을 수 있어요. 겹치지 않는 짧은 형태도 돼요. `capabilities/map-render` 대신 `map-render`처럼요. Atlas로 개념 이름을 바꾸면 그 개념을 가리키는 모든 관계가 다시 쓰여요.

Atlas는 관계 목록을 쓸 때 공백을 다듬고, 중복을 없애고, 정렬해요. 그래서 순서에는 뜻이 없어요. 역관계나 전이 관계를 스스로 더하지도 않아요. 한쪽에 쓴 `relates`는 반대쪽에 복사되지 않고, A가 B에 의존하고 B가 C에 의존한다고 해서 A가 C에 의존한다고 쓰지 않아요. 관계가 없다는 건 "관계 없음"이 아니라 "기록되지 않음"이에요.

## 지도가 관계를 쓰는 방식

- 아무것도 고르지 않았을 때, 도메인 사이의 흐린 호는 두 도메인의 개념 사이에 있는 `depends_on` 관계를 방향별로 세요.
- 개념을 가리키거나 고르면, 그 개념이 스스로 적은 관계만 그려요. 반대쪽 개념 하나에 선 하나예요. **의존하는 개념**과 **이 개념에 의존하는 개념**은 쐐기로, **관련**은 점선으로, **상위 개념**은 이중선으로 그려요.
- 개념 패널의 **의존하는 개념**과 **이 개념에 의존하는 개념** 목록은 `depends_on`만으로 만들어요. 관련과 상위 개념 연결은 **그 밖의 관계**에 개수로 들어가요.

선 범례 전체는 [지도 읽는 법](/guide/reading-the-map)을 보세요.

## 에이전트가 관계를 쓰는 방식

MCP 서버는 같은 frontmatter로 그래프 질문에 답해요. 그래서 에이전트가 모든 파일을 읽을 필요가 없어요.

- `find_backlinks`는 어떤 관계 키로든, 본문 속 링크로든 slug를 가리키는 모든 개념을 나열해요. 이름을 바꾸거나 지우기 전에 호출하세요.
- `find_path`는 두 개념 사이의 최단 경로를 돌려줘요. 단계마다 그 단계를 잇는 키(`via`)와, 기록돼 있다면 이유(`rationale`)를 알려 줘요.
- `find_neighbors`는 개념 둘레 한 단계를 방향과 유형으로 걸러서 돌려줘요.
- `query_ontology`에 `impact`나 `blast_radius`를 주면 "이게 바뀌면 무엇이 영향을 받나요?"에 답해요. 선언된 `depends_on` 관계만 따라가요. 구조는 영향이 아니에요.
- `query_ontology`에 `domain_matrix`를 주면 도메인 사이의 관계를 세요. `depends_on`으로 한정하면 지도의 호가 그리는 숫자와 같아요.

쓸 때는 `add_relation`이 `from`, `to`, `type`(`depends_on`, `relates`, `contains`, `describes`, `domains`, `capabilities`, `elements`, `domain` 중 하나), `why`를 받아요. `remove_relation`과 `replace_relation`은 기본으로 미리 보기만 하고, `confirm: true`일 때만 써요. `broader`는 아직 `add_relation`의 유형이 아니에요. 에이전트는 `patch_concept`에 새 목록 전체와 파일의 `mtime`을 넘겨 바꾸고, 그다음 `validate_vault`를 실행해요.

[CLI](/guide/cli)는 터미널에서 같은 읽기를 제공해요. Atlas 소스 체크아웃에서 실행하면, 아래 명령은 이 저장소 자체의 온톨로지를 읽어요.

```bash
node cli/src/index.mjs backlinks capabilities/mcp-tool-server --vault docs/ontology
node cli/src/index.mjs path capabilities/cli-commands domains/human-workbench --vault docs/ontology
node cli/src/index.mjs blast-radius capabilities/mcp-tool-server --direction incoming --vault docs/ontology
node cli/src/index.mjs domain-matrix docs/ontology --types depends_on
```

`relate`와 `remove-relation`은 MCP 도구와 같은 점검을 거쳐 관계 하나를 써요. 지도에서는 **관계 편집**이 한 번에 관계 하나씩 같은 일을 해요. [개념과 관계 편집하기](/guide/studio)를 보세요.

## 파일이 여전히 진실이에요

관계를 더하면 파일 하나의 한 줄이 바뀌고, 그 변경은 다른 변경처럼 `git diff`에 나와요. 에이전트가 쓴 관계도 내가 쓴 관계와 똑같이 생겨서, 리뷰 한 번으로 둘 다 확인할 수 있어요.
