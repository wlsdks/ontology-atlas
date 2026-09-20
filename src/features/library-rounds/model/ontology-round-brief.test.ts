import { describe, expect, it } from 'vitest';

import { buildOntologyRoundBrief } from './ontology-round-brief';

describe('ontology round brief', () => {
  it('is explicit about bounded read-only refinement and the construction handoff', () => {
    const brief = buildOntologyRoundBrief({
      vaultRoot: '/Users/probe/project',
      locale: 'ko',
      focus: 'source binding gaps',
    });

    expect(brief).toContain('source binding gaps');
    expect(brief).toContain('connection_info');
    expect(brief).toContain('query_ontology');
    expect(brief).toContain('review-only');
    expect(brief).toContain('add_concepts');
    expect(brief).toContain('connection_info.sameRoot');
    expect(brief).toContain('Use no shell, Python, grep, cat');
    expect(brief).toContain('Do not turn a structural health result into a semantic approval.');
  });
});
