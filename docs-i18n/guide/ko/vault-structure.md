# 온톨로지 폴더: 마크다운 파일과 맨 위 정보칸

Atlas 온톨로지는 평범한 마크다운 파일이 든 폴더예요. 코드베이스 지식 그래프의 개념 하나가 `.md` 파일 하나이고, 파일 맨 위의 YAML frontmatter가 그 개념이 무엇이고 다른 개념과 어떻게 이어지는지를 말해요. 이 장에서는 파일 형식, Atlas가 읽는 필드, 파일을 두는 위치를 보여 줘요. 뒤에 데이터베이스는 없어요. 파일이 곧 온톨로지예요.

## 개념 하나, 파일 하나

```markdown
---
uid: 7ec556ec-768d-40c3-8147-19db4287a338
slug: capabilities/token-issue
kind: capability
title: Token issuance
display_en: Token issuance
domain: domains/auth
elements: [elements/jwt-signer]
path: src/auth/issue-token.ts
dependencies: [capabilities/session-store]
relation_notes: { capabilities/session-store: "세션을 기록한 뒤에만 토큰을 발급한다." }
---

로그인에 성공하면 취소할 수 있는 세션 토큰을 발급한다.

## Includes
- 토큰에 서명하고 돌려준다.

## Excludes
- 비밀번호 확인. 이건 자격 증명 검증에 속한다.
```

frontmatter는 그래프예요. 종류, 이름, 부모, 관계가 들어가요. 본문은 사람이나 에이전트가 읽는 의미예요. 정의, 개념이 포함하는 것과 제외하는 것, 근거, 아직 불확실한 것이 들어가요.

## 필드

| 필드 | 담는 것 |
|---|---|
| `uid` | 영구 식별자. 소문자 UUIDv4예요. 절대 바뀌지 않아요. |
| `slug` | 지금 쓰는 읽기 쉬운 주소. `capabilities/token-issue` 같은 형태예요. 관계는 slug를 가리켜요. 이름을 바꿀 수 있어요. |
| `kind` | `project`, `domain`, `capability`, `element`, `document` 중 하나. [개념 고르기](/guide/what-becomes-a-node)를 보세요. |
| `title` | 정식 이름. 검색과 매칭은 모든 언어에서 이 이름을 써요. |
| `display_<locale>` | 그 언어 화면에 보이는 이름. 예를 들어 `display_en`, `display_ko`. |
| `display` | `title`이 길 때 라벨에 쓰는 짧은 이름(선택). |
| `description` | 한 줄 요약(선택). |
| `domain` | 역량이나 요소의 부모 도메인. 있어야 하는 필드라서, 없으면 경고가 나와요. |
| `path` | 역량이나 요소에서, 처음 보는 사람이 가장 먼저 열어 봐야 할 파일이나 폴더 하나. |
| 관계 키 | `domains`, `capabilities`, `elements`, `dependencies`, `relates`, `broader`, `contains`, `describes`. [개념 사이의 관계](/guide/relations)를 보세요. |
| `relation_notes` | 관계마다 그 관계가 왜 성립하는지 적은 한 문장. 대상의 slug를 키로 써요. |
| `created_by` | 파일을 만든 주체. `human`, 또는 `agent:` 뒤에 에이전트 이름. |
| `review_state` | 선택. `human_decides`는 사람만 결정할 수 있는 개념을 표시하고, `confirmed`는 사람이 의미를 확인했다는 기록이에요. |

`uid`, `slug`, `kind`, `title`은 모든 개념에 꼭 있어야 해요. 역량이나 요소에 `domain`이 없으면 오류가 아니라 경고라서, 덜 만든 폴더도 열려요.

### 정체: uid와 slug

개념을 만드는 쪽(앱, MCP 서버, CLI)이 `uid`를 한 번 발급해요. 내가 고르는 값이 아니에요. 개념 이름을 바꾸면 `slug`가 바뀌고 그 개념을 가리키는 모든 관계도 다시 쓰이지만, `uid`는 그대로예요. 두 개념을 합치면 남는 쪽의 `uid`를 유지하고 흡수된 쪽은 `merged_uids`에 기록해서, 예전 `uid`로도 맞는 개념을 찾을 수 있어요. `merged_uids`는 손으로 쓰지 마세요.

관계와 링크를 쓸 때는 slug를 쓰세요. 사람이 파일에서 읽는 게 slug예요. 이름이 바뀐 뒤에도 같은 개념을 가리켜야 하는 도구나 작업 인계에는 `uid`를 쓰세요.

### 여러 언어로 된 이름

지도, 목록, 패널은 화면 언어에 맞는 `display_<locale>`이 있으면 그걸 보여 주고, 없으면 정식 이름을 보여 줘요. `title`은 모든 언어에서 같아서, 검색과 매칭이 번역에 좌우되지 않아요. 팀이 두 언어로 지도를 읽는다면 두 이름을 모두 채우세요. 하나가 비어 있으면 다른 언어의 이름이 대신 나와요.

## 파일을 두는 곳

온톨로지 폴더는 그 폴더가 설명하는 저장소 안에 두세요. 그래야 코드 변경과 그에 맞는 의미 변경을 같은 풀 리퀘스트에서 리뷰할 수 있어요. 이 저장소는 자기 온톨로지를 `docs/ontology/`에 둬요.

```text
your-repo/
├── src/
└── docs/ontology/
    ├── project.md          프로젝트 (kind: project)
    ├── domains/            도메인마다 파일 하나
    ├── capabilities/       역량마다 파일 하나
    ├── elements/           요소마다 파일 하나
    ├── sources/            원본 자료. 개념이 되지 않아요
    └── .ontology-atlas/    앱이 온톨로지 옆에 두는 파일
```

프로젝트와 문서는 폴더 맨 위에 두고, 도메인·역량·요소는 각자의 폴더에 둬요. 관례상 파일 경로는 slug를 따르지만, Atlas가 믿는 주소는 frontmatter의 `slug:`예요. 종류 폴더 아래의 slug는 평평해야 해요. `elements/jwt-signer`는 되고, `elements/src/auth/jwt-signer`는 안 돼요. 코드 위치는 `path`에 적어요.

`sources/` 아래 파일은 위키 문서가 인용하는 문서 같은 원본 자료이고, 개념으로 읽히지 않아요. `.ontology-atlas/`에는 검토 결과나 코드 폴더 연결처럼 앱이 온톨로지 옆에 쓰는 파일이 들어가요. Atlas가 그 연결을 처음 쓸 때 거기에 `.gitignore`도 함께 넣어서, 이 폴더는 Git에 들어가지 않아요.

Atlas 소스 체크아웃에서 명령줄로 폴더를 시작하려면 이렇게 해요.

```bash
node cli/src/index.mjs init docs/ontology
node cli/src/index.mjs validate docs/ontology
```

`validate`는 깨진 참조, 알 수 없는 종류, 잘못된 식별자를 알려 줘요. 대부분은 작업을 막지 않는 경고이고, `uid` 중복은 오류예요. 다른 명령은 [CLI와 MCP의 관계](/guide/cli)에 정리돼 있어요.

## 파일이 곧 진실이에요

Atlas는 매번 파일에서 온톨로지를 읽어요. 편집기에서든, CLI로든, 에이전트를 통해서든 파일을 고치면 지도가 몇 초 안에 변경을 반영해요. 동기화 버튼도, 숨은 상태도 없어요. 에이전트가 한 변경까지 모든 변경은 `git diff`의 한 줄이고, 리뷰하고 남기거나 되돌릴 수 있어요.

다음: [개념 고르기](/guide/what-becomes-a-node).
