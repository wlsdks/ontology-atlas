---
name: parallel-brief
description: Write the brief for a subagent so the parallel run does not corrupt itself — own port, files to read only, no stash, worktree removal, which baselines must not break, and read the primary sources rather than the summary. Use whenever you are about to spawn a subagent, especially when others are already running. It exists because every constraint here comes from an accident that actually happened on 2026-08-03~04: measuring another agent's server, two branches lowering the same ratchet baseline from the same stale number, worktrees committed as gitlinks, lint counts inflated by another agent's probe files, and eight relayed premises rejected by the seats they were sent to. Skip only when the work is a handful of tool calls you can finish yourself.
---

# /parallel-brief — 서브 에이전트에게 일을 넘길 때

**개수가 문제가 아니라 조율이 문제다.** 아래는 전부 2026-08-03~04 실제 사고에서
나왔다. 여섯 줄 체크리스트는 `AGENTS.md` 상주분에 있고, 이 파일이 그 이유다.

## 1. 서버 — 남의 서버를 재면 남의 화면을 잰다

`playwright.config.ts` 의 `reuseExistingServer: !CI` 가 **이미 떠 있는 서버를
그대로 쓴다.** 둘 이상이 동시에 돌면 다른 에이전트의 코드를 재고 통과라고
보고한다(실제 2회 — 래칫 셋이 한꺼번에 실패했는데 제품 결함이 아니었다).

- e2e 를 돌리면 **자기 포트**를 쓴다(`PLAYWRIGHT_BASE_URL`, 3100 아닌 값).
- 빌드된 화면을 재려면 **`PLAYWRIGHT_STATIC=1`** — dev 에만 있는 층 때문에
  정적 export 에서만 죽는 결함을 dev 는 영원히 통과시킨다.
- **스펙마다 따로 돌린다.** 묶어 돌리면 실패 원인이 포트 문제와 안 갈린다.

## 2. 래칫 기준선 — 숫자는 마지막에 한 사람이 센다

래칫(좋아진 수치가 다시 나빠지지 못하게 상한을 박는 검사)의 기준선은 리터럴
숫자다. 둘이 각자 내리면 **둘 다 옛 기준에서 잰 값이라 합칠 수 없다**(실제로
`144` 와 `136` 이 동시에 나왔고 둘 다 `148` 기준, 실제 합산은 `132`).

- **머지하는 쪽이 병합 후 다시 센다.** 산술로 합치지 않는다.
- **한 칸 낮춰 빨개지는지 확인**한 뒤 확정한다 — 실측인지 추측인지 갈린다.
- 같은 래칫 파일을 여럿에게 맡기지 않는다. 맡겨야 하면 **한 명만 구조를
  바꾸고 나머지는 숫자만**.

## 3. 워크트리 · stash

- `git add -A` 를 쓰지 않는다 — 워크트리가 **gitlink(내용 없는 빈 참조)로
  커밋되어** 클론이 깨진다(실제로 main 에 들어갔다). 경로를 지정해 add 한다.
- 끝나면 **워크트리를 제거**한다.
- **`git stash` 금지.** stash 는 저장소 전체가 하나라 워크트리별로 안 갈린다 —
  실제로 두 에이전트가 서로의 작업을 날렸다.

## 4. 측정값 오염 — 자기 워크트리 안에서 재라

메인에서 `pnpm lint` 를 돌리면 `.claude/worktrees/**` 까지 읽는다. `output/` ·
`.tmp/` 의 프로브도 섞인다 — **git 은 무시하는데 eslint 는 읽는다**(main 경고가
96 으로 보였는데 실제는 92였다).

- 재는 것은 **자기 워크트리 안에서**. 작업 파일은 **저장소 밖 스크래치패드**에.
- 수치를 보고할 때 **어디서 쟀는지** 함께 적는다.

## 5. 자리마다 소유하는 파일이 다르다

| 자리 | 소유 | 나머지는 |
|---|---|---|
| **「체계」**(`design-system`) | `control-class.ts` · `globals.css` 램프 · `DESIGN-SYSTEM.md` 규격 절 | 읽기만 |
| **`design-guardian`** | 화면 컴포넌트의 시각·상호작용 | — |
| **작업 에이전트** | 배정된 소비처 파일 | 규격 파일은 읽기만 |
| **감사 에이전트** | 재고 **보고만** | 명백하고 되돌리기 쉬운 것만 |

- **규격(값의 단계표·모양·크기·톤)은 「체계」의 일이다.** 작업 에이전트가 값이
  없어 막히면 **그 자리를 세어 보고**하고 넘어간다. 혼자 만들면 두 번째 시스템.
- **감사와 수리를 한 명에게 맡기지 않는다** — 자기가 만든 것을 자기가
  통과시키면 안 된다.

## 6. 브리프에 빠뜨리지 말 것 여섯

손으로 적다 빠뜨려서 사고가 났다.

1. **자기 포트**(e2e 를 돌린다면) 2. **읽기만 할 파일**(지금 남이 고치는 것)
3. **stash 금지 · 워크트리 제거 · 커밋에 넣지 말 것** 4. **작업 파일은
스크래치패드** 5. **깨면 안 되는 기준선 + 실제로 돌려서 확인하라**
6. **1차 자료를 직접 읽어라** — 2026-08-04 하루에 소집자의 전제가 **여덟 번**
기각됐다. 정본은 계약 테스트 머리말과 `docs/DECISIONS.md`.

## 7. 언제 나누지 않나

- **몇 번의 도구 호출로 끝나는 일** — 기준선 숫자, 문서 몇 줄, 프로브 한 번.
- **자기 일을 다시 확인하는 일** — 나누는 이유는 컨텍스트 격리이지 재검증이 아니다.
- **같은 파일을 건드릴 일** — 이득 0, 충돌만. 순차로.

나누는 것이 옳은 때: **혼자서는 컨텍스트가 감당 못 하는 전수 측정** · **환경이
따로 필요한 일**(설치된 앱을 여는 것) · **독립이 목적인 심사**(카운슬).
