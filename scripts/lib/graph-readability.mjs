/**
 * 그래프 가독성 지표 — **순수 계산**. 브라우저도 DOM 도 모른다.
 *
 * ## 왜 브라우저에서 떼어냈는가
 *
 * `/gate-probe` 의 한 줄: **항상 통과하기만 하는 게이트는 게이트가 없는 것과
 * 구별되지 않는다.** 첫 실측에서 겹침이 세 케이스 모두 0 이 나왔는데, 그 0 이
 * "지도가 안 겹친다" 인지 "탐지기가 놀고 있다" 인지 그 자리에서는 알 수 없었다.
 * 계산이 페이지 안에 있으면 **아는 답을 넣어 볼 수가 없기 때문**이다.
 *
 * 그래서 페이지는 좌표만 내놓고, 판정은 여기서 한다. 여기는 fixture 로 프로브할
 * 수 있다 — `tests/contract/graph-readability.contract.test.ts`.
 *
 * ## 무엇을 재고 무엇을 일부러 안 재는가
 *
 * Purchase, *"Which Aesthetic has the Greatest Effect on Human Understanding?"*
 * (Graph Drawing 1997): **엣지 교차 최소화가 인간 이해도에 압도적으로 가장
 * 중요했고**, 각도 해상도 최대화와 격자 스냅은 통계적으로 유의하지 않았다.
 *
 * 그래서 둘만 잰다 — **교차**, 그리고 교차보다 앞선 전제인 **겹침**(가려진 노드는
 * 읽히기 전에 화면에 없다). 유의하지 않다고 밝혀진 미학을 재면 숫자만 늘고 판정은
 * 안 는다. 그건 계기가 아니라 대시보드다.
 *
 * 기성 라이브러리(`greadability.js`)를 안 쓴 이유도 같다 — 유의하지 않은 축까지
 * 계산하고, 우리가 쓰는 둘은 이 파일이다. `forbidden.md` 는 새 의존성에 이유를
 * 요구한다.
 */

/** 곡선 하나를 몇 개의 선분으로 근사할까. */
const SAMPLES = 8;

const orient = (ax, ay, bx, by, cx, cy) => {
  const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  return v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0;
};

const segmentsCross = (p, q, r, s) =>
  orient(p[0], p[1], q[0], q[1], r[0], r[1]) !== orient(p[0], p[1], q[0], q[1], s[0], s[1]) &&
  orient(r[0], r[1], s[0], s[1], p[0], p[1]) !== orient(r[0], r[1], s[0], s[1], q[0], q[1]);

/**
 * 2차 베지어를 폴리라인으로.
 *
 * **현선이 아니라 그려지는 곡선을 재기 위해서다.** 이 지도의 엣지는
 * `quadraticCurveTo` 로 그려진다 — 끝점만 이으면 화면에 없는 교차를 세고 화면에
 * 있는 교차를 놓친다. 컨트롤 포인트가 없으면 직선으로 취급한다.
 */
function polyline(e) {
  const cx = e.controlX ?? (e.ax + e.bx) / 2;
  const cy = e.controlY ?? (e.ay + e.by) / 2;
  const pts = [];
  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = i / SAMPLES;
    const u = 1 - t;
    pts.push([
      u * u * e.ax + 2 * u * t * cx + t * t * e.bx,
      u * u * e.ay + 2 * u * t * cy + t * t * e.by,
    ]);
  }
  return pts;
}

const sharesEndpoint = (a, b) =>
  a.sourceId === b.sourceId ||
  a.sourceId === b.targetId ||
  a.targetId === b.sourceId ||
  a.targetId === b.targetId;

/**
 * @param {{
 *   nodes: Array<{ id: string, x: number, y: number, radius: number }>,
 *   edges: Array<{ sourceId: string, targetId: string, ax: number, ay: number, bx: number, by: number, controlX?: number, controlY?: number }>,
 *   width: number, height: number,
 * }} input — 좌표는 전부 화면(CSS) 픽셀.
 */
export function measureReadability({ nodes, edges, width, height }) {
  /** 화면 밖 기하는 사용자가 볼 수 없다 — 여기 교차를 세면 판정이 오염된다. */
  const onScreen = (x, y, pad = 0) => x >= -pad && y >= -pad && x <= width + pad && y <= height + pad;

  // ── 1. 엣지 교차 ─────────────────────────────────────────────────────────
  const visible = edges.filter(
    (e) =>
      onScreen(e.ax, e.ay) ||
      onScreen(e.bx, e.by) ||
      onScreen(e.controlX ?? (e.ax + e.bx) / 2, e.controlY ?? (e.ay + e.by) / 2),
  );
  const polys = visible.map((e) => ({ e, pts: polyline(e) }));
  // 축 정렬 바운딩 박스 선별 — 없으면 큰 볼트에서 쌍 비교가 수천만 번이다.
  const bbox = polys.map(({ pts }) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    return [x0, y0, x1, y1];
  });

  let crossings = 0;
  for (let i = 0; i < polys.length; i += 1) {
    for (let j = i + 1; j < polys.length; j += 1) {
      // **끝점을 공유하는 엣지 쌍은 세지 않는다.** 한 노드에서 뻗은 두 선이 그
      // 노드에서 만나는 것은 교차가 아니라 그래프의 정의다 — 세면 차수 높은
      // 노드를 가진 그래프가 무조건 나쁘게 나온다.
      if (sharesEndpoint(polys[i].e, polys[j].e)) continue;
      const [ax0, ay0, ax1, ay1] = bbox[i];
      const [bx0, by0, bx1, by1] = bbox[j];
      if (ax1 < bx0 || bx1 < ax0 || ay1 < by0 || by1 < ay0) continue;
      let hit = false;
      for (let m = 0; m < SAMPLES && !hit; m += 1) {
        for (let n = 0; n < SAMPLES && !hit; n += 1) {
          if (segmentsCross(polys[i].pts[m], polys[i].pts[m + 1], polys[j].pts[n], polys[j].pts[n + 1])) {
            hit = true;
          }
        }
      }
      if (hit) crossings += 1;
    }
  }

  /**
   * 정규화 상한 — 모든 엣지 쌍에서 **끝점을 공유해 교차가 원천적으로 불가능한
   * 쌍**을 뺀 수. 품질은 1 이 무교차.
   */
  const m = visible.length;
  const degree = new Map();
  for (const e of visible) {
    degree.set(e.sourceId, (degree.get(e.sourceId) ?? 0) + 1);
    degree.set(e.targetId, (degree.get(e.targetId) ?? 0) + 1);
  }
  let impossiblePairs = 0;
  for (const d of degree.values()) impossiblePairs += (d * (d - 1)) / 2;
  const maxCrossings = Math.max(0, (m * (m - 1)) / 2 - impossiblePairs);

  // ── 2. 노드 겹침 ─────────────────────────────────────────────────────────
  const vis = nodes.filter((n) => n.radius > 0 && onScreen(n.x, n.y, n.radius));
  const sorted = [...vis].sort((a, b) => a.x - b.x); // x 스윕 — O(n²) 회피
  let overlaps = 0;
  let worstOverlapPx = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const a = sorted[i];
      const b = sorted[j];
      const reach = a.radius + b.radius;
      if (b.x - a.x > reach) break; // 정렬돼 있으므로 이 뒤는 전부 멀다
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < reach) {
        overlaps += 1;
        worstOverlapPx = Math.max(worstOverlapPx, reach - d);
      }
    }
  }

  return {
    visibleNodes: vis.length,
    visibleEdges: m,
    crossings,
    maxCrossings,
    /**
     * ★ **공허한 만점을 만점으로 읽지 않기 위한 칸.**
     *
     * 실측에서 합성 3000 이 `교차 0 / 가능 0 → 품질 1` 을 냈다. 그건 배치가
     * 완벽해서가 아니라 **밀도 게이트가 서브트리를 접어 화면에 별 모양 18엣지만
     * 남았기 때문**이다 — 모든 엣지 쌍이 끝점을 공유하니 교차가 원천적으로 불가능
     * 하고, 그래서 만점이 나온다. 이 칸이 없으면 계기가 "가장 큰 볼트에서 가장
     * 좋다" 는 정반대 결론을 낸다.
     */
    crossingMeasurable: maxCrossings > 0,
    crossingQuality: maxCrossings > 0 ? +(1 - crossings / maxCrossings).toFixed(4) : null,
    overlaps,
    /** 겹친 쌍 / 노드 — 규모가 다른 케이스를 비교하려면 이쪽. */
    overlapRate: vis.length > 1 ? +(overlaps / vis.length).toFixed(4) : 0,
    worstOverlapPx: +worstOverlapPx.toFixed(1),
  };
}
