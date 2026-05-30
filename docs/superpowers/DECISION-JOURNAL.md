# Decision Journal — 루프 자율 평가 로그 (사람 개입 0)

> 사용자가 휴먼 루프 제거 + 평가까지 루프 자율로 위임(2026-05-31). **사람이 할 일은
> 없다**(원하면 열람만). 단, "루프가 자기 일을 주관적으로 좋다고 자가채점" 하면 47
> iteration 폴리시 드리프트가 재발한다(stress-test #1: self-grading = rubber-stamp,
> iter 47 함정). 그래서 평가는 **주관 self-opinion 이 아니라 객관 게이트 + 적대적
> 비판**으로 한다. 이 파일은 그 평가의 *투명 로그* 다(audit·옵션 열람용). 근거 SPEC:
> `specs/SPEC-loop-reward-substrate.md`.

## 자율 평가 메커니즘 (사람 reward 대체)

1. **객관 게이트 (변경마다):** 반증가능 artifact 必 — *먼저 쓴 실패테스트가 통과* 또는
   *측정 가능한 before→after delta*. "내 생각에 가치있다" 는 불충분. artifact 없으면 NO-OP.
2. **적대적 자기비판 (commit 전):** 독립 critic agent 패널(workflow, default-deny)이
   "위장 폴리시다 / retention 무관 / 회의적 사용자가 거절할 것" 을 *반박 시도*. **과반이
   refute 하면 kill → NO-OP.** 단일 self-opinion 금지.
3. **10회마다 적대적 audit:** 최근 10 commit 을 critic 이 {retention|wedge|polish|no-op}
   라벨; polish 3+ 면 "drift 중" — 게이트 강화 또는 정지 + surface(FYI).

## 사전 신호 (prior)

- **폴리시(색·헤딩·i18n·주석·복잡도↓ 단독·동작없는 dedup) = reject prior** (사용자 cold
  eval: "PMF 미검증, 폴리시 한계효용"). 적대 critic 은 이 prior 로 폴리시를 기본 refute.
- **한계(정직):** 객관 게이트 + 적대 critic 도 결국 *나(루프)의 추론* 이다 — 실사용자 신호가
  아님. rubber-stamp 보단 훨씬 robust 하지만 drift 위험을 *완전히* 없애진 못한다. 가장 강한
  reward 는 여전히 실사용자. 그래서 audit·게이트를 보수적으로 유지하고, 요약을 주기적으로
  surface(사람 action 불요, 가시성만).

## Journal (newest on top) — 무엇 · objective artifact · 적대 verdict · commit

| date | firing | lever | objective artifact (test/metric) | adversarial verdict | commit |
|------|--------|-------|----------------------------------|---------------------|--------|
| 2026-05-31 | v2.2 #2 | 1b drift (탐색) | none — verify-only(코드 read) | drift surfacing 이 **agent**(postWriteMaintenance·maintenance_plan·SessionStart hook) + **human**(home `TopologyAnalysisBar` healthBreakdown: orphan/stale/promotion · insights `AgentReadinessPanel`) **양측 모두 성숙**. 새 surfacing gap 없음 → **1b 재탐색 금지**. 다음 frontier = **1a cold-start**(fresh vault→first-value; 미성숙·미탐색이 확인된 유일 레버). | NO-OP |
| 2026-05-31 | v2.2 #1 | 1b drift | none — 게이트에서 pre-build refute | **4/4 high REFUTE.** add_concept 가 이미 `compactPostWriteMaintenance().summary.danglingReferences`(+ maintenance_plan `resolve_dangling_reference` proposedAction) 로 write-time 에 dangling ref 를 *더 풍부하게* 노출. 추가 warning 은 redundant + forward-ref(child→parent)·batch bootstrap 에서 false-positive → warnings[] 희석. **재제안 금지.** | NO-OP |
| 2026-05-31 | v2.2 setup | meta | (메커니즘 정의 — 평가 대상 아님) | n/a (directive) | 이 커밋 |
