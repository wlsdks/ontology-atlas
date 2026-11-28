import { useEffect, useLayoutEffect, useState } from "react";
import { easeMotion } from "@/shared/motion/ease";
import { MOTION } from "@/shared/motion/tokens";
import {
  clampTreePitch,
  decayTreeYawVelocity,
  mixTreePose,
  resistTreePitch,
  TREE_POSE_REST,
  treePoseFacing,
  zoomTreePoseAbout,
} from "../../model/tree-view/tree-camera";
import type { TreeLayout, TreeNameSide, TreeNamePlacement, TreePose, TreeRect, TreeScreenPoint } from "../../model/tree-view/tree-shapes";
import type { TreeFrame } from "./use-tree-frame";

/** A drag across 600 px turns the tree half way round; pitch follows at half that rate. */
const ORBIT_YAW_RAD_PER_PX = Math.PI / 600;
const ORBIT_PITCH_RAD_PER_PX = ORBIT_YAW_RAD_PER_PX / 2;
/** A concept brought into the free area stops this far (CSS px) inside it, room for its name. */
const REVEAL_INSET_PX = 48;
/** A closed mark is flown to this much past the scale at which it opens, so it opens for certain. */
const OPEN_MARGIN = 1.25;

const FLY_MS = MOTION.expressive.duration * 1000;
const SETTLE_MS = MOTION.settle.duration * 1000;

export interface TreeMotionHost {
  layout: TreeLayout | null;
  draw: TreeFrame["draw"];
  locate: TreeFrame["locate"];
  fitOf: TreeFrame["fitOf"];
  names: TreeFrame["names"];
  reducedMotion: boolean;
  /** After every drawn frame; `rest` when names were placed afresh. */
  onDrawn: (rest: boolean) => void;
  onGrowing: (growing: boolean) => void;
}

interface Flight {
  from: TreePose;
  to: TreePose;
  startMs: number | null;
  durationMs: number;
  /** Held on screen while the pose moves, sliding from (fromX, fromY) to (toX, toY); -1 for none. */
  anchor: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

interface RectMove {
  from: TreeRect;
  to: TreeRect;
  startMs: number | null;
  durationMs: number;
}

interface PitchSettle {
  from: number;
  to: number;
  startMs: number | null;
}

const copyPose = (from: Readonly<TreePose>, out: TreePose): TreePose => {
  out.yaw = from.yaw;
  out.pitch = from.pitch;
  out.zoom = from.zoom;
  out.panX = from.panX;
  out.panY = from.panY;
  return out;
};

const copyRect = (from: TreeRect, out: TreeRect): TreeRect => {
  out.x = from.x;
  out.y = from.y;
  out.width = from.width;
  out.height = from.height;
  return out;
};

const progressAt = (startMs: number, durationMs: number, now: number) => (durationMs <= 0 ? 1 : Math.min(1, Math.max(0, (now - startMs) / durationMs)));

/** `v` moved inside [low, high]; the middle when the span is empty. */
const clampInto = (v: number, low: number, high: number) => (low > high ? (low + high) / 2 : Math.min(high, Math.max(low, v)));

/**
 * The tree's camera over time: pose, orbit momentum, pitch settle, flights, the free area's
 * moves and the growth. One requestAnimationFrame loop runs while any of them changes and
 * stops when none does, so the tree draws no frame at rest.
 */
export class TreeMotion {
  readonly pose: TreePose = copyPose(TREE_POSE_REST, { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 });
  private growth: number;
  private host: TreeMotionHost;
  private shownFree: TreeRect | null = null;
  private freeMove: RectMove | null = null;
  private flight: Flight | null = null;
  private pitchSettle: PitchSettle | null = null;
  private yawVelocity = 0;
  private coastMs: number | null = null;
  private growthStartMs: number | null = null;
  private dragging = false;
  private dragYaw = 0;
  private dragPitch = 0;
  /** The concept held on screen while an orbit (drag, coast, settle) turns the tree; -1 for none. */
  private orbitAnchor = -1;
  private orbitX = 0;
  private orbitY = 0;
  /** The pose changed since the last frame. */
  private dirty = false;
  private raf: number | null = null;
  private readonly keep = new Map<number, TreeNameSide>();
  private readonly point: TreeScreenPoint = { x: 0, y: 0, scale: 0, depth: 0 };
  private readonly scratch: TreePose = { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 };

  constructor(host: TreeMotionHost, grows: boolean) {
    this.host = host;
    this.growth = grows ? 0 : 1;
  }

  /** True while a frame is pending or the pointer holds the tree. */
  get busy(): boolean {
    return this.raf !== null || this.dragging;
  }

  get free(): TreeRect | null {
    return this.shownFree;
  }

  /** The latest sources; the next frame draws with them. */
  attach(host: TreeMotionHost): void {
    this.host = host;
  }

  dispose(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  /** Sources changed: a frame at the current pose now, unless the loop will draw one anyway. */
  redraw(): void {
    if (this.raf !== null) return;
    if (this.growth < 1 && this.growthStartMs === null) {
      this.wake();
      return;
    }
    this.drawNow(this.dragging);
  }

  /** The free area to fit; `animate` moves there over the settle duration instead of jumping. */
  setFree(free: TreeRect, animate: boolean, selected: number): void {
    if (!this.shownFree) {
      this.shownFree = copyRect(free, { x: 0, y: 0, width: 0, height: 0 });
    } else if (animate && !this.host.reducedMotion) {
      this.freeMove = { from: copyRect(this.shownFree, { x: 0, y: 0, width: 0, height: 0 }), to: copyRect(free, { x: 0, y: 0, width: 0, height: 0 }), startMs: null, durationMs: SETTLE_MS };
    } else {
      copyRect(free, this.shownFree);
      this.freeMove = null;
    }
    const flight = this.flight;
    if (flight && flight.anchor >= 0) {
      flight.toX = clampInto(flight.toX, free.x + REVEAL_INSET_PX, free.x + free.width - REVEAL_INSET_PX);
      flight.toY = clampInto(flight.toY, free.y + REVEAL_INSET_PX, free.y + free.height - REVEAL_INSET_PX);
    } else if (selected >= 0) {
      this.bringInside(selected, free, animate ? SETTLE_MS : 0);
    }
    if (this.freeMove || this.flight) this.wake();
    else this.redraw();
  }

  /** Turns `node` to the near side over the expressive duration; zoomed in, it stays put on screen. */
  flyTo(node: number): void {
    const { layout } = this.host;
    if (!layout || node < 0 || node >= layout.model.count) return;
    const to: TreePose = { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 };
    treePoseFacing(layout, node, this.pose, to);
    to.pitch = clampTreePitch(to.pitch);
    const target = this.targetFree();
    const holds = to.zoom > 1 && target !== null && this.locate(this.pose, node);
    const flight = this.startFlight(to, FLY_MS, holds ? node : -1);
    if (holds && target) {
      flight.fromX = this.point.x;
      flight.fromY = this.point.y;
      flight.toX = clampInto(this.point.x, target.x + REVEAL_INSET_PX, target.x + target.width - REVEAL_INSET_PX);
      flight.toY = clampInto(this.point.y, target.y + REVEAL_INSET_PX, target.y + target.height - REVEAL_INSET_PX);
    }
  }

  /** Moves `node` into the free area over the settle duration when it lies outside it. */
  reveal(node: number): void {
    const target = this.targetFree();
    if (target) this.bringInside(node, target, SETTLE_MS);
  }

  /** Back to the rest pose (the Fit tile and the 0 key). */
  fit(): void {
    this.startFlight(TREE_POSE_REST, FLY_MS, -1);
  }

  /**
   * Zooms about `mark` toward the scale at which its children's spacing reaches `thresholdPx`:
   * spacing x unit x scale grows linearly with zoom while the threshold grows with its square root,
   * so the factor is the squared ratio over the current scale, with a margin.
   */
  openClosed(node: number, mark: { x: number; y: number; scale: number }, spacingWorld: number, unitPx: number, thresholdPx: number): void {
    const target = this.targetFree();
    if (!target || spacingWorld <= 0 || unitPx <= 0 || mark.scale <= 0) return;
    const needed = (thresholdPx / (spacingWorld * unitPx)) ** 2;
    const factor = Math.max(OPEN_MARGIN, (needed / mark.scale) * OPEN_MARGIN);    const to: TreePose = { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 };
    zoomTreePoseAbout(this.pose, factor, mark.x, mark.y, this.host.fitOf(target), to);
    const flight = this.startFlight(to, FLY_MS, node);
    flight.fromX = flight.toX = mark.x;
    flight.fromY = flight.toY = mark.y;
  }

  /** User zoom about a screen point: immediate, and it ends any flight or coast. */
  zoomAbout(factor: number, x: number, y: number): void {
    const free = this.shownFree;
    if (!free) return;
    this.stopMotion();
    zoomTreePoseAbout(this.pose, factor, x, y, this.host.fitOf(free), this.scratch);
    copyPose(this.scratch, this.pose);
    this.dirty = true;
    this.wake();
  }

  /** The pointer took hold: stops a coast or flight; with `anchor` zoomed in, the orbit turns about it. */
  beginDrag(anchor: number): void {
    this.stopMotion();
    this.dragging = true;
    this.dragYaw = this.pose.yaw;
    this.dragPitch = this.pose.pitch;
    this.orbitAnchor = -1;
    const free = this.shownFree;
    if (anchor >= 0 && this.pose.zoom > 1 && free && this.locate(this.pose, anchor)) {
      this.orbitAnchor = anchor;
      this.orbitX = this.point.x;
      this.orbitY = this.point.y;
    }
  }

  /** The drag's offset from where it began, CSS px, times the person's drag speed. */
  dragBy(dxPx: number, dyPx: number): void {
    if (!this.dragging) return;
    this.pose.yaw = this.dragYaw + dxPx * ORBIT_YAW_RAD_PER_PX;
    this.pose.pitch = resistTreePitch(this.dragPitch + dyPx * ORBIT_PITCH_RAD_PER_PX);
    this.holdOrbitAnchor();
    this.dirty = true;
    this.wake();
  }

  /** Lets go with a horizontal speed (px/ms): the turn coasts on, a stretched pitch settles back. */
  endDrag(vxPxPerMs: number): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.yawVelocity = this.host.reducedMotion ? 0 : vxPxPerMs * ORBIT_YAW_RAD_PER_PX;
    this.coastMs = null;
    const settled = clampTreePitch(this.pose.pitch);
    if (settled !== this.pose.pitch) {
      if (this.host.reducedMotion) {
        this.pose.pitch = settled;
        this.holdOrbitAnchor();
      } else this.pitchSettle = { from: this.pose.pitch, to: settled, startMs: null };
    }
    if (this.yawVelocity !== 0 || this.pitchSettle) {
      this.wake();
      return;
    }
    this.orbitAnchor = -1;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.dirty = false;
    this.drawNow(false);
  }

  /** Jumps to `pose` (the test hook). */
  setPose(pose: Readonly<TreePose>): void {
    this.stopMotion();
    copyPose(pose, this.pose);
    this.dirty = true;
    this.wake();
  }

  /** Grows the tree from the trunk again; nothing under reduced motion. */
  replayGrowth(): void {
    if (this.host.reducedMotion) return;
    if (this.growthStartMs !== null && this.growth < 1) this.host.onGrowing(false);
    this.growth = 0;
    this.growthStartMs = null;
    this.wake();
  }

  private stopMotion(): void {
    this.flight = null;
    this.pitchSettle = null;
    this.yawVelocity = 0;
    this.orbitAnchor = -1;
  }

  private targetFree(): TreeRect | null {
    return this.freeMove?.to ?? this.shownFree;
  }

  /** Writes where `node` stands at `pose` in the shown free area into `this.point`. */
  private locate(pose: TreePose, node: number): boolean {
    const free = this.shownFree;
    return free !== null && this.host.locate(pose, node, free, this.point);
  }

  private startFlight(to: Readonly<TreePose>, durationMs: number, anchor: number): Flight {
    this.stopMotion();
    const flight: Flight = {
      from: copyPose(this.pose, { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 }),
      to: copyPose(to, { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 }),
      startMs: null,
      durationMs: this.host.reducedMotion ? 0 : durationMs,
      anchor,
      fromX: 0,
      fromY: 0,
      toX: 0,
      toY: 0,
    };
    this.flight = flight;
    this.wake();
    return flight;
  }

  /** When `node` would stand outside `free`, pans it the least way to `REVEAL_INSET_PX` inside. */
  private bringInside(node: number, free: TreeRect, durationMs: number): void {
    const { locate } = this.host;
    const aim = this.flight?.to ?? this.pose;
    if (!locate(aim, node, free, this.point)) return;
    const { x, y } = this.point;
    if (x >= free.x && x <= free.x + free.width && y >= free.y && y <= free.y + free.height) return;
    const to = copyPose(aim, { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 });
    to.panX += clampInto(x, free.x + REVEAL_INSET_PX, free.x + free.width - REVEAL_INSET_PX) - x;
    to.panY += clampInto(y, free.y + REVEAL_INSET_PX, free.y + free.height - REVEAL_INSET_PX) - y;
    this.startFlight(to, durationMs, -1);
  }

  /** Re-solves the pan so the orbit anchor stays where the drag found it. */
  private holdOrbitAnchor(): void {
    if (this.orbitAnchor < 0 || !this.locate(this.pose, this.orbitAnchor)) return;
    this.pose.panX += this.orbitX - this.point.x;
    this.pose.panY += this.orbitY - this.point.y;
  }

  private wake(): void {
    if (this.raf === null) this.raf = requestAnimationFrame(this.tick);
  }

  private drawNow(moving: boolean): boolean {
    const free = this.shownFree;
    if (!free) return false;
    const drawn = this.host.draw(this.pose, moving ? this.keptNames() : null, this.growth, free);
    if (drawn) this.host.onDrawn(!moving);
    return drawn;
  }

  /** While moving, names only re-check where they stand; while growing there are none to keep. */
  private keptNames(): ReadonlyMap<number, TreeNameSide> {
    const keep = this.keep;
    keep.clear();
    if (this.growth < 1) return keep;
    const placed: TreeNamePlacement = this.host.names.current;
    for (let i = 0; i < placed.count; i += 1) keep.set(placed.boxes[i]!.node, placed.boxes[i]!.side);
    return keep;
  }

  private readonly tick = (now: number): void => {
    this.raf = null;
    let active = false;

    if (this.growth < 1 && this.growthStartMs !== null) {
      const t = progressAt(this.growthStartMs, FLY_MS, now);
      this.growth = t >= 1 ? 1 : easeMotion(t);
      if (t < 1) active = true;
      else this.host.onGrowing(false);
    }

    const move = this.freeMove;
    if (move && this.shownFree) {
      move.startMs ??= now;
      const t = progressAt(move.startMs, move.durationMs, now);
      const e = easeMotion(t);
      this.shownFree.x = move.from.x + (move.to.x - move.from.x) * e;
      this.shownFree.y = move.from.y + (move.to.y - move.from.y) * e;
      this.shownFree.width = move.from.width + (move.to.width - move.from.width) * e;
      this.shownFree.height = move.from.height + (move.to.height - move.from.height) * e;
      if (t < 1) active = true;
      else this.freeMove = null;
    }

    const flight = this.flight;
    if (flight) {
      flight.startMs ??= now;
      const t = progressAt(flight.startMs, flight.durationMs, now);
      const e = easeMotion(t);
      mixTreePose(flight.from, flight.to, e, this.pose);
      if (flight.anchor >= 0 && this.locate(this.pose, flight.anchor)) {
        this.pose.panX += flight.fromX + (flight.toX - flight.fromX) * e - this.point.x;
        this.pose.panY += flight.fromY + (flight.toY - flight.fromY) * e - this.point.y;
      }
      if (t < 1) active = true;
      else this.flight = null;
    }

    if (this.yawVelocity !== 0) {
      if (this.coastMs !== null) {
        const dt = now - this.coastMs;
        this.pose.yaw += this.yawVelocity * dt;
        this.yawVelocity = decayTreeYawVelocity(this.yawVelocity, dt);
      }
      this.coastMs = now;
      if (this.yawVelocity !== 0) active = true;
    }

    const settle = this.pitchSettle;
    if (settle) {
      settle.startMs ??= now;
      const t = progressAt(settle.startMs, SETTLE_MS, now);
      this.pose.pitch = settle.from + (settle.to - settle.from) * easeMotion(t);
      if (t < 1) active = true;
      else this.pitchSettle = null;
    }

    if (this.orbitAnchor >= 0) {
      this.holdOrbitAnchor();
      if (!active && !this.dragging) this.orbitAnchor = -1;
    }

    const growthPending = this.growth < 1 && this.growthStartMs === null;
    const moving = active || this.dirty || this.dragging || growthPending;
    this.dirty = false;
    if (!this.drawNow(moving)) return;
    if (growthPending) {
      this.growthStartMs = now;
      this.host.onGrowing(true);
      active = true;
    }
    if (moving && (active || !this.dragging)) this.wake();
  };
}

/** The tree's motion controller, created once; `grows` decides whether the first frames grow the tree. */
export function useTreeMotion(host: TreeMotionHost, grows: () => boolean): TreeMotion {
  const [motion] = useState(() => new TreeMotion(host, grows()));
  useLayoutEffect(() => {
    motion.attach(host);
  });
  useEffect(() => () => motion.dispose(), [motion]);
  return motion;
}
