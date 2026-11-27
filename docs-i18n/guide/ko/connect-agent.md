# MCP로 코딩 에이전트 연결하기

이 장에서는 Claude Code, Codex, Cursor, Antigravity 같은 코딩 에이전트를 MCP(Model
Context Protocol)로 온톨로지 폴더에 연결해요. 연결하고 나면 에이전트는 코드를
바꾸기 전에 코드베이스 온톨로지를 읽을 수 있고, 지도가 보여 주는 바로 그
마크다운 파일에 새 개념과 관계를 기록할 수 있어요.

## 에이전트는 폴더에 연결돼요

에이전트는 세션에 필요할 때 내 컴퓨터에서 Atlas MCP 서버를 띄우고, 세션이
끝나면 서버도 멈춰요. 서버는 온톨로지 폴더의 마크다운 파일을 읽고 써요. 포트를 열지
않고, 스스로 네트워크 요청을 하지도 않아요. 에이전트 자체는 평소처럼 자기 모델
제공자와 통신해요.

이 구조 덕분에 이런 점이 생겨요.

- Atlas 앱을 닫아 둬도 에이전트가 폴더를 읽을 수 있어요.
- 지도도 같은 파일을 읽으니, 에이전트가 쓴 내용이 지도에 바로 나타나요.
- 연결 정보는 폴더 안의 설정 파일이라서, 다른 변경처럼 `git diff`에 보여요.

## 앱에서 연결하기

1. 앱에서 온톨로지 폴더를 열어요.
2. 사이드바에서 **에이전트**를 고르고 **MCP** 탭으로 가요.
3. **에이전트에 이 폴더 연결** 아래에서 쓰는 도구 줄의 **연결**을 눌러요.

| 도구 | 버튼이 쓰는 파일 |
|---|---|
| Claude Code | `.mcp.json` |
| Codex | `.codex/config.toml` |
| Cursor | `.cursor/mcp.json` |
| Antigravity | `.agents/mcp_config.json` |

버튼마다 자기 도구의 파일만, 그 파일이 없을 때만 써요. 이미 있는 파일은 절대
덮어쓰지 않아요. 설정 파일은 앱 안에 든 MCP 서버를 가리키고 폴더의 절대 경로를
담고 있어서, Node.js나 Atlas 소스 코드가 따로 없어도 돼요.

`.mcp.json`이나 `.codex/config.toml`이 이미 있는데 Atlas가 만든 연결 파일이
아니라면, 그 줄에 경고가 뜨고 고친 설정을 복사할 수 있어요. 내용을 읽어 본 뒤
내 파일에 직접 합치세요.

그다음 에이전트를 종료했다가 다시 여세요. 에이전트는 세션을 시작할 때만 MCP
설정을 읽어요.

이 파일들은 앱만 써요. 폴더의 절대 경로를 아는 건 앱뿐이기 때문이에요.
ontologyatlas.com을 포함한 웹 페이지는 폴더를 열지 않고 아무것도 쓰지 않아요.
앱을 쓰지 않는다면 다음 절처럼 소스 체크아웃에서 서버를 실행하세요. 앱은
[여기서 내려받으세요](https://ontologyatlas.com/ko/download/).

## 소스 체크아웃에서 연결하기

Linux나 Intel Mac처럼 앱이 없는 환경에서는 저장소를 클론해서 서버를 실행해요. Git,
Node.js 24, pnpm이 필요해요.

```bash
git clone https://github.com/wlsdks/ontology-atlas ~/tools/ontology-atlas
cd ~/tools/ontology-atlas && pnpm install
pnpm --dir mcp install --frozen-lockfile
```

그다음 에이전트에 서버를 등록해요. Claude Code는 내 저장소 루트의 `.mcp.json`에서
읽고, stdio로 MCP 서버를 띄우는 다른 클라이언트도 같은 세 필드로 등록하면 돼요.

```json
{
  "mcpServers": {
    "ontology-atlas": {
      "command": "node",
      "args": ["/absolute/path/to/ontology-atlas/mcp/src/index.js"],
      "env": { "OATLAS_VAULT": "/absolute/path/to/your/atlas" }
    }
  }
}
```

절대 경로를 쓰세요. 설정 파일은 `~`를 풀어 주지 않아요. Codex는 서버를 전역으로
등록할 수도 있어요.

```bash
codex mcp add ontology-atlas --env OATLAS_VAULT=/absolute/path/to/your/atlas -- node /absolute/path/to/ontology-atlas/mcp/src/index.js
```

Codex는 그 폴더를 신뢰한다고 표시해야 프로젝트의 `.codex/config.toml`을
읽어요. 신뢰로 표시한 뒤 `codex mcp list`를 실행하면 `ontology-atlas`가 보여야
해요.

클라이언트에 읽기 권한만 주려면 `env`에 `"OATLAS_READ_ONLY": "1"`을 넣으세요.
그러면 서버는 읽기 도구만 내놓고, 모든 쓰기를 거부해요.

## 연결 확인하기

디스크에 설정 파일이 있다고 해서 에이전트가 그 파일을 불러왔다고 볼 수는
없어요. 에이전트를 다시 시작한 뒤 이렇게 물어보세요.

> connection_info를 호출하고, 어떤 온톨로지 폴더와 어떤 코드 저장소에
> 연결됐는지 알려 줘.

`connection_info`는 서버가 찾은 폴더와 저장소 경로, 그리고 서버가 제공하는
도구 목록을 돌려줘요. 폴더가 예상과 다르면 에이전트에게 쓰기를 맡기기 전에
설정부터 고치세요.

앱에서는 제목 옆의 **연결 확인**을 누르면 에이전트를 다시 시작하는 단계와
도구별 파일 상태가 나와요.

## 에이전트가 읽고 쓸 수 있는 것

정확한 목록은 서버가 내놓는 도구 목록을 보세요. 도구는 크게 몇 묶음으로 나뉘어요.

- **작업 전에 읽기:** `get_concepts`는 개념과 그 이웃을 돌려주고,
  `find_backlinks`는 그 개념을 가리키는 개념을 보여 줘요. `query_ontology`는
  두 개념이 어떻게 이어지는지(`path`) 보여 주고, 워크스페이스 개요나 변경의
  영향 같은 질문에 답해요.
- **코드 읽기:** `analyze_repo_structure`, `infer_imports`는 아무것도 쓰지
  않고 저장소를 훑어봐요.
- **쓰기:** `add_concepts`, `add_relations`, `patch_concept`, `rename_concept`,
  `merge_concepts`, `delete_concept` 등이 있어요. 이름 바꾸기, 합치기, 삭제,
  관계 제거는 먼저 변경 내용을 미리 보여 주고, 확인 값을 넣어 다시 호출해야
  실제로 써요.
- **점검:** `validate_vault`와 `compile_ontology`는 깨진 참조와 빠진 부분을
  알려 줘요.

모든 쓰기는 마크다운 변경으로 남아요. 에이전트가 파일을 읽을 때 받은
`expected_mtime`을 함께 보내면, 그사이 디스크에서 바뀐 파일은 쓰기 도구가
덮어쓰지 않아요. 보내지 않으면 그대로 써요.

## 여전히 내가 정하는 것

- **쓰기에 내 승인이 필요한지.** 외부 에이전트라면 그 에이전트의 권한 설정을
  따라요. 앱에 내장된 에이전트 대화에서는 **자동 승인**을 켜지 않는 한 쓰기마다
  먼저 물어봐요.
- **의미가 맞는지.** 쓰기에 성공했다고 그 의미까지 받아들여진 건 아니에요.
  커밋하기 전에 diff를 읽으세요.
- **에이전트가 무엇을 할지.** 지도에서 개념을 고르고 **프롬프트 복사**를
  누르면, 에이전트에게 붙여 넣을 수 있게 그 개념의 맥락이 복사돼요.

같은 화면의 **에이전트** 탭은 내 컴퓨터에서 찾은 코딩 도구를 보여 주고, 각
도구가 실행되는지 확인해요. 앱에서는 같은 MCP 서버를 쓰는 에이전트와 지도 옆에서
대화를 열 수도 있어요.

다음: [내 코드로 첫 지도 만들기](/guide/from-your-repo). 무엇이 컴퓨터 밖으로
나가는지는 [데이터·개인정보·안전](/guide/trust)을 보세요.
