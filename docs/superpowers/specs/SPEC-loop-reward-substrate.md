---
status: needs-approval
created: 2026-05-31
surfaced-by: self-improve loop (v2) — responding to user "스스로 강화학습하며 뭘 개선할지 알아가는 루프" 요청
decision-owner: user (jinan)
---

# SPEC — Loop reward substrate (자가개선 루프에 reward signal 연결)

> ⚠ **status: needs-approval.** 이건 제안(draft)이다. 사용자가 승인/수정/거절하기 전엔
> 구현하지 않는다. 루프는 이 항목을 charter `## Blocked` 에 두고 재-surface 하지 않는다.

## 왜 (problem)

사용자 요청: *"스스로 강화학습하며 뭘 개선해야 할지 알아가며 개선해줘 — 뭐가 부족하고
사용자가 뭘 필요로 할지 스스로 판단하게."*

기술적 현실(정직):
- 진짜 RL 불가 — 가중치 업데이트·gradient·reward 없음. firing 간 "학습" 은 *글로 적힌
  것*(charter·commit)뿐.
- **핵심 결핍 = reward signal.** "사용자가 뭘 필요로 하나" 를 루프가 *스스로* 판단하면
  교정 신호가 없어 추측이 된다. 47 iteration 폴리시 드리프트 + 4-critic stress-test 의
  #1 지적("self-grading = rubber stamp", iter 47 이 자기 vault 보고 'retention positive'
  선언한 함정)이 정확히 이것.
- 따라서 v2 는 default-NO-OP 으로 *추측 양산*을 막았다. 하지만 그건 *멈춤*이지
  *학습*이 아니다. 학습하려면 **외부 reward 를 연결**해야 한다.

## 목표 (goal)

루프의 선택을 *추측이 아니라 사람의 실제 판정* 에 grounding 한다 — 사용자의 RL 직감의
**실현 가능한 버전**. 사용자가 reward function 역할을 한다(실사용자가 생기기 전까지).

비목표: 진짜 ML 학습 흉내, 자동 "positive" 자가선언(금지), 실사용자 없이 PMF 입증.

## 제안

### Phase 1 — human-graded decision journal (가벼움 · 즉시 가능 · 추천 시작점)

단일 파일 `docs/superpowers/DECISION-JOURNAL.md`. 두 주체가 쓴다:

1. **루프(매 commit 또는 surface 시)** — 한 행 append:
   `| <date> | <firing/commit> | <lever 1a/1b/1c/2> | <hypothesis 한 줄> | <artifact/commit hash> | status: pending |`
2. **사용자(가끔, 비동기)** — 각 행의 status 를 직접 표시:
   `reward: +1 valuable | 0 unsure | -1 not-valuable` + 짧은 note (왜).
3. **루프(매 firing 시작)** — journal 을 읽어 **negative 신호를 정책으로** 반영:
   - 같은 lever/패턴이 `-1` 받았으면 → 그 방향 회피(negative reward).
   - `+1` 패턴 → 그 방향 강화(positive reward).
   - 미평가(pending) 누적 N개↑ → 새 commit 줄이고 "평가 부탁" surface.

왜 동작: **self-grading(함정)을 human-grading(유일하게 유효한 retention 근사 신호)으로
교체.** 가중치 학습은 아니지만 — 루프의 *문서화된 정책*이 사용자 판정으로 매 firing
업데이트되는, RL 의 policy-update 에 가장 가까운 실현 형태.

비용: 파일 1개 + 컨벤션. 앱 변경 0. 사용자 부담 = 가끔 +1/0/-1 표시(1분).

### Phase 2 — 로컬 usage 계측 (선택 · 더 무거움 · 별도 SPEC 필요)

앱이 *로컬 디스크에만* usage 신호를 적는다(프라이버시 OK, 백엔드 0):
- 어떤 뷰/기능이 실제로 열리나(topology vs insights vs builder 사용률).
- cold-start 이탈 지점(폴더 선택 후 첫 행동까지).
- 실제 편집 세션에서 vault↔코드 drift 가 쌓이는 속도(retention 의 핵심 미지수).

사용자가 그 로그를 보고(또는 루프가 *노출만* — 결론 금지) decision-journal 의 reward 를
더 객관적으로 매긴다. **앱 계측은 새 표면 + 제품 방향이라 Phase 1 검증 후 별도 SPEC.**

진짜 강한 신호는 결국 **실사용자 2~3명** — 계측은 그들이 있을 때 빛난다(Phase 1 은
사용자 1인=jinan 의 proxy 신호라도 self-grading 보다 낫다).

## 사용자가 결정할 것 (approval 시 답해주세요)

1. Phase 1(decision journal) 도입할까? (Y/N)
2. 파일 위치/포맷 이대로 OK? (`docs/superpowers/DECISION-JOURNAL.md`, 표 형식)
3. 평가 주기 — 매 commit? 하루 한 번 몰아서? (루프가 pending 누적 시 알림 빈도)
4. Phase 2(로컬 usage 계측) 관심? (지금/나중/안 함)

## 검증 / 리스크

- Phase 1 은 코드 0(문서+컨벤션)이라 검증 부담 0. 효과 검증 = 사용자가 실제로 grade
  하는가(안 하면 신호 비어 무의미 — 그땐 Phase 2/실사용자로).
- 1인 reward 는 편향(사용자 1명 = 전체 사용자 아님). 완화 = 실배포 후 실사용자 신호.
- 루프가 reward 를 자기에게 유리하게 해석할 위험 → journal 의 reward 칸은 *사람만* 쓴다
  (루프는 pending 만 적고 +1/-1 은 못 적음). 게이트로 강제.
