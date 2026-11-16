import { describe, expect, it } from 'vitest';

import en from '../../../../messages/en/download.json';
import ko from '../../../../messages/ko/download.json';
import { FAQ_KEYS, faqStructuredData } from './faq';

describe('download FAQ', () => {
  it('has a question and an answer for every key in every catalog it ships', () => {
    for (const catalog of [en, ko]) {
      for (const key of FAQ_KEYS) {
        const item = (catalog.faq.items as Record<string, { q: string; a: string }>)[key];
        expect(item?.q.trim().length, key).toBeGreaterThan(0);
        expect(item?.a.trim().length, key).toBeGreaterThan(0);
      }
    }
  });

  it('marks up exactly the words the page shows', () => {
    const data = faqStructuredData([{ question: 'Is it free?', answer: 'Yes.' }]);
    expect(data.mainEntity).toEqual([
      { '@type': 'Question', name: 'Is it free?', acceptedAnswer: { '@type': 'Answer', text: 'Yes.' } },
    ]);
  });
});
