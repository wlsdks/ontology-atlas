---
slug: README
kind: vault-readme
title: My ontology vault
display_ko: 내 온톨로지 문서함
display_en: My ontology vault
---

# 내 온톨로지 문서함

이 폴더는 **사람과 AI 에이전트가 함께 키우는 코드베이스 의미 모델**입니다.
`.md` 파일 하나가 노드 하나(프로젝트 / 도메인 / 역량 / 요소 / 개념)이고,
파일 맨 위의 frontmatter 가 그래프의 키(slug / kind / depends_on /
capabilities / elements / domain)입니다.

여기서 말하는 온톨로지는 코드베이스의 **실행 가능한 의미 모델**입니다 —
프로젝트·도메인·역량·요소와 타입 있는 관계로 소유권, 의존성, 근거, 변경 영향을
설명합니다.

## 5분 만에 시작하기

1. `project.md` 를 열어 프로젝트 이름과 설명을 씁니다.
2. 새 도메인이 떠오르면 `domains/` 아래에 `<slug>.md` 를 추가합니다:
   ```markdown
   ---
   slug: domains/auth
   kind: domain
   title: Authentication
   display_ko: 인증
   capabilities:
     - capabilities/login
     - capabilities/signup
   ---

   사용자 인증, 세션, 권한을 담당합니다.
   ```
3. 역량과 요소도 같은 방식으로 — `capabilities/` 와 `elements/` 아래에.
4. AI 에이전트(Claude Code, Cursor, …)를 연결하면 같은 문서함을 읽고 쓰면서
   함께 키웁니다.
5. 그래프로 보려면 워크벤치의 `/docs` 피커에서 이 폴더를 고릅니다.

첫 그래프를 자동으로 만들고 싶다면, 코드베이스 루트에서:

```bash
ontology-atlas bootstrap . --vault <이-폴더>
```

이 명령은 `package.json`, README 제목, `src/` 구조를 분석해 손대지 않은 예시
스타터를 실제 프로젝트/도메인/역량 노드로 바꿉니다. 이미 수정한 스타터 파일은
그대로 둡니다.

## AI 에이전트 설정

이 문서함이 `ontology-atlas init` 이나 설치된 앱의 스타터로 만들어졌다면
폴더 안에 이미 다음이 있습니다:

- Claude Code / Cursor 용 `.mcp.json`
- Codex 용 `.codex/config.toml`

에이전트에서 **이 문서함 폴더 자체**를 열고 재시작하세요. 두 설정 파일 모두
`OATLAS_VAULT=.` 을 쓰므로 에이전트가 이 폴더를 직접 읽고 씁니다.

에이전트를 별도 코드베이스 루트에서 열어 두고 싶다면, 그 코드베이스 루트에서
CLI 복구 경로를 씁니다:

```bash
ontology-atlas agent-setup /이-문서함의/절대/경로 --root . --write
```

없는 Claude Code / Cursor / Codex 설정 파일만 만들고, 스타터 마크다운을
추가하거나 기존 설정을 덮어쓰지 않습니다. 직접 병합하려면 `.mcp.json.example`
을 열어 `OATLAS_VAULT` 자리표시자를 이 문서함의 절대 경로로 바꾼 뒤, 그 서버
항목을 에이전트 설정에 복사하세요.

Codex 는 명령 한 줄로 전역 등록도 됩니다:

```bash
codex mcp add ontology-atlas --env OATLAS_VAULT=/이-문서함의/절대/경로 -- npx -y ontology-atlas-mcp
```

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

CLI 가 설치돼 있다면 같은 첫 접속 점검은:

```bash
ontology-atlas validate .
ontology-atlas workspace-brief .
ontology-atlas agent-brief . --prompt
ontology-atlas agent-brief . --graph-db-pack
ontology-atlas agent-brief . --verify-fallbacks
ontology-atlas cycles . --max-hops 8
ontology-atlas growth . --limit 20
ontology-atlas maintenance . --limit 20
ontology-atlas mcp-verify . --timeout-ms 15000
```

사람이 읽는 터미널 출력 대신 작은 JSON 보고서가 필요한 자동화라면:

```bash
ontology-atlas agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4
```

에이전트를 이 문서함이 아니라 코드베이스 루트에서 열었다면 `.` 대신 문서함
경로를 씁니다(예: `./ontology`).

## 관계 (frontmatter 키)

| 키 | 뜻 |
|---|---|
| `depends_on: [<slug>, ...]` | 이 노드가 기대는 다른 노드 |
| `capabilities: [...]` | 이 도메인/프로젝트가 제공하는 역량 |
| `elements: [...]` | 이 역량/도메인이 쓰는 요소 |
| `domain: <slug>` | 이 역량/요소의 상위 도메인 |
| `relates: [...]` | 느슨한 연관 참조 |

## 종류(kind)

- `project` — 최상위. 보통 작업공간당 하나.
- `domain` — 큰 영역(인증, 결제, 빌더, …).
- `capability` — 도메인 안에서 사용자가 할 수 있는 일 하나(로그인, 가입, …).
- `element` — 역량이 쓰는 더 작은 단위(jwt-token, otp-store, …).
- `document` — 근거 노드(다른 개념을 뒷받침하는 마크다운 문서).

## AI 에이전트가 해줄 수 있는 일

`ontology-atlas-mcp` 서버를 등록하면 에이전트가 이 문서함을 읽고 쓰는 도구
32개를 갖습니다:

- **읽기 19**: connection_info / git_status / git_history / list_concepts / get_concept / get_concepts / find_evidence /
  find_backlinks / find_neighbors / find_path / list_kinds / find_orphans /
  query_concepts / compile_ontology / query_ontology / validate_vault /
  analyze_repo_structure / infer_imports / index_project
- **쓰기 13**: absorb_document / add_concept / add_concepts / add_relation / add_relations /
  remove_relation / replace_relation / patch_concept / reclassify_concept /
  delete_concept / rename_concept / merge_concepts / git_snapshot

자세히: https://github.com/wlsdks/ontology-atlas/tree/main/mcp
