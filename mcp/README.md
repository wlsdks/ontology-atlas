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

서버가 stdio 로 연결됨. tool 목록에 `oh-my-ontology` namespace 11 도구 등장.

### 3. 호출

```
"이 프로젝트의 모든 capability 노드를 list 해줘"
→ mcp__oh-my-ontology__list_concepts({ kind: 'capability' })

"capabilities/mcp-server 가 의존하는 element 가 뭐야?"
→ mcp__oh-my-ontology__get_concept({ slug: 'capabilities/mcp-server' })
```

## 도구 11종 (v0.5.0)

| 도구 | 동작 |
|---|---|
| `list_concepts` | vault 의 모든 노드 (`kind:` frontmatter 가진 .md). 옵션 `kind`, `limit`. |
| `get_concept` | 단일 `slug` (확장자 제외) 의 frontmatter + body excerpt + 이웃 (dependencies / relates) |
| `find_evidence` | `title` 부분매칭 — frontmatter title/capabilities/elements + body 본문 검색 |
| `find_backlinks` | 특정 `slug` 를 가리키는 다른 노드들. frontmatter array 키 (capabilities / elements / dependencies / relates / …) + body wikilink/mdlink 모두 검사. |
| `find_path` | 두 slug 사이 그래프 최단 경로 (BFS, 무방향). 옵션 `maxHops` (기본 5). |
| `list_kinds` | vault kind 분포 census `{ total, byKind: { capability: N, ... } }`. |
| `find_orphans` | **v0.5** vault 의 고립 노드 (어느 다른 노드도 frontmatter 에서 가리키지 않는 doc). 옵션 `kind` (필터), `excludeKinds` (제외, 기본 `['vault-readme']`). cleanup 시작점 / "안 쓰이는 노드" 점검. |
| `add_concept` | 새 `.md` 노드 작성. 필수: `slug` `kind` `title`. 옵션: `domain` `capabilities` `elements` `body`. 기존 slug 면 throw. |
| `add_relation` | 두 slug 사이 edge. `type`: `depends_on` (→ dependencies), `relates` (→ relates), `contains` (→ contains), `describes` (→ describes). frontmatter 배열에 append. |
| `patch_concept` | 기존 노드 frontmatter (key 단위 patch — null = 삭제) + body 갱신. `add_concept` 가 throw 한 기존 slug 를 *수정* 할 때 사용. |
| `delete_concept` | **v0.4 ⚠ DESTRUCTIVE** 노드 영구 삭제. 안전 가드 2단: ① `confirm:true` 미지정 시 dry-run (backlinks 미리보기), ② backlinks 있으면 throw — `force:true` 만 강행. 응답에 frontmatter+body 캡처 — 실수 복구용. |

## 로컬 검증 (UX-3)

### 1줄 verify CLI

```bash
cd mcp && npm install
OMOT_VAULT=../docs/ontology npm run verify
```

verify 가 성공하면 다음 출력:

```
[oh-my-ontology-mcp verify]
· step 1 — parser smoke test
✓ result: 7 passed, 0 failed
· step 2 — server boot + tools/list + list_concepts
✓ initialize OK — server oh-my-ontology-mcp@0.5.0
✓ tools/list 11/11 — add_concept · add_relation · delete_concept · find_backlinks · find_evidence · find_orphans · find_path · get_concept · list_concepts · list_kinds · patch_concept
✓ list_concepts — vault total 23 노드

전체 통과 — Claude Code 에 .mcp.json 등록 후 재시작하면 11 도구 사용 가능합니다.
```

실패 시 어느 step 에서 막혔는지 + 진단 메시지 노출.

### 수동 (참고)

```bash
# parser smoke
node src/parser.test.mjs

# 실 서버 stdin/stdout JSON-RPC
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_concepts","arguments":{"limit":5}}}' \
  | OMOT_VAULT=../docs/ontology node src/index.js
```

## Claude Code 등록 후 첫 호출 (sample prompt)

`.mcp.json` 등록 + Claude Code 재시작 후 LLM 에게 다음을 시도하세요:

> **첫 탐색 — vault 의 ontology 가 보이는지 확인**
> 1. `mcp__oh-my-ontology__list_concepts` 호출해 vault 의 모든 노드를 list 해줘
> 2. `get_concept({ slug: "project" })` 로 root 노드의 frontmatter + 이웃을 보여줘
> 3. `find_backlinks({ slug: "capabilities/mcp-server" })` 로 그 capability 의 의존자를 찾아줘
> 4. (선택) `add_concept` 로 새 capability 노드 만들어줘 — slug, kind, title 필요

위 4 도구가 정상 응답하면 vault read/write 양쪽 라운드트립 OK. agent 가 자기 codebase 분석 결과를 11 도구 (read 7 + write 4) 로 ontology 에 *commit* 하면 사람·AI agent 양립 저작 흐름 시작.

## 설계 원칙

- **stdin/stdout JSON-RPC** — Claude Code 가 child process 로 spawn. stdout 은 *프로토콜 전용*, log 는 stderr 로만.
- **Sync fs** — MCP 호출 빈도가 낮아 async 오버헤드 불필요.
- **frontmatter 보존** — `add_relation` 은 기존 frontmatter 유지하며 배열 키만 patch (idempotent — 이미 있으면 `alreadyExists: true`).
- **vault root sandbox** — `slug` 는 vault-relative. 서버는 `OMOT_VAULT` 밖에 쓰지 않는다.

## 상태

- 0.5.0 — 11 도구 (read 7 + write 4). `find_orphans` 추가.
- 0.4.0 — 10 도구 (read 6 + write 4). `delete_concept` 추가 (dry-run + backlinks 가드).
- 0.3.0 — 9 도구. `find_path` (BFS) + `list_kinds` (census).
- 0.2.0 — 7 도구.
- 0.1.0 — 5 도구.

## 문제 해결

- **Tool 목록에 안 보임**: Claude Code 재시작. `.mcp.json` syntax 검증 (`jq . .mcp.json`).
- **vault 인식 0**: `OMOT_VAULT` 절대 경로 시도. 또는 `pwd` 로 실제 cwd 확인.
- **`Doc already exists`**: `add_concept` 은 기존 파일 덮어쓰기 안 함. 직접 편집 또는 `patch_concept` 으로 frontmatter / body 부분 갱신.
