import type { FilmMarkTokens } from './film-map-sizes';
import type { FilmConcept, FilmVault } from './film-vault';

/** The product's mark tokens (`app/styles/map-graph-tokens.css`) as plain numbers for tests. */
export const FILM_TEST_TOKENS: FilmMarkTokens = {
  domainDiscPx: 16,
  domainCorePx: 10,
  domainRimPx: 2,
  projectDiscPx: 16,
  projectCorePx: 9,
  capDiscMinPx: 3,
  capDiscGainPx: 2.8,
  capDiscMaxPx: 12,
  capRimPx: 1.4,
  capCoreInsetPx: 3.5,
  capCoreMinPx: 1.6,
  elementDotPx: 1.9,
  selectedDiscPx: 11,
  selectedRingGapPx: 4,
  selectedRingPx: 1.5,
  lineTaperPx: 4,
  lineTaperGainPx: 0.5,
  lineTaperMaxPx: 8,
  lineDotPx: 1.5,
  lineDotGapPx: 5,
  lightAlpha: 0.2,
  lightReach: 1.8,
  restHue: 262,
  growth: 1.37,
  sink: 0.3,
};

/** Text width as eight pixels a character, so a test can predict every box. */
export const eightPixelsPerCharacter = (text: string): number => text.length * 8;

/**
 * A vault of domains `a`, `b`, ... whose capabilities hold the listed numbers of elements:
 * `fixtureVault({ a: [0, 3] })` is domain `a` with two capabilities, the second with three elements.
 */
export function fixtureVault(domains: Record<string, number[]>, dependencies: [string, string][] = []): FilmVault {
  const byId = new Map<string, FilmConcept>();
  const concept = (id: string, kind: FilmConcept['kind'], domain: string | null, capability: string | null = null): FilmConcept => {
    const made: FilmConcept = { id, kind, label: id, slug: id, path: `${id}.md`, domain, capability, elements: [] };
    byId.set(id, made);
    return made;
  };
  const domainConcepts: FilmConcept[] = [];
  const capabilities: FilmConcept[] = [];
  const elements: FilmConcept[] = [];
  for (const [name, elementCounts] of Object.entries(domains)) {
    const domainId = `domain:${name}`;
    domainConcepts.push(concept(domainId, 'domain', domainId));
    elementCounts.forEach((count, index) => {
      const capability = concept(`capability:${name}${index}`, 'capability', domainId);
      capabilities.push(capability);
      for (let element = 0; element < count; element += 1) {
        const made = concept(`element:${name}${index}.${element}`, 'element', domainId, capability.id);
        capability.elements.push(made.id);
        elements.push(made);
      }
    });
  }
  return { project: null, domains: domainConcepts, capabilities, elements, byId, dependencies, relates: [], relationCount: dependencies.length };
}
