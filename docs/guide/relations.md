# 관계는 어떻게 생기나

지도를 처음 열면 가운데 허브에서 도메인이 방사형으로 뻗어 나갑니다. 그 모양만
보면 이런 의문이 듭니다.

> 도메인끼리는 서로 아무 관계도 못 갖나? 이 구조는 미리 설계된 데이터를
> 조회하는 것뿐인가? 관계는 DB 에 들어 있나, md 에 들어 있나?

세 질문에 차례로 답합니다.

저장 키·화면 이름·MCP query/write 지원 범위·방향·endpoint kind·inverse·추론
경계의 정본은
[Atlas 메타모델 명세](../ONTOLOGY-ATLAS-SPEC.md#5-relation-types-and-their-semantics)입니다.
이 장은 그 표를 복제하지 않고 사람이 지도와 Markdown에서 관계를 읽는 법만
설명합니다.

## 1. 도메인끼리 관계, 생깁니다

방사형으로 보이는 건 **구조(담김) 관계**뿐입니다. 그 위에 **의미 관계**가 따로
얹히고, 그건 계층을 자유롭게 가로지릅니다.

이 저장소는 자기 자신을 볼트로 들고 있어서(`docs/ontology/`) 실제로 세어 볼 수
있습니다.

```bash
node cli/src/index.mjs overview --vault docs/ontology
```

관계 종류 분포가 이렇게 나옵니다. **여기 수를 옮겨 적지 않습니다.** 볼트는
누가 노드를 더할 때마다 자라서, 문서에 적힌 순간부터 낡기 시작합니다. 직접
돌려서 자기 볼트의 수를 보십시오.

관계 키는 둘로 나뉩니다.

| 관계 키 | 무엇인가 |
|---|---|
| `elements` · `capabilities` · `domains` · `domain` | **구조**: 무엇이 무엇을 담는가 |
| `relates` · `dependencies` | **의미**: 비슷한 것, 기대고 있는 것 |
| `describes` | 문서가 가리키는 대상 |

구조만 있으면 트리이고, **의미 관계가 하나라도 붙는 순간 그래프**가 됩니다.
그 둘은 계층을 가로지를 수 있기 때문입니다.

도메인 사이만 따로 보려면:

```bash
node cli/src/index.mjs domain-matrix --vault docs/ontology
```

어느 도메인 쌍이 서로 이어져 있는지 표로 나옵니다.

### 도메인이 도메인을 직접 가리키는 법

도메인 문서의 frontmatter 에 상대 도메인의 슬러그를 그냥 적습니다.

```markdown
---
uid: 31890f3e-7b5d-4c0a-8f14-123456789abc
slug: domains/onboarding-and-shell
kind: domain
title: "Onboarding, Distribution & App Shell"
relates: [domains/topology-navigation]
---
```

반대쪽에서도 마주 볼 수 있습니다. `relates` 는 방향이 없어서 한쪽만 적어도
같은 한 줄이고, 양쪽에 적어도 지도는 왕복을 한 줄로 접습니다.

```markdown
---
uid: 41890f3e-7b5d-4c0a-8f14-123456789abc
slug: domains/topology-navigation
kind: domain
relates:
  - domains/onboarding-and-shell    # 도메인 → 도메인
---
```

이게 질문에 대한 가장 짧은 답입니다. **도메인은 다른 도메인을 그냥 이름으로
가리키면 됩니다.** 계층을 거슬러 올라갈 필요도, 중간에 뭘 만들 필요도 없습니다.

## 2. 트리 위에 얹히는 그래프

구조와 의미는 같은 지도 위에 있지만 **다른 층**입니다.

```
         project
            │
   ┌────────┴────────┐
   │                 │
domain A ┄┄┄┄┄┄┄ domain B    ← relates
   │                 │
capability ┄┄┄┄> capability   ← depends_on
   │                 │
element           element

│  실선 = 구조(담김)
┄  파선 = 의미(관계)
```

실선은 "누가 누구를 담는가" 이고, 파선은 "누가 누구에게 기대는가 / 무엇과 함께
읽어야 하는가" 입니다. 파선은 층을 건너뛰어도 되고, 도메인을 가로질러도 됩니다.

## 3. 저장은 DB 가 아니라 마크다운입니다

별도의 데이터베이스·동기화 버튼·서버가 없습니다. **관계는 `.md` 파일 맨 위
frontmatter 의 한 줄**이며 관계를 추가할 때 DB migration은 없습니다. 단 UID 없는
v1 문서함을 v2로 바꾸는 명시적 파일 migration은 [폴더의 구조](/guide/vault-structure)에
따릅니다.

### 관계를 선언하는 쪽

역량 문서 하나를 예로 들면 이렇게 생겼습니다.

```markdown
---
uid: 51890f3e-7b5d-4c0a-8f14-123456789abc
slug: capabilities/vault-live-updates
kind: capability
title: Vault live updates
domain: domains/local-vault-management
dependencies:
  - capabilities/topology-canvas-render   # 기댄다 (방향)
relates:
  - capabilities/mcp-conflict-guard       # 함께 읽는다 (대칭)
---

폴더가 바뀌면 지도가 따라 바뀐다.
```

### 관계를 받는 쪽

볼트 안의 `capabilities/topology-canvas-render.md` 는 **아무것도 적지
않습니다.**

```markdown
---
uid: 61890f3e-7b5d-4c0a-8f14-123456789abc
slug: capabilities/topology-canvas-render
kind: capability
title: Topology canvas render
domain: views
---

캔버스 2D 로 지도를 그린다.
```

관계는 **한쪽에만 적으면 됩니다.** 받는 쪽은 역방향 링크(backlink)로 자동으로
알게 됩니다. 양쪽에 적어도 되지만(위의 두 도메인이 그랬습니다) 지도는 그 왕복을
한 줄로 접어서 그립니다.

> 그래서 세는 기준이 둘입니다. `overview` 가 말하는 수는 *적힌 참조* 수이고,
> 지도가 그리는 선은 왕복을 접은 수라 더 적습니다. 같은 그래프를 다르게 센 것이지
> 둘 중 하나가 틀린 게 아닙니다.

### 관계 키 표

정확한 대응은 위 명세 §5 표 하나만 유지합니다. 여기서 기억할 것은 세 층이
같은 이름 집합이 아니라는 점입니다.

- Markdown은 `dependencies:`를 저장하고 MCP writer는 `depends_on`을 받습니다.
- Markdown의 `broader:`는 화면에서 `is_a`로 보이지만, 현재 공개 MCP relation
  query/write enum에는 둘 다 없습니다. 기존 노드를 바꿀 때는 `get_concept`의
  `mtime`과 전체 post-change `broader` 배열을 넣은 `patch_concept` 뒤
  `validate_vault`를 사용합니다.
- `relates`는 대칭 의미지만 reciprocal frontmatter를 자동으로 쓰지 않습니다.
- backlink와 경로 탐색은 읽기 파생이지 inverse/transitive 관계를 새로 만드는
  추론이 아닙니다. 빠진 관계는 `unknown`/visible gap이지 거짓이 아닙니다.

### 지도에서 선의 문법

관계의 종류가 선 모양으로 보입니다.

| 선 | 뜻 |
|---|---|
| 실선 | 구조: 담김 |
| 파선 + 굵기 테이퍼 (시작 굵고 끝 얇음) | 방향 있는 화면 관계 (`depends_on` · frontmatter `broader`에서 파생한 `is_a`) |
| 파선 + 균일한 굵기 | 대칭 관계 (`relates`) |

테이퍼가 **없다는 사실 자체가** "이 관계는 양끝이 대등하다" 는 정보입니다.
`relates` 에 화살표를 그리면 없는 인과를 주장하게 되므로 그리지 않습니다.

### 진실원은 파일이라 `git diff` 로 보입니다

관계를 하나 더하는 건 파일 한 줄을 고치는 일입니다.

```diff
  dependencies:
    - capabilities/topology-canvas-render
+   - capabilities/vault-validator
```

AI 에이전트가 관계를 추가해도 똑같이 이 형태로 남습니다. 리뷰할 게 커밋 하나뿐이고,
마음에 안 들면 되돌리면 됩니다. DB 안에서 조용히 바뀌는 상태가 없습니다.

## 4. 미리 설계된 데이터를 조회하는 게 아닙니다

노드를 펼칠 때 어딘가에 준비된 답을 꺼내 오는 게 아닙니다. 순서는 이렇습니다.

```
 디스크의 .md 파일들
        │
        │  frontmatter 파싱
        ▼
   노드 목록 + 참조 목록
        │
        │  이름 풀이 (slug/별칭 → 노드)
        ▼
   엣지 목록  ← 여기서 처음 "관계"가 생깁니다
        │
        │  담김 사슬을 타고 projectIds 스탬프
        ▼
      지도 · INDEX · 분석
```

파생은 `src/entities/docs-vault/lib/derive-ontology-from-vault.ts` 가 합니다.
그래서:

- 관계 파일을 고치면 **다음 파생에서 곧바로** 그래프가 달라집니다. 관계별 migration은 없습니다.
- `domain:` 만 적으면 그 위의 프로젝트 소속은 담김 사슬을 타고 **자동으로** 정해집니다.
  `project:` 키를 손으로 적을 일이 없습니다.
- 존재하지 않는 이름을 가리키면 그 참조는 "이름만 불린 개념" 으로 남습니다.
  검증기(`validate`)가 그걸 보고합니다.

## 5. 데모 지도에 도메인 간 선이 없던 이유

성능 시험용 주소(`?synth=3000`)로 지도를 열면 도메인끼리 선이 하나도 없습니다.
이건 제품의 한계가 아니라 **그 합성 볼트가 구조 관계만 만들기 때문**입니다.
합성기(`src/views/home/lib/synth-vault.ts`)가 내는 관계는 `contains` 한 종류뿐입니다.

진짜 볼트(`docs/ontology/`)를 열면 도메인을 가로지르는 파선이 보입니다. 지도의
모양을 판단할 때는 **어느 볼트를 열었는지 먼저 확인하세요.**

## 6. 지도가 수천 개를 어떻게 그리나

관계가 많아지면 그리는 쪽이 문제가 됩니다. 네 가지 장치가 함께 일합니다.

### 동심 링 배치

부모를 중심으로 자식이 부채꼴로 놓이고, 깊이마다 반지름이 정해져 있습니다.

```
        ·  ·  ·  ·  ·      element    (반지름 90)
      ·  ┌──────┐  ·
    ·    │ capa │      ·   capability (반지름 145)
   ·   ┌─┴──────┴─┐   ·
  ·    │  domain  │    ·   domain     (반지름 250)
       └────┬─────┘
         project              원점
```

### 부채꼴이 폭주하면 나선으로

자식이 아주 많아지면 부채꼴의 반지름이 개수에 비례해 커집니다(자식 100개면
반지름 2250). 그래서 임계를 넘으면 **황금각 나선(phyllotaxis)** 원반으로
바꿔 놓습니다. 해바라기 씨 배치와 같은 방식입니다. 간격 26으로 두면 자식
108개의 원반 반지름이 약 414 에 그칩니다. 폭주가 유계로 바뀝니다.

### 밀도 게이트

자식이 **12개**를 넘는 부모는 나머지를 `+N` 칩 하나로 접습니다. 3,000노드
볼트에서 element 의 **95%** 가 이 칩 뒤에 있습니다. 눌러야 펴집니다.

### 의미 줌 (semantic zoom)

멀리서는 뼈대만, 다가가면 살이 붙습니다.

| 줌 배율 | 보이는 것 |
|---|---|
| 1.5 미만 | project · domain · 허브 (뼈대) |
| 1.5 이상 | capability 가 나타남 |
| 2.3 이상 | element 가 나타남 |

### 겹침 완화는 보이는 것만

씨앗 배치는 싸고 겹침 완화가 비쌉니다. 3,000노드에서 씨앗 배치는 4.3ms 인데
전체 완화는 2,253ms: **전체 비용의 99.8%** 가 완화입니다. 그래서 **그려질
노드만** 완화합니다. 접힌 95% 는 아직 자리를 다툴 일이 없기 때문입니다.

느린 기기(CPU 6배 스로틀) 3,000노드 기준 **13,457ms → 563ms**.

## 정리

- 관계는 계층을 가로지릅니다. 도메인끼리도 직접 이어집니다.
- 저장소는 DB 가 아니라 `.md` frontmatter 한 줄입니다.
- 그래프는 미리 만들어 두는 게 아니라 파일에서 **매번 파생**됩니다.
- 방향이 있는 관계와 대칭 관계는 지도에서 선 모양으로 구별됩니다.
- 대규모는 배치·접기·줌·완화 네 장치로 감당합니다.

관계를 직접 세어 보고 싶으면 [CLI](/guide/cli) 장의 `overview` ·
`domain-matrix` · `path` 를 보세요. frontmatter 의 나머지 규칙은
[폴더의 구조](/guide/vault-structure) 에 있습니다.
