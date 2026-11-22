import { describe, expect, it } from 'vitest';

import { WIKI_PAGE_TEMPLATE } from '@/shared/lib/library/wiki-page-schema';

import { roundDraftProblem } from './round-draft-problem';

const DRAFT = WIKI_PAGE_TEMPLATE.replace(/sources\/<file>/g, 'sources/plan.pdf');
const withLine = (line: string) => DRAFT.replace('status: draft\n', `status: draft\n${line}\n`);

describe('what reads as a round draft', () => {
  it('accepts the template draft and nothing that could read otherwise', () => {
    expect(roundDraftProblem(DRAFT)).toBeNull();
    expect(roundDraftProblem(DRAFT.replace('\n', '\r\n'))).toBeNull();
    expect(roundDraftProblem(DRAFT.replace('status: draft', 'status: reviewed'))).toEqual({ reason: 'not-draft' });
    expect(roundDraftProblem(DRAFT.replace('status: draft', 'status: "draft"'))).toEqual({ reason: 'not-draft' });
    expect(roundDraftProblem(DRAFT.replace('status: draft\n', ''))).toEqual({ reason: 'not-draft' });
    expect(roundDraftProblem('# Plan\n')).toEqual({ reason: 'no-frontmatter' });
  });

  it('refuses a key written twice, in any case or indentation, and a kind: line', () => {
    expect(roundDraftProblem(withLine('status: reviewed'))).toEqual({ reason: 'duplicate-key', key: 'status' });
    expect(roundDraftProblem(withLine('  status: draft'))).toEqual({ reason: 'duplicate-key', key: 'status' });
    expect(roundDraftProblem(withLine('Status: reviewed'))).toEqual({ reason: 'duplicate-key', key: 'status' });
    expect(roundDraftProblem(withLine('describes: [capabilities/checkout]'))).toEqual({ reason: 'forbidden-key', key: 'describes' });
    expect(roundDraftProblem(withLine('kind: capability'))).toEqual({ reason: 'forbidden-key', key: 'kind' });
  });

  it('carries the links to concepts it found unchanged, and refuses one it adds, changes or drops', () => {
    const links = 'describes:\n  - capabilities/checkout\nrelation_notes:\n  capabilities/checkout: "Facts 1-2 describe checkout."';
    const linked = withLine(links);
    const revised = linked.replace('## Summary\n', '## Summary\n\nRevised.\n');
    expect(roundDraftProblem(revised, linked)).toBeNull();
    expect(roundDraftProblem(revised.replace('  - capabilities/checkout', '- capabilities/checkout'), linked)).toBeNull();
    expect(roundDraftProblem(revised, null)).toEqual({ reason: 'forbidden-key', key: 'describes' });
    expect(roundDraftProblem(revised, DRAFT)).toEqual({ reason: 'forbidden-key', key: 'describes' });
    expect(roundDraftProblem(revised.replace('  - capabilities/checkout', '  - capabilities/checkout\n  - capabilities/login'), linked))
      .toEqual({ reason: 'forbidden-key', key: 'describes' });
    expect(roundDraftProblem(revised.replace('describe checkout.', 'say more.'), linked))
      .toEqual({ reason: 'forbidden-key', key: 'relation_notes' });
    expect(roundDraftProblem(DRAFT, linked)).toEqual({ reason: 'forbidden-key', key: 'describes' });
    expect(roundDraftProblem(withLine('Describes: [capabilities/checkout]'), withLine('Describes: [capabilities/checkout]')))
      .toEqual({ reason: 'forbidden-key', key: 'describes' });
  });
});
