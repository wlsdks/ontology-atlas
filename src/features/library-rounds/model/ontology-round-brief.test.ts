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

  /*
   * The person reading this packet is deciding which proposals are worth a turn. A proposal
   * carrying a write-door code repairs something the tools already measured; one carrying none is
   * this pass's own judgement. Saying which is which is cheaper than re-deriving it at review time.
   */
  it('names which write-door finding a proposal answers, and admits when none', () => {
    const brief = buildOntologyRoundBrief({ vaultRoot: '/Users/probe/project', locale: 'en' });

    for (const finding of [
      'definition-missing',
      'boundary-missing',
      'uncertainty-missing',
      'epistemic-exclusion',
      'folder-only-evidence',
      'slug-outside-kind-folder',
    ]) {
      expect(brief).toContain(finding);
    }
    expect(brief).toContain('A proposal that answers none of them says so');
    // Naming a finding is a claim about a repair, so it may not be attached decoratively.
    expect(brief).toContain('do not attach a finding name to a change that does not repair it');
  });

  it('stays read-only while it names those findings', () => {
    const brief = buildOntologyRoundBrief({ vaultRoot: '/Users/probe/project', locale: 'en' });
    expect(brief).toContain('review-only');
    expect(brief).toContain('Do not call add_concept, add_concepts');
  });
});
