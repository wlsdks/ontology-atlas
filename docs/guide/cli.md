# CLI

개발자의 일상 진입점입니다. 소스 체크아웃에서 실행합니다.

```bash
node cli/src/index.mjs --help
```

> 레지스트리에 발행된 패키지가 아니라서 `npx` 로는 실행되지 않습니다. 살아있는
> 경로는 **앱 번들**(에이전트 연결 버튼이 절대 경로로 설정을 써 줍니다)과
> **소스 체크아웃** 둘뿐입니다.

## 세 진입로가 같은 볼트를 본다

명령을 외우기 전에 이걸 먼저 알아 두면 나머지가 쉬워집니다.

| 진입로 | 쓰는 사람 |
|---|---|
| CLI | 사람 — 터미널에서 |
| MCP | AI 에이전트 — Claude Code · Codex · Cursor |
| 화면 | 사람 — [공방](/guide/studio) · [인사이트](/guide/insights) |

셋이 **같은 `.md` 폴더**를 봅니다. 그래프를 다루는 명령들은 실제로 MCP 서버를
감싸고 있어서, `blast-radius` 를 터미널에서 부르든 에이전트가 부르든 **같은
권한, 같은 답**입니다. 그래서 이 장의 표는 「무슨 명령이 있나」 가 아니라
**「지금 이 상황에서 무엇을 부르나」** 로 정리했습니다.

## 언제 무엇을 부르나

### 시작할 때

| 상황 | 명령 |
|---|---|
| 빈 저장소에 볼트를 만든다 | `init` (`--quick-start` 로 부트스트랩까지 한 줄) |
| 이미 있는 코드에서 노드를 뽑는다 | `bootstrap` — `analyze` + `infer-imports` 를 한 번에 |
| 무엇이 뽑힐지 먼저 본다 | `analyze` · `infer-imports` — **부작용 0**, 제안만 |
| 내가 쓰던 `.md` 를 들인다 | `import <path...>` |
| `CLAUDE.md` · `AGENTS.md` 를 노드로 접는다 | `absorb <file...>` |

`analyze` · `infer-imports` · `index` 는 `--apply` 를 붙이기 전에는 아무것도
쓰지 않습니다. **먼저 보고 나서 앉히는 것**이 이 세 명령의 기본 자세입니다.

### 코드를 고치는 중

| 알고 싶은 것 | 명령 |
|---|---|
| 이 개념이 뭐였더라 | `node <slug>` — 머리말 · 계보 · 드나드는 관계 한 화면 |
| 이 이름 쓰는 데가 어디지 | `backlinks <slug>` |
| 여길 고치면 어디가 흔들리나 | `blast-radius <slug>` |
| 이 둘이 어떻게 이어지나 | `path <from> <to>` · `explain <from> <to>` |
| 여기서 뻗어 나가면 어디까지 닿나 | `reachability <slug>` |
| 이런 조건의 노드만 보고 싶다 | `query "kind=capability AND has(elements)"` |
| 비슷한 게 이미 있나 | `similar "<title>"` |

이 줄들은 전부 **읽기**입니다. 아무것도 바꾸지 않으니 마음껏 부르십시오.

### 무언가를 쓰기 전

| 하려는 일 | 먼저 부를 것 | 그다음 |
|---|---|---|
| 관계 하나 잇기 | `relation-check <from> <to> <type>` | `relate` (`--dry-run` 지원) |
| 이름 바꾸기 | `backlinks` · `blast-radius` | `rename` (dry-run 기본) |
| 둘을 하나로 합치기 | `similar` | `merge` (dry-run 기본) |
| 지우기 | `backlinks` | `delete` |

**쓰기 명령에는 거의 항상 짝이 되는 읽기 명령이 있습니다.** 먼저 파장을 보고
나서 쓰는 것이 이 CLI 의 설계입니다. 자세한 절차와 실제 출력은
[볼트가 자란 뒤](/guide/growing-vault) 에 있습니다.

### 커밋 직전

```bash
node cli/src/index.mjs preflight --staged
```

스테이지된 파일을 볼트 노드로 해석해 이번 커밋이 무엇을 건드리는지 요약합니다.
아무것도 안 걸리면 조용히 넘어갑니다 — **막지 않습니다.**

볼트만 따로 커밋하려면 `snapshot` 입니다 (`--dry-run` 으로 먼저 보고).

### 뭘 할지 모르겠을 때

| 묻고 싶은 것 | 명령 |
|---|---|
| 이 볼트가 대체 어떻게 생겼나 | `overview` |
| 오늘 뭘 손봐야 하나 | `maintenance` |
| 어디가 더 자랄 수 있나 | `growth` |
| 어디가 중심인가 | `hubs` — PageRank · 다리 · 권위 · 허브 네 랭킹 |
| 지금 상황 + 다음 행동 한 화면 | `workspace-brief` |

같은 큐를 화면으로 보고 싶으면 [그래프 인사이트](/guide/insights) 가 같은
`maintenance_plan` 을 그립니다.

### 볼트를 못 믿겠을 때

| 의심 | 명령 |
|---|---|
| frontmatter 가 깨졌나 | `validate` — **코드 경로는 안 봅니다** |
| 근거로 적은 파일이 사라졌나 | `health` — 여섯 검사, 코드 경로까지 대조 |
| 아무도 안 가리키는 노드가 있나 | `orphans` |
| 「기대는 곳」 이 원을 그리나 | `cycles` |
| 그래프가 섬으로 쪼개졌나 | `components` |
| 에이전트 붙이는 설정이 맞나 | `mcp-verify` · `agent-setup` · `agent-files` |

`validate` 와 `health` 의 차이가 자주 헷갈립니다. **`validate` 는 문서만,
`health` 는 문서가 가리키는 코드까지** 봅니다. 리팩터링으로 파일이 사라진 뒤
`validate` 는 통과하는데 `health` 가 잡는 상황이 그래서 생깁니다.

### 에이전트에게 넘길 때 · 밖으로 꺼낼 때

| 하고 싶은 일 | 명령 |
|---|---|
| 새 세션에 배경을 넘긴다 | `agent-brief` (`--prompt` 로 붙여넣을 형태) |
| 결정적으로 컴파일한다 | `compile` (`--fix` 로 관계 배열 정규화) |
| 다른 도구로 가져간다 | `export --format jsonld\|graphml\|json` |

`agent-brief` 는 새 대화를 시작할 때마다 배경 설명을 다시 쓰는 일을 없애 줍니다.
[AI 에이전트 연결하기](/guide/connect-agent) 와 짝입니다.

## 알아 두면 편한 두 가지

**`--json` 이 거의 모든 명령에 있습니다.** 스크립트로 엮거나 결과를 다른
도구에 넘길 때 씁니다.

**큰 볼트에서 그래프 명령이 시간 초과가 나면** `OATLAS_CLI_MCP_TIMEOUT_MS` 로
한 번의 호출 대기 시간을 늘립니다. 그래프 명령들은 MCP 서버를 한 번 띄웠다
내리는 구조라 볼트가 커지면 첫 응답이 늦어질 수 있습니다.

## 전체 목록

52개입니다. `--help` 가 한 화면에 냅니다.

```bash
node cli/src/index.mjs --help
```
