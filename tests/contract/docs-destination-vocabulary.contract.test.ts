import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

/**
 * Library is now the destination; Sources, Wiki, and Ontology are its document sections.
 * `/docs` remains a compatible address for the Ontology section. This gate therefore derives
 * relationships from each locale's own navigation labels instead of pinning authored copy.
 * `user-facing-vocabulary.contract.test.ts` owns the separate folder-versus-vault vocabulary.
 */

type Catalog = Record<string, unknown>;

function at(catalog: Catalog, path: string): string {
  const value = path.split('.').reduce<unknown>((node, key) => {
    if (!node || typeof node !== 'object') return undefined;
    return (node as Catalog)[key];
  }, catalog);
  expect(typeof value, `${path} 가 문자열이 아니다`).toBe('string');
  return value as string;
}

const ONTOLOGY_REFERENCES = [
  'nav.settingsMenu.vaultTitle',
  'searchWidgets.shortcuts.scope.docs',
  'topology.controls.docsLabel',
  'ontologyPages.insights.emptyTitleLink',
  'projectPages.detail.topBarDocsVault',
] as const;

describe('Library destination vocabulary', () => {
  for (const [locale, catalog] of [['en', en], ['ko', ko]] as const) {
    it(`${locale}: Library stays the destination and Ontology stays its document section`, () => {
      const library = at(catalog as Catalog, 'navRail.library');
      const ontology = at(catalog as Catalog, 'navRail.docs');
      const metadata = at(catalog as Catalog, 'metadata.pages.docs');

      expect(library).not.toBe(ontology);
      expect(at(catalog as Catalog, 'library.title')).toBe(library);
      expect(metadata).toContain(library);
      expect(metadata).toContain(ontology);

      const referencesMissingTheirSection = ONTOLOGY_REFERENCES.filter(
        (path) => !at(catalog as Catalog, path).includes(ontology),
      );
      expect(
        referencesMissingTheirSection,
        'A compatible Docs link may use contextual copy, but it must still name the Ontology section it opens.',
      ).toEqual([]);
    });
  }
});
