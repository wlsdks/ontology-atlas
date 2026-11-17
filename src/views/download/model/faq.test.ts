import { describe, expect, it } from 'vitest';

import en from '../../../../messages/en/download.json';
import ja from '../../../../messages/ja/download.json';
import ko from '../../../../messages/ko/download.json';
import zh from '../../../../messages/zh/download.json';
import { FAQ_KEYS, faqStructuredData, splitAnswer } from './faq';

const CATALOGS = { en, ko, ja, zh } as const;

function answers(catalog: (typeof CATALOGS)[keyof typeof CATALOGS]) {
  return FAQ_KEYS.map((key) => (catalog.faq.items as Record<string, { q: string; a: string }>)[key]);
}

describe('download FAQ', () => {
  it('has a question and an answer for every key in every catalog it ships', () => {
    for (const [locale, catalog] of Object.entries(CATALOGS)) {
      answers(catalog).forEach((item, index) => {
        expect(item?.q.trim().length, `${locale} ${FAQ_KEYS[index]}`).toBeGreaterThan(0);
        expect(item?.a.trim().length, `${locale} ${FAQ_KEYS[index]}`).toBeGreaterThan(0);
      });
    }
  });

  it('splits every answer into a first sentence and the rest that join back into the same words', () => {
    for (const [locale, catalog] of Object.entries(CATALOGS)) {
      for (const { a } of answers(catalog)) {
        const { lead, gap, rest } = splitAnswer(a);
        expect(lead + gap + rest, locale).toBe(a);
        expect(lead.length, `${locale}: ${a}`).toBeGreaterThan(0);
        expect(lead.length, `${locale}: ${a}`).toBeLessThan(a.length);
      }
    }
  });

  it('ends the first sentence at a stop, not at a dot inside a word or number', () => {
    expect(splitAnswer('Version 2.0.1 runs on macOS. The rest.')).toEqual({
      lead: 'Version 2.0.1 runs on macOS.',
      gap: ' ',
      rest: 'The rest.',
    });
    expect(splitAnswer('はい。残り。')).toEqual({ lead: 'はい。', gap: '', rest: '残り。' });
    expect(splitAnswer('No stop at all')).toEqual({ lead: 'No stop at all', gap: '', rest: '' });
  });

  it('marks up exactly the words the page shows', () => {
    const data = faqStructuredData([{ question: 'Is it free?', answer: 'Yes.' }]);
    expect(data.mainEntity).toEqual([
      { '@type': 'Question', name: 'Is it free?', acceptedAnswer: { '@type': 'Answer', text: 'Yes.' } },
    ]);
  });
});
