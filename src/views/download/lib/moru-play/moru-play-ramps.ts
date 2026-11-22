import { backOut, easeOut, smooth } from './moru-play';

/** Opacity and size ramps of the round's effects, by milliseconds since the effect began. */

export const TOAST_MS = 1400;

export function toastOpacity(ageMs: number): number {
  return ageMs < 0 || ageMs > TOAST_MS ? 0 : ageMs < 160 ? smooth(ageMs / 160) : 1 - smooth((ageMs - TOAST_MS + 300) / 300);
}

/** A swell that rises and settles over `durationMs` by `gain`; 1 once over. */
export function pulseScale(ageMs: number, durationMs: number, gain: number): number {
  return ageMs < durationMs ? 1 + gain * Math.sin(Math.PI * easeOut(ageMs / durationMs)) : 1;
}

export function countdownDigit(intoMs: number): number {
  return 3 - Math.floor(intoMs / 1000);
}

/** `localMs` is the time inside the digit's own second. */
export function countdownOpacity(localMs: number): number {
  return localMs < 80 ? localMs / 80 : localMs > 760 ? 1 - smooth((localMs - 760) / 240) : 1;
}

export function countdownSize(localMs: number, calm: boolean): number {
  return calm ? 1 : 1.45 - 0.45 * backOut(localMs / 320);
}

export function scoreFloatRise(ageMs: number, calm: boolean): number {
  return calm ? 0 : 38 * easeOut(ageMs / 520);
}

export function scoreFloatOpacity(ageMs: number): number {
  return ageMs < 80 ? ageMs / 80 : 1 - smooth((ageMs - 480) / 260);
}

export function scoreFloatSize(ageMs: number, calm: boolean): number {
  return calm ? 1 : 0.7 + 0.3 * backOut(ageMs / 260);
}

export function tierBadgeOpacity(ageMs: number): number {
  return ageMs < 120 ? ageMs / 120 : 1 - smooth((ageMs - 600) / 300);
}

export function tierBadgeSize(ageMs: number, calm: boolean): number {
  return calm ? 1 : 0.6 + 0.4 * backOut(ageMs / 320);
}

export function tierBadgeRise(ageMs: number, calm: boolean): number {
  return calm ? 0 : 16 * easeOut(ageMs / 900);
}

export function bubbleOpacity(ageMs: number): number {
  return ageMs < 90 ? ageMs / 90 : 1 - smooth((ageMs - 650) / 250);
}

export function bubbleRise(ageMs: number, calm: boolean): number {
  return calm ? 0 : 6 * easeOut(ageMs / 200);
}
