---
name: design-build
description: Build a screen from this repo's design system deterministically — which primitive to reach for, which ramp owns each value, how a surface appears and leaves, and which instrument proves it afterwards. Use whenever you are about to write UI: a new screen, a new panel or dialog, a new control, or a visual change to an existing one. It exists because the gap between "make me a screen" and a screen that matches the system was never the model's taste — it was missing assets and an unwritten order of operations. Skip only for copy-only edits and pure build plumbing.
---

# /design-build — 명령에서 화면까지, 같은 순서로

## 이게 왜 필요한가

2026-08-03 실측이 「명령만 하면 디자인 시스템대로 나온다」의 실제 장벽을 짚었다.
취향이 아니라 **자산과 순서**였다:

| 재 본 것 | 값 |
|---|---|
| 프로덕션 생 `<button>` 중 기존 프리미티브가 덮던 모양 | **419개 중 1개** |
| 조건부로 나타나는 표면 중 하드컷 | **20개 중 11개** |
| 칩 하나의 (높이·`px`·`py`·타입) 고유 조합 | **143개에 50종** (상위 3종 23%) |
| 3개월간 프로덕션 사용처 0이던 프리미티브 | **3개** (램프 밖 `text-lg` 를 쓰고 있었다) |

그래서 이 스킬은 **고를 것을 줄인다.** 매번 새로 정하지 않는 것이 품질의 대부분이다.

## 0. 먼저 — 지을지 고를지

**비자명한 시각/레이아웃/상호작용/모션 변경이면 `/design-directions` 를 먼저 돌린다.**
갈래를 안 그리고 하나를 지으면, 나중에 카운슬이 갈래 탐색을 대신하게 되고 그게
가장 비싼 경로다. 값만 바꾸는 편집(토큰 교체·카피·간격)이면 건너뛴다.

## 1. 컨트롤 — 손으로 className 을 쓰지 않는다

| 필요한 것 | 쓸 것 |
|---|---|
| 라벨 있는 작은 컨트롤 | `<Chip>` |
| 정사각 아이콘 컨트롤 | `<IconButton label="…">` — `label` 은 **필수** |
| 목록의 한 줄 전체 | `<RowButton>` |
| 표준 버튼(주 행동) | `<Button>` |
| 보더 없는 인셋 (세그먼트 · 탭 · 고스트 버튼) | `controlClass({ shape: 'segment' })` |
| 위에 없는 모양 (pill · card · link · tile) | `controlClass({ shape })` |
| 그 여덟에도 없는 모양 | **멈추고 전수를 다시 센다** — 분류에 없는 모양이 나왔다는 뜻이다 |

모양 여섯은 전수 419개에서 나왔다(칩 128 · 링크형 85 · 행 39 · 아이콘 36 ·
pill 32 · 카드 18). **아홉째를 감으로 추가하지 않는다** — 뒤에 붙은 `tile` 과
`segment` 는 감이 아니라 **반복 횟수**로 들어왔다. 정규화 라운드가 「자리가 없어
못 옮겼다」고 적은 사유를 세어, 같은 결론이 여러 라운드에서 나온 것만 승격한다
(`segment` 는 네 라운드 연속이었다). 근거 없이 늘어난 축은 그 자체로 두 번째
시스템이고, 이 저장소는 사용처 0인 프리미티브 셋으로 그 실패를 이미 겪었다.

`className` 으로 넘길 수 있는 것은 **이 한 자리에만 참인 것**뿐이다 — 자리잡기 ·
폭 · 순서. 모양·크기·색을 넘기면 이 층이 있으나 마나다.

## 2. 나타나는 표면 — `<Surface>` 로 감싼다

```tsx
<Surface open={open} origin="top right" onExited={returnFocus}>…</Surface>
```

넷이 딸려 온다: 퇴장 창 · 자기 이름으로 앞으로 재생하는 퇴장 클래스 ·
나가는 프레임의 `inert`+`pointer-events-none` · 퇴장 완료 후 1회 알림.

**모달이면 그 위에 계약을 더 쌓는다** — `design.md` 가 **모달성 증명**을 요구한다:
scrim(또는 차단된 상호작용) · `role="dialog"` + `aria-modal` · Esc · 열릴 때
포커스가 **다음 행동**에 · 닫힐 때 트리거로 복귀. 골격은 새로 만들지 말고
`AgentConnectSheet` 또는 `RecentChangesNeedsVaultDialog` 를 따른다.

**중앙에서 태어나는 팝오버는 반려 사유다.** 트리거 방향을 `origin` 으로 준다.

## 3. 값 — 어느 램프가 소유하나

| 값 | 출처 | 어기면 |
|---|---|---|
| 글자 크기 | 타입 램프 (`caption`…`hero-lg`) | 미정의 스텝은 **리터럴을 안 남기고** 루트 16px 로 렌더된다 — 조용하다 |
| 행간 | `--leading-*`, 크기의 **짝** | 조건부로 크기만 갈아끼우면 짝이 어긋난다 |
| 반경 | `rounded-chip/card/panel` | — |
| 그림자 | elevation-1/2/3 · dock-* · control-press | 손 튜닝은 광원 역전·계층 역전을 만든다 |
| 색 | `--color-*` | 새 hue = 두 번째 채색 시스템 |
| duration | `--motion-fast`(확인) · `base`(이동) · `settle`(확정) | 값이 아니라 **쓰임**으로 고른다 |

## 4. 모션 — 예산은 주인공에게

- **한 입력 = 한 사건.** 같은 입력이 낳은 단계는 같은 프레임에 시작한다.
- **사용자가 부른 목적물이 먼저 갖는다.** 목적물이 하드컷인데 배경만 이징이면 결함.
- 호버/포커스는 `0~--motion-fast`. 이동·확정 램프는 하루 몇 번의 사건의 것이다.
- `prefers-reduced-motion` 은 전역 base 레이어가 처리한다 — **여기서 분기하지 않는다**
  (레이어 밖 `!important` 는 오히려 진다).

## 5. 지은 뒤 — 재서 확인한다

```bash
pnpm checks:changed          # ★ 항상 여기서 시작한다. 손으로 쓴 목록은 늘 좁다
```

그리고 걸리는 것만:

| 무엇을 건드렸나 | 계기 |
|---|---|
| 아무 UI | `/design-audit` — 겹침 · 치수 편차 · 램프 이탈 · **대비** |
| 모션 | `/motion-verify` — 녹화 없는 판정은 무효 |
| 브레이크포인트 | `/responsive-sweep` |
| 지도 | `node scripts/measure-graph-readability.mjs` |
| 토큰 | `node scripts/measure-contrast.mjs` |

## 6. 너를 막을 게이트들 — 미리 알고 가라

전부 **래칫**이다. 오늘의 부채는 그대로 두고 **새 부채만** 막는다.

| 게이트 | 막는 것 |
|---|---|
| `control-adoption-ratchet` | 손 className 을 쓴 새 `<button>` |
| `surface-motion-ratchet` | 등장/퇴장 없는 새 표면 |
| `contrast-ratchet` (e2e) | 대비를 떨어뜨리는 토큰 편집 |
| `a11y-ratchet` (e2e) | 기준선 밖 접근성 룰 위반 |
| `disabled-affordance` | 비활성인데 비활성처럼 안 보이는 컨트롤 |
| `control-class` | 램프 밖 값 · 새 hue · 두 모양이 같은 값 |

**게이트가 빨개지면 우회하지 말고 따라라.** 이 게이트들은 실제로 만든 사람에게
먼저 걸렸다 — 2026-08-03 에 새 다이얼로그의 버튼 둘이 「417 → 419」로 막혔고,
`Surface` 의 `inert` 가 React 19 에서 조용히 안 붙던 것도 자기 계약이 잡았다.

## 7. 새 규격을 만들었으면 게이트도 같은 PR 에

**룰 없는 규격은 지켜지지 않는다.** 단 켜기 전에 **위반을 전수 측정한다** —
한 PR 로 못 치우는 룰은 강제가 아니라 소음이고 기존 신호까지 덮는다
(`shadow-[` 를 통째로 금지했다가 lint 가 144 → 548 로 뛴 전례). 절차는
`/gate-probe`.

## 이 스킬이 실패하는 방식

| 실패 | 어떻게 아는가 |
|---|---|
| 모양이 여섯에 없어서 손으로 썼다 | 래칫이 빨개진다. 전수를 다시 세라는 신호이지 우회하라는 뜻이 아니다 |
| `className` 에 크기·색을 넘겼다 | 층이 있으나 마나다. `controls.test.tsx` 가 바이트 동일을 요구한다 |
| 표면을 `{open && …}` 로만 그렸다 | 닫힐 때 1프레임에 사라진다 |
| 계기를 안 돌리고 「괜찮아 보인다」로 끝냈다 | 몇 픽셀 어긋남은 아무도 눈으로 못 짚는다 |
| 게이트를 켜기 전에 안 셌다 | 소음이 신호를 덮어 게이트 전체가 무력해진다 |
