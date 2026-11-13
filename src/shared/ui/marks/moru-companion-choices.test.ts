import { expect, it } from 'vitest';
import reactions from './moru-reactions.json';
import { companionChoices } from './moru-companion-choices';

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
    return Array.from({ length: 12 }, next).join(',');
  });
  expect(new Set(sequences).size).toBe(3);
});

it('keeps magic out of folder selection and makes waiting alternate gentle responses', () => {
  const folder = companionChoices('folder', () => 0.99);
  expect(Array.from({ length: 33 }, folder)).not.toContain('magic-fish');
  const waiting = companionChoices('waiting', () => 0.99);
  expect(Array.from({ length: 6 }, waiting)).toEqual(['soft-bow', 'thinking', 'soft-bow', 'thinking', 'soft-bow', 'thinking']);
});
