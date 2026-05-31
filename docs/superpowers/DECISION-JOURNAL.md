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
| 2026-05-31 | Atlas A#5(d) | data-loss fix (pillar 1/2) | TDD red→green: persistEditorSave 4 unit(swallow 금지 매트릭스) + editor integration 1(conflict→no phantom"저장됨"·localized msg·dirty 유지·poll re-fetch 가 'my unsaved edits' 안 덮음). 전체 1572/1572 · tsc 0 · lint 0 · i18n en/ko parity · /docs 콘솔 0. | **3-critic 게이트 0/3 refute (value=high KEEP).** 직전 #5c 게이트가 발견한 사전존재 data-loss 수정: `DocsVaultPage` onSave 가 `VaultConflictError` 를 swallow→editor 가 rejected save 를 phantom-clean(dirty→false)+"저장됨" flash→다음 poll 이 미저장 편집 silent overwrite. fix=`persistEditorSave`(re-throw, never swallow, toast hook 보존)+editor localized conflict msg+dirty 유지. 3 critic 이 throw 전파 end-to-end 추적·deps-bar swallow 은 free-text buffer 없어 안전(미변경)·uncaught rejection 없음 확인. | `3aa703a5` |
| 2026-05-31 | Atlas A#5(b)(c) | real-time (pillar 2) | (게이트에서 kill — banner reverted) | **3-critic 게이트 2/3 refute → KILL.** saveDoc post-save mtime 반환 + staleness banner. (correctness, medium) reload 버튼이 동시 poll 에 forceReloadRef 가 소비/리셋되며 silent no-op = green-but-wrong(RTL 테스트가 poll 을 interleave 안 해 놓침). (value, low) "#5a 가 이미 clobber 막았고 save-time VaultConflictError 토스트도 있으니 banner=already-safe 위 awareness=pre-PMF marginal polish". regression critic 만 KEEP. → revert. **그러나 correctness critic 이 더 깊은 사전존재 data-loss(save-into-conflict phantom-clean) 발견 → A#5(d) 로 수정.** | NO-OP (revert) |
| 2026-05-31 | Atlas A#5(a) | data-loss fix (pillar 1/2) | TDD red→green(clobber test 16ms red→pass) · clean-reflect+in-flight-race 테스트 · save/close 유지 7/7 · tsc/lint 0 · 전체 1566/1566 | **3-critic 게이트 0/3 refute.** 직전 firing 게이트가 발견한 사전존재 clobber(poll 재fetch 가 미저장 편집 덮어씀) 수정: dirtyRef-guard(effect-synced, race-safe) + .then guard(잔여 in-flight race 봉합 — critic 권고). race-correctness/regression/value 전부 endorse. | `bc6b9e3d` |
| 2026-05-31 | Atlas A#5 | real-time (pillar 2) | (코드 검증 + 게이트) — banner reverted | **3-critic 게이트가 HIGH 발견 → REVERT.** banner 자체는 맞으나 사전존재 data-loss 버그에 막힘: editor content-load effect 가 getDocContent(fileHandles memo) 의존 → poll 마다 new Map → effect 재실행 → dirty 편집 silent overwrite + banner 안 뜸. 5 unit test green 이었지만 integration 미커버. → revert, 정식 fix(getDocContent ref 안정화=clobber 수정+banner 작동, saveDoc post-save mtime 반환) 다음 firing. **게이트가 잡은 3번째 실제 버그 + 사전존재 data-loss 발견.** | NO-OP (revert) | 
| 2026-05-31 | Atlas A#6 | real-time (pillar 2) | 9 poll-cadence vitest(controller orphan-bug 테스트 포함) · tsc/lint 0 · 37 test pass | **3-critic 게이트 1/3 refute(medium): timer-lifecycle orphan-loop 버그**(boolean flag 가 await 경계서 desync → hide→show-during-inflight 가 두번째 루프 생성 + zombie). 수정: generation-token controller(createAdaptivePoller) 재구현, 정확 시나리오 테스트 박제. value/polish 2 critic endorse. = 게이트가 잡은 3번째 실제 버그(#1 via, #6 timer). | `9a2c116b` |
| 2026-05-31 | Atlas A#4 | agent-native (탐색) | 5 node:test · **OLD==NEW inclusion set 실증(실 vault 10 질의)** · mcp test:all 310 · mcp-verify 0 drift · tsc/lint/package-contracts green | **3-critic 게이트 0/3 refute.** value critic 실측: OLD walk-order 에서 title-exact 노드가 "vault" 53개 중 50번째·"mcp" 41개 중 31번째로 묻힘 → 랭킹이 best 를 matches[0] 로. correctness=inclusion 불변 실증, polish=genuine. 유일 divergence(needle \n)=비도달. + #2 verify.mjs pathDrift 갭 동봉 정정(mcp-verify 가 발견). | `ac547ca1` |
| 2026-05-31 | Atlas A#2 | agent-native (drift-0) | 11 node:test(실 dogfood drift-0 smoke 포함) · single-source 증명(audit script + validate_vault pathDrift 둘 다 64/193/0 동일) · integration 73 pass · tsc/lint/package-contracts green · dogfood 신규실패 0(stash 검증) | **3-critic 게이트 0/3 refute.** correctness critic 이 구 audit 로직(git show 703761c3) 복원해 side-by-side 동일 확인(유일 차이=결정적 정렬, 개선). placement(separate field, shared validate.mjs 불변)·value·polish endorse(low). flagged: README pathDrift 누락 → 커밋에 반영. | `99bf424c` |
| 2026-05-31 | Atlas A#1 | agent-native (drift-0) | 6/6 node:test(실패→통과, compiler-grounded anti-drift 포함) · dogfood e2e inVaultNotInCode 0→15 · tsc/lint/integration/package-contracts green | **4-critic 게이트: 1 refute(high) + 1 high-flag = green-but-wrong via 버그**(compiler 'dependencies' vs 필터 'depends_on' → vault 엣지 0 매칭, 거짓 drift-0). 합성 fixture 라 테스트가 못 잡음. **수정**: via set 매칭 + 실 compiler 통과 테스트 + hint 사실화. 3 critic endorse(low, "bootstrap flow 에 가치 집중"). | `d2bea40d` |
| 2026-05-31 | v2.2 #10 audit | (step-7 audit) | 독립 3-auditor 패널 (no-self-grade) | **3/3 만장일치: polishCount=3, recentDrift=false.** polish 3개(27156e67 heading→h2 · 46a7f08e comment-only · 5c0d52d3 charter self-positive)는 전부 **v2.2 재설계(64d4422d) 이전** tail = v2.2 가 막으려던 바로 그 drift. 최근 5 commit 은 전부 honest no-op(2ed158a3 은 게이트 4/4 refute 기록). 게이트 작동 중. **"polish 3+" count 는 window-boundary artifact** (10-commit window 가 재설계 경계 걸침) → 강화/정지 불요. v2.2 commit 쌓이면 tail 롤아웃. | NO-OP (audit) |
| 2026-05-31 | v2.2 #3 | 1a cold-start (탐색) | none — verify-only(코드 read) | cold-start 이 **target user(개발자+agent)** 에 성숙: CLI `init` 이 6-step 안내(추천 `bootstrap` 1-liner 포함) + 3 bootstrap 경로(CLI `bootstrap` · `/ontology-bootstrap` skill · MCP `analyze_repo_structure`). web-only(비-target) cold-start 은 코드 접근 불가 + charter 비-target + copy(artifact-ban). **1a 재탐색 금지.** | NO-OP |
| 2026-05-31 | v2.2 #2 | 1b drift (탐색) | none — verify-only(코드 read) | drift surfacing 이 **agent**(postWriteMaintenance·maintenance_plan·SessionStart hook) + **human**(home `TopologyAnalysisBar` healthBreakdown: orphan/stale/promotion · insights `AgentReadinessPanel`) **양측 모두 성숙**. 새 surfacing gap 없음 → **1b 재탐색 금지**. 다음 frontier = **1a cold-start**(fresh vault→first-value; 미성숙·미탐색이 확인된 유일 레버). | NO-OP |
| 2026-05-31 | v2.2 #1 | 1b drift | none — 게이트에서 pre-build refute | **4/4 high REFUTE.** add_concept 가 이미 `compactPostWriteMaintenance().summary.danglingReferences`(+ maintenance_plan `resolve_dangling_reference` proposedAction) 로 write-time 에 dangling ref 를 *더 풍부하게* 노출. 추가 warning 은 redundant + forward-ref(child→parent)·batch bootstrap 에서 false-positive → warnings[] 희석. **재제안 금지.** | NO-OP |
| 2026-05-31 | v2.2 setup | meta | (메커니즘 정의 — 평가 대상 아님) | n/a (directive) | 이 커밋 |

## ⚑ 수렴 노트 (firing #3, 2026-05-31) — 매 firing 먼저 읽기

상위 retention 레버 **1a(cold-start) · 1b(drift)** 가 firing #1~3 에서 모두 *target user(개발자+agent)* 기준 **성숙 확인**. 1c(canvas)·perf·change-tracking(A/B)·wedge-restructure 는 이전 라운드에 이미 shipped(메모리 기록). 남은 진짜 레버 = **retention 검증**인데 이건 *실사용자 신호*가 필요 — 루프가 코드로 만들 수 없음.

**따라서 코드-레벨 자율 firing 은 당분간 대부분 NO-OP 가 정상**(폴리시 날조 floor 작동 중, 게이트 정상). 루프가 계속 경계할 것:
1. 코드가 진화하며 생기는 **새** gap(새 capability/route/write 경로 → 그때 1a~3 재평가).
2. 매 10회 정직 audit(폴리시 drift 감시).
3. 사용자가 주는 **새 방향 / 실사용자 신호** → 그때 큰 진전 재개.

즉 "할 일이 없어서 멈춘 게 아니라, 코드로 풀 수 있는 retention 레버를 다 풀어서 외부 신호 대기 중" 이 정직한 상태. 무리한 marginal 변경(게이트가 어차피 refute)으로 commit 수 늘리지 말 것.
