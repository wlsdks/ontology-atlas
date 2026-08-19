import { describe, expect, it } from "vitest";

import { relaxNodeSeparation, type SeparationNode } from "./separation";

const dist = (a: SeparationNode, b: SeparationNode) => Math.hypot(b.x - a.x, b.y - a.y);

describe("relaxNodeSeparation", () => {
  it("겹친 쌍을 최소 거리 이상으로 밀어낸다", () => {
    const nodes: SeparationNode[] = [
      { id: "parent", x: 0, y: 0, r: 28 },
      { id: "child", x: 5, y: 0, r: 7 },
    ];
    relaxNodeSeparation(nodes, { ratio: 1.35, iterations: 2 });
    expect(dist(nodes[0], nodes[1])).toBeGreaterThanOrEqual((28 + 7) * 1.35 - 0.01);
  });

  it("핀 노드는 절대 움직이지 않는다 — 상대만 밀린다", () => {
    const nodes: SeparationNode[] = [
      { id: "pinned", x: 0, y: 0, r: 17 },
      { id: "other", x: 3, y: 0, r: 17 },
    ];
    relaxNodeSeparation(nodes, { ratio: 1.35, iterations: 2, pinnedId: "pinned" });
    expect(nodes[0].x).toBe(0);
    expect(nodes[0].y).toBe(0);
    expect(dist(nodes[0], nodes[1])).toBeGreaterThanOrEqual(34 * 1.35 - 0.01);
  });

  it("이미 떨어진 쌍은 건드리지 않는다 (결정론·무부작용)", () => {
    const nodes: SeparationNode[] = [
      { id: "a", x: 0, y: 0, r: 10 },
      { id: "b", x: 200, y: 0, r: 10 },
    ];
    relaxNodeSeparation(nodes, { ratio: 1.35, iterations: 2 });
    expect(nodes[0]).toMatchObject({ x: 0, y: 0 });
    expect(nodes[1]).toMatchObject({ x: 200, y: 0 });
  });

  it("완전 동일 좌표도 결정론적으로 분리한다 (0 나누기 방어)", () => {
    const nodes: SeparationNode[] = [
      { id: "a", x: 50, y: 50, r: 10 },
      { id: "b", x: 50, y: 50, r: 10 },
    ];
    relaxNodeSeparation(nodes, { ratio: 1.35, iterations: 2 });
    expect(dist(nodes[0], nodes[1])).toBeGreaterThan(0);
  });
});

/**
 * 차등 검사 — 「빨라진 것이지 달라진 것이 아니다」.
 *
 * 2026-08-19 에 비활성 i 의 안쪽 루프를 «활성인 j» 위로만 돌리도록 바꿨다
 * (3D 돔은 밀도 게이트로 접지 않아 N² 방문이 그대로 프레임 비용이 됐다 —
 * 노드 드래그 p95 52.1ms). 이 함수는 좌표를 **제자리에서** 고치므로 쌍을
 * 방문하는 «순서» 가 곧 결과다. 그래서 빠르기가 아니라 **동일성**을 검사한다:
 * 아래 `referenceRelax` 는 최적화 이전의 열거 그대로이고, 무작위 그래프에서
 * 두 결과가 비트 단위로 같아야 한다.
 *
 * 이 검사가 놀고 있지 않다는 증거: `referenceRelax` 의 `iActive` 를 j 루프
 * «안» 으로 옮기면(= 연쇄 전파를 같은 패스에서 반영) 즉시 빨갛게 된다.
 */
function referenceRelax(nodes: SeparationNode[], options: {
  ratio: number;
  iterations: number;
  pinnedId?: string | null;
  activeIds?: ReadonlySet<string> | null;
}): void {
  const { ratio, iterations, pinnedId = null, activeIds = null } = options;
  const active = activeIds ? nodes.map((n) => activeIds.has(n.id)) : null;
  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      const iActive = active === null || active[i];
      for (let j = i + 1; j < nodes.length; j += 1) {
        if (!iActive && active !== null && !active[j]) continue;
        const a = nodes[i];
        const b = nodes[j];
        const minDist = (a.r + b.r) * ratio;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= minDist) continue;
        if (dist < 1e-6) {
          dx = 1;
          dy = 0;
          dist = 1;
        }
        const push = (minDist - dist) / dist;
        const px = dx * push;
        const py = dy * push;
        if (a.id === pinnedId) {
          b.x += px;
          b.y += py;
        } else if (b.id === pinnedId) {
          a.x -= px;
          a.y -= py;
        } else {
          a.x -= px / 2;
          a.y -= py / 2;
          b.x += px / 2;
          b.y += py / 2;
        }
        if (active !== null) {
          active[i] = true;
          active[j] = true;
        }
      }
    }
  }
}

/** 결정론 난수 — 시드 고정이라 실패가 재현된다. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function makeNodes(rng: () => number, count: number): SeparationNode[] {
  const out: SeparationNode[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      id: `n${i}`,
      // 좁은 상자에 몰아넣어 겹침(=연쇄 전파)이 실제로 일어나게 한다.
      x: Math.round(rng() * 300 * 1000) / 1000,
      y: Math.round(rng() * 300 * 1000) / 1000,
      r: 6 + Math.round(rng() * 20),
    });
  }
  return out;
}

describe("relaxNodeSeparation — 활성 집합 열거 최적화", () => {
  it("무작위 그래프 30개에서 최적화 이전 열거와 결과가 동일하다", () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const rng = makeRng(seed * 7919);
      const base = makeNodes(rng, 60);
      // 활성 집합 크기를 0 ~ 전체까지 훑는다 — 경계(빈 집합·전체)도 포함.
      const activeCount = seed % 61;
      const activeIds = new Set(base.slice(0, activeCount).map((n) => n.id));
      const pinnedId = seed % 3 === 0 ? base[0].id : null;

      const mine = base.map((n) => ({ ...n }));
      const ref = base.map((n) => ({ ...n }));
      const options = { ratio: 1.35, iterations: 2, pinnedId, activeIds };
      relaxNodeSeparation(mine, options);
      referenceRelax(ref, options);

      expect(mine.map((n) => `${n.id}:${n.x}:${n.y}`)).toEqual(
        ref.map((n) => `${n.id}:${n.x}:${n.y}`),
      );
    }
  });

  it("활성 집합이 없으면(=전 노드 활성) 종전 경로와 동일하다", () => {
    const rng = makeRng(4242);
    const base = makeNodes(rng, 40);
    const mine = base.map((n) => ({ ...n }));
    const ref = base.map((n) => ({ ...n }));
    relaxNodeSeparation(mine, { ratio: 1.35, iterations: 2 });
    referenceRelax(ref, { ratio: 1.35, iterations: 2 });
    expect(mine.map((n) => `${n.x}:${n.y}`)).toEqual(ref.map((n) => `${n.x}:${n.y}`));
  });

  it("연쇄 전파가 살아 있다 — 활성 하나가 정지 사슬 A→B→C 를 민다", () => {
    // 한 줄로 겹쳐 세운다: a(활성)만 움직였는데 c 까지 밀려야 한다.
    const nodes: SeparationNode[] = [
      { id: "a", x: 0, y: 0, r: 20 },
      { id: "b", x: 10, y: 0, r: 20 },
      { id: "c", x: 20, y: 0, r: 20 },
    ];
    relaxNodeSeparation(nodes, {
      ratio: 1.35,
      iterations: 2,
      activeIds: new Set(["a"]),
    });
    expect(nodes[2].x).not.toBe(20);
  });
});
