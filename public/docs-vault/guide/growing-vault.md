# 볼트가 자란 뒤

노드가 스무 개일 때는 아무 문제도 없습니다. 문제는 이백 개가 되고, 세 사람이
같이 쓰고, 에이전트가 매일 몇 개씩 더할 때 나타납니다.

> 같은 걸 두 번 만든 것 같은데 어디 있지? 이 이름 바꾸면 뭐가 깨지나? 이제
> 뭘 손봐야 하는지 어떻게 아나?

이 장은 그 뒤의 일입니다.

## 1. 가장 흔한 고장은 중복이다

볼트가 자라면서 생기는 1번 실패 모드는 **같은 개념을 두 번 만드는 것**입니다.
「사용자 인증」과 「로그인 처리」가 따로 살면 관계가 둘로 갈리고, 어느 쪽을 봐야
할지 아무도 모르게 됩니다.

**만들기 전에 물어보십시오.**

```bash
node cli/src/index.mjs similar "지도 렌더링" my-vault
```

```
similar to: 지도 렌더링 — 3 matches

  1  0.158  element     elements/topology-map-v2      — Topology Map V2
       signals: title 0.09 · slug 0.07
  2  0.087  domain      domains/topology-navigation   — Topology Map Navigation
```

이미 있으면 새로 만들지 말고 **있는 것을 고칩니다.** MCP 로 붙은 에이전트는 이걸
따로 부를 필요도 없습니다. 제목이 비슷한 노드가 이미 있으면 `add_concept` 응답에
경고가 같이 옵니다.

이미 둘로 갈라진 뒤라면 접습니다.

```bash
node cli/src/index.mjs merge capabilities/guided-tour capabilities/topology-browsing --vault my-vault
```

```
dry-run  capabilities/guided-tour → capabilities/topology-browsing
         (1 file(s) would change, capabilities/guided-tour.md will be deleted)

  domains/onboarding-and-shell — Onboarding, Distribution & App Shell
    capabilities changed

re-run with --confirm to apply.
```

**기본이 dry-run 입니다.** 무엇이 바뀌는지 먼저 보고, `--confirm` 을 붙여야
실행됩니다.

병합해도 정체성 이력은 끊기지 않습니다. 남는 노드의 `uid`는 그대로이고,
사라지는 노드의 `uid`와 기존 `merged_uids`는 남는 노드의
`merged_uids`로 흡수됩니다. 예전 UID를 저장한 에이전트 핸드오프도 같은
노드를 찾습니다.

## 2. 이름 바꾸기: 백링크는 알아서 따라온다

이름을 바꿀 때 무서운 건 그 이름을 부르던 곳들입니다. 손으로 고치면 반드시
하나를 빠뜨립니다.

```bash
node cli/src/index.mjs rename capabilities/guided-tour capabilities/tour --vault my-vault
```

```
dry-run  capabilities/guided-tour → capabilities/tour (1 file(s) would change)

  domains/onboarding-and-shell — Onboarding, Distribution & App Shell
    capabilities changed

re-run with --confirm to apply.
```

`.md` 파일을 옮기고 **그 슬러그를 가리키던 모든 frontmatter 를 함께 고칩니다.**
관계에 붙여 둔 이유 메모(`relation_notes`)의 키까지 따라갑니다.
`slug`는 바뀌지만 `uid`는 바뀌지 않습니다. 이 차이 때문에 이름과 파일이
바뀌어도 에이전트·내보내기·출처 이력은 같은 개념으로 인식합니다.

바꾸기 전에 파장을 보고 싶으면:

```bash
node cli/src/index.mjs backlinks capabilities/mcp-server my-vault
node cli/src/index.mjs blast-radius capabilities/mcp-server my-vault
```

`blast-radius` 는 이렇게 답합니다.

```
capabilities/mcp-server — blast radius (depth 2, incoming)
  risk medium · 6 노드 · 9 관계 · 0 cross-domain

affected by kind
  capability 2 · element 2 · domain 1 · project 1
```

## 3. 다음에 뭘 할지는 큐가 말한다

「이제 뭘 손봐야 하지」 를 사람이 눈으로 찾을 필요가 없습니다.

```bash
node cli/src/index.mjs maintenance my-vault
```

```
maintenance plan — 8 remaining / 8 filtered / 8 total
summary: compileIssues:0, cycles:0, canonicalize:0, dangling:0, relations:0
buckets: phase review:8 · severity info:8 · kind capability_without_evidence:8

  [info] maint_b4dc8feb  review/capability_without_evidence · score 0.5
     "capabilities/app-update" 에 정본 `path:`도 실제 element 관계도 없어,
     이 행동이 코드 어디에 사는지 볼트가 말하지 못합니다. …
```

**행 하나가 곧 할 일 하나**이고, 각 행이 무엇을 하라는지 문장으로 말합니다.
줄이 많으면 좁힙니다.

```bash
node cli/src/index.mjs maintenance my-vault --kinds capability_without_evidence --limit 5
```

자라날 자리를 보고 싶으면 `growth` 가 짝입니다. 이쪽은 고장이 아니라 **비어
있는 연결**을 냅니다.

## 4. 전체 검진

```bash
node cli/src/index.mjs health my-vault
```

```
vault health healthy — 70 노드 · 152 관계

  ✓ compile_issues            Compiled ontology artifact has no compiler issues.
  ✓ unresolved_edges          Every internal edge resolves to a known node.
  ✓ dependency_cycles         No directed dependency cycles were detected.
  ✓ relation_recommendations  No safe containment suggestions are pending.
  ✓ components                The actionable graph is connected.
  ✓ vault_validation          Vault schema and graph references validate cleanly.
```

여섯 검사가 각각 무엇을 보는지 이름으로 말합니다. 필요한 것만 따로 볼 수도
있습니다.

| 명령 | 답하는 질문 |
|---|---|
| `validate` | frontmatter 와 참조가 성립하는가 |
| `orphans` | 아무도 가리키지 않는 노드가 있는가 |
| `cycles` | 「필요한 항목」 관계가 원을 그리는가 |
| `components` | 그래프가 섬으로 쪼개졌는가 |
| `overview` | 지금 볼트가 어떤 모양인가 |

`health` 는 **코드 경로까지 대조**합니다. `validate` 는 frontmatter 만 봅니다.
근거로 적어 둔 파일이 리팩터링으로 사라졌으면 `health` 가 잡습니다.

## 5. 여럿이 같이 쓰기

**볼트는 저장소 안에 있고, 진실원은 파일입니다.** 그래서 협업 기제가 따로 필요
없습니다. 이미 쓰고 있는 그것입니다.

- 개념 변경은 `.md` 한 줄 diff 로 보입니다. 코드 리뷰에서 같이 봅니다.
- 충돌 해소는 텍스트 충돌 해소입니다. 특별한 도구가 없습니다.
- 되돌리기는 `git revert` 입니다.

커밋 전에 이번 변경이 볼트의 무엇을 건드리는지 보려면:

```bash
node cli/src/index.mjs preflight --staged
```

스테이지된 파일을 볼트 노드로 해석해 영향 범위를 요약합니다. 아무것도 안 걸리면
조용히 넘어갑니다.

볼트만 따로 커밋하고 싶으면:

```bash
node cli/src/index.mjs snapshot my-vault --dry-run
```

볼트 폴더 범위의 커밋을 의미 요약과 함께 만듭니다. 바뀐 게 없으면 「스냅샷할 변경
없음」 이라고 말하고 끝냅니다.

## 6. 동시에 고칠 때: 조용한 덮어쓰기 막기

사람이 편집기에서 파일을 고치는 동안 에이전트가 같은 파일을 쓰면, 한쪽이 소리
없이 사라질 수 있습니다. 쓰기 도구들이 이걸 막는 장치를 갖고 있습니다.

1. `get_concept` 이 그 파일의 `mtime` 을 같이 돌려줍니다.
2. 쓸 때 그 값을 `expected_mtime` 으로 넘깁니다.
3. 그 사이 파일이 바뀌었으면 **덮어쓰지 않고 충돌 오류를 냅니다.**

에이전트에게 볼트를 맡길 생각이라면 이 한 가지는 알고 계시는 편이 좋습니다.
"에이전트가 내 편집을 날렸다" 는 사고가 이 값 하나로 막힙니다.

## 7. 지우기

```bash
node cli/src/index.mjs delete elements/old-thing --vault my-vault
```

**백링크가 남아 있으면 거부합니다.** 가리키는 곳이 있는데 지우면 그 참조들이
이름만 남은 유령이 되기 때문입니다. 정말 지우려면 가리키던 쪽을 먼저 정리하거나,
`--force` 로 그 판단을 직접 지십시오.

기본 writer는 삭제된 UID를 의도적으로 다시 발급하지 않습니다. 다만 현재 범위에는
별도 tombstone 장부가 없으므로, 현재 vault만 검사해서 사람이 과거 UID를 수동으로
재사용했는지 증명할 수는 없습니다. 삭제 후 구 UID 조회는 `not found`가 정상이며,
이력을 이어야 한다면 삭제가 아니라 `merge`를 쓰십시오.

## 정리

- 중복이 1번 고장입니다. 만들기 전에 `similar`, 이미 갈라졌으면 `merge`.
- `rename` 은 **백링크를 전부 다시 씁니다.** 손으로 고치지 마십시오.
- `uid`는 영구 정체성, `slug`는 바꿀 수 있는 현재 주소입니다.
- `rename` · `merge` · `delete` · `snapshot` 은 **dry-run 이 기본**입니다.
- 다음 할 일은 `maintenance`, 자랄 자리는 `growth`, 전체는 `health`.
- 협업 기제는 **git 그 자체**입니다. 동시 편집만 `expected_mtime` 이 지킵니다.

명령 전체 목록은 [CLI](/guide/cli) 에 있습니다.
