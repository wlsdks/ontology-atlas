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
    rig.readRoom({ x: 0, y: 0, width: 1300, height: 860 }, true);
    rig.fit(true, 0);
    expect(rig.step(1)).toBe(true);
    const first = worldToScreen(rig.camera, rig.room, 120, -80);
    expect(Math.hypot(first.x - at.x, first.y - at.y)).toBeLessThan(1);
    for (let t = 16; rig.step(t); t += 16);
    const end = worldToScreen(rig.camera, rig.room, 120, -80);
    expect(Math.hypot(end.x - at.x, end.y - at.y)).toBeGreaterThan(20);
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
