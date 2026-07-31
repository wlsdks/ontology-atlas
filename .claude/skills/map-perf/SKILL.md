---
name: map-perf
description: Measure topology-map interaction cost (node drag, pan, zoom) with a deterministic harness that provably grabs a real node instead of silently panning the background. Use before claiming a map performance problem is fixed, or when a user reports lag you cannot reproduce. The `?e2e=1` hook (`window.__atlasMap`) exposes which nodes are draggable and whether the current gesture is a node drag or a pan — the two look identical from outside, and confusing them produced six consecutive false "not slow here" reports.
---

# /map-perf — 지도 상호작용 비용 측정

> **이 스킬이 존재하는 이유는 실패다.** 2026-07-31, 소유자가 노드 드래그 렉을
> 보고했고 나는 **여섯 번 연속으로 "안 느린데요"** 라고 답했다. 매번 배경을
> 밀고 있었다. 소유자가 화면을 보고 *"너는 노드가 아니라 그냥 배경을
> 흔들잖아"* 라고 짚어준 뒤에야 끝났다. 이 문서는 그 실패가 반복되지 않게 한다.

## 0. 먼저 알아야 할 것 — 왜 조준이 어려운가

지도는 캔버스 하나다. **노드 드래그와 배경 팬이 밖에서 구별되지 않는다**:

| | 노드 드래그 | 배경 팬 |
|---|---|---|
| 커서 | `grabbing` | `grabbing` — **같다** |
| 화면 | 노드가 움직임 | 지도 전체가 움직임 |
| 물리 시뮬 | **깨어남**(`heatRef`) | 안 깨어남 |
| 비용(3000노드) | **~140ms/프레임** | ~2ms/프레임 |

그리고 **호버 히트 ≠ 잡기**다. 커서가 `pointer` 로 바뀌어도 그 노드가 시뮬에
없으면(`sim.hasNode()` 실패) 잡기가 조용히 실패하고 **팬으로 흘러간다.**
그래서 "커서가 pointer 인 지점을 찾아 끈다"는 접근은 **틀린 답을 안정적으로**
낸다 — 언제나 빠르게 나온다.

## 1. 검사 훅 — `?e2e=1`

URL 에 `e2e=1` 이 있을 때만 `window.__atlasMap` 이 붙는다. 제품 API 가 아니다.

```js
window.__atlasMap.nodes()
// → [{ id, kind, label, x, y, draggable, hidden }]
//   x/y = CSS 픽셀(마우스 좌표계). draggable = 시뮬에 있는가(= 끌 수 있는가).
//   hidden = 밀도 게이트로 접혀 화면에 없는가.

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

출력에 **`노드 잡음 ✓`** 가 없으면 그 수치는 버린다. 하네스가 그걸 스스로
판정한다 — 사람이 화면을 보고 판정하게 두지 않는다.

## 3. 규율 넷 — 어기면 또 틀린다

1. **진짜 마우스만 쓴다.** `page.mouse.*`(CDP)만. 페이지 안에서 만든
   `new PointerEvent(...)` 는 `isTrusted: false` 라 `setPointerCapture` 가
   거부되고, 노드 잡기 경로가 끊겨 **팬으로 흘러간다.** 이 한 줄이 실패
   여섯 번 중 다섯을 만들었다.
2. **`headless: false` 로 잰다.** 헤드리스는 표시가 없어 vsync 도 합성
   백프레셔도 없다. **헤드리스 fps 는 실기기로 전이되지 않는다** — JS 비용만
   전이된다. 실측: 같은 코드가 헤드리스 44fps / 실기기 7fps.
3. **`gap` 이 아니라 `work` 를 인용한다.** `gap`(rAF 간격)은 디스플레이
   주사율과 하네스 왕복(CDP 1회 ≈ 24ms)에 오염된다. `work`(콜백이 동기로 쓴
   시간)가 우리 코드의 몫이다. 이 사고의 신호가 정확히 거기 있었다.
4. **대조군을 같이 잰다.** `synth=3000` 옆에 `synth=31`. 비용이 노드 수에
   비례하는지가 한 번에 갈린다(실측 139.9ms vs 1.0ms).

## 4. 계기를 화면에 띄우고 싶을 때

설정 → 「지도 배경」 → **프레임 계기** (기본 꺼짐). 지도 우하단에
`fps · 최악 ○○ms · 끊김 ○` 이 뜬다. **최악 간격이 fps 보다 중요하다** —
버벅임은 평균이 아니라 꼬리다(실측: 중앙 16.7ms 인데 최악 150ms).
꺼져 있으면 측정 루프도 돌지 않는다.

사용자 기기에서만 재현될 때는 이걸 켜 달라고 하는 것이 가장 빠르다.

## 5. 자주 나오는 함정

- **프로필 경로를 고정하지 마라.** 앞 실행의 크롬이 물고 있을 때 지우면 창이
  스스로 닫히고, 증상이 `Target page has been closed` 로 나와 측정 실패처럼
  보인다. `scripts/perf-node-drag.mjs` 는 PID 별 프로필을 쓴다.
- **첫 방문 안내가 캔버스를 덮는다.** `guides=off` 를 붙인다. 안 붙이면 입력이
  캔버스에 닿지 않고, 프레임 비용이 0.1ms 로 나와 "빠르다"로 오독된다.
- **fps 는 vsync 로 양자화된다.** 8ms 미만 개선은 fps 로 안 보인다. 그럴 땐
  `work` 를 봐라.

## 6. 브라우저 없이 재는 편이 나은 것

물리 시뮬(ForceAtlas2) 비용처럼 **순수 계산**은 브라우저를 빼고 재는 쪽이
정확하고 조준 실패가 끼어들지 않는다:

```js
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
// 노드 수를 바꿔 가며 forceAtlas2.assign(g, { iterations: 3, settings }) 를 잰다
```

실측(2026-07-31): n=800 → 5.6ms, **n=3000 → 79.4ms** (Barnes-Hut 켜면 34.5ms).
`n²` 그대로다.

## 7. 마지막 관문 — 설치 앱

이 하네스는 Chrome 을 잰다. 제품 표면은 **Tauri(WKWebView)** 라 엔진이 다르다.
Chrome 에서 처방이 확정되면 설치 앱에서 한 번 더 재야 한다
(`.claude/rules/surfaces.md` 의 데스크톱 능력 규율).
