# 볼트의 구조

볼트는 그냥 마크다운 폴더입니다. 특별한 것은 각 파일 맨 위의 frontmatter 뿐입니다.

```markdown
---
kind: capability
slug: token-issue
title: 토큰 발급
domain: auth
---

# 토큰 발급

로그인에 성공한 사용자에게 세션 토큰을 내준다.
```

## kind — 그 파일이 무엇인지

`kind` 가 그 파일이 무엇인지 정합니다. 위에서 아래로 갈수록 구체적입니다.

| kind | 뜻 | 예 |
|---|---|---|
| `project` | 최상위 산출물 | `auth-platform` |
| `domain` | 기능 묶음 | `auth`, `billing` |
| `capability` | 하나의 일관된 행동 | `token-issue` |
| `element` | 구체적인 조각 (파일·라이브러리·스키마) | `jwt-signer.ts` |
| `document` | 그래프에 매인 설명 문서 | 이 가이드 |

## 관계

관계는 `contains` · `depends_on` · `broader` 같은 키로 씁니다.

```markdown
---
kind: capability
slug: token-issue
domain: auth
depends_on: [jwt-signer, session-store]
---
```

**프로젝트 소속은 따로 적지 않습니다.** `contains` 사슬을 타고 자동으로 정해집니다.
`domain: auth` 라고만 써 두면 그 위의 프로젝트까지 알아서 이어집니다.

## 이름을 두 언어로

`display_ko` / `display_en` 을 쓰면 화면 언어에 맞는 이름이 지도와 목록에
그려집니다. `title` 은 검색·매칭의 진실원이라 바뀌지 않습니다.

**볼트가 쓰는 언어는 전부 채웁니다** — 한쪽만 채우면 다른 언어 사용자에게 원문이
그대로 노출됩니다.

## 어디에 두는가

보통은 다루는 저장소 안에 둡니다 — 그러면 코드와 의미가 같은 커밋에 실려 같이
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
