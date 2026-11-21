import { describe, expect, it } from 'vitest';

import { COMBO_STEP, ROUND_MS, newRound } from './moru-play';
import { createHud, isHurry, litPips, msLeft, type HudNodes } from './moru-play-hud';

describe('combo pips', () => {
  it('lights the streak into the current step, and every pip at the top multiplier', () => {
    expect(litPips(0, 1)).toBe(0);
    expect(litPips(3, 1)).toBe(3);
    expect(litPips(COMBO_STEP, 2)).toBe(0);
    expect(litPips(COMBO_STEP * 2 + 2, 3)).toBe(2);
    expect(litPips(COMBO_STEP * 3 + 2, 4)).toBe(COMBO_STEP);
  });
});

describe('the round clock', () => {
  it('counts down from the round length, and rests at it before a round', () => {
    expect(msLeft(null)).toBe(ROUND_MS);
    const round = newRound(1);
    round.t = 12_345;
    expect(msLeft(round)).toBe(ROUND_MS - 12_345);
    round.t = ROUND_MS + 500;
    expect(msLeft(round)).toBe(0);
  });

  it('hurries only inside a round and only in the last ten seconds', () => {
    const round = newRound(1);
    expect(isHurry(null, 5)).toBe(false);
    expect(isHurry(round, 11)).toBe(false);
    expect(isHurry(round, 10)).toBe(true);
  });
});

function nodes(): HudNodes {
  const make = () => document.createElement('span');
  return {
    score: make(),
    scoreLabel: make(),
    multiplier: make(),
    pips: [make(), make(), make(), make(), make()],
    lives: [make(), make(), make()],
    time: make(),
    timeBar: make(),
    toast: make(),
  };
}

describe('the HUD writer', () => {
  it('writes the score, multiplier, lives and clock of a round onto its elements', () => {
    const field = document.createElement('div');
    const hud = nodes();
    const writer = createHud(field, hud, (score) => `${score} points`);
    const round = newRound(1);
    round.score = 70;
    round.lives = 2;
    round.t = 55_000;
    writer.write(round, 0, false);
    expect(hud.score!.textContent).toBe('70');
    expect(hud.scoreLabel!.textContent).toBe('70 points');
    expect(hud.lives[2]!.hasAttribute('data-lost')).toBe(true);
    expect(hud.lives[1]!.hasAttribute('data-lost')).toBe(false);
    expect(hud.time!.textContent).toBe('5');
    expect(field.hasAttribute('data-hurry')).toBe(true);
    expect(hud.timeBar!.style.transform).toBe(`scaleX(${((ROUND_MS - 55_000) / ROUND_MS).toFixed(4)})`);
  });

  it('writes a value only when it changes, until a reset', () => {
    const field = document.createElement('div');
    const hud = nodes();
    const writer = createHud(field, hud, String);
    const round = newRound(1);
    writer.write(round, 0, false);
    hud.score!.textContent = 'edited';
    writer.write(round, 16, false);
    expect(hud.score!.textContent).toBe('edited');
    writer.reset();
    writer.write(round, 32, false);
    expect(hud.score!.textContent).toBe('0');
  });

  it('swells a lost heart and shows then hides the power toast', () => {
    const field = document.createElement('div');
    const hud = nodes();
    const writer = createHud(field, hud, String);
    writer.beatHeart(1000, 1);
    writer.showToast(1000, 'magnet');
    writer.write(newRound(1), 1100, false);
    expect(hud.lives[1]!.style.transform).toMatch(/^scale\(1\./);
    expect(hud.lives[0]!.style.transform).toBe('');
    expect(hud.toast!.dataset.power).toBe('magnet');
    expect(Number(hud.toast!.style.opacity)).toBeGreaterThan(0);
    writer.write(newRound(1), 3000, false);
    expect(hud.toast!.style.opacity).toBe('0');
  });

  it('holds hearts and the multiplier still under reduced motion', () => {
    const field = document.createElement('div');
    const hud = nodes();
    const writer = createHud(field, hud, String);
    writer.beatHeart(1000, 0);
    writer.beatMultiplier(1000);
    writer.write(newRound(1), 1100, true);
    expect(hud.lives[0]!.style.transform).toBe('');
    expect(hud.multiplier!.style.transform).toBe('');
  });
});
