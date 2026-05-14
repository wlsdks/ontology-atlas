---
name: ontology-extract
description: User gave you prose — a meeting note, a PR description, an RFC draft, a chat log, a paragraph from a Notion page — and asks "extract ontology from this" or similar. Read the prose, cross-check the existing vault with `similar_nodes` / `find_evidence`, then propose a small set of candidate nodes/edges, ask the user to pick which to land, and only then call `add_concept` / `add_relation` / `patch_concept`. Skip when the prose is just a personal note with no ontology-shaped concepts.
---

# /ontology-extract — prose 에서 ontology 가 자라게

이 프로젝트의 mission v3 한 줄: *하나의 codebase, 하나의 ontology, 개발자 + AI agent 가 같이 키운다*. `/ontology-sync` 가 **코드 변경** 에서 vault 가 자라게 했다면, 이 skill 은 **prose** (회의록 · PR 본문 · RFC 초안 · 채팅 로그 · Notion 한 단락) 에서 자라게 한다. Obsidian 처럼 `[[link]]` 만 자라는 게 아니라 *typed ontology 노드* 가 자란다 — LLM 이 매개라서 가능한 흐름.

## When to run

**Run when**:
- 사용자가 prose 단락을 보여주며 "ontology 로 정리해줘" / "여기서 추출해줘" 비슷한 요청
- 새 RFC / 회의록 / PR 본문에서 *그 codebase 가 새로 갖게 된 개념* 이 발견됨
- 사용자가 외부 문서 (Notion · Confluence · Slack 스레드) 한 단락을 붙여넣음

**Skip when**:
- prose 가 개인 노트 / 의견 / 상황 보고라 ontology 시민 (capability / element / domain) 으로 승격할 만한 *명사* 가 없음
- 사용자가 단순 "요약" 만 요청 — extraction 은 vault 변경을 시도하므로 *사용자 의도* 가 명확할 때만
- prose 가 이미 vault 안의 노드 본문 — 자신을 자신에서 추출하는 회귀

## Workflow

### 1. Read prose + 기존 vault 같이 본다 (cheap)

```
list_kinds                  # 전체 윤곽
find_evidence(title)        # prose 의 핵심 명사 한두 개를 title 매치
similar_nodes               # prose 의 핵심 구절을 candidate 로 받아 유사도 점수
```

prose 안의 *명사* 와 *동사구* 를 candidate phrase 로 뽑은 다음, vault 에 **이미 있는지** 먼저 확인한다. 가장 흔한 실패는 "auth-login" 이라는 노드가 이미 있는데 "사용자 로그인" 으로 별도 만들어 duplicate 생기는 케이스.

`similar_nodes({candidateSlug, title})` 가 prose 의 phrase 와 기존 노드 사이 유사도 (slug + title + neighbors) 점수를 반환한다. 점수 0.3 이상은 *기존 노드 patch* 후보, 그 미만은 *새 노드* 후보로 분류.

### 2. Candidate 추출 — kind 별 분류

prose 한 단락에서 평균적으로 0~3 개 ontology 시민이 나온다. 5+ 가 보이면 prose 가 너무 길거나 ontology 화 욕심이 과한 것 — 가장 굵직한 1~2 개만 우선.

| Prose 형태 | Likely kind | 예 |
|---|---|---|
| "X 라는 새 기능" / "사용자가 Y 할 수 있게" | **capability** | "회원이 비밀번호를 재설정할 수 있다" → `capabilities/password-reset` |
| "Z 라이브러리를 도입" / "K 파일을 만들어" | **element** | "JWT 토큰을 사용" → `elements/jwt-token` |
| "A 영역 전체를 정리" / "B 라는 새 도메인" | **domain** | "결제 영역을 분리" → `domains/billing` |
| 그 외 (의견 · 상태 · 동기) | **건너뜀** | 의견은 ontology 시민 아님 |

각 candidate 에 대해 다음을 메모:
- slug (kebab-case, kind 접두어)
- 짧은 title (한 줄)
- 어느 도메인 안 (capability/element 만)
- prose 안의 *어떤 phrase* 에서 도출됐는지 (사용자 검증용 trace)
- 기존 노드 patch 후보냐 (similar_nodes 결과) vs 새 노드 후보냐

### 3. 사용자에게 *짧은* candidate 표 (write 전에 정지)

쓰기 전에 사용자에게 **한 번** 확인 받는다. format:

```
prose 에서 추출한 후보 3개 — 진행할 것 골라줘:

  [new]   capabilities/password-reset      "회원이 비밀번호를 재설정할 수 있다"
                                             ← 새 capability, domain=auth
  [patch] capabilities/auth-login          기존 노드, body 에 OTP 흐름 추가 제안
                                             ← prose 4번째 단락 "OTP 적용" 에서
  [new]   elements/otp-sender              "OTP 전송 컴포넌트" — domain=auth

전부 진행 / 1번만 / 2,3만 / 다 취소 — 어떻게?
```

**중요**: 이 skill 의 가치는 *추출 자체* 보다 *사용자가 무엇을 vault 에 들이는지 통제* 에 있다. ontology 권위가 사용자 → AI 로 흐르지 않아야. AI 가 자동으로 5 노드 추가하면 며칠 안에 vault 가 LLM hallucination 으로 오염됨.

### 4. 확인 받은 것만 쓰기

| Candidate 종류 | Tool |
|---|---|
| new node | `add_concept(slug, kind, title, domain?, body?)` — body 에 prose 한 줄 인용 + source 명시 추천 |
| patch existing | `patch_concept(slug, body?, frontmatter?, expected_mtime)` — body 끝에 추가 단락 |
| edge 만 | `add_relation(from, to, type)` |

여러 후보 한 번에 들이면 `add_concepts` (배치, max 50) 와 `add_relations` 사용.

`add_concept` body 에 *prose source* 를 명시하는 게 추후 audit 에 도움 — 예:

```markdown
# Password Reset

회원이 잊은 비밀번호를 본인 메일로 받은 OTP 로 재설정.

> Extracted from RFC-2026-05-14 "auth 흐름 개선" §3. Bootstrap by /ontology-extract.
```

### 5. Verify + 사용자에게 changelog

`/ontology-sync` 와 같은 reply shape (5 줄). prose → vault delta 가 보이게.

```
prose 1 단락 (회의록 §3) 읽음. 후보 3 → 사용자 2 채택.
+ capabilities/password-reset (domain auth)
+ elements/otp-sender (domain auth, capabilities/password-reset.elements 에 자동 연결)
warnings 0. find_orphans 변동 0.
```

## 실수 회피

- **LLM hallucination 노드**: prose 에 *명시* 안 된 개념을 "그래야 할 거 같아서" 만드는 case. extraction 은 **prose 안 phrase 의 거울** 이어야 — 추가 추론 금지. 의심되면 사용자에게 "prose 어느 줄에서 도출했는지" 보여주기.
- **kind 잘못 잡기**: "X 라는 새 *기능*" 인데 element 로 만들거나, "Y 라는 *파일*" 인데 capability 로 만들기. 한국어 "기능" 은 거의 항상 capability, "도구/라이브러리/모듈" 은 element, "영역/도메인" 은 domain.
- **patch 보다 new 가 더 흔히 옳음**: similar score 0.3~0.5 구간은 *애매한 patch* 이므로 *새 노드 + 기존 노드와 `relates` edge* 가 보통 더 깨끗. 사용자에게 두 옵션 다 보여주고 고르게.
- **prose 가 길면 chunking**: 단락별 / 섹션별 separate run. 한 번에 10+ candidate 가 보이면 ontology 가 자라는 게 아니라 LLM 이 paraphrase 하는 것.

## 다른 skill 과의 관계

| Skill | 시작점 | 끝 |
|---|---|---|
| `/ontology-bootstrap` | 빈 vault + 코드 | 첫 5–15 노드 |
| `/ontology-sync` | code change (git diff) | 코드↔vault drift 0 |
| **`/ontology-extract`** | **사용자 prose** | **prose 안 개념 → vault 노드** |

세 skill 이 입력 차이만 다른 같은 끝점 (사용자 vault). bootstrap 은 0→1, sync 는 코드 follow, extract 는 사람 생각 follow.

## Example

> 사용자: "오늘 회의록 §3 에 'OTP 도입 결정' 적었는데 ontology 로 정리해줘"
>
> Agent:
> - `find_evidence("OTP")` → 0 매치
> - `similar_nodes(title:"OTP 전송")` → `elements/sms-sender` 점수 0.18 (낮음, 새 노드 권장)
> - `list_kinds` → 26 노드, capabilities/auth-login 존재 확인
> - **후보 표 제시**: new `elements/otp-sender` (domain auth), patch `capabilities/auth-login` body 에 OTP 흐름 추가
> - 사용자 "둘 다 진행" → `add_concept` + `patch_concept(expected_mtime)`
> - **5줄 changelog 응답**
