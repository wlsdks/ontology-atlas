---
slug: README
kind: vault-readme
title: My ontology vault
---

# My ontology vault

이 폴더는 **사람과 AI agent 가 같이 키우는 codebase mental model** 입니다.
각 `.md` 파일은 한 노드 (project / domain / capability / element / concept)
이고, 파일 위 frontmatter 가 그래프의 키 (slug / kind / depends_on /
capabilities / elements / domain) 입니다.

## 시작 방법 (5분)

1. `project.md` 를 열어 프로젝트 이름과 설명을 적습니다.
2. 새 도메인이 떠오르면 `domains/` 안에 `<slug>.md` 추가:
   ```markdown
   ---
   slug: domains/auth
   kind: domain
   title: 인증
   capabilities:
     - capabilities/login
     - capabilities/signup
   ---

   사용자 인증·세션·권한을 담당.
   ```
3. capability / element 도 같은 패턴 — `capabilities/` 와 `elements/`.
4. AI agent (Claude Code 등) 를 등록하면 같은 vault 를 읽고 쓰며 같이 키워갑니다.
5. 그래프로 보고 싶으면 `https://oh-my-ontology.web.app` 또는 직접 클론한
   workbench 의 `/docs` picker.

## 관계 (frontmatter 키)

| 키 | 어떤 관계 |
|---|---|
| `depends_on: [<slug>, ...]` | 이 노드가 다른 노드에 의존 |
| `capabilities: [...]` | 이 도메인 / 프로젝트가 가진 역량 |
| `elements: [...]` | 이 역량 / 도메인이 사용하는 요소 |
| `domain: <slug>` | 이 capability/element 의 상위 도메인 |
| `evidenceIds: [doc-1, ...]` | 이 노드의 근거 문서 ID |

## kind 종류

- `project` — 최상위. 워크스페이스 1개당 보통 1.
- `domain` — 큰 영역 (인증, 결제, 빌더 등).
- `capability` — 도메인의 한 역량 (로그인, 회원가입, …).
- `element` — capability 가 쓰는 작은 요소 (jwt-token, otp-store, …).
- `concept` — 이 외 자유로운 개념 (프로토콜·표준·외부 시스템 등).

## AI agent 가 자동으로 할 수 있는 일

`oh-my-ontology-mcp` 서버를 등록하면 다음 11 도구로 vault read/write:

- **read 7**: list_concepts / get_concept / find_evidence / find_backlinks /
  find_path / list_kinds / find_orphans
- **write 4**: add_concept / add_relation / patch_concept / delete_concept

자세히: https://github.com/wlsdks/oh-my-ontology/tree/main/mcp
