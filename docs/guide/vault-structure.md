# 볼트의 구조

볼트는 그냥 마크다운 폴더입니다. 특별한 것은 각 파일 맨 위의 frontmatter 뿐입니다.

```markdown
---
uid: 01890f3e-7b5d-4c0a-8f14-123456789abc
kind: capability
slug: token-issue
title: 토큰 발급
domain: auth
---

# 토큰 발급

로그인에 성공한 사용자에게 세션 토큰을 내준다.
```

## uid와 slug: 영구 정체성과 현재 주소

모든 노드는 두 식별자를 같이 가집니다.

| 필드 | 의미 | 바꾸어도 되나 | 주로 쓰는 곳 |
|---|---|---|---|
| `uid` | 그 노드 자체의 영구 정체성 | **안 됨** | MCP 정확 조회·핸드오프·출처·내보내기 URN |
| `slug` | 사람이 읽는 현재 주소 | rename으로 바꿀 수 있음 | 파일 경로·관계값·URL·CLI 그래프 명령 |
| `title` | 사람에게 보이는 이름 | 바꿀 수 있음 | 화면·검색·설명 |

`uid`는 작성기가 노드를 만들 때 한 번만 발급하는 **lowercase UUIDv4**입니다.
slug·title·파일 경로로부터 계산하지 않으며, 복사해서 새 노드에 재사용하지도
않습니다. `rename`과 `reclassify`는 UID를 보존합니다. `merge`는 남는
노드의 UID를 보존하고 흡수된 UID를 `merged_uids`에 기록하여 예전 UID
조회도 같은 노드로 이어지게 합니다.

```markdown
uid: 21890f3e-7b5d-4c0a-8f14-123456789abc
merged_uids:
  - 01890f3e-7b5d-4c0a-8f14-123456789abc
slug: token-issue
```

`merged_uids`는 `merge_concepts` 전용 이력입니다. 손으로 발급하거나 일반 patch로
고치지 마십시오. UID 중복·잘못된 형식·생존 UID의 자기 반복은 `validate`가
하드 오류로 막습니다.

이 규격은 무작위 UUIDv4를 정의한 [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562.html)와,
JSON-LD 노드 식별자가 IRI여야 한다는 [W3C JSON-LD 1.1](https://www.w3.org/TR/json-ld11/#node-identifiers)을
따릅니다. 내보낼 때는 `urn:uuid:<uid>`를 쓰므로 slug를 바꿔도 외부 정체성이
바뀌지 않습니다.

### UID 없는 기존 문서함을 v2로 바꾸기

읽는 순간 조용히 파일을 고치지 않습니다. Ontology Atlas 소스 체크아웃 루트에서
먼저 변경 대상을 미리 봅니다.

```bash
pnpm vault:migrate 2026-08-02-add-node-uids --vault /path/to/vault
```

검토한 뒤 같은 명령에 `--write`를 붙여 적용합니다. git 안의 문서함에 commit 안 된
Markdown이 있으면 변환을 거부하므로 먼저 commit하거나 stash해야 합니다. 올바른 기존
UID는 보존하고, 잘못됐거나 중복된 primary/merged UID는 첫 파일을 쓰기 전에 실패합니다.

## kind: 그 파일이 무엇인지

`kind` 가 그 파일이 무엇인지 정합니다. 위에서 아래로 갈수록 구체적입니다.

| kind | 뜻 | 예 |
|---|---|---|
| `project` | 최상위 산출물 | `auth-platform` |
| `domain` | 기능 묶음 | `auth`, `billing` |
| `capability` | 하나의 일관된 행동 | `token-issue` |
| `element` | 역량을 실현하는 구별되는 구현 역할 | `jwt-signer` |
| `document` | 그래프에 매인 설명 문서 | 이 가이드 |

## 관계

사람과 도구는 관계를 `contains` · `depends_on` · `broader` 같은 이름으로
읽습니다. Markdown frontmatter에서 `depends_on`의 정본 저장 키는
`dependencies:`입니다.

```markdown
---
uid: 11890f3e-7b5d-4c0a-8f14-123456789abc
kind: capability
slug: token-issue
title: 토큰 발급
domain: auth
dependencies: [jwt-signer, session-store]
---
```

**프로젝트 소속은 따로 적지 않습니다.** `contains` 사슬을 타고 자동으로 정해집니다.
`domain: auth` 라고만 써 두면 그 위의 프로젝트까지 알아서 이어집니다.
관계값에는 UID가 아니라 slug를 쓸 수 있어, 사람이 파일만 열어도 그래프를 읽을
수 있습니다. rename 도구가 이 관계값을 원자적으로 같이 바꿔 줍니다.

## 이름을 두 언어로

`display_ko` / `display_en` 을 쓰면 화면 언어에 맞는 이름이 지도와 목록에
그려집니다. `title` 은 검색·매칭의 진실원이라 바뀌지 않습니다.

**볼트가 쓰는 언어는 전부 채웁니다**. 한쪽만 채우면 다른 언어 사용자에게 원문이
그대로 노출됩니다.

## 어디에 두는가

보통은 다루는 저장소 안에 둡니다. 그러면 코드와 의미가 같은 커밋에 실려 같이
리뷰됩니다.

```
your-repo/
├── src/
└── docs/ontology/     ← 볼트
    ├── project.md
    ├── domains/
    ├── capabilities/
    └── elements/
```

이 저장소도 그렇게 합니다. `docs/ontology/` 에 자기 자신을 적어 두고, 그 파일들로
이 제품을 만듭니다.

## 진실원은 파일입니다

frontmatter 가 진실원입니다. 별도 승인 절차도, 동기화 버튼도 없습니다. 파일을
고치면 그게 곧 그래프입니다. 에이전트가 쓴 것도 마찬가지라 `git diff` 로 보이고,
마음에 안 들면 손으로 고치면 됩니다.
