import { easeMotion } from "@/shared/motion/ease";
import { SPRING, type Spring } from "@/shared/motion/spring";
import { MOTION } from "@/shared/motion/tokens";

/** Integration step; a 300-stiffness spring is stable far below it. */
const STEP_S = 0.001;
/**
 * A late frame advances no further than one 60 Hz frame, so a dropped frame slows the motion for an
 * instant instead of jumping it (`docs/DESIGN-SYSTEM.md`, "Continuous values").
 */
const MAX_FRAME_S = 1 / 60;
/** Close enough to the target, and slow enough, that the next frame would draw the same pixels. */
const REST_DISTANCE = 1e-4;
const REST_SPEED = 1e-3;

export type BandMotionMode = "intro" | "follow" | "instant";

interface Intro {
  elapsed: number;
  from: number[];
  to: number[];
}

/**
 * Numbers that move toward targets. The first targets ease in from where they stand over
 * `--motion-expressive`; every later target is followed from the drawn value and its speed on
 * `SPRING.surface`, so a page landing mid-motion bends the motion instead of restarting it. Pure:
 * the caller supplies the clock and draws `positions`.
 */
export class BandMotion {
  readonly positions: number[];
  private readonly velocities: number[];
  private targets: number[];
  private intro: Intro | null = null;
  private readonly introSeconds: number;
  private readonly spring: Spring;

  constructor(size: number, options: { introSeconds?: number; spring?: Spring } = {}) {
    this.positions = new Array<number>(size).fill(0);
    this.velocities = new Array<number>(size).fill(0);
    this.targets = new Array<number>(size).fill(0);
    this.introSeconds = options.introSeconds ?? MOTION.expressive.duration;
    this.spring = options.spring ?? SPRING.surface;
  }

  get size(): number {
    return this.positions.length;
  }

  set(targets: readonly number[], mode: BandMotionMode): void {
    if (targets.length !== this.positions.length) throw new Error("BandMotion: the number of values changed");
    // The same targets again change nothing, so a running intro is not handed to the spring.
    if (mode === "follow" && targets.every((value, i) => value === this.targets[i])) return;
    this.targets = [...targets];
    if (mode === "instant") {
      targets.forEach((value, i) => {
        this.positions[i] = value;
        this.velocities[i] = 0;
      });
      this.intro = null;
      return;
    }
    if (mode === "intro") {
      this.intro = { elapsed: 0, from: [...this.positions], to: [...targets] };
      return;
    }
    if (this.intro) {
      // A target that changes during the intro hands over to the spring at the intro's current speed.
      const { elapsed, from, to } = this.intro;
      const t = Math.min(1, elapsed / this.introSeconds);
      const a = Math.max(0, t - 1e-3);
      const b = Math.min(1, t + 1e-3);
      const slope = b > a ? (easeMotion(b) - easeMotion(a)) / (b - a) : 0;
      for (let i = 0; i < this.positions.length; i += 1) {
        this.velocities[i] = (slope * (to[i]! - from[i]!)) / this.introSeconds;
      }
      this.intro = null;
    }
  }

  /** Advances by `seconds` of wall time; false once every value rests on its target. */
  advance(seconds: number): boolean {
    const dt = Math.min(Math.max(seconds, 0), MAX_FRAME_S);
    if (this.intro) {
      const intro = this.intro;
      intro.elapsed += dt;
      const t = Math.min(1, intro.elapsed / this.introSeconds);
      const eased = easeMotion(t);
      for (let i = 0; i < this.positions.length; i += 1) {
        this.positions[i] = intro.from[i]! + (intro.to[i]! - intro.from[i]!) * eased;
      }
      if (t < 1) return true;
      this.intro = null;
      this.velocities.fill(0);
      return this.positions.some((value, i) => value !== this.targets[i]);
    }
    const { stiffness, dampingRatio } = this.spring;
    const damping = 2 * dampingRatio * Math.sqrt(stiffness);
    let moving = false;
    for (let i = 0; i < this.positions.length; i += 1) {
      let x = this.positions[i]!;
      let v = this.velocities[i]!;
      const target = this.targets[i]!;
      if (x === target && v === 0) continue;
      for (let elapsed = 0; elapsed < dt; elapsed += STEP_S) {
        const h = Math.min(STEP_S, dt - elapsed);
        v += (-stiffness * (x - target) - damping * v) * h;
        x += v * h;
      }
      const scale = Math.max(1, Math.abs(target));
      if (Math.abs(x - target) < REST_DISTANCE * scale && Math.abs(v) < REST_SPEED * scale) {
        x = target;
        v = 0;
      } else {
        moving = true;
      }
      this.positions[i] = x;
      this.velocities[i] = v;
    }
    return moving;
  }
}
