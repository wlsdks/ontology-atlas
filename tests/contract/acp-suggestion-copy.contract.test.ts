import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

describe('ACP suggestion prompt catalog', () => {
  for (const [locale, messages] of [
    ['en', en],
    ['ko', ko],
  ] as const) {
    it(`${locale} renders the maintenance call instead of leaking its message key`, () => {
      const t = createTranslator({ locale, messages, namespace: 'acpChat' });
      const prompt = t('suggest.evidence.prompt', {
        count: 2,
        first: 'capabilities/example',
      });

      expect(prompt).not.toContain('acpChat.suggest.evidence.prompt');
      expect(prompt).toContain('query_ontology({operation: "maintenance_plan"');
      expect(prompt).toContain('capability_without_evidence');
      expect(prompt).toContain('capabilities/example');
      expect(prompt).toContain('2');
    });
  }
});
