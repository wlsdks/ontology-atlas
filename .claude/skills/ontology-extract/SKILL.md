---
name: ontology-extract
description: User gave you prose — a meeting note, a PR description, an RFC draft, a chat log, a paragraph from a Notion page — and asks "extract ontology from this" or similar. Read the prose, cross-check the existing vault with `similar_nodes` / `find_evidence`, then propose a small set of candidate nodes/edges, ask the user to pick which to land, and only then call `add_concept` / `add_relation` / `patch_concept`. Skip when the prose is just a personal note with no ontology-shaped concepts.
---

# /ontology-extract — prose 에서 ontology 가 자라게

이 프로젝트의 mission v3 한 줄: *하나의 codebase, 하나의 ontology, 개발자 + AI agent 가 같이 키운다*. **볼트(vault)는 온톨로지가 저장된 마크다운 폴더**이고, 그 안 `.md` 파일들이 노드(개념 하나)와 엣지(개념 사이의 연결)다. `/ontology-sync` 가 **코드 변경**을 보고 볼트를 늘린다면, 이 skill 은 **prose**(사람이 쓴 줄글 — 회의록 · PR 본문 · RFC 초안 · 채팅 로그 · Notion 한 단락)를 보고 늘린다. Obsidian 은 `[[link]]` 로 문서끼리 잇기만 하지만, 여기서는 **종류가 정해진 노드**(capability 역량 · element 요소 · domain 도메인 중 무엇인지가 붙은 노드)가 늘어난다 — 그 판별을 LLM 이 대신해 주기 때문에 가능하다.

## When to run

**Run when**:
- 사용자가 줄글 한 단락을 보여주며 "ontology 로 정리해줘" / "여기서 추출해줘" 비슷한 요청
- 새 RFC / 회의록 / PR 본문에서 *그 codebase 가 새로 갖게 된 개념* 이 발견됨
- 사용자가 외부 문서 (Notion · Confluence · Slack 스레드) 한 단락을 붙여넣음

**Skip when**:
- 줄글이 개인 노트 / 의견 / 상황 보고라, 노드로 올릴 만한 *명사* (capability / element / domain) 가 없음
- 사용자가 단순 "요약" 만 요청 — 이 skill 은 볼트에 파일을 쓰려고 하므로, 사용자가 그걸 원한다고 분명히 말했을 때만 실행한다
- 줄글이 이미 볼트 안 노드의 본문 — 같은 내용을 자기 자신에서 다시 뽑아 겹치게 된다

## Workflow

### 1. Read prose + 기존 vault 같이 본다 (cheap)

```
list_kinds                  # 전체 윤곽
find_evidence(title)        # prose 의 핵심 명사 한두 개를 title 매치
similar_nodes               # prose 의 핵심 구절을 candidate 로 받아 유사도 점수
```

줄글에서 *명사* 와 *동사구* 를 후보(candidate — 아직 볼트에 쓰지 않고 사용자가 고르게 제안만 하는 노드) 로 뽑은 다음, 볼트에 **이미 있는지** 먼저 확인한다. 가장 흔한 실패는 `auth-login` 노드가 이미 있는데 "사용자 로그인" 이라는 노드를 따로 만들어 같은 개념이 둘이 되는 것이다.

`similar_nodes({candidateSlug, title})` 는 줄글에서 뽑은 말과 기존 노드가 얼마나 닮았는지를 (slug + title + 이웃 노드 기준) 점수로 돌려준다. 점수가 0.3 이상이면 *기존 노드를 patch(고쳐 쓰기)* 할 후보로, 그 미만이면 *새 노드* 후보로 나눈다.

### 2. Candidate 추출 — kind 별 분류

줄글 한 단락에서 노드로 올릴 만한 것은 보통 0~3 개다. 5개 넘게 보이면 단락이 너무 길거나 네가 과하게 뽑고 있는 것이다 — 가장 굵직한 1~2 개만 먼저 제안한다.

| Prose 형태 | Likely kind | 예 |
|---|---|---|
| "X 라는 새 기능" / "사용자가 Y 할 수 있게" | **capability** | "회원이 비밀번호를 재설정할 수 있다" → `capabilities/password-reset` |
| "Z 라이브러리를 도입" / "K 파일을 만들어" | **element** | "JWT 토큰을 사용" → `elements/jwt-token` |
| "A 영역 전체를 정리" / "B 라는 새 도메인" | **domain** | "결제 영역을 분리" → `domains/billing` |
| 그 외 (의견 · 상태 · 동기) | **건너뜀** | 의견은 노드로 만들지 않는다 |

후보마다 다음을 적어 둔다:
- slug (kebab-case, kind 접두어)
- 짧은 title (한 줄)
- 어느 도메인(여러 역량을 묶는 상위 영역) 에 속하는지 (capability/element 만)
- 줄글의 *어느 구절* 에서 나왔는지 (사용자가 근거를 되짚을 수 있게)
- 기존 노드를 고칠 후보인지 (similar_nodes 결과) 새로 만들 후보인지

### 3. 사용자에게 *짧은* candidate 표 (write 전에 정지)

볼트에 쓰기 전에 사용자에게 **한 번** 확인을 받는다. 이런 형식으로 보여 준다:

```
prose 에서 추출한 후보 3개 — 진행할 것 골라줘:

  [new]   capabilities/password-reset      "회원이 비밀번호를 재설정할 수 있다"
                                             ← 새 capability, domain=auth
  [patch] capabilities/auth-login          기존 노드, body 에 OTP 흐름 추가 제안
                                             ← prose 4번째 단락 "OTP 적용" 에서
  [new]   elements/otp-sender              "OTP 전송 컴포넌트" — domain=auth

전부 진행 / 1번만 / 2,3만 / 다 취소 — 어떻게?
```

**중요**: 이 skill 의 값어치는 *뽑아내는 것* 자체보다 *무엇을 볼트에 들일지 사용자가 정한다* 는 데 있다. 무엇이 옳은 개념인지 판단하는 권한은 사용자에게 남아야 하고 AI 로 넘어가면 안 된다. AI 가 확인 없이 5개씩 추가하면 며칠 안에 볼트가 모델이 지어낸 개념(hallucination)으로 뒤덮인다.

### 4. 확인 받은 것만 쓰기

| Candidate 종류 | Tool |
|---|---|
| new node | `add_concept(slug, kind, title, domain?, body?)` — body 에 줄글 한 줄을 인용하고 출처를 적어 두길 권한다 |
| patch existing | `patch_concept(slug, body?, frontmatter?, expected_mtime)` — body 끝에 단락을 덧붙인다 |
| edge 만 | `add_relation(from, to, type)` |

후보 여러 개를 한 번에 쓸 때는 `add_concepts` (한 번에 최대 50개) 와 `add_relations` 를 쓴다.

`add_concept` 의 body 에 *어느 글에서 가져왔는지* 를 적어 두면 나중에 사람이 되짚어 확인할 수 있다 — 예:

```markdown
# Password Reset

회원이 잊은 비밀번호를 본인 메일로 받은 OTP 로 재설정.

> Extracted from RFC-2026-05-14 "auth 흐름 개선" §3. Bootstrap by /ontology-extract.
```

### 5. Verify + 사용자에게 changelog

`/ontology-sync` 와 같은 형식(5 줄)으로 답한다. 줄글에서 볼트로 무엇이 늘었는지가 보이게 쓴다.

```
prose 1 단락 (회의록 §3) 읽음. 후보 3 → 사용자 2 채택.
+ capabilities/password-reset (domain auth)
+ elements/otp-sender (domain auth, capabilities/password-reset.elements 에 자동 연결)
warnings 0. find_orphans 변동 0.
```

## 실수 회피

- **모델이 지어낸 노드**: 줄글에 *적혀 있지 않은* 개념을 "그래야 할 것 같아서" 만드는 경우. 이 skill 은 **줄글에 적힌 말을 옮기는 데까지만** 한다 — 거기서 더 추론하지 않는다. 의심되면 사용자에게 "줄글 어느 줄에서 나왔는지" 를 보여 준다.
- **kind(노드 종류) 를 잘못 잡기**: "X 라는 새 *기능*" 인데 element 로 만들거나, "Y 라는 *파일*" 인데 capability 로 만들기. 한국어 "기능" 은 거의 항상 capability, "도구/라이브러리/모듈" 은 element, "영역/도메인" 은 domain.
- **고치기보다 새로 만드는 쪽이 더 자주 옳다**: 닮은 정도가 0.3~0.5 면 기존 노드를 고칠 근거로는 약하다. *새 노드를 만들고 기존 노드와 `relates` 관계로 잇는 쪽* 이 보통 더 깔끔하다. 사용자에게 두 방법을 다 보여 주고 고르게 한다.
- **줄글이 길면 나눠서 돌린다**: 단락별 · 섹션별로 따로 실행한다. 한 번에 후보가 10개 넘게 나오면 온톨로지가 자라는 게 아니라 모델이 같은 말을 바꿔 쓰고 있는 것이다.

## 다른 skill 과의 관계

| Skill | 시작점 | 끝 |
|---|---|---|
| `/ontology-bootstrap` | 빈 vault + 코드 | 첫 5–15 노드 |
| `/ontology-sync` | code change (git diff) | 코드↔vault drift 0 |
| **`/ontology-extract`** | **사용자 prose** | **prose 안 개념 → vault 노드** |

세 skill 은 입력만 다르고 도착점은 같다 — 사용자의 볼트. bootstrap 은 아무것도 없는 상태에서 첫 노드를 만들고, sync 는 코드를 따라가고, extract 는 사람이 쓴 글을 따라간다.

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
