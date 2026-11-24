---
slug: README
kind: vault-readme
title: My ontology vault
display_ko: 내 온톨로지 문서함
display_en: My ontology vault
---

# 내 온톨로지 문서함

이 폴더는 **사람과 AI 에이전트가 함께 키우는 코드베이스 의미 모델**입니다.
`.md` 파일 하나가 노드 하나(프로젝트 / 도메인 / 역량 / 요소 / 문서)이고,
파일 맨 위의 frontmatter 자체가 그래프입니다.

여기서 말하는 온톨로지는 코드베이스의 **실행 가능한 의미 모델**입니다 —
저자가 만드는 다섯 kind와 타입 있는 관계로 범위, 의존성, 연관, 설명을
표현합니다. 포함·제외·예시·반례, direct `is_a` 판별, 추론 경계의 정본은 한 곳입니다:
https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind

## 5분 만에 시작하기

1. `project.md` 를 열어 프로젝트 이름과 설명을 씁니다.
2. 새 노드는 공방이나 MCP `add_concepts`로 만듭니다. 이 작성 경로가 불변 UID를
   발급하므로 스타터 파일과 정체성을 복사하지 마세요.
3. 역량과 요소도 같은 작성 경로로 만듭니다.
4. AI 에이전트(Claude Code, Cursor, …)를 연결하면 같은 문서함을 읽고 쓰면서
   함께 키웁니다.
5. 그래프로 보려면 워크벤치의 `/docs` 피커에서 이 폴더를 고릅니다.

## AI 에이전트 설정

이 문서함에 에이전트를 붙이는 길은 두 가지입니다.

**설치된 Ontology Atlas 앱이 있다면**, 앱에서 이 폴더를 열고 에이전트 연결
버튼을 누르세요. 앱이 Claude Code / Cursor / Codex 설정을 대신 써 줍니다 —
이 폴더의 실제 경로를 이미 알고 있고, MCP 서버를 자기 번들 안에 싣고
다닙니다. 터미널도, node 도, 설치 과정도 필요 없습니다.

**앱이 없다면**, 서버 항목을 직접 병합합니다. `.mcp.json.example`을 열어
`OATLAS_VAULT` 자리표시자를 이 문서함의 절대 경로로 바꾼 뒤, 그 서버 항목을
에이전트 설정에 복사하세요. Codex 는 이 폴더를 trusted 로 승인한 뒤에만
프로젝트의 `.codex/config.toml` 을 읽습니다. 신뢰 요청을 승인하고 이 폴더에서
`codex mcp list` 를 실행해 `ontology-atlas` 가 보이는지 확인한 뒤 쓰기를
시작하세요.

## 에이전트 연결 확인

에이전트를 재시작한 뒤, **무언가를 고치기 전에** 연결을 증명하게 하세요:

> ontology-atlas MCP 서버로 `validate_vault` 를 실행하고, 이어서
> `query_ontology({ "operation": "workspace_brief" })`,
> `query_ontology({ "operation": "agent_brief" })`,
> `query_ontology({ "operation": "health" })`,
> `query_ontology({ "operation": "cycles", "maxHops": 8 })`,
> `query_ontology({ "operation": "growth_plan", "limit": 20 })`,
> `query_ontology({ "operation": "maintenance_plan", "limit": 20 })` 를
> 실행해 줘. 이 문서함을 읽을 수 있는지, 그래프가 충분히 깨끗한지, 쓰기 도구가
> 준비됐는지 변경을 제안하기 전에 알려 줘.

## kind와 관계

폴더 이름으로 추측하지 말고 위 명세를 사용하세요. `project`, `domain`,
`capability`, `element`, `document`만 저자가 만들며 `vault-readme`는 도구가 만드는
예약 kind입니다. `broader:`는 검증되는 저장 키이고 앱은 `is_a`로 보여 주지만,
현재 공개 MCP relation API는 `broader`나 `is_a`를 받지 않습니다. 연결된 agent의
server instructions가 충돌을 막는 정확한 `patch_concept` fallback을 제공합니다.

## AI 에이전트가 해줄 수 있는 일

`ontology-atlas-mcp` 서버를 등록하면 실행 중인 서버가 현재 읽기·쓰기 도구
목록을 에이전트에게 알려 줍니다. 정확한 이름은 `tools/list`로 보고,
`validate_vault`로 서버가 이 문서함을 실제로 읽는지 확인하세요.

처음에는 `connection_info`, `list_concepts`, `validate_vault`,
`query_ontology({ operation: "agent_brief" })`를 사용합니다. 읽기 점검이 깨끗하고
사람이 제안된 의미를 승인한 뒤에만 씁니다.

자세히: https://github.com/wlsdks/ontology-atlas/tree/main/mcp
