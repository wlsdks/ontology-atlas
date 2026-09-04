import { describe, expect, it } from 'vitest';
import enMessages from '../../../../messages/en.json';
import koMessages from '../../../../messages/ko.json';
import {
  selectInsightsDocumentTitle,
  selectInsightsScopeTitle,
} from './insights-scope-title';

describe('selectInsightsScopeTitle', () => {
  it('names the sample while a bundled sample is loaded', () => {
    expect(
      selectInsightsScopeTitle('static', { sample: 'Sample analysis', folder: 'Graph insights' }),
    ).toBe('Sample analysis');
  });

  it('keeps the folder wording once the person opened their own folder', () => {
    expect(
      selectInsightsScopeTitle('local', { sample: 'Sample analysis', folder: 'Graph insights' }),
    ).toBe('Graph insights');
  });
});

describe('selectInsightsDocumentTitle', () => {
  it('overrides the baked tab title in sample mode', () => {
    expect(selectInsightsDocumentTitle('static', 'Sample analysis · Ontology Atlas')).toBe(
      'Sample analysis · Ontology Atlas',
    );
  });

  it('leaves the pre-built metadata title alone in local mode', () => {
    expect(selectInsightsDocumentTitle('local', 'Sample analysis · Ontology Atlas')).toBeNull();
  });
});

describe('insights sample copy', () => {
  const catalogs = { en: enMessages, ko: koMessages } as const;

  it.each(['en', 'ko'] as const)('[%s] gives the sample its own wording', (locale) => {
    const insights = catalogs[locale].ontologyPages.insights;

    for (const value of [insights.titleSample, insights.subtitleSample, insights.documentTitleSample]) {
      expect(value.length).toBeGreaterThan(0);
    }
    // The folder wording is what claimed a bundled sample was the person's own
    // folder, so the sample copy must not be the same sentence.
    expect(insights.titleSample).not.toBe(insights.title);
    expect(insights.subtitleSample).not.toBe(insights.subtitle);
  });

  it.each(['en', 'ko'] as const)('[%s] keeps the sample tab title on the brand template', (locale) => {
    expect(catalogs[locale].ontologyPages.insights.documentTitleSample).toBe(
      `${catalogs[locale].ontologyPages.insights.titleSample} · ${catalogs[locale].metadata.siteName}`,
    );
  });
});
