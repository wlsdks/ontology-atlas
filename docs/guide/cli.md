# CLI

개발자의 일상 진입점입니다. 소스 체크아웃에서 실행합니다.

```bash
node cli/src/index.mjs --help
```

> 레지스트리에 발행된 패키지가 아니라서 `npx` 로는 실행되지 않습니다. 살아있는
> 경로는 **앱 번들**(에이전트 연결 버튼이 절대 경로로 설정을 써 줍니다)과
> **소스 체크아웃** 둘뿐입니다.

## 자주 쓰는 것

| 하고 싶은 일 | 명령 |
|---|---|
| 빈 저장소에 볼트 만들기 | `init` |
| 내 `.md` 를 볼트로 들이기 | `import <path...>` |
| frontmatter 무결성 검사 | `validate` |
| 그래프로 컴파일 | `compile` |
| 이름 바꾸기(백링크 포함) | `rename <old> <new>` |
| 누가 이걸 쓰나 | `backlinks <slug>` |
| 여길 고치면 어디가 흔들리나 | `blast-radius <slug>` |
| 두 노드가 어떻게 이어지나 | `path <from> <to>` |
| 고아 노드 찾기 | `orphans` |
| 순환 찾기 | `cycles` |
| 전체 건강 검진 | `health` |

전부 52개 명령이 있습니다. `--help` 가 목록을 냅니다.

## 커밋 전에

```bash
node cli/src/index.mjs preflight
```

frontmatter 가 깨졌거나 끊어진 관계가 있으면 커밋 전에 잡습니다.

## 에이전트에게 넘기기

```bash
node cli/src/index.mjs agent-brief
```

지금 볼트의 상태를 에이전트가 읽기 좋은 형태로 냅니다 — 세션을 새로 시작할 때
배경 설명을 다시 쓰는 대신 이걸 씁니다.
