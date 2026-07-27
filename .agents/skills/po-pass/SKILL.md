---
name: po-pass
description: Write the solo product-owner pass before implementing any product, UX, graph, MCP, CLI, workflow, or macOS-shell change — read the decision ledger, state phenomenon and problem separately, self-score the six rubric rows, and escalate to /po-council when the score or the trigger list demands it. This is the daily path; the council is the rare one. Skip only for mechanical work — typos, dependency bumps, CI plumbing, test fixtures, lint config.
---

# /po-pass — 매일 쓰는 경로. 사고는 여기서 났다.

카운슬은 드물게 열린다. **작업의 대부분은 이 단독 패스로 지나간다** — 그리고
2026-07-27 사고는 카운슬이 아니라 **여기서** 났다. 한 패스가 문서가 치명적이라
부른 두 행에 "없음"을 쓰고, 스스로 `Build and verify` 를 내고, 출하됐다. 아무도
소집하지 않는 카운슬은 그걸 못 잡는다. 이 스킬이 그 경로를 지킨다.

## 0. 먼저 원장을 읽는다

`docs/DECISIONS.md` 에서 **같은 표면 · 같은 질문의 선행 결정**을 찾는다.

- 있으면 → 이 패스는 그 기록을 ① 여전히 유효하다고 **인용**하거나 ② 명시적으로
  **뒤집는다**(이유와 함께). 조용히 다시 결정하지 않는다.
- 선행 기록의 **반증 조건이 이미 관측됐는지** 확인한다. 관측됐으면 그때 진 쪽이
  이긴 것이고, 이 패스는 그 사실에서 출발한다.

## 1. 현상과 문제를 갈라 쓴다

순서는 **관찰된 현상 → 사용자 문제 → 성공 조건 → 해법 → 구현**이다. 그런데
순서만으로는 가장 흔한 실패를 못 막는다 — **현상을 사용자 말투로 옮겨 적고 그걸
문제라고 부르는 것.** 세 시험을 통과해야 문제다:

1. **차이 시험** — 문제 문장에서 현상을 지워라. 남는 것이 ① 누가 ② 어느 순간에
   ③ 결정 · 이해 · 신뢰 · 핸드오프 중 무엇을 잃는지를 여전히 말하는가?
2. **제2 관측 시험** — 이 문제가 실재한다면 **현상 말고 또 무엇이 관측되겠는가?**
   (이탈 · 재시도 · 질문 · 에이전트 실패 로그 · 지원 요청) 두 번째 채널을 못 대면
   재진술이거나 검증 불가능한 추상이다. 이 시험이 "틀렸다면 보일 것"의 반증
   조건을 겸한다.
3. **해법 독립 시험** — 해법이 바뀌어도 문제 서술이 말이 되는가. 금지어는
   **위치**가 아니라 **제안된 변경의 어휘**다(컴포넌트 · 라이브러리 · 패턴 이름).

하나라도 실패하면 Problem insight 는 **최대 2점**이고, 점수를 매기기 전에 문제를
다시 쓴다.

## 2. 패스를 쓴다

`docs/PRODUCT-OWNER-OPERATING-SYSTEM.md` 의 **Fast PO Pass** 템플릿을 읽고 그대로
채운다 — 기억으로 바꿔 쓰지 않는다. 최소한 이 여덟이 들어간다: 관찰된 현상 ·
사용자 문제 · 대상과 모먼트 · 현재 대안 · 온톨로지 가치 · 에이전트 가치 ·
단순화 · 검증.

## 3. 여섯 행을 스스로 채점한다 — 0/2/4 앵커를 인용하면서

같은 문서의 **PO Quality Rubric** 표를 읽고 각 행의 0 · 2 · 4 기준을 **인용한 뒤**
점수를 준다. 기억으로 채점하지 않는다.

| 행 | 소유 자리(카운슬이 열릴 때) |
|---|---|
| Problem insight · User moment | 근거 |
| Differentiation | 해자 |
| Ontology value · Agent value | 지킴이 |
| Verification | 결 |

**"해당 없음"은 0점이지 면제가 아니다.** 특히 온톨로지/에이전트 가치를 "없음"으로
선언하는 것은 **네가 줄 수 있는 면제가 아니다** — 그건 지킴이의 면제 심사이고,
심사하려면 카운슬이 열려야 한다. 이 한 문장이 사고를 막는 지점이다.

## 4. 소집 여부를 선언한다

**필수 소집** — 다음 중 하나라도 해당하면 여기서 멈추고 `/po-council` 을 부른다:

- 합계 **18/24 미만**
- **Problem insight · Ontology value · Agent value · Verification 중 0점**
- 사용자 표면(라우트)의 신설 또는 제거
- 공개 계약 변경 — MCP 도구 시그니처 · CLI 명령 · vault 스키마
- 방향 · 포지셔닝 · 낯선 사람이 처음 읽는 문구
- 첫 공개 릴리스 등 **한 번뿐인 평판 자원**을 쓰는 일
- 소유자가 요청

**소집 안 함** — 18점 이상이고 치명적 0이 없고 위 트리거를 안 밟았으면 판정을
내고 진행한다.

**절대 안 함** — 기계적 작업(오타 · 의존성 범프 · CI 배관 · 테스트 픽스처 ·
lint 설정). 여기 카운슬을 부르는 것이 PO OS 가 경고하는 process theater 다.

## 5. 판정과 기록

판정은 넷 중 하나: `Do not build` · `Investigate first` · `Shape a slice` ·
`Build and verify`.

트리거를 밟은 변경이면 **`docs/DECISIONS.md` 에 기록을 남긴다.**
`pnpm decisions:check` 가 라우트 신설/제거와 공개 계약 변경에 대해 이걸 강제한다 —
기록 없이 통과하지 못한다.

## 출력 형식

```md
## PO 패스 — <변경>

**선행 기록**: [DECISIONS.md 해당 기록 · 유효/뒤집음 · 반증 조건 관측 여부 — 없으면 "없음"]

**관찰된 현상**: […]
**사용자 문제**: […]
**현상↔문제 판별**: 차이 [통과/실패] · 제2 관측 [채널: …] · 해법 독립 [통과/실패]

**대상과 모먼트** · **현재 대안** · **온톨로지 가치** · **에이전트 가치** ·
**단순화** · **검증**: […]

**자가 채점**: Problem insight N · User moment N · Differentiation N ·
Ontology value N · Agent value N · Verification N = **N/24**
(치명적 0: 없음 / <행>)

**소집**: 필요 없음 / **필요 — 사유: <트리거>** → `/po-council` 호출

**판정**: Do not build / Investigate first / Shape a slice / Build and verify
```
