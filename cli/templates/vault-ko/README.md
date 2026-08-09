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
2. 새 노드는 공방, MCP `add_concept`, 또는 소스 체크아웃 CLI로 만듭니다.
   이 작성 경로가 불변 UID를 발급하므로 스타터 파일과 정체성을 복사하지 마세요.
   아래 안내대로 `$ATLAS`를 설정한 뒤:
   ```bash
   node $ATLAS/cli/src/index.mjs add domain auth --title="Authentication" --vault .
   ```
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

**앱이 없다면**, Ontology Atlas 소스 체크아웃에서 에이전트 설정 명령을 한 번
실행합니다. 꺾쇠 두 자리는 내 컴퓨터의 실제 절대 경로로 바꿔 넣으세요 —
클론한 체크아웃, 그리고 이 문서함 폴더입니다:

```bash
node <ontology-atlas 체크아웃>/cli/src/index.mjs agent-setup <이 문서함 폴더> --root . --write
```

없는 Claude Code / Cursor / Codex 설정 파일만 만들고, 스타터 마크다운을
추가하거나 기존 설정을 덮어쓰지 않습니다. 직접 병합하려면 `.mcp.json.example`
을 열어 `OATLAS_VAULT` 자리표시자를 이 문서함의 절대 경로로 바꾼 뒤, 그 서버
항목을 에이전트 설정에 복사하세요. CLI 는 체크아웃의 `mcp/src/index.js` 를
가리키는 `.mcp.json` 과 `.codex/config.toml` 을 만듭니다.

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

Ontology Atlas 소스 체크아웃이 있다면 같은 첫 접속 점검을 CLI 로도 할 수
있습니다. `$ATLAS` 를 체크아웃 **폴더**에 한 번 맞춰 두고 — Atlas 의 다른 화면이 쓰는
뜻과 같습니다 — 이렇게 씁니다:

```bash
export ATLAS=<ontology-atlas 소스 체크아웃 경로>

node $ATLAS/cli/src/index.mjs validate .
node $ATLAS/cli/src/index.mjs workspace-brief .
node $ATLAS/cli/src/index.mjs agent-brief . --prompt
node $ATLAS/cli/src/index.mjs agent-brief . --graph-db-pack
node $ATLAS/cli/src/index.mjs agent-brief . --verify-fallbacks
node $ATLAS/cli/src/index.mjs cycles . --max-hops 8
node $ATLAS/cli/src/index.mjs growth . --limit 20
node $ATLAS/cli/src/index.mjs maintenance . --limit 20
node $ATLAS/cli/src/index.mjs mcp-verify . --timeout-ms 15000
```

사람이 읽는 터미널 출력 대신 작은 JSON 보고서가 필요한 자동화라면:

```bash
node $ATLAS/cli/src/index.mjs agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4
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

`ontology-atlas-mcp` 서버를 등록하면 실행 중인 서버가 현재 읽기·쓰기 도구
목록을 에이전트에게 알려 줍니다. 정확한 이름은 `tools/list`로 보고,
`mcp-verify`로 서버가 이 문서함을 실제로 읽는지 확인하세요.

처음에는 `connection_info`, `list_kinds`, `validate_vault`,
`query_ontology({ operation: "agent_brief" })`를 사용합니다. 읽기 점검이 깨끗하고
사람이 제안된 의미를 승인한 뒤에만 씁니다.

자세히: https://github.com/wlsdks/ontology-atlas/tree/main/mcp
