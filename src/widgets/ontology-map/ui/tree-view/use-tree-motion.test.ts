import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TreeNameSide, TreePose } from "../../model/tree-view/types";
import { TreeMotion, type TreeMotionHost } from "./use-tree-motion";

const FREE = { x: 0, y: 0, width: 1000, height: 800 };
const FRAME_MS = 16;

/** A frame clock the test advances by hand; it counts every frame the code asks for. */
function frameClock() {
  const pending = new Map<number, FrameRequestCallback>();
  let next = 1;
  let now = 0;
  const clock = {
    requested: 0,
    get pending() {
      return pending.size;
    },
    /** Runs the frames pending now, one clock step later. */
    step() {
      now += FRAME_MS;
      const due = [...pending.values()];
      pending.clear();
      for (const callback of due) callback(now);
    },
  };
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    clock.requested += 1;
    pending.set(next, callback);
    return next++;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => pending.delete(id));
  return clock;
}

function recordingHost() {
  const draws: { pose: TreePose; keep: ReadonlyMap<number, TreeNameSide> | null; growth: number }[] = [];
  const host: TreeMotionHost = {
    layout: null,
    draw: (pose, keep, growth) => {
      draws.push({ pose: { ...pose }, keep, growth });
      return true;
    },
    locate: () => false,
    fitOf: (free) => free,
    names: { current: { boxes: [], count: 0, dropped: 0, tested: 0 } },
    reducedMotion: false,
    onDrawn: () => {},
    onGrowing: () => {},
  };
  return { host, draws };
}

describe("the tree's frame loop", () => {
  let clock: ReturnType<typeof frameClock>;
  beforeEach(() => {
    clock = frameClock();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("schedules no further frame after a drag that ends still", () => {
    const { host, draws } = recordingHost();
    const motion = new TreeMotion(host, false);
    motion.setFree(FREE, false, -1);
    motion.beginDrag(-1);
    motion.dragBy(40, 0);
    clock.step();
    motion.dragBy(80, 0);
    const requestedBeforeRelease = clock.requested;

    motion.endDrag(0);

    expect(clock.requested).toBe(requestedBeforeRelease);
    expect(clock.pending).toBe(0);
    expect(draws.at(-1)!.keep).toBeNull();
    expect(draws.at(-1)!.pose.yaw).toBeCloseTo((80 * Math.PI) / 600);
  });

  it("lets a flick coast on, then stops the loop once the coast has died out", () => {
    const { host, draws } = recordingHost();
    const motion = new TreeMotion(host, false);
    motion.setFree(FREE, false, -1);
    motion.beginDrag(-1);
    motion.dragBy(120, 0);
    clock.step();
    const releasedYaw = motion.pose.yaw;
    const drawsAtRelease = draws.length;

    motion.endDrag(2);
    let frames = 0;
    while (clock.pending > 0 && frames < 1000) {
      clock.step();
      frames += 1;
    }

    expect(clock.pending).toBe(0);
    expect(frames).toBeLessThan(1000);
    expect(motion.pose.yaw).toBeGreaterThan(releasedYaw);
    expect(draws.at(-1)!.keep).toBeNull();
    expect(draws.slice(drawsAtRelease, -1).every((draw) => draw.keep !== null)).toBe(true);
  });
});
