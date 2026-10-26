import { describe, expect, it } from 'vitest';
import { planPeriod, overviewPacket } from './period-run';
import { parseNarrative, sourcePassages, type NarrativeSource } from './narrative';

const source = (i: number, text = `Change ${i}.\n\n${'Original record. '.repeat(15)}`): NarrativeSource => ({ id: `c:${i}`, kind: 'commit', title: `Change ${i}`, text, integration: `${i}`, version: `${i}` });
const lookup = { status: 'not-requested', unchecked: 12, unlinked: 0 };

describe('period-wide source planning', () => {
  it('accounts for all fitting records across bounded requests instead of dropping older records', () => {
    const sources = Array.from({ length: 12 }, (_, i) => source(i));
    const plan = planPeriod(sources, 'week', 1200, lookup);
    expect(plan.parts.length).toBeGreaterThan(1);
    expect(plan.parts.flatMap(part => part.sources).map(value => value.id).sort()).toEqual(sources.map(value => value.id).sort());
    expect(new Set(plan.parts.flatMap(part => part.sources.map(value => value.id))).size).toBe(12);
    expect(plan.unsent).toEqual([]);
    for (const part of plan.parts) {
      expect(part.bytes).toBeLessThanOrEqual(1200);
      for (const value of JSON.parse(part.text).sources) expect(value.passages.map((p: { text: string }) => p.text).join('')).toBe(sources.find(source => source.id === value.id)?.text);
    }
  });
  it('does not inherit a per-request record cap as a silent period cap', () => {
    const sources = Array.from({ length: 2001 }, (_, i) => source(i, `Change ${i}.`));
    const plan = planPeriod(sources, 'year', 128 * 1024, lookup);
    expect(plan.parts).toHaveLength(11);
    expect(plan.parts.every(part => part.commits <= 200 && part.sources.length <= 240)).toBe(true);
    expect(plan.parts.flatMap(part => part.sources).map(source => source.id)).toEqual(sources.map(source => source.id));
    expect(plan.unsent).toEqual([]);
  });
  it('keeps oversized and incomplete records named while including fitting records after them', () => {
    const plan = planPeriod([source(0, '한글'.repeat(4000)), source(1, ''), source(2)], 'week', 1200, lookup);
    expect(plan.parts.flatMap(part => part.sources.map(value => value.id))).toEqual(['c:2']);
    expect(plan.unsent.map(item => [item.source.id, item.reason])).toEqual([['c:0', 'overlarge'], ['c:1', 'incomplete']]);
  });
  it('builds an overview only from exact nominated originals and refuses unsubmitted original IDs', () => {
    const plan = planPeriod([source(0), source(1)], 'week', 1100, lookup);
    const accepted = plan.parts.map(part => parseNarrative(JSON.stringify({ themes: part.sources.map(value => ({ title: 'Change', change: { text: 'A change.', evidence: [sourcePassages(value)[0].id], inferred: false }, reason: null, checks: [], limits: [] })) }), part));
    const overview = overviewPacket(plan, accepted);
    expect(overview.packet).not.toBeNull();
    const packet = overview.packet!;
    expect(packet.evidenceIds).not.toContain('c:0:p1');
    expect(packet.text).not.toContain('A change.');
    expect(JSON.parse(packet.text).sources.flatMap((value: { passages: { id: string; text: string }[] }) => value.passages).every((p: { id: string; text: string }) => plan.sources.some(value => sourcePassages(value).some(original => original.id === p.id && original.text === p.text)))).toBe(true);
    expect(() => parseNarrative(JSON.stringify({ themes: [{ title: 'Change', change: { text: 'Invented support.', evidence: ['c:0:p1'], inferred: false }, reason: null, checks: [], limits: [] }] }), packet)).toThrow();
  });
});
