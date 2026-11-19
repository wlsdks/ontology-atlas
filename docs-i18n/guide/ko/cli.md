# CLI와 MCP의 관계

이 장에서는 Ontology Atlas 명령줄 도구(CLI)를 다뤄요. 실행하는 법, 매일 쓰는
명령, 그리고 Claude Code나 Codex 같은 코딩 에이전트가 호출하는 MCP 서버와 엔진
하나를 함께 쓰는 방식이에요. CLI가 하는 일은 모두 지도가 보여 주는 바로 그
마크다운 온톨로지 폴더를 대상으로 해요.

## 소스 체크아웃에서 실행하기

npm 패키지가 없어서 `npx`로는 안 돼요. CLI는 저장소를 클론해서 실행하고, Git,
Node.js 24, pnpm이 필요해요. 클론은 설명하려는 저장소 바깥에 두세요.

```bash
git clone https://github.com/wlsdks/ontology-atlas ~/tools/ontology-atlas
cd ~/tools/ontology-atlas && pnpm install
pnpm --dir mcp install --frozen-lockfile
```

`mcp` 폴더에는 자체 lockfile이 있어서 설치 명령 두 줄이 모두 필요해요. 그다음
어떤 명령이든 `node`로 실행해요.

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs --help
```

`atlas`라고만 치고 싶다면, `install-shim`이 이 클론을 가리키는 한 줄짜리
실행 파일을 `~/.local/bin/atlas`에 써 줘요. 쓰기 전에 내용을 출력해 보여 주고,
`install-shim --uninstall`로 지울 수 있어요.

에이전트를 연결하는 데 CLI가 꼭 필요하지는 않아요. 데스크톱 앱에는 MCP 서버가
들어 있고 에이전트 설정도 대신 써 줘요
([MCP로 코딩 에이전트 연결하기](/guide/connect-agent) 참고).

## 엔진 하나, 입구 셋

| 입구 | 쓰는 사람 |
|---|---|
| 앱이나 웹사이트의 지도 | 사람 |
| MCP 도구 | 코딩 에이전트 |
| CLI | 터미널의 사람과 스크립트 |

`backlinks`, `blast-radius`, `rename`, `relate` 같은 그래프 명령은 호출 한 번을
위해 MCP 서버를 띄웠다가 다시 멈춰요. 그래서 터미널에서 친 명령과 에이전트가
호출한 같은 도구는 같은 답을 내고, 같은 쓰기 규칙을 따라요. 폴더가 커서 이
명령들이 시간 초과로 끝난다면 `OATLAS_CLI_MCP_TIMEOUT_MS`로 대기 시간을 늘리세요.

## 시작할 때 쓰는 명령

| 할 일 | 명령 |
|---|---|
| 시작 파일과 에이전트 설정이 든 온톨로지 폴더 만들기 | `init ./atlas` |
| 기존 폴더의 에이전트 설정 고치기 | `agent-setup ./atlas --write` |
| MCP 서버가 뜨고 응답하는지 확인하기 | `mcp-verify ./atlas` |
| 저장소에서 개념 후보 미리 보기 | `bootstrap . --vault ./atlas` |
| `CLAUDE.md`나 `AGENTS.md`를 개념으로 바꾸기 | `absorb CLAUDE.md --vault ./atlas` |
| 기존 마크다운 파일 가져오기 | `import <path...> --vault ./atlas` |

`bootstrap`, `analyze`, `index`, `infer-imports`는 미리 보기만 해요. 개념을 쓰지
않고, `bootstrap`은 아직 승인이 필요하다는 뜻으로 종료 코드 3을 내요. 개념 자체는
내가 검토하는 에이전트가 만들어요.
[내 코드로 첫 지도 만들기](/guide/from-your-repo)에서 설명해요.

## 찾아볼 때 쓰는 명령

읽기만 하니까 마음껏 실행해도 돼요.

| 질문 | 명령 |
|---|---|
| 이 개념은 무엇이고, 무엇과 이어져 있나요? | `node <slug> ./atlas` |
| 무엇이 이 개념을 가리키나요? | `backlinks <slug> --vault ./atlas` |
| 이게 바뀌면 무엇이 영향을 받을 수 있나요? | `blast-radius <slug> --vault ./atlas` |
| 두 개념은 어떻게 이어져 있나요? | `path <from> <to> --vault ./atlas` |
| 비슷한 게 이미 있나요? | `similar "<title>" ./atlas` |
| 어떤 개념이 조건에 맞나요? | `query "kind=capability AND has(elements)" --vault ./atlas` |
| 폴더 전체는 어떤 모습인가요? | `overview ./atlas` |
| 다음에 무엇을 고쳐야 하나요? | `maintenance ./atlas` |

## 쓰는 명령

| 할 일 | 명령 | 기본 동작 |
|---|---|---|
| 개념 더하기 | `add <kind> <slug> --title "..." --vault ./atlas` | 씀 |
| 관계 더하기 | `relate <from> <to> <type> --why "..." --vault ./atlas` | 씀. `--dry-run`은 미리 보기 |
| 관계 지우기 | `remove-relation <from> <to> <type>` | 씀. `--dry-run`은 미리 보기 |
| 개념과 그 참조의 이름 바꾸기 | `rename <old> <new> --vault ./atlas` | 미리 보기. `--confirm`으로 적용 |
| 두 개념 합치기 | `merge <from> <into> --vault ./atlas` | 미리 보기. `--confirm`으로 적용 |
| 개념 지우기 | `delete <slug> --vault ./atlas` | 미리 보기. 참조가 남아 있으면 거부 |

쓰기 전마다 짝이 되는 읽기 명령을 먼저 실행하세요. `relation-check`는 `relate`
전에 관계가 스키마에 맞는지 확인하고, `backlinks`는 이름 바꾸기나 삭제가 무엇을
건드릴지 보여 줘요.

## 점검할 때 쓰는 명령

| 질문 | 명령 |
|---|---|
| 마크다운이 올바르고 참조가 풀리나요? | `validate ./atlas` |
| 인용한 소스 파일이 아직 있고, 그래프가 멀쩡한가요? | `health ./atlas` |
| 아무것도 가리키지 않는 개념은 무엇인가요? | `orphans ./atlas` |
| 의존이 순환하나요? | `cycles ./atlas` |
| 스테이징한 파일이 어떤 개념을 건드리나요? | `preflight ./atlas --staged` |

`validate`는 온톨로지 폴더만 읽어요. `health`는 인용된 경로를 코드와도 비교해서,
리팩터링으로 근거가 사라진 개념을 잡아내요. `validate`는 오류를 찾으면 종료 코드
1을 내서 CI에 넣기 좋아요. `preflight`는 커밋을 막지 않아요.

## 에이전트와 공유에 쓰는 명령

| 할 일 | 명령 |
|---|---|
| 새 에이전트 세션에 시작 맥락 넘기기 | `agent-brief ./atlas` |
| 상태와 다음 할 일을 한 화면에서 보기 | `workspace-brief ./atlas` |
| 온톨로지 폴더만 요약과 함께 커밋하기 | `snapshot ./atlas` |
| 그래프 내보내기 | `export ./atlas --format jsonld` (또는 `graphml`, `json`) |

`agent-brief`는 폴더에 손볼 곳이 남아 있는 동안, 예를 들어 `init` 직후에는 종료
코드 1을 내요. 그래도 출력은 빠짐없이 나와요. `snapshot`은 로컬 커밋만 해요.
브랜치에 이미 설정된 upstream으로 보내려면 `--push`를, 미리 보려면 `--dry-run`을
붙이세요.

거의 모든 명령이 스크립트용 `--json`을 받아요. 모든 옵션이 담긴 전체 목록은
도움말에 있어요.

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs --help
```

코드가 바뀌는 동안 이 명령들로 지도를 최신으로 유지하는 법은
[코드가 바뀔 때 지도 최신으로 유지하기](/guide/growing-vault)를 보세요.
