import { describe, expect, it } from "vitest";
import { RELIEF_PITCH_MAX, RELIEF_PITCH_REST, RELIEF_RISE_TOTAL_MS } from "./relief-projection";
import { draggedPitch, ReliefPose, reliefTweenMs, restingPitch } from "./relief-pose";

describe("relief pose", () => {
  it("rests at the nearer pose on release", () => {
    expect(restingPitch(0.374)).toBe(0);
    expect(restingPitch(0.375)).toBe(RELIEF_PITCH_REST);
    expect(restingPitch(0.9)).toBe(RELIEF_PITCH_REST);
  });

  it("maps vertical drag at 0.003 rad/px within 0 and the maximum", () => {
    expect(draggedPitch(0, 100)).toBeCloseTo(0.3, 9);
    expect(draggedPitch(0.75, -100)).toBeCloseTo(0.45, 9);
    expect(draggedPitch(0, -50)).toBe(0);
    expect(draggedPitch(0.5, 1000)).toBe(RELIEF_PITCH_MAX);
  });

  it("tweens for 200 ms plus up to 220 ms by distance", () => {
    expect(reliefTweenMs(0)).toBe(200);
    expect(reliefTweenMs(RELIEF_PITCH_REST)).toBe(420);
    expect(reliefTweenMs(-RELIEF_PITCH_REST / 2)).toBe(310);
  });

  it("lands at once when not animated (reduced motion)", () => {
    const pose = new ReliefPose();
    pose.begin(RELIEF_PITCH_REST, { now: 0, animate: false, rise: false });
    expect(pose.pitch).toBe(RELIEF_PITCH_REST);
    expect(pose.animating).toBe(false);
  });

  it("tweens to the target and stops", () => {
    const pose = new ReliefPose();
    pose.begin(RELIEF_PITCH_REST, { now: 1000, animate: true, rise: false });
    expect(pose.animating).toBe(true);
    pose.step(1100);
    expect(pose.pitch).toBeGreaterThan(0);
    expect(pose.pitch).toBeLessThan(RELIEF_PITCH_REST);
    pose.step(1000 + reliefTweenMs(RELIEF_PITCH_REST));
    expect(pose.pitch).toBe(RELIEF_PITCH_REST);
    expect(pose.animating).toBe(false);
  });

  it("rises on the assembly clock and reports it", () => {
    const pose = new ReliefPose();
    pose.begin(RELIEF_PITCH_REST, { now: 0, animate: true, rise: true });
    expect(pose.step(100).riseClock).toBe(100);
    expect(pose.step(RELIEF_RISE_TOTAL_MS).riseClock).toBeNull();
    expect(pose.pitch).toBe(RELIEF_PITCH_REST);
  });

  it("ignores a second request for the target it is already heading to", () => {
    const pose = new ReliefPose();
    pose.begin(RELIEF_PITCH_REST, { now: 0, animate: true, rise: false });
    pose.step(100);
    const mid = pose.pitch;
    pose.begin(RELIEF_PITCH_REST, { now: 100, animate: false, rise: false });
    expect(pose.pitch).toBe(mid);
    expect(pose.animating).toBe(true);
  });
});
