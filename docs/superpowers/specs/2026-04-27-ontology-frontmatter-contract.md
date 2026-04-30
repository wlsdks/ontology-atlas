# Ontology md frontmatter 계약 v1

**작성일**: 2026-04-27
**상태**: 활성 (T-3 산출물)
**관련**: [`2026-04-27-ontology-design-loop.md`](./2026-04-27-ontology-design-loop.md) §4 T-3
**전제**:
- TBox v1 — 5 클래스 + 7 관계 (T-1, [`2026-04-17-ontology-driven-project-map.md`](./2026-04-17-ontology-driven-project-map.md) §3, §4)
- 신뢰도 정책 — high ≥ 0.85 / medium 0.60~0.84 / low < 0.60 (T-7)

---

## 1. 왜 규격이 필요한가

md 자유형만으로도 일부 추출은 가능하지만, **C-1 cutover 진입 조건 (추출 정확도 ≥ 80%)** 을 달성하려면 입력 정형화가 필수다. 다만 사람에게 부담을 주면 입력이 끊기므로 — "사람이 쓰기 부담스럽지 않고, 기계가 안정적으로 읽는 최소 규격" 을 정한다.

원칙:
- **frontmatter 가 명세적**일수록 자동 반영 신뢰도가 올라간다.
- **frontmatter 없는 문서도 받지만**, 추출 결과는 자동 반영 금지 (`< 0.60` low) 로 강제.
- **사람이 손으로 frontmatter 를 다 채울 필요 없음**. 추출 워커가 본문에서 발견한 단서를 frontmatter 로 역제안 가능.

---

## 2. 처리 등급 (3 단계)

문서가 들어오면 워커는 frontmatter 완비도에 따라 **처리 등급** 을 매기고, 등급이 추출 결과의 신뢰도에 영향을 준다.

| 등급 | 조건 | 추출 결과 신뢰도 상한 |
|---|---|---|
| **A — strict** | 필수 frontmatter 5 종 + 권장 4 종 모두 채움 | 1.0 (자동 승인 가능) |
| **B — lenient** | 필수 5 종은 채워졌지만 권장 일부 누락 | 0.84 (medium tier 까지만) |
| **C — freeform** | 필수 누락 또는 frontmatter 없음 | 0.59 (low tier 강제, 자동 반영 금지) |

워커는 등급을 `knowledgeExtractionOutputs.warnings` 에 `grade:A` / `grade:B` / `grade:C` 로 기록.

---

## 3. Frontmatter 명세

### 3.1 필수 5 종

| 키 | 타입 | 설명 | 예 |
|---|---|---|---|
| `id` | string | 문서 안에서 식별자가 되는 노드 ID. kebab-case. canonical node ID 후보가 됨 | `auth-login` |
| `kind` | enum | TBox 클래스. `project` / `domain` / `capability` / `element` / `document` 중 하나 | `capability` |
| `project` | string | 문서가 속한 project 노드 ID (혹은 slug) | `aslan-maps` |
| `title` | string | display title. 한글 OK | `로그인` |
| `version` | number | frontmatter schema 버전 (현재 `1`). schema 변경 시 +1 | `1` |

### 3.2 권장 4 종 (등급 A 진입 조건)

| 키 | 타입 | 설명 |
|---|---|---|
| `domain` | string | `kind` 가 `capability` / `element` 인 경우 상위 domain ID |
| `status` | enum | `draft` / `active` / `deprecated` / `archived` |
| `aliases` | string[] | 같은 개념의 다른 표현. 노드 병합 매칭에 사용 |
| `tags` | string[] | 자유 라벨. 검색·필터 보조용 |

### 3.3 선택 — 명시 관계

`relates` 키로 본문에 나타나기 어려운 관계를 frontmatter 로 직접 선언. **frontmatter 의 relates 는 신뢰도 1.0 으로 처리** (LLM 추출이 아니라 사용자가 명시한 사실).

```yaml
relates:
  - type: depends_on   # KnowledgeEdgeType 7 종 중 하나
    target: iam
    note: "auth-login 이 iam 모듈을 의존"
  - type: implements
    target: auth-policy
```

검증 규칙:
- `type` 은 `KnowledgeEdgeType` 7 종 (T-2) 만 허용.
- `target` 은 동일 frontmatter 의 `id` 와 **다른** 노드를 가리켜야 함.
- 추출 워커가 source class (이 문서의 `kind`) + target class 를 ontologyRelations 의 sourceClassIds / targetClassIds 와 대조해 incompatible 하면 warning + 신뢰도 0.5 로 강등.

### 3.4 element 전용 — `elementType`

`kind: element` 인 경우 `elementType` 을 권장. 9 종 enum (T-1 시드와 일치):

```yaml
kind: element
elementType: api    # service / api / agent / workflow / schema / data-store / ui / prompt / integration
```

`elementType` 누락 시 등급 B (lenient).

---

## 4. 권장 본문 섹션

추출 워커는 아래 섹션명을 우선 인식. 같은 의미라도 표준 이름을 쓰면 신뢰도 +0.05.

| 섹션명 | 무엇을 추출 |
|---|---|
| `요약` | node.summary 후보 |
| `문제` | summary 보강 / domain 단서 |
| `역할` | capability 단서 |
| `입력` | element (data-store / schema) 후보 |
| `출력` | 동일 |
| `구성 요소` | 하위 element 후보 + `contains` edge 후보 |
| `관계` | 명시적 edge 후보 (`type` 표기 인식) |
| `의사결정` | 논리 근거 보존, summary 추출 안 함 |
| `오픈 이슈` | 추출 제외 |

섹션명이 다르거나 unstructured 인 경우, chunk 단위 추출만 시도 + 등급 B 또는 C.

---

## 5. 완전 예시

### 5.1 등급 A — capability 문서

```md
---
id: auth-login
kind: capability
project: aslan-maps
domain: authentication
title: 로그인
status: active
version: 1
aliases:
  - sign in
  - 로그인 기능
tags:
  - auth
  - p0
relates:
  - type: depends_on
    target: iam
  - type: implements
    target: auth-policy
---

## 요약

이메일 / OAuth 두 경로로 로그인. iam 모듈을 통해 토큰 발급.

## 역할

- 사용자 인증
- 세션 토큰 발급
- 실패 횟수 추적

## 구성 요소

- `LoginForm` (ui)
- `LoginAction` (api)
- `SessionStore` (data-store)

## 관계

- `LoginAction` uses `iam.IssueToken`
- `LoginForm` describes `auth-login`
```

### 5.2 등급 B — element 문서, elementType 누락

```md
---
id: project-card
kind: element
project: aslan-maps
title: 프로젝트 카드
version: 1
---

## 요약

토폴로지 캔버스에서 한 프로젝트를 표현하는 카드 노드.
```

### 5.3 등급 C — frontmatter 없음

```md
# 잡노트 — 어쩌면 프로젝트가 될 것

…자유 글…
```

→ `document` 노드만 약한 후보로 생성 + 본문에서 발견한 키워드는 모두 `related_to` 후보로만, 자동 반영 금지.

---

## 6. JSON Schema (워커 검증용)

추출 워커는 frontmatter 를 YAML parse 후 아래 schema 로 validate.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["id", "kind", "project", "title", "version"],
  "properties": {
    "id": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$" },
    "kind": {
      "type": "string",
      "enum": ["project", "domain", "capability", "element", "document"]
    },
    "project": { "type": "string" },
    "title": { "type": "string", "minLength": 1 },
    "version": { "type": "integer", "const": 1 },
    "domain": { "type": "string" },
    "status": {
      "type": "string",
      "enum": ["draft", "active", "deprecated", "archived"]
    },
    "elementType": {
      "type": "string",
      "enum": [
        "service", "api", "agent", "workflow", "schema",
        "data-store", "ui", "prompt", "integration"
      ]
    },
    "aliases": { "type": "array", "items": { "type": "string" } },
    "tags": { "type": "array", "items": { "type": "string" } },
    "relates": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["type", "target"],
        "properties": {
          "type": {
            "type": "string",
            "enum": [
              "contains", "belongs_to", "depends_on",
              "implements", "uses", "describes", "related_to"
            ]
          },
          "target": { "type": "string" },
          "note": { "type": "string" }
        }
      }
    }
  },
  "additionalProperties": true
}
```

`additionalProperties: true` — 사용자가 자기 도메인 키 (예: `owner`, `link`) 를 추가해도 받음. 워커는 무시.

---

## 7. 진화 정책

- frontmatter schema 변경 시 `version` 을 +1 + 본 문서를 `2026-XX-XX-ontology-frontmatter-contract.md` 로 새 버전 만들기 + DATA-MODEL.md 의 frontmatter 참조 갱신.
- 새 키 추가는 backwards-compatible (선택 필드로) 일 것. 필수 키 변경은 major bump.
- 마이그레이션이 필요한 경우 (예: 필수 키 추가) — 기존 문서의 등급을 일괄 B 로 강등하고 사용자가 보강하도록 검수 큐 발송.

---

## 8. 미해결 / 다음 결정 (이 계약 외부) — **결정 완료 (2026-04-27)**

> 모두 [`2026-04-27-ontology-id-resolution.md`](./2026-04-27-ontology-id-resolution.md) 에서 결정 됐다. 후속 PR: T-12 (canonical mapping) / T-13 (stub promote UI) / T-14 (다국어 — 측정 후 조건부).

- ~~frontmatter 의 `id` 와 canonical node ID 매핑~~ → frontmatter `id` 가 우선, canonical = `<kind>:<id>`. 누락 시 legacy slug fallback.
- ~~`relates.target` 미존재 시~~ → stub placeholder (`kind: unknown`) 생성 + edge type `related_to` 강등 + 검수 큐 promote/dismiss.
- ~~다국어 정규화~~ → v0 단순 normalizeKey, 양방향 한·영 매칭은 측정 결과 의존 (T-14).
