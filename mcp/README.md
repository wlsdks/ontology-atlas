# oh-my-ontology-mcp

> MCP 서버 — AI agent (Claude Code 등) 가 oh-my-ontology vault 의 ontology 를
> read/write 한다. mission "사람과 AI agent 가 같이 저작하는 codebase ontology"
> 의 AI 측 surface.

## 빠르게

### 1. Claude Code 에 등록

프로젝트 root 에 `.mcp.json` 작성:

```json
{
  "mcpServers": {
    "oh-my-ontology": {
      "command": "node",
      "args": ["./mcp/src/index.js"],
      "env": {
        "OMOT_VAULT": "./docs/ontology"
      }
    }
  }
}
```

또는 npm publish 후 `npx`:

```json
{
  "mcpServers": {
    "oh-my-ontology": {
      "command": "npx",
      "args": ["-y", "oh-my-ontology-mcp"],
      "env": {
        "OMOT_VAULT": "./docs/ontology"
      }
    }
  }
}
```

`OMOT_VAULT` 미지정 시 `cwd` 가 vault root.

### 2. Claude Code 재시작

서버가 stdio 로 연결됨. tool 목록에 `oh-my-ontology` namespace 5 도구 등장.

### 3. 호출

```
"이 프로젝트의 모든 capability 노드를 list 해줘"
→ mcp__oh-my-ontology__list_concepts({ kind: 'capability' })

"capabilities/mcp-server 가 의존하는 element 가 뭐야?"
→ mcp__oh-my-ontology__get_concept({ slug: 'capabilities/mcp-server' })
```

## 도구 7종 (v0.2.0)

| 도구 | 동작 |
|---|---|
| `list_concepts` | vault 의 모든 노드 (`kind:` frontmatter 가진 .md). 옵션 `kind`, `limit`. |
| `get_concept` | 단일 `slug` (확장자 제외) 의 frontmatter + body excerpt + 이웃 (dependencies / relates) |
| `find_evidence` | `title` 부분매칭 — frontmatter title/capabilities/elements + body 본문 검색 |
| `find_backlinks` | 특정 `slug` 를 가리키는 다른 노드들. frontmatter array 키 (capabilities / elements / dependencies / relates / …) + body wikilink/mdlink 모두 검사. |
| `add_concept` | 새 `.md` 노드 작성. 필수: `slug` `kind` `title`. 옵션: `domain` `capabilities` `elements` `body`. 기존 slug 면 throw. |
| `add_relation` | 두 slug 사이 edge. `type`: `depends_on` (→ dependencies), `relates` (→ relates), `contains` (→ contains), `describes` (→ describes). frontmatter 배열에 append. |
| `patch_concept` | 기존 노드 frontmatter (key 단위 patch — null = 삭제) + body 갱신. `add_concept` 가 throw 한 기존 slug 를 *수정* 할 때 사용. |

## 로컬 검증

```bash
# 의존성 install
cd mcp && npm install

# parser smoke test
node src/parser.test.mjs

# 실 서버 boot — list_concepts 호출
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_concepts","arguments":{"limit":5}}}' \
  | OMOT_VAULT=../docs/ontology node src/index.js
```

## 설계 원칙

- **stdin/stdout JSON-RPC** — Claude Code 가 child process 로 spawn. stdout 은 *프로토콜 전용*, log 는 stderr 로만.
- **Sync fs** — MCP 호출 빈도가 낮아 async 오버헤드 불필요.
- **frontmatter 보존** — `add_relation` 은 기존 frontmatter 유지하며 배열 키만 patch (idempotent — 이미 있으면 `alreadyExists: true`).
- **vault root sandbox** — `slug` 는 vault-relative. 서버는 `OMOT_VAULT` 밖에 쓰지 않는다.

## 상태

- 0.2.0 — 7 도구 (read 4 + write 3). 단일 파일 노드. 의존: `@modelcontextprotocol/sdk@^1.0.0`.
- 0.1.0 — 5 도구 (read 3 + write 2).
- 이후: `delete_concept` (위험 — confirmation 필요), `find_path` (graph traversal), `list_kinds` (kind 분포 요약).

## 문제 해결

- **Tool 목록에 안 보임**: Claude Code 재시작. `.mcp.json` syntax 검증 (`jq . .mcp.json`).
- **vault 인식 0**: `OMOT_VAULT` 절대 경로 시도. 또는 `pwd` 로 실제 cwd 확인.
- **`Doc already exists`**: `add_concept` 은 기존 파일 덮어쓰기 안 함. 필요하면 직접 편집 또는 `patch_concept` 대기.
