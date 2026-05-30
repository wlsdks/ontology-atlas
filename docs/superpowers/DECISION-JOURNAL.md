# Decision Journal — 자가개선 루프의 reward signal

> 루프(Claude)가 "뭘 했고 / 왜 가치 있을 거라 봤나" 를 여기 적는다. **사람(jinan)이 각
> 행에 reward 를 매긴다.** 루프는 매 firing 이 파일을 *가장 먼저* 읽어 그 reward 로 방향을
> 잡는다 — 루프가 자기 일을 자기가 채점하던 함정(self-grading)을 **사람-채점**으로 교체.
> 이게 "루프가 뭘 개선할지 스스로 알아가는" 의 실현 가능한 형태다(진짜 강화학습은 아님 —
> 사람이 reward function 역할). 근거 SPEC: `specs/SPEC-loop-reward-substrate.md` (Phase 1,
> approved 2026-05-31, 결정은 루프에 위임됨).

## 사람이 할 일 (1분, 가끔이면 됨)

각 행의 **`reward`** 칸만 채워주세요:
- **`+1`** = 가치 있었다 · 이런 거 더 해.
- **`0`** = 중립 / 모르겠다.
- **`-1`** = 불필요 · 헛것 · 이런 거 그만.

원하면 `note` 에 한 줄 이유(왜). 그게 전부입니다. — reward 칸은 **사람만** 씁니다(루프는
`pending` 만 적음; 자기 점수 못 매김).

## 루프가 할 일 (매 firing)

1. **이 파일을 가장 먼저 읽는다.** `-1` 받은 lever/패턴 → 회피. `+1` → 강화. `0`/`pending` → 중립.
2. commit 하거나 surface 할 때마다 표 맨 위에 한 행 append (`reward: pending`).
3. **`pending` 이 5개 이상** 쌓이면 새 commit 을 멈추고 "평가 부탁" 을 한 번 surface(채점 유도) 후 NO-OP.
4. **방향은 reward 신호가 정한다 — 루프 자체 판단이 아니라.** (이게 이 파일의 존재 이유.)

## 사전 신호 (iters 1–47 · 사용자 cold eval 기반 prior)

- **폴리시(색·헤딩·i18n·주석·복잡도↓ 단독·동작없는 dedup) = `-1` prior.** 지난 47 iteration
  대부분이 이것이었고 사용자 평가 = "PMF 미검증, 폴리시는 한계효용." 루프는 이 prior 로
  폴리시를 회피한다(charter v2 가 이미 아티팩트 기준으로 강제 중).
- 진짜 reward 는 **실사용자** — Phase 1 의 사람-채점은 사용자 1인(jinan) proxy 신호다(전체
  사용자 아님). self-grading 보단 훨씬 낫지만, 실배포·실사용자와 병행될 때 가장 강하다.

## Journal (newest on top)

| date | firing | lever | hypothesis (왜 가치 있을 거라 봤나) | artifact | reward | note |
|------|--------|-------|--------------------------------------|----------|:------:|------|
| 2026-05-31 | v2#4 | meta · reward-substrate Phase1 | 루프에 사람-채점 reward 채널을 연결해 self-grading 함정 제거 → 앞으로 방향이 추측 아닌 신호 기반이 됨 | 이 journal + charter v2/cron 갱신 | pending | |
| 2026-05-31 | v2#3 | meta · surface | reward-substrate 를 SPEC(needs-approval)으로 제안 | `9859ded8` | pending | |
