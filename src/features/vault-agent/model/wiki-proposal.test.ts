import { describe, expect, it } from 'vitest';

import { validateWikiPage, WIKI_SECTION_ORDER } from '@/shared/lib/wiki-page-schema';

import { measureSourceText } from './source-text';
import { buildWikiPageProposal, wikiSlugFromName, type CompileSourceRead } from './wiki-proposal';

const PLAN_TEXT = '# Quarter plan\n\nWe ship the Library in Q3.\n\nSources stay verbatim.';
const PLAN_HASH = '3b1f0000000000000000000000000000000000000000000000000000000000aa';

function planRead(overrides: Partial<CompileSourceRead> = {}): CompileSourceRead {
  return {
    path: 'sources/quarter-plan.md',
    format: 'md',
    readable: true,
    refusal: null,
    truncated: false,
    sha256: PLAN_HASH,
    measure: measureSourceText(PLAN_TEXT),
    ...overrides,
  };
}

const NOW = new Date('2027-03-04T05:06:07.089Z');

function fields(overrides: Partial<Parameters<typeof buildWikiPageProposal>[0]> = {}) {
  return {
    slug: 'quarter-plan',
    title: 'Quarter plan',
    summary: 'What the team committed to for the quarter.',
    facts: ['The Library ships in Q3. [[src:sources/quarter-plan.md#p2]]'],
    ...overrides,
  };
}

describe('wikiSlugFromName', () => {
  it.each([
    ['quarter-plan', 'quarter-plan'],
    ['Quarter Plan 2027.md', 'quarter-plan-2027'],
    ['wiki/quarter-plan.md', 'quarter-plan'],
    ['  Retro — 5 Sept  ', 'retro-5-sept'],
  ])('%s becomes %s', (input, expected) => {
    expect(wikiSlugFromName(input)).toBe(expected);
  });
});

describe('buildWikiPageProposal — the page Atlas is willing to show', () => {
  it('assembles the template shape and passes the shared validator', () => {
    const proposal = buildWikiPageProposal(fields(), {
      reads: [planRead()],
      model: 'qwen3:8b',
      now: NOW,
    });

    expect(proposal.ok).toBe(true);
    expect(proposal.problems).toEqual([]);
    expect(proposal.path).toBe('wiki/quarter-plan.md');
    expect(proposal.slug).toBe('wiki/quarter-plan');
    // The shared contract is the authority; this is the same call the Library's own list
    // makes against a page already on disk.
    expect(validateWikiPage(proposal.page, { knownSources: ['sources/quarter-plan.md'] }).ok).toBe(
      true,
    );
    for (const section of WIKI_SECTION_ORDER) {
      expect(proposal.page).toContain(`## ${section}`);
    }
  });

  it('mints the frontmatter from the bytes read, not from the writer', () => {
    const proposal = buildWikiPageProposal(fields(), {
      reads: [planRead()],
      model: 'qwen3:8b',
      now: NOW,
    });

    expect(proposal.page).toContain('created_by: model:qwen3:8b');
    expect(proposal.page).toContain('compiled_at: 2027-03-04T05:06:07Z');
    expect(proposal.page).toContain('sources:\n  - sources/quarter-plan.md');
    expect(proposal.page).toContain(`source_hash:\n  sources/quarter-plan.md: ${PLAN_HASH}`);
    expect(proposal.page).toContain('status: draft');
    // `describes:` is a claim about the graph and needs a person. A model never writes it.
    expect(proposal.page).not.toContain('describes:');
    expect(proposal.page).not.toContain('kind:');
  });

  it('refuses a Facts bullet with no citation, quoting the bullet', () => {
    const proposal = buildWikiPageProposal(
      fields({ facts: ['The Library ships in Q3.'] }),
      { reads: [planRead()], model: 'qwen3:8b', now: NOW },
    );
    expect(proposal.ok).toBe(false);
    expect(proposal.problems.map((problem) => problem.code)).toContain('uncited-fact');
    expect(proposal.problems[0].message).toContain('The Library ships in Q3.');
  });

  it('refuses a Decisions bullet with no citation — the rule the shared schema does not carry', () => {
    const proposal = buildWikiPageProposal(
      fields({ decisions: ['We keep sources verbatim.'] }),
      { reads: [planRead()], model: 'qwen3:8b', now: NOW },
    );
    expect(proposal.ok).toBe(false);
    expect(proposal.problems.map((problem) => problem.code)).toContain('uncited-decision');
    // The shared validator alone would have let this page through.
    expect(
      validateWikiPage(proposal.page, { knownSources: ['sources/quarter-plan.md'] }).problems.map(
        (problem) => problem.code,
      ),
    ).not.toContain('uncited-decision');
  });

  it('refuses an anchor that does not exist in the bytes read this turn', () => {
    const proposal = buildWikiPageProposal(
      fields({ facts: ['The Library ships in Q3. [[src:sources/quarter-plan.md#p47]]'] }),
      { reads: [planRead()], model: 'qwen3:8b', now: NOW },
    );
    expect(proposal.ok).toBe(false);
    const problem = proposal.problems.find(
      (candidate) => candidate.code === 'citation-anchor-unresolvable',
    );
    expect(problem?.message).toContain('#p47');
    expect(problem?.message).toContain('3 paragraphs');
  });

  it('refuses a citation to a source that was never opened', () => {
    const proposal = buildWikiPageProposal(
      fields({ facts: ['Revenue doubled. [[src:sources/finance.pdf#p2]]'] }),
      {
        reads: [
          planRead(),
          {
            path: 'sources/finance.pdf',
            format: 'pdf',
            readable: false,
            refusal: 'needs-a-parser',
            truncated: false,
            sha256: null,
            measure: null,
          },
        ],
        model: 'qwen3:8b',
        now: NOW,
      },
    );
    expect(proposal.ok).toBe(false);
    expect(proposal.problems.map((problem) => problem.code)).toContain('citation-source-not-read');
  });

  it('refuses a page whose source could not be hashed, rather than writing an empty source_hash', () => {
    const proposal = buildWikiPageProposal(fields(), {
      reads: [planRead({ sha256: null })],
      model: 'qwen3:8b',
      now: NOW,
    });
    expect(proposal.ok).toBe(false);
    expect(proposal.problems.map((problem) => problem.code)).toContain('hash-unavailable');
  });

  it('refuses a page with nothing behind it', () => {
    const proposal = buildWikiPageProposal(fields({ facts: [] }), {
      reads: [planRead()],
      model: 'qwen3:8b',
      now: NOW,
    });
    expect(proposal.ok).toBe(false);
    expect(proposal.problems.map((problem) => problem.code)).toContain('no-source-read');
  });

  it('writes the partial-read and unreadable facts onto the page, not only onto the card', () => {
    const proposal = buildWikiPageProposal(fields(), {
      reads: [
        planRead({ truncated: true }),
        {
          path: 'sources/finance.pdf',
          format: 'pdf',
          readable: false,
          refusal: 'needs-a-parser',
          truncated: false,
          sha256: null,
          measure: null,
        },
      ],
      model: 'qwen3:8b',
      now: NOW,
    });

    expect(proposal.ok).toBe(true);
    const notInSources = proposal.page.slice(proposal.page.indexOf('## Not in sources'));
    expect(notInSources).toContain('Only the first part of `sources/quarter-plan.md` was read');
    expect(notInSources).toContain('`sources/finance.pdf` is a PDF file');
    expect(proposal.sourcesTruncated).toEqual(['sources/quarter-plan.md']);
    expect(proposal.sourcesUnreadable).toEqual([
      { path: 'sources/finance.pdf', refusal: 'needs-a-parser', truncated: false },
    ]);
  });

  it('writes the Summary as prose and every other section as a list', () => {
    const proposal = buildWikiPageProposal(
      fields({ overview: ['Two sentences.', 'And a second one.'] }),
      { reads: [planRead()], model: 'qwen3:8b', now: NOW },
    );
    const summary = proposal.page.slice(
      proposal.page.indexOf('## Summary'),
      proposal.page.indexOf('## Facts'),
    );
    expect(summary).toContain('Two sentences.\n\nAnd a second one.');
    expect(summary).not.toContain('- Two sentences.');
    expect(proposal.page).toContain('- The Library ships in Q3.');
  });

  it('drops its own note about an unopened file when the writer already named it', () => {
    const withPdf = {
      reads: [
        planRead(),
        {
          path: 'sources/finance.pdf',
          format: 'pdf',
          readable: false,
          refusal: 'needs-a-parser' as const,
          truncated: false,
          sha256: null,
          measure: null,
        },
      ],
      model: 'qwen3:8b',
      now: NOW,
    };
    const named = buildWikiPageProposal(
      fields({ notInSources: ['finance.pdf needs a reader Atlas does not have.'] }),
      withPdf,
    );
    const section = named.page.slice(named.page.indexOf('## Not in sources'));
    expect(section).toContain('finance.pdf needs a reader');
    expect(section).not.toContain('which Atlas cannot open on this route');

    const silent = buildWikiPageProposal(fields(), withPdf);
    expect(silent.page.slice(silent.page.indexOf('## Not in sources'))).toContain(
      'which Atlas cannot open on this route',
    );
  });

  it('keeps all five sections even when four of them are empty', () => {
    const proposal = buildWikiPageProposal(fields(), {
      reads: [planRead()],
      model: 'qwen3:8b',
      now: NOW,
    });
    expect(proposal.sections.map((section) => section.name)).toEqual([...WIKI_SECTION_ORDER]);
    expect(proposal.sections.map((section) => section.entries)).toEqual([1, 1, 0, 0, 0]);
  });

  it('carries the page it would replace, so the applier can guard the mtime', () => {
    const proposal = buildWikiPageProposal(fields(), {
      reads: [planRead()],
      model: 'qwen3:8b',
      now: NOW,
      existing: { text: 'old page', mtime: 1717171717 },
    });
    expect(proposal.existing).toEqual({ text: 'old page', mtime: 1717171717 });
  });
});
