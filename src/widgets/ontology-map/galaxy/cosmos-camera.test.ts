import { describe, expect, it } from "vitest";
import { MOMENTUM_TAU_MS } from "../model/motion-physics";
import { CosmosCameraRig, focusScale, galaxyFitScale, screenToWorld, worldToScreen } from "./cosmos-camera";
import type { CosmosCamera } from "./cosmos-types";

const room = { x: 100, y: 80, width: 1000, height: 700 };
const bounds = { minX: -500, minY: -400, maxX: 500, maxY: 400 };

function rig(camera: CosmosCamera = { x: 0, y: 0, scale: 1 }): CosmosCameraRig {
  const r = new CosmosCameraRig();
  r.room = room;
  r.setBounds(bounds, true);
  r.camera = { ...camera };
  return r;
}

function settle(r: CosmosCameraRig, from: number, until = from + 5_000): number {
  let t = from;
  while (r.step(t) && t < until) t += 16;
  return t;
}

describe("cosmos camera", () => {
  it("refits a changed room after arrival by gliding from the view on screen, not by snapping", () => {
    const rig = new CosmosCameraRig();
    rig.room = { x: 0, y: 0, width: 1441, height: 977 };
    rig.setBounds({ minX: -500, minY: -400, maxX: 500, maxY: 400 }, true);
    const at = worldToScreen(rig.camera, rig.room, 120, -80);
    rig.readRoom({ x: 0, y: 0, width: 1300, height: 860 }, { final: true, keepView: true });
    rig.fit(true, 0);
    expect(rig.step(1)).toBe(true);
    const first = worldToScreen(rig.camera, rig.room, 120, -80);
    expect(Math.hypot(first.x - at.x, first.y - at.y)).toBeLessThan(1);
    for (let t = 16; rig.step(t); t += 16);
    const end = worldToScreen(rig.camera, rig.room, 120, -80);
    expect(Math.hypot(end.x - at.x, end.y - at.y)).toBeGreaterThan(20);
  });

  it("presents intermediate refit positions across delayed frames and still lands exactly", () => {
    const r = new CosmosCameraRig();
    r.room = { x: 0, y: 0, width: 1441, height: 977 };
    r.setBounds(bounds, true);
    const at = worldToScreen(r.camera, r.room, 120, -80);
    r.readRoom({ x: 0, y: 0, width: 1300, height: 860 }, { final: true, keepView: true });
    const target = new CosmosCameraRig();
    target.room = r.room;
    target.setBounds(bounds, true);
    const end = worldToScreen(target.camera, target.room, 120, -80);
    const travel = Math.hypot(end.x - at.x, end.y - at.y);
    r.fit(true, 0, "presentation");
    let previous = at;
    let moving = true;
    let frames = 0;
    for (const now of [16, 108, 191, 10_000, 10_120, 10_240, 10_360, 10_480, 10_600, 10_720, 10_840]) {
      moving = r.step(now);
      const next = worldToScreen(r.camera, r.room, 120, -80);
      expect(Math.hypot(next.x - previous.x, next.y - previous.y)).toBeLessThanOrEqual(travel * 0.5);
      previous = next;
      frames += 1;
      if (!moving) break;
    }
    expect(frames).toBeGreaterThan(4);
    expect(moving).toBe(false);
    expect(r.camera).toEqual(target.camera);
  });

  it.each([60, 120])("keeps the normal refit path and duration at %i Hz", (hz) => {
    const presented = rig({ x: 100, y: -50, scale: 0.7 });
    const elapsed = rig({ x: 100, y: -50, scale: 0.7 });
    presented.fit(true, 0, "presentation");
    elapsed.fit(true, 0);
    for (let frame = 0; frame <= hz; frame += 1) {
      const now = frame * 1000 / hz;
      expect(presented.step(now)).toBe(elapsed.step(now));
      expect(presented.camera).toEqual(elapsed.camera);
    }
  });

  it("lets a drag replace a delayed refit and fits immediately with reduced motion", () => {
    const r = rig({ x: 100, y: -50, scale: 0.7 });
    r.fit(true, 0, "presentation");
    r.step(1_000);
    r.dragStart(1, { x: 300, y: 300 }, 1_000);
    r.dragMove(1, { x: 330, y: 340 }, 1_016, 1);
    const dragged = { ...r.camera };
    expect(r.step(10_000)).toBe(false);
    expect(r.camera).toEqual(dragged);
    r.cancelDrag();
    r.reducedMotion = true;
    r.fit(true, 10_000, "presentation");
    const fitted = rig();
    fitted.fit(false, 0);
    expect(r.camera).toEqual(fitted.camera);
    expect(r.step(20_000)).toBe(false);
  });

  it("never approaches a star by zooming out", () => {
    const galaxy = { extent: 400 };
    const fit = galaxyFitScale(galaxy, room);
    expect(focusScale({ current: fit * 3, galaxy, room, overviewScale: 0.4 })).toBe(fit * 3);
    expect(focusScale({ current: fit / 2, galaxy, room, overviewScale: 0.4 })).toBe(fit);
  });

  it("holds the project and halo stars at the overview scale or closer", () => {
    expect(focusScale({ current: 0.2, galaxy: null, room, overviewScale: 0.4 })).toBe(0.4);
    expect(focusScale({ current: 1.3, galaxy: null, room, overviewScale: 0.4 })).toBe(1.3);
  });

  it("travels back to the camera held before the first selection only when no gesture came between", () => {
    const r = rig({ x: 10, y: 20, scale: 0.9 });
    r.holdReturn();
    r.approach({ x: 300, y: 100 }, { extent: 50 }, room, 0);
    settle(r, 0);
    r.releaseReturn(10_000);
    settle(r, 10_000);
    expect(r.camera).toEqual({ x: 10, y: 20, scale: 0.9 });

    r.holdReturn();
    r.approach({ x: 300, y: 100 }, { extent: 50 }, room, 20_000);
    settle(r, 20_000);
    r.zoomAt({ x: 400, y: 300 }, 1.2, false, 30_000);
    const chosen = { ...r.camera };
    r.releaseReturn(31_000);
    settle(r, 31_000);
    expect(r.camera).toEqual(chosen);
  });

  it("keeps the first return across a second selection", () => {
    const r = rig({ x: 10, y: 20, scale: 0.9 });
    r.holdReturn();
    r.approach({ x: 300, y: 100 }, { extent: 50 }, room, 0);
    settle(r, 0);
    r.holdReturn();
    r.approach({ x: -200, y: 50 }, { extent: 80 }, room, 5_000);
    settle(r, 5_000);
    r.releaseReturn(10_000);
    settle(r, 10_000);
    expect(r.camera).toEqual({ x: 10, y: 20, scale: 0.9 });
  });

  it("travels within 200 to 420 ms", () => {
    for (const to of [{ x: 0.1, y: 0, scale: 1 }, { x: 4_000, y: -3_000, scale: 6 }]) {
      const r = rig();
      r.travel(to, 1_000);
      expect(r.step(1_000 + 199)).toBe(true);
      expect(r.step(1_000 + 420)).toBe(false);
      expect(r.camera).toEqual(to);
    }
  });

  it("keeps the pointer's world point within half a pixel through an anchored wheel zoom", () => {
    const r = rig({ x: 40, y: -30, scale: 0.8 });
    const pointer = { x: 820, y: 210 };
    const world = screenToWorld(r.camera, r.room, pointer.x, pointer.y);
    r.wheel({ deltaY: -120, deltaMode: 0, ctrlKey: false, timeStamp: 0 } as WheelEvent, pointer, 860, 1, 0);
    for (let t = 0; t < 600; t += 16) {
      r.step(t);
      const back = worldToScreen(r.camera, r.room, world.x, world.y);
      expect(Math.hypot(back.x - pointer.x, back.y - pointer.y)).toBeLessThan(0.5);
    }
    expect(r.camera.scale).toBeGreaterThan(0.8);
  });

  it("moves the camera by the drag times the drag speed", () => {
    for (const gain of [0.5, 1, 2]) {
      const r = rig({ x: 0, y: 0, scale: 2 });
      r.dragStart(1, { x: 300, y: 300 }, 0);
      expect(r.dragMove(1, { x: 500, y: 300 }, 100, gain)).toBe("started");
      expect(r.interaction()).toBe("pan");
      expect((0 - r.camera.x) * r.camera.scale).toBeCloseTo(200 * gain, 6);
    }
  });

  it("lands a flick with no overshoot", () => {
    const r = rig({ x: 0, y: 0, scale: 1 });
    r.dragStart(1, { x: 300, y: 300 }, 0);
    for (let i = 1; i <= 6; i += 1) r.dragMove(1, { x: 300 + i * 20, y: 300 }, i * 10, 1);
    expect(r.dragEnd(1, 60, 1, { windowMs: 80, minSpeed: 0.05 })).toBe("pan");
    const released = r.camera.x;
    let last = released;
    let t = 100;
    while (r.step(t)) {
      expect(r.camera.x).toBeLessThanOrEqual(last);
      last = r.camera.x;
      t += 16;
    }
    expect(released - r.camera.x).toBeCloseTo(2 * MOMENTUM_TAU_MS, 6);
    expect(r.interaction()).toBe("none");
  });
});
