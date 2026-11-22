import { describe, expect, it } from 'vitest';

import {
  bodySections,
  formatReviewValue,
  proposedMeaningUnits,
  requestedValueFields,
  splitTask,
  summarizeProposal,
  type ReviewItem,
} from './meaning-units';

const item = (fields: ReviewItem['fields'], relation: ReviewItem['relation'] = null): ReviewItem => ({
  key: 'k',
  target: 'refund',
  exact: true,
  relation,
  fields,
});

describe('bodySections', () => {
  it('reads only the four meaning sections and reports text outside them', () => {
    const body = ['Intro line', '## Definition', 'Pays money back.', '## Includes', '- cards', '## Notes', 'stray'].join('\n');
    const { units, uncovered } = bodySections(body);
    expect(units.map((unit) => unit.id)).toEqual(['body:Definition', 'body:Includes']);
    expect(units[0].displayText).toBe('Pays money back.');
    expect(uncovered).toBe(true);
  });

  it('is fully covered when every non-blank line sits in a meaning section', () => {
    expect(bodySections('## Definition\nOne.\n\n## Excludes\nTwo.').uncovered).toBe(false);
  });

  it('does not take a heading inside a code fence for a section', () => {
    const body = ['## Definition', 'Text.', '```', '## Excludes', 'not a section', '```'].join('\n');
    expect(bodySections(body).units.map((unit) => unit.id)).toEqual(['body:Definition']);
  });

  it('drops a heading that has no text under it', () => {
    expect(bodySections('## Definition\n\n## Includes\nx').units.map((unit) => unit.label)).toEqual(['Includes']);
  });
});

describe('proposedMeaningUnits', () => {
  it('lists a relation reason, body sections and relation notes in that order', () => {
    const { units, bodyUncovered } = proposedMeaningUnits(
      item(
        [
          { key: 'body', after: '## Definition\nD.' },
          { key: 'relation_notes', after: { billing: 'why', empty: '' } },
        ],
        { from: 'a', type: 'depends_on', to: 'b', why: 'because' },
      ),
    );
    expect(units.map((unit) => unit.id)).toEqual([
      'relation:a:depends_on:b',
      'body:Definition',
      'relation_notes:billing',
      'relation_notes:empty',
    ]);
    expect(units[3].value).toBeDefined();
    expect(units[2].value).toBeUndefined();
    expect(bodyUncovered).toBe(false);
  });

  it('has nothing for no item and skips a relation without a reason', () => {
    expect(proposedMeaningUnits(null)).toEqual({ units: [], bodyUncovered: false });
    expect(proposedMeaningUnits(item([], { from: 'a', type: 't', to: 'b' })).units).toEqual([]);
  });
});

describe('requestedValueFields', () => {
  it('keeps plain fields and leaves out those already read as meaning units', () => {
    const fields = requestedValueFields(
      item([
        { key: 'title', after: 'Refund' },
        { key: 'body', after: '## Definition\nD.' },
        { key: 'relation_notes', after: { a: 'x' } },
        { key: 'body', after: 42 },
      ]),
    );
    expect(fields.map((field) => field.key)).toEqual(['title', 'body']);
  });
});

describe('summarizeProposal', () => {
  it('names what is missing from the summary: nothing, the body, or omitted units', () => {
    expect(summarizeProposal(item([])).coverage).toBe('coverageNone');
    expect(summarizeProposal(item([{ key: 'title', after: 'T' }])).coverage).toBe('detailsPointer');
    expect(summarizeProposal(item([{ key: 'body', after: 'intro\n## Definition\nD.' }])).coverage).toBe('bodyInDetails');
  });

  it('caps visible meaning units at five and says how many were left out', () => {
    const relationNotes = Object.fromEntries(Array.from({ length: 7 }, (_, index) => [`n${index}`, 'why']));
    const summary = summarizeProposal(item([{ key: 'relation_notes', after: relationNotes }]));
    expect(summary.visibleMeaningUnits).toHaveLength(5);
    expect(summary.meaningUnitCount).toBe(7);
    expect(summary.omittedMeaningUnits).toBe(2);
    expect(summary.coverage).toBe('incomplete');
  });

  it('caps visible value fields at eight', () => {
    const fields = Array.from({ length: 10 }, (_, index) => ({ key: `f${index}`, after: 'v' }));
    const summary = summarizeProposal(item(fields));
    expect(summary.visibleValueFields).toHaveLength(8);
    expect(summary.omittedValueFields).toBe(2);
  });
});

describe('splitTask', () => {
  it('splits at the first blank line', () => {
    expect(splitTask('  Lead sentence.\n\nMore detail.\nEven more.  ')).toEqual({
      lead: 'Lead sentence.',
      rest: 'More detail.\nEven more.',
    });
    expect(splitTask('Only one paragraph.\nSecond line.')).toEqual({
      lead: 'Only one paragraph.\nSecond line.',
      rest: '',
    });
  });
});

describe('formatReviewValue', () => {
  it('shows a string as is, nothing for undefined, and JSON otherwise', () => {
    expect(formatReviewValue('x')).toBe('x');
    expect(formatReviewValue(undefined)).toBe('');
    expect(formatReviewValue({ a: 1 })).toBe('{"a":1}');
    expect(formatReviewValue(12)).toBe('12');
  });
});
