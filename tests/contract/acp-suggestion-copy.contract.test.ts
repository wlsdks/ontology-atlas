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
        firstLabel: locale === 'ko' ? '예시 역량' : 'Example capability',
      });

      expect(prompt).not.toContain('acpChat.suggest.evidence.prompt');
      expect(prompt).toContain('query_ontology({operation: "maintenance_plan"');
      expect(prompt).toContain('capability_without_evidence');
      expect(prompt).toContain('capabilities/example');
      expect(prompt).toContain('2');
    });

    it(`${locale} shows readable containment names while the prompt retains exact slugs`, () => {
      const t = createTranslator({ locale, messages, namespace: 'acpChat' });
      const params = {
        slug: 'elements/qualification-handoff-helper',
        slugLabel: locale === 'ko' ? '자격 검증 도우미' : 'Qualification helper',
        domain: 'domains/project-portfolio',
        domainLabel: locale === 'ko' ? '프로젝트 관리' : 'Project management',
      };
      const label = t('suggest.containment.label', params);
      const prompt = t('suggest.containment.prompt', params);

      expect(label).toContain(params.slugLabel);
      expect(label).toContain(params.domainLabel);
      expect(label).not.toContain(params.slug);
      expect(label).not.toContain(params.domain);
      expect(label).not.toContain('되받지');
      expect(prompt).toContain(params.slug);
      expect(prompt).toContain(params.domain);
      expect(prompt).toContain(params.slugLabel);
      expect(prompt).toContain(params.domainLabel);
    });
  }
});
