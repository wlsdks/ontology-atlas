import { easeMotion } from "@/shared/motion/ease";
import { RELIEF_PITCH_MAX, RELIEF_PITCH_REST, RELIEF_RISE_TOTAL_MS, reliefRisePitchAt } from "./relief-projection";

export const RELIEF_TILT_PER_PX = 0.003;

const clampPitch = (p: number) => Math.min(RELIEF_PITCH_MAX, Math.max(0, p));

export function restingPitch(pitch: number): number {
  return pitch >= RELIEF_PITCH_REST / 2 ? RELIEF_PITCH_REST : 0;
}

export function reliefTweenMs(delta: number): number {
  return 200 + 220 * Math.min(1, Math.abs(delta) / RELIEF_PITCH_REST);
}

export function draggedPitch(startPitch: number, upwardPx: number): number {
  return clampPitch(startPitch + upwardPx * RELIEF_TILT_PER_PX);
}

interface Motion {
  kind: "rise" | "tween";
  start: number;
  from: number;
  to: number;
  duration: number;
}

export class ReliefPose {
  pitch: number;
  private motion: Motion | null = null;

  constructor(pitch = 0) {
    this.pitch = clampPitch(pitch);
  }

  get animating(): boolean {
    return this.motion != null;
  }

  get target(): number {
    return this.motion?.to ?? this.pitch;
  }

  begin(target: number, { now, animate, rise }: { now: number; animate: boolean; rise: boolean }): void {
    const to = clampPitch(target);
    if (Math.abs(this.target - to) < 1e-6) return;
    const delta = Math.abs(to - this.pitch);
    if (!animate || delta < 1e-4) {
      this.pitch = to;
      this.motion = null;
      return;
    }
    this.motion = rise
      ? { kind: "rise", start: now, from: this.pitch, to, duration: RELIEF_RISE_TOTAL_MS }
      : { kind: "tween", start: now, from: this.pitch, to, duration: reliefTweenMs(delta) };
  }

  hold(pitch: number): void {
    this.motion = null;
    this.pitch = clampPitch(pitch);
  }

  step(now: number): { riseClock: number | null } {
    const m = this.motion;
    if (!m) return { riseClock: null };
    const clock = Math.max(0, now - m.start);
    if (clock >= m.duration) {
      this.pitch = m.to;
      this.motion = null;
      return { riseClock: null };
    }
    if (m.kind === "rise") {
      this.pitch = reliefRisePitchAt(clock, m.from, m.to);
      return { riseClock: clock };
    }
    this.pitch = m.from + (m.to - m.from) * easeMotion(clock / m.duration);
    return { riseClock: null };
  }
}
