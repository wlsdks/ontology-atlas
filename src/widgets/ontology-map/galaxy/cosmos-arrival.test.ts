import { describe, expect, it } from "vitest";
import { TIER_ASSEMBLE_TOTAL_MS } from "../morph/tier-assembly";
import { applyArrival, ARRIVAL_MS, chooseArrival } from "./cosmos-arrival";
import type { CosmosArrivalMode, GalaxyPose } from "./cosmos-types";
import type { CosmosLayout } from "./layout/cosmos-layout";

const finals = [
  { x: 10, y: 0 },
  { x: 100, y: 0 },
];

function fakeLayout(keyframes: number[][]): CosmosLayout {
  return { galaxies: finals, settle: { keyframes, targetRadius: 100 } } as unknown as CosmosLayout;
}

const frames = [
  [0, 0, 0, 0],
  [5, 1, 50, 2],
  [10, 0, 100, 0],
];

const blankPoses = (): GalaxyPose[] => finals.map(() => ({ x: NaN, y: NaN, theta: 0, wispTheta: 0, wispLight: 1, presence: 0, condense: 0 }));

describe("chooseArrival", () => {
  const base = { firstOpen: true, arrivedByMorph: false, hasRecord: false, relayout: false, reducedMotion: false };
  const rows: [Partial<typeof base>, CosmosArrivalMode][] = [
    [{ reducedMotion: true, relayout: true }, "none"],
    [{ relayout: true, arrivedByMorph: true, firstOpen: false, hasRecord: true }, "replay"],
    [{ arrivedByMorph: true }, "none"],
    [{ firstOpen: false }, "none"],
    [{ hasRecord: true }, "condense"],
    [{}, "replay"],
  ];
  it.each(rows)("%o → %s", (patch, mode) => {
    expect(chooseArrival({ ...base, ...patch })).toBe(mode);
  });
});

describe("applyArrival", () => {
  it("raises the core over its own 520 ms rise", () => {
    const poses = blankPoses();
    applyArrival(fakeLayout(frames), 260, "replay", poses);
    expect(poses[0]!.corePresence).toBeCloseTo(1 - 0.5 ** 3, 9);
    expect(poses[1]!.corePresence).toBe(poses[0]!.corePresence);
    applyArrival(fakeLayout(frames), 600, "replay", poses);
    expect(poses[0]!.corePresence).toBe(1);
    applyArrival(fakeLayout(frames), 100, "none", poses);
    expect(poses[0]!.corePresence).toBe(1);
  });

  it("lasts the tier assembly", () => {
    expect(ARRIVAL_MS).toBe(TIER_ASSEMBLE_TOTAL_MS);
    expect(ARRIVAL_MS).toBe(1120);
  });

  it("reads the first keyframe before the start without throwing", () => {
    const poses = blankPoses();
    expect(applyArrival(fakeLayout(frames), -16, "replay", poses)).toBe(true);
    expect(poses.map((p) => [p.x, p.y])).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(poses.every((p) => p.presence === 0 && p.condense === 0.25)).toBe(true);
  });

  it("replays centres linearly through the keyframes", () => {
    const poses = blankPoses();
    applyArrival(fakeLayout(frames), ARRIVAL_MS / 2, "replay", poses);
    expect(poses[1]).toMatchObject({ x: 50, y: 2 });
  });

  it("condenses in place with one keyframe and does nothing with none", () => {
    const one = blankPoses();
    expect(applyArrival(fakeLayout([[0, 0, 0, 0]]), 400, "replay", one)).toBe(true);
    expect(one.map((p) => [p.x, p.y])).toEqual(finals.map((g) => [g.x, g.y]));
    expect(one[0]!.presence).toBeGreaterThan(0);
    expect(one[0]!.presence).toBeLessThan(1);
    const zero = blankPoses();
    expect(applyArrival(fakeLayout([]), 400, "replay", zero)).toBe(false);
    expect(zero.every((p) => p.presence === 1 && p.condense === 1)).toBe(true);
  });

  it("holds centres fixed while condensing", () => {
    const poses = blankPoses();
    for (const clock of [0, 300, 700, 1000]) {
      applyArrival(fakeLayout(frames), clock, "condense", poses);
      expect(poses.map((p) => [p.x, p.y])).toEqual(finals.map((g) => [g.x, g.y]));
    }
  });

  it.each(["replay", "condense"] as const)("is whole at the end of %s", (mode) => {
    const poses = blankPoses();
    expect(applyArrival(fakeLayout(frames), ARRIVAL_MS, mode, poses)).toBe(false);
    expect(poses).toEqual(finals.map((g) => expect.objectContaining({ x: g.x, y: g.y, presence: 1, condense: 1 })));
  });

  it("brings an inner galaxy in before an outer one", () => {
    const poses = blankPoses();
    applyArrival(fakeLayout(frames), 300, "replay", poses);
    expect(poses[0]!.presence).toBeGreaterThan(0);
    expect(poses[1]!.presence).toBe(0);
    expect(poses[0]!.condense).toBeGreaterThan(poses[1]!.condense);
  });
});
