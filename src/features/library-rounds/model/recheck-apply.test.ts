import { describe, expect, it } from 'vitest';

import { applyRecheckReply, markEvidenceChecked, parseRecheckReply, type TakenConcept } from './recheck-apply';

const HEAD = 'a'.repeat(40);
const DOC = [
  '---',
  'kind: capability',
  'title: Pay an invoice',
  'evidence:',
  '  - src/pay.ts',
  'review_state: accepted',
  'review_mark: 0123456789abcdef',
  '---',
  '',
  'Pays one invoice.',
  '## Includes',
  '- Partial payments   ',
  '',
].join('\n');

const reply = (answers: unknown) => `Checked.\n\n\`\`\`json\n${JSON.stringify({ answers })}\n\`\`\`\n`;

function concept(slug: string, overrides: Partial<TakenConcept> = {}): TakenConcept {
  return { slug, path: `${slug}.md`, text: DOC, files: [{ path: 'src/pay.ts', cut: false }], basis: `c1 src/pay.ts@c2`, ...overrides };
}

const bodyOf = (text: string) => text.slice(text.indexOf('\n---\n', 4) + 5);

describe('marking a document still accurate', () => {
  it('adds one evidence_checked line and leaves every body byte where it was', () => {
    const marked = markEvidenceChecked(DOC, HEAD)!;
    expect(marked).not.toBeNull();
    expect(bodyOf(marked)).toBe(bodyOf(DOC));
    const added = marked.split('\n').filter((line) => !DOC.split('\n').includes(line));
    expect(added).toEqual([`evidence_checked: ${HEAD}`]);
  });

  it('moves an older mark to the new commit and changes nothing else', () => {
    const older = markEvidenceChecked(DOC, 'b'.repeat(40))!;
    const again = markEvidenceChecked(older, HEAD)!;
    expect(again).toBe(markEvidenceChecked(DOC, HEAD));
  });

  it('keeps a CRLF document in CRLF and a BOM in front', () => {
    const crlf = `﻿${DOC.replace(/\n/g, '\r\n')}`;
    const marked = markEvidenceChecked(crlf, HEAD)!;
    expect(marked.startsWith('﻿---\r\n')).toBe(true);
    expect(marked).toContain(`evidence_checked: ${HEAD}\r\n`);
    expect(marked.replace(`evidence_checked: ${HEAD}\r\n`, '')).toBe(crlf);
  });

  it('keeps a body that starts right under the closing fence', () => {
    const tight = DOC.replace('---\n\nPays', '---\nPays');
    expect(markEvidenceChecked(tight, HEAD)!.replace(`evidence_checked: ${HEAD}\n`, '')).toBe(tight);
  });

  it('refuses a document the patcher would change by more than the one line', () => {
    expect(markEvidenceChecked(DOC.replace('Pays one invoice.', 'Pays one invoice.\r'), HEAD)).toBeNull();
    expect(markEvidenceChecked('No frontmatter here.\n', HEAD)).toBeNull();
  });
});

describe('reading the reply', () => {
  it('takes the last fenced JSON block and drops an answer with no slug or an unknown verdict', () => {
    const text = `${reply([{ slug: 'old', verdict: 'accurate' }])}\nThen:\n${reply([
      { slug: 'capabilities/pay', verdict: 'accurate' },
      { slug: 'capabilities/ship', verdict: 'probably' },
      { verdict: 'outdated' },
    ])}`;
    expect(parseRecheckReply(text)).toEqual([{ slug: 'capabilities/pay', verdict: 'accurate', reason: '', passage: '' }]);
  });

  it('is unreadable without a block, with broken JSON, or without an answers list', () => {
    expect(parseRecheckReply('All accurate.')).toBeNull();
    expect(parseRecheckReply('```json\n{"answers": [\n```')).toBeNull();
    expect(parseRecheckReply('```json\n{"verdicts": []}\n```')).toBeNull();
    expect(parseRecheckReply(null)).toBeNull();
  });
});

describe('settling a run from the reply', () => {
  it('marks only accurate concepts of the run, keeps the reason of the rest, and counts answers about others', () => {
    const applied = applyRecheckReply({
      taken: [concept('capabilities/pay'), concept('capabilities/ship'), concept('capabilities/refund'), concept('capabilities/void')],
      reply: reply([
        { slug: 'capabilities/pay', verdict: 'accurate' },
        { slug: 'capabilities/ship', verdict: 'outdated', reason: 'Ships twice now', passage: 'Pays one invoice.' },
        { slug: 'capabilities/refund', verdict: 'unsure', reason: 'The handler moved' },
        { slug: 'domains/billing', verdict: 'accurate' },
        { slug: 'capabilities/pay', verdict: 'outdated' },
      ]),
      sourceReads: new Set(),
      commit: HEAD,
    })!;
    expect(applied.marks.map((mark) => mark.path)).toEqual(['capabilities/pay.md']);
    expect(applied.marks[0]!.before).toBe(DOC);
    expect(applied.ignored).toBe(1);
    expect(applied.concepts.map(({ slug, outcome, leftReason, reason }) => ({ slug, outcome, leftReason, reason }))).toEqual([
      { slug: 'capabilities/pay', outcome: 'accurate', leftReason: undefined, reason: undefined },
      { slug: 'capabilities/ship', outcome: 'outdated', leftReason: undefined, reason: 'Ships twice now' },
      { slug: 'capabilities/refund', outcome: 'left', leftReason: 'cannot-tell', reason: 'The handler moved' },
      { slug: 'capabilities/void', outcome: 'left', leftReason: 'no-answer', reason: undefined },
    ]);
  });

  it('takes "accurate" on a cut diff only when the agent read that file', () => {
    const taken = [concept('capabilities/pay', { files: [{ path: 'src/pay.ts', cut: true }] })];
    const answer = reply([{ slug: 'capabilities/pay', verdict: 'accurate' }]);
    const unread = applyRecheckReply({ taken, reply: answer, sourceReads: new Set(['src/other.ts']), commit: HEAD })!;
    expect(unread.marks).toEqual([]);
    expect(unread.concepts[0]).toMatchObject({ outcome: 'left', leftReason: 'cut-unread', leftPath: 'src/pay.ts' });
    const read = applyRecheckReply({ taken, reply: answer, sourceReads: new Set(['src/pay.ts']), commit: HEAD })!;
    expect(read.concepts[0]!.outcome).toBe('accurate');
  });

  it('changes nothing when the reply cannot be read', () => {
    expect(applyRecheckReply({ taken: [concept('capabilities/pay')], reply: 'Looks fine to me.', sourceReads: new Set(), commit: HEAD })).toBeNull();
  });
});
