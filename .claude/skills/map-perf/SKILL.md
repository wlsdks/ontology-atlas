---
name: map-perf
description: Measure topology-map interaction cost (node drag, pan, zoom) with a deterministic harness that provably grabs a real node instead of silently panning the background. Use before claiming a map performance problem is fixed, or when a user reports lag you cannot reproduce. The `?e2e=1` hook (`window.__atlasMap`) exposes which nodes are draggable and whether the current gesture is a node drag or a pan — the two look identical from outside, and confusing them produced six consecutive false "not slow here" reports.
---

# /map-perf — 지도 상호작용 비용 측정

> **이 스킬이 존재하는 이유는 실패다.** 2026-07-31, 소유자가 노드 드래그 렉을
> 보고했고 나는 **여섯 번 연속으로 "안 느린데요"** 라고 답했다. 매번 배경을
> 밀고 있었다. 소유자가 화면을 보고 *"너는 노드가 아니라 그냥 배경을
> 흔들잖아"* 라고 짚어준 뒤에야 끝났다. 이 문서는 그 실패가 반복되지 않게 한다.

## 0. 먼저 알아야 할 것 — 왜 노드를 정확히 잡기가 어려운가

지도는 캔버스 하나로 그려진다. 그래서 **노드 하나를 끄는 것과 지도 배경을 통째로
미는 것(팬)이 바깥에서는 구별되지 않는다**:

| | 노드 드래그 | 배경 팬 |
|---|---|---|
| 커서 | `grabbing` | `grabbing` — **같다** |
| 화면 | 노드가 움직임 | 지도 전체가 움직임 |
| 물리 시뮬레이션 | **다시 돌기 시작함**(`heatRef`) | 안 돌아감 |
| 비용(3000노드) | **~140ms/프레임** | ~2ms/프레임 |

그리고 **커서가 노드 위에 올라간 것과 노드를 실제로 잡은 것은 다르다.** 커서가
`pointer` 로 바뀌어도 그 노드가 물리 시뮬레이션에 들어 있지 않으면
(`sim.hasNode()` 실패) 잡기가 아무 신호 없이 실패하고 **그대로 배경 팬이 된다.**
그래서 "커서가 pointer 로 바뀌는 지점을 찾아 끈다"는 방법은 **틀린 답을 아주
안정적으로** 낸다 — 언제 재도 빠르게 나온다.

## 1. 검사용 훅 — `?e2e=1`

URL 에 `e2e=1` 이 있을 때만 `window.__atlasMap` 이 붙는다. 측정할 때만 열리는
검사용 창구이지 제품 기능이 아니다.

```js
window.__atlasMap.nodes()
// → [{ id, kind, label, x, y, draggable, hidden, radius, agentFocus }]
//   x/y = CSS 픽셀(마우스 좌표계). draggable = 시뮬에 있는가(= 끌 수 있는가).
//   hidden = 밀도 게이트로 접혀 화면에 없는가. radius = 화면 반지름.
//   이 밖에 edges() · edgeAt() · camera() · selection() · chips() 게터도 있다.

window.__atlasMap.interaction()
// → { kind: "node" | "pan" | "idle", nodeId }
//   ★ 드래그 «중에» 부른다. "pan" 이면 그 측정은 무효다.

window.__atlasMap.backing()
// → { width, height, dpr }  캔버스 백킹 크기 — 해상도 캡 발동 확인용.
```

구현: `src/widgets/topology-map-v2/ui/use-topology-loop.ts` 끝의 effect.

## 2. 절차

```bash
pnpm build && npx serve out -l 4173      # 정적 빌드가 떠 있어야 한다
node scripts/perf-node-drag.mjs          # 기본 http://localhost:4173
```

출력에 **`노드 잡음 ✓`** 가 없으면 그 수치는 버린다. 측정 스크립트(하네스)가
그것을 스스로 판정한다 — 사람이 화면을 보고 판단하게 두지 않는다.

## 3. 규율 넷 — 어기면 또 틀린다

1. **진짜 마우스만 쓴다.** `page.mouse.*`(CDP)만 쓴다. 페이지 안에서 만든
   `new PointerEvent(...)` 는 `isTrusted: false` 라서 `setPointerCapture` 가
   거부되고, 노드를 잡는 경로가 끊겨 **그대로 배경 팬이 된다.** 이 한 줄이 실패
   여섯 번 중 다섯을 만들었다.
2. **`headless: false` — 창을 실제로 띄워 놓고 잰다.** 창 없이(헤드리스) 돌리면
   화면에 그릴 곳이 없어서, 모니터 주사율에 맞춰 프레임을 내보내는 제동
   장치(vsync·합성 백프레셔)가 아예 안 걸린다. **그래서 헤드리스 fps 는 실제
   기기의 fps 를 예측하지 못한다** — 전이되는 것은 JS 계산 비용뿐이다. 실측:
   같은 코드가 헤드리스 44fps / 실기기 7fps.
3. **`gap` 말고 `work` 를 인용한다.** `gap`(프레임과 프레임 사이의 간격)은
   모니터 주사율과 측정 스크립트의 왕복 시간(CDP 1회 ≈ 24ms)에 오염된다.
   `work`(우리 코드가 한 프레임 안에서 실제로 붙잡고 있던 시간)가 우리 몫이다.
   그때 사고의 신호도 정확히 거기 있었다.
4. **비교할 대조군을 같이 잰다.** `synth=3000` 옆에 `synth=31` 을 같이 돌린다.
   비용이 노드 수에 따라 늘어나는지가 한 번에 갈린다(실측 139.9ms vs 1.0ms).

## 4. 측정값을 화면에 띄워 놓고 보고 싶을 때

설정 → 「지도 배경」 → **프레임 계기**(재는 값을 화면에 띄워 주는 표시기, 기본
꺼짐). 지도 우하단에 `fps · 최악 ○○ms · 끊김 ○` 이 뜬다. **평균 fps 보다 가장
느렸던 프레임이 중요하다** — 버벅임은 평균이 아니라 제일 나쁜 몇 프레임에서
느껴진다(실측: 중앙값은 16.7ms 인데 최악이 150ms).
이 표시를 꺼 두면 측정 루프 자체가 돌지 않는다.

사용자 기기에서만 재현되는 문제는 사용자에게 이걸 켜 달라고 하는 것이 가장 빠르다.

## 5. 자주 빠지는 함정

- **크롬 프로필 경로를 고정해 두지 마라.** 앞 실행의 크롬이 그 폴더를 쓰고 있는데
  지우면 창이 스스로 닫히고, 증상이 `Target page has been closed` 로 나와 측정
  실패처럼 보인다. `scripts/perf-node-drag.mjs` 는 프로세스마다 다른 프로필을 쓴다.
- **첫 방문 안내가 캔버스를 덮는다.** `guides=off` 를 붙인다. 안 붙이면 입력이
  캔버스까지 닿지 않고, 프레임 비용이 0.1ms 로 나와서 "빠르다"로 잘못 읽힌다.
- **fps 는 모니터 주사율 단위로 뚝뚝 끊겨서만 변한다.** 8ms 미만의 개선은 fps
  숫자로는 안 보인다. 그럴 땐 `work` 를 봐라.

## 6. 브라우저 없이 재는 편이 나은 것

물리 시뮬레이션(ForceAtlas2) 비용처럼 **순수한 계산**은 브라우저를 빼고 재는 쪽이
정확하고, 노드를 잘못 잡는 실패가 아예 끼어들지 않는다:

```js
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
// 노드 수를 바꿔 가며 forceAtlas2.assign(g, { iterations: 3, settings }) 를 잰다
```

실측(2026-07-31): n=800 → 5.6ms, **n=3000 → 79.4ms** (Barnes-Hut 켜면 34.5ms).
노드 수의 제곱에 비례해 늘어난다.

## 7. 마지막 관문 — 설치한 앱에서 한 번 더

이 측정 스크립트가 재는 것은 Chrome 이다. 사용자가 실제로 쓰는 것은
**Tauri(WKWebView)** 라 브라우저 엔진이 다르다. Chrome 에서 고칠 방법이 정해지면
설치한 앱에서 한 번 더 재야 한다(`.claude/rules/surfaces.md` 의 데스크톱 규율).
