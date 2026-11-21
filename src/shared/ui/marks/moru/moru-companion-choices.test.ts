import { expect, it } from 'vitest';
import reactions from './moru-reactions.json';
import { companionChoices } from './moru-companion-choices';

it.each(['folder', 'welcome'] as const)('reveals a playful encounter on the second %s pet without changing the gentle first response', context => {
  for (const value of [0, 0.37, 0.999]) {
    const next = companionChoices(context, () => value);
    expect(next()).toBe('shy');
    expect(['nose-balance', 'pup-peek', 'heart-gift', ...(context === 'welcome' ? ['star-sneeze'] : [])]).toContain(next());
  }
});

it.each([0, 0.37, 0.999])('varies a full welcome repertoire without repeating recent gestures at random value %s', value => {
  const next = companionChoices('welcome', () => value);
  const repertoire = Object.keys(reactions.clips);
  const drawn = Array.from({ length: repertoire.length * 3 }, next);
  expect(drawn[0]).toBe('shy');
  for (let cycle = 0; cycle < 3; cycle++) {
    expect([...drawn.slice(cycle * repertoire.length, (cycle + 1) * repertoire.length)].sort()).toEqual(repertoire.sort());
  }
  for (let i = 2; i < drawn.length; i++) expect(drawn.slice(i - 2, i)).not.toContain(drawn[i]);
});

it('uses more than one order while keeping the first response gentle', () => {
  const sequences = [0, 0.37, 0.999].map(value => {
    const next = companionChoices('welcome', () => value);
    return Array.from({ length: Object.keys(reactions.clips).length }, next).join(',');
  });
  expect(new Set(sequences).size).toBe(3);
});

it('keeps magic out of folder selection and makes waiting alternate gentle responses', () => {
  const folder = companionChoices('folder', () => 0.99);
  const seen = Array.from({ length: 42 }, folder);
  for (const id of ['magic-fish', 'star-sneeze', 'bubble-chase', 'sing']) expect(seen).not.toContain(id);
  const waiting = companionChoices('waiting', () => 0.99);
  expect(Array.from({ length: 6 }, waiting)).toEqual(['soft-bow', 'thinking', 'soft-bow', 'thinking', 'soft-bow', 'thinking']);
});
