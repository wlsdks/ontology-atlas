# project-narnia-mcp

Narnia MCP server — Claude Code · Cursor · 기타 MCP 클라이언트가 등록만 하면 AI agent 가 자기 워크스페이스 토폴로지에 노드/허브를 push 할 수 있는 도구를 자동으로 갖게 된다.

## 설치 & 등록

### 1. API key 발급

Narnia 웹 admin 의 `/admin/api-keys/?a=<accountId>` 에서 키 발급 → 평문 1회 노출.

### 2. Claude Code 등록 (`.claude/mcp_servers.json` 또는 글로벌)

```json
{
  "narnia": {
    "command": "npx",
    "args": ["-y", "project-narnia-mcp"],
    "env": {
      "NARNIA_API_KEY": "nk_...",
      "NARNIA_ACCOUNT_ID": "stark",
      "NARNIA_BASE_URL": "https://asia-northeast3-<project>.cloudfunctions.net",
      "NARNIA_DEFAULT_PROJECT_ID": "narnia"
    }
  }
}
```

### 3. Cursor 등록 (`.cursor/mcp.json`)

같은 형식. `command: "npx"`, `args: ["-y", "project-narnia-mcp"]`.

## 노출되는 tool

### `narnia_push_doc`

워크스페이스 컨테이너에 hub 또는 node 한 건 push (upsert).

**Input schema:**

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `slug` | string | ✅ | kebab-case, 컨테이너 안 unique |
| `name` | string | ✅ | 표시 이름 |
| `projectId` | string |  | 컨테이너 id (기본 `NARNIA_DEFAULT_PROJECT_ID`) |
| `isHub` | boolean |  | true → hubs/, false → nodes/ (default false) |
| `description` | string |  |  |
| `detail` | string |  | markdown 본문 |
| `tags`, `stack`, `dependencies`, `hubIds` | string[] |  |  |
| `owner`, `icon` | string |  |  |
| `progress` | number |  | 0~100 |

**호출 결과**: receiveDoc 응답 JSON 을 그대로 텍스트 content 로 반환 (`{ status, action, path, writtenAt }`).

## 사용 시나리오

Claude Code 에 등록 후 Claude 와의 대화에서:

> "지금 작업 중인 IAM 명세서 narnia 에 push 해줘"

→ Claude 가 자동으로 `narnia_push_doc` 호출 → 토폴로지에 즉시 노드 등장.

CI/배포 도구에서 직접 쓰려면 `project-narnia-client` (npm) 가 더 간단.

## 환경변수

| 변수 | 필수 | 설명 |
|---|---|---|
| `NARNIA_API_KEY` | ✅ | Bearer 토큰 평문 |
| `NARNIA_ACCOUNT_ID` | ✅ | 워크스페이스 id |
| `NARNIA_BASE_URL` | ✅ | Cloud Function 베이스 URL |
| `NARNIA_DEFAULT_PROJECT_ID` |  | 기본 컨테이너. 미지정 시 `"general"` |

## 라이선스

Apache-2.0 © Aslan Labs
