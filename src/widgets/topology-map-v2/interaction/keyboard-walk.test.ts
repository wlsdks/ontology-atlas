import { describe, expect, it } from "vitest";
import {
  CONE_HALF_TANGENT,
  DEAD_END_NOTICE_COOLDOWN_MS,
  shouldAnnounceDeadEnd,
  ORTHOGONAL_PENALTY,
  pickInitialFocus,
  pickNeighborInDirection,
  walkDirectionForKey,
  type WalkNode,
} from "./keyboard-walk";

/** y 는 화면 좌표계 — 아래로 갈수록 커진다. */
const at = (id: string, x: number, y: number): WalkNode => ({ id, x, y });

describe("pickNeighborInDirection", () => {
  const center = at("c", 0, 0);

  it("바로 위·아래·왼·오른쪽을 각각 고른다", () => {
    const neighbors = [at("up", 0, -100), at("down", 0, 100), at("left", -100, 0), at("right", 100, 0)];
    expect(pickNeighborInDirection(center, neighbors, "up")).toBe("up");
    expect(pickNeighborInDirection(center, neighbors, "down")).toBe("down");
    expect(pickNeighborInDirection(center, neighbors, "left")).toBe("left");
    expect(pickNeighborInDirection(center, neighbors, "right")).toBe("right");
  });

  it("그 방향에 이웃이 없으면 아무 일도 하지 않는다 — 감싸 돌지 않는다", () => {
    // 아래에만 이웃이 있다. 위를 눌러도 그 아래 노드로 뛰지 않는다.
    expect(pickNeighborInDirection(center, [at("only", 0, 200)], "up")).toBeNull();
  });

  it("뒤에 있는 것은 세지 않는다", () => {
    expect(pickNeighborInDirection(center, [at("behind", 0, 100)], "up")).toBeNull();
  });

  it("가까운 쪽을 고른다", () => {
    const neighbors = [at("far", 0, -400), at("near", 0, -80)];
    expect(pickNeighborInDirection(center, neighbors, "up")).toBe("near");
  });

  /**
   * 직교 벌점이 하는 일 — 「거의 옆인데 살짝 위」가 「바로 위」를 이기지 못한다.
   * 벌점이 없으면 거리만 비교되어 `sideways` 가 이긴다(거리 90 < 100).
   */
  it("바로 위가, 더 가깝지만 옆으로 벗어난 것을 이긴다", () => {
    const straight = at("straight", 0, -100);
    const sideways = at("sideways", 80, -40); // 직선거리 ≈ 89
    const picked = pickNeighborInDirection(center, [sideways, straight], "up");
    expect(picked, "직교 벌점이 안 걸렸다").toBe("straight");
    // 벌점이 실제로 결과를 갈랐는지 산수로 확인한다(값이 바뀌면 여기서 터진다).
    expect(100 + 0 * ORTHOGONAL_PENALTY).toBeLessThan(40 + 80 * ORTHOGONAL_PENALTY);
  });

  it("부채꼴(±60°) 밖은 버린다", () => {
    // 위로 10, 옆으로 100 → across/along = 10 > tan(60°) ≈ 1.73
    expect(pickNeighborInDirection(center, [at("wide", 100, -10)], "up")).toBeNull();
    // 부채꼴 안쪽 경계 바로 안 — 통과해야 한다.
    const inside = at("inside", 100 * (CONE_HALF_TANGENT - 0.05), -100);
    expect(pickNeighborInDirection(center, [inside], "up")).toBe("inside");
  });

  /**
   * **네 방향이 틈 없이 평면을 덮는다** — 어떤 이웃이든 최소 한 방향키로는 닿는다.
   * 이 성질이 ±60° 를 고른 이유이고, 각을 좁히면 여기서 먼저 터진다.
   */
  it("어느 방향으로 놓인 이웃이든 최소 한 방향키로 닿는다", () => {
    const DIRECTIONS = ["up", "down", "left", "right"] as const;
    const unreachable: number[] = [];
    for (let degrees = 0; degrees < 360; degrees += 3) {
      const radians = (degrees * Math.PI) / 180;
      const neighbor = at("n", Math.cos(radians) * 150, Math.sin(radians) * 150);
      const reached = DIRECTIONS.some(
        (direction) => pickNeighborInDirection(center, [neighbor], direction) === "n",
      );
      if (!reached) unreachable.push(degrees);
    }
    expect(unreachable, `이 각도의 이웃에 아무 방향키로도 못 닿는다: ${unreachable.join(", ")}`).toEqual(
      [],
    );
  });

  it("자기 자신은 세지 않는다", () => {
    expect(pickNeighborInDirection(center, [center], "up")).toBeNull();
  });

  it("값이 같으면 배열 순서가 아니라 id 로 가른다", () => {
    const a = at("aaa", 0, -100);
    const b = at("bbb", 0, -100);
    expect(pickNeighborInDirection(center, [b, a], "up")).toBe("aaa");
    expect(pickNeighborInDirection(center, [a, b], "up")).toBe("aaa");
  });

  it("이웃이 없으면 null", () => {
    expect(pickNeighborInDirection(center, [], "up")).toBeNull();
  });
});

describe("pickInitialFocus", () => {
  it("화면 가운데에 가장 가까운 노드를 고른다", () => {
    const nodes = [at("far", 500, 500), at("near", 10, 10), at("mid", 200, 0)];
    expect(pickInitialFocus(nodes, { x: 0, y: 0 })).toBe("near");
  });

  it("배열 순서가 아니라 거리로 고른다 — 첫 노드가 화면 밖일 수 있다", () => {
    const nodes = [at("first", 9_000, 9_000), at("visible", 5, 5)];
    expect(pickInitialFocus(nodes, { x: 0, y: 0 })).toBe("visible");
  });

  it("같은 거리면 id 로 가른다", () => {
    expect(pickInitialFocus([at("b", 10, 0), at("a", -10, 0)], { x: 0, y: 0 })).toBe("a");
  });

  it("노드가 없으면 null", () => {
    expect(pickInitialFocus([], { x: 0, y: 0 })).toBeNull();
  });
});

describe("shouldAnnounceDeadEnd", () => {
  it("처음에는 말한다", () => {
    expect(shouldAnnounceDeadEnd(null, 0)).toBe(true);
  });

  it("말한 직후에는 다시 말하지 않는다", () => {
    expect(shouldAnnounceDeadEnd(1_000, 1_000 + DEAD_END_NOTICE_COOLDOWN_MS - 1)).toBe(false);
  });

  it("식은 뒤에는 다시 말한다", () => {
    expect(shouldAnnounceDeadEnd(1_000, 1_000 + DEAD_END_NOTICE_COOLDOWN_MS)).toBe(true);
  });

  it("쉬는 시간이 사람이 읽을 만한 길이다", () => {
    expect(DEAD_END_NOTICE_COOLDOWN_MS).toBeGreaterThanOrEqual(600);
    expect(DEAD_END_NOTICE_COOLDOWN_MS).toBeLessThanOrEqual(4_000);
  });
});

describe("walkDirectionForKey", () => {
  it("네 방향키만 우리 것이다", () => {
    expect(walkDirectionForKey("ArrowUp")).toBe("up");
    expect(walkDirectionForKey("ArrowDown")).toBe("down");
    expect(walkDirectionForKey("ArrowLeft")).toBe("left");
    expect(walkDirectionForKey("ArrowRight")).toBe("right");
  });

  it("그 밖의 키는 우리 것이 아니다 — 남의 단축키를 삼키지 않는다", () => {
    for (const key of ["Enter", "Escape", "Tab", "g", "p", "PageUp", "Home", " "]) {
      expect(walkDirectionForKey(key), `${key} 를 방향키로 먹었다`).toBeNull();
    }
  });
});
