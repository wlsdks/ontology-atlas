/**
 * 3D 돔의 **위도 링** 렌더러 — 왜 이 링이 있어야 하는지는 `model/dome-view.ts`
 * 의 `DOME_RING_KINDS` 독블록에 있다(요약: 링이 없으면 이 배치는 돔이 아니라
 * 천막으로 읽히고, 회전에 기준이 없다).
 *
 * ## 왜 원 하나가 아니라 폴리라인인가
 *
 * `ctx.ellipse` 로 한 번에 그리면 **한 획에 알파가 하나**다. 그러면 링 전체가
 * 같은 밝기라 앞뒤가 안 갈리고, 그 순간 링은 깊이 단서가 아니라 그냥 테두리가
 * 된다. 이 파일이 하는 일의 전부는 그 원을 세그먼트로 쪼개 **호마다 자기
 * 깊이의 잉크**를 주는 것이다 — 그래서 뒤쪽 반원이 안개에 잠기고 앞쪽 반원만
 * 남으며, 그 비대칭이 곧 «어느 쪽이 앞인가» 다.
 *
 * ## 이 파일은 토큰을 모른다
 *
 * `render/*` 의 규약대로 색은 전부 인자로 받는다(`node-shapes.ts` 선례).
 * 값의 정본은 `model/dome-view.ts`(물성)와 토큰 리더(색)다.
 */

export interface DomeRingScreenSample {
  x: number;
  y: number;
  /** 0 가까움 … 1 멂 — 이번 프레임의 정규화 깊이. */
  u: number;
}

export interface DomeRingScreen {
  /** 그 티어의 조립 램프 0..1 — 2D↔3D 전환에서 링이 티어와 함께 뜨고 진다. */
  a: number;
  points: readonly DomeRingScreenSample[];
}

export interface DomeRingsDrawState {
  rings: readonly DomeRingScreen[];
  /** 기준 불투명도 — 안개·램프를 곱하기 전. */
  baseAlpha: number;
  /** 기준 굵기(화면 px) — 깊이 굵기 감쇠를 곱한다. */
  baseWidthPx: number;
  /** 깊이 → 안개 배수. 노드·엣지와 **같은 함수**를 넘긴다. */
  fog: (u: number) => number;
  /** 깊이 → 굵기 배수. 노드·엣지와 **같은 함수**를 넘긴다. */
  widthFactor: (u: number) => number;
}

export interface DomeRingsTokens {
  /** 링 잉크 — 좌표계 급의 가장 낮은 잉크. */
  stroke: string;
}

/**
 * 한 프레임의 링 전부를 그린다. 호출부는 이 함수를 **엣지보다 먼저** 부른다 —
 * 링은 무대이지 배우가 아니라서, 관계선과 노드가 그 위에 얹혀야 한다.
 *
 * `ctx.globalAlpha` 는 이 함수가 자기 값으로 덮어쓰고 끝에 되돌린다.
 */
export function draw(ctx: CanvasRenderingContext2D, state: DomeRingsDrawState, tokens: DomeRingsTokens): void {
  const { rings, baseAlpha, baseWidthPx, fog, widthFactor } = state;
  if (rings.length === 0) return;

  const prevAlpha = ctx.globalAlpha;
  const prevCap = ctx.lineCap;
  ctx.strokeStyle = tokens.stroke;
  ctx.lineCap = "butt";
  ctx.setLineDash([]);

  for (const ring of rings) {
    if (ring.a <= 0.01) continue;
    const points = ring.points;
    const count = points.length;
    if (count < 3) continue;
    for (let i = 0; i < count; i++) {
      const from = points[i];
      const to = points[(i + 1) % count];
      // 세그먼트의 깊이는 두 끝의 평균 — 끝점 값을 그대로 쓰면 이웃 세그먼트가
      // 같은 점에서 다른 밝기를 주장해 마디마다 계단이 보인다.
      const u = (from.u + to.u) / 2;
      const alpha = baseAlpha * fog(u) * ring.a;
      if (alpha <= 0.004) continue;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = Math.max(0.35, baseWidthPx * widthFactor(u));
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = prevAlpha;
  ctx.lineCap = prevCap;
}
