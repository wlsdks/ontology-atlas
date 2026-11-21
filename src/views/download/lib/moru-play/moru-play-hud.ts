import { COMBO_STEP, ROUND_MS, multiplierFor, type Round } from './moru-play';
import { pulseScale, toastOpacity } from './moru-play-ramps';

export interface HudNodes {
  score: HTMLElement | null;
  scoreLabel: HTMLElement | null;
  multiplier: HTMLElement | null;
  pips: Array<HTMLElement | null>;
  lives: Array<HTMLElement | null>;
  time: HTMLElement | null;
  timeBar: HTMLElement | null;
  toast: HTMLElement | null;
}

/** Whole seconds left that turn the clock urgent. */
const HURRY_SECONDS = 10;

/** Pips lit in the combo meter: all of them at the top multiplier, else the streak into the current step. */
export function litPips(combo: number, multiplier: number): number {
  return multiplier >= 4 ? COMBO_STEP : combo % COMBO_STEP;
}

export function msLeft(round: Round | null): number {
  return round ? Math.max(0, ROUND_MS - round.t) : ROUND_MS;
}

export function isHurry(round: Round | null, seconds: number): boolean {
  return Boolean(round) && seconds <= HURRY_SECONDS;
}

/**
 * The round's score, multiplier, combo pips, lives, clock and power toast, written to the page's
 * own elements. Each value is written only when it changes, so a frame that changes nothing
 * touches nothing.
 */
export function createHud(field: HTMLElement, nodes: HudNodes, scoreLabel: (score: number) => string) {
  const shown = { score: -1, mult: -1, pips: -1, lives: -1, time: -1, hurry: false, power: '' };
  let heartAt = -Infinity;
  let heartIndex = -1;
  let multAt = -Infinity;
  let toastAt = -Infinity;

  return {
    reset() {
      shown.score = shown.mult = shown.pips = shown.lives = shown.time = -1;
      toastAt = heartAt = multAt = -Infinity;
    },
    beatHeart(clock: number, livesLeft: number) {
      heartAt = clock;
      heartIndex = livesLeft;
    },
    beatMultiplier(clock: number) {
      multAt = clock;
    },
    showToast(clock: number, power: string) {
      toastAt = clock;
      if (nodes.toast) nodes.toast.dataset.power = power;
    },
    write(round: Round | null, clock: number, calm: boolean) {
      const r = round;
      const score = r?.score ?? 0;
      if (score !== shown.score) {
        shown.score = score;
        if (nodes.score) nodes.score.textContent = String(score);
        if (nodes.scoreLabel) nodes.scoreLabel.textContent = scoreLabel(score);
        field.dataset.score = String(score);
      }
      const combo = r?.combo ?? 0;
      const mult = multiplierFor(combo);
      if (mult !== shown.mult) {
        shown.mult = mult;
        if (nodes.multiplier) {
          nodes.multiplier.textContent = `×${mult}`;
          nodes.multiplier.dataset.level = String(mult);
        }
        field.dataset.multiplier = String(mult);
      }
      const pips = litPips(combo, mult);
      if (pips !== shown.pips) {
        shown.pips = pips;
        nodes.pips.forEach((pip, i) => pip?.toggleAttribute('data-on', i < pips));
        field.dataset.combo = String(combo);
      }
      const lives = r?.lives ?? 3;
      if (lives !== shown.lives) {
        shown.lives = lives;
        nodes.lives.forEach((heart, i) => heart?.toggleAttribute('data-lost', i >= lives));
        field.dataset.lives = String(lives);
      }
      const left = msLeft(r);
      const seconds = Math.ceil(left / 1000);
      if (seconds !== shown.time) {
        shown.time = seconds;
        if (nodes.time) nodes.time.textContent = String(seconds);
      }
      const hurry = isHurry(r, seconds);
      if (hurry !== shown.hurry) {
        shown.hurry = hurry;
        field.toggleAttribute('data-hurry', hurry);
      }
      if (nodes.timeBar) nodes.timeBar.style.transform = `scaleX(${(left / ROUND_MS).toFixed(4)})`;
      const power = r?.power?.kind ?? '';
      if (power !== shown.power) {
        shown.power = power;
        if (power) field.dataset.power = power;
        else delete field.dataset.power;
      }
      nodes.lives.forEach((heart, i) => {
        if (!heart) return;
        const beat = !calm && i === heartIndex ? pulseScale(clock - heartAt, 420, 0.45) : 1;
        heart.style.transform = beat === 1 ? '' : `scale(${beat.toFixed(3)})`;
      });
      if (nodes.multiplier) {
        const beat = calm ? 1 : pulseScale(clock - multAt, 360, 0.35);
        nodes.multiplier.style.transform = beat === 1 ? '' : `scale(${beat.toFixed(3)})`;
      }
      if (nodes.toast) nodes.toast.style.opacity = String(toastOpacity(clock - toastAt));
    },
  };
}

export type Hud = ReturnType<typeof createHud>;
