/**
 * The wiki-page contract, as a table.
 *
 * One input, one expected set of problem codes, run through every implementation of the
 * contract (`mcp/src/wiki-schema.mjs` and `src/shared/lib/wiki-page-schema.ts`) by
 * `tests/contract/wiki-page-schema.contract.test.ts`. The MCP package is delivered
 * separately from the web bundle, so the two cannot be one physical module; this table
 * is the effective unification, the same pattern as `validate-vault-cases.mjs`.
 *
 * Message wording may differ between implementations. Codes may not — a screen, a CLI
 * exit code, and an agent's retry all branch on the code.
 */

const FRONTMATTER = [
  '---',
  'title: Quarter plan',
  'created_by: agent:claude',
  'compiled_at: 2026-09-05T10:00:00Z',
  'sources:',
  '  - sources/plan.pdf',
  'source_hash:',
  '  sources/plan.pdf: 3b1f0a00000000000000000000000000000000000000000000000000000000ab',
  'status: draft',
  'summary: What the quarter plan commits the team to.',
  '---',
].join('\n');

function page(frontmatter, body) {
  return `${frontmatter}\n\n${body}\n`;
}

const BODY = [
  '## Summary',
  '',
  'The plan names three deliverables and one date.',
  '',
  '## Facts',
  '',
  '- Three deliverables are named. [[src:sources/plan.pdf#p2]]',
  '- The date is the last Friday of March. [[src:sources/plan.pdf#p4]] [[src:sources/plan.pdf#p9]]',
  '',
  '## Decisions',
  '',
  '- Hiring is deferred to the next quarter. [[src:sources/plan.pdf#p6]]',
  '',
  '## Open questions',
  '',
  '- Who owns the second deliverable?',
  '',
  '## Not in sources',
  '',
  '- The budget figure people quote in meetings is not in this document.',
].join('\n');

export const WIKI_PAGE_CASES = [
  {
    name: 'a complete page fits the contract',
    input: page(FRONTMATTER, BODY),
    expectedOk: true,
    expectedCodes: [],
  },
  {
    name: 'kind: puts the page in the graph, which a wiki page must never do',
    input: page(FRONTMATTER.replace('status: draft', 'kind: capability\nstatus: draft'), BODY),
    expectedOk: false,
    expectedCodes: ['kind-present'],
  },
  {
    name: 'a missing field is named by its own code',
    input: page(
      FRONTMATTER.split('\n').filter((line) => !line.startsWith('summary:')).join('\n'),
      BODY,
    ),
    expectedOk: false,
    expectedCodes: ['missing-field:summary'],
  },
  {
    name: 'several missing fields report several codes',
    input: page(
      FRONTMATTER.split('\n')
        .filter((line) => !line.startsWith('summary:') && !line.startsWith('status:'))
        .join('\n'),
      BODY,
    ),
    expectedOk: false,
    expectedCodes: ['missing-field:status', 'missing-field:summary'],
  },
  {
    name: 'a section out of order is reported',
    input: page(
      FRONTMATTER,
      BODY.replace('## Decisions', '## Open questions').replace(
        /## Open questions\n\n- Who owns the second deliverable\?/,
        '## Decisions\n\n- Hiring stands. [[src:sources/plan.pdf#p6]]',
      ),
    ),
    expectedOk: false,
    expectedCodes: ['section-order'],
  },
  {
    name: 'a missing section is reported as an order problem, because the order is all five',
    input: page(
      FRONTMATTER,
      BODY.split('## Not in sources')[0].trimEnd(),
    ),
    expectedOk: false,
    expectedCodes: ['section-order'],
  },
  {
    name: 'a fact with no citation is refused',
    input: page(
      FRONTMATTER,
      BODY.replace('- Three deliverables are named. [[src:sources/plan.pdf#p2]]', '- Three deliverables are named.'),
    ),
    expectedOk: false,
    expectedCodes: ['uncited-fact'],
  },
  {
    name: 'a wrapped fact carries its citation on the continuation line, which is still the same bullet',
    input: page(
      FRONTMATTER,
      BODY.replace(
        '- Three deliverables are named. [[src:sources/plan.pdf#p2]]',
        '- Three deliverables are named, in a bullet long enough that the writer wrapped\n  it and put the citation on the second line. [[src:sources/plan.pdf#p2]]',
      ),
    ),
    expectedOk: true,
    expectedCodes: [],
  },
  {
    name: 'a wrapped fact with no citation on any of its lines is still uncited',
    input: page(
      FRONTMATTER,
      BODY.replace(
        '- Three deliverables are named. [[src:sources/plan.pdf#p2]]',
        '- Three deliverables are named, in a bullet long enough that the writer wrapped\n  it and never cited it.',
      ),
    ),
    expectedOk: false,
    expectedCodes: ['uncited-fact'],
  },
  {
    name: 'an uncited bullet outside Facts is fine — Open questions are not claims',
    input: page(FRONTMATTER, BODY),
    expectedOk: true,
    expectedCodes: [],
  },
  {
    name: 'a citation with no anchor cannot be checked, so it is not a citation',
    input: page(
      FRONTMATTER,
      BODY.replace('[[src:sources/plan.pdf#p2]]', '[[src:sources/plan.pdf]]'),
    ),
    expectedOk: false,
    expectedCodes: ['bad-citation', 'uncited-fact'],
  },
  {
    name: 'an anchor form outside the five is refused',
    input: page(
      FRONTMATTER,
      BODY.replace('[[src:sources/plan.pdf#p2]]', '[[src:sources/plan.pdf#chapter-two]]'),
    ),
    expectedOk: false,
    expectedCodes: ['bad-citation', 'uncited-fact'],
  },
  {
    name: 'every anchor form the contract defines is accepted',
    input: page(
      [
        '---',
        'title: Anchors',
        'created_by: model:llama3.1',
        'compiled_at: 2026-09-05T10:00:00Z',
        'sources:',
        '  - sources/plan.pdf',
        '  - sources/budget.xlsx',
        '  - sources/orders.csv',
        '  - sources/spec.docx',
        '  - sources/log.txt',
        'source_hash: {}',
        'status: reviewed',
        'summary: One bullet per anchor form.',
        '---',
      ].join('\n'),
      [
        '## Summary',
        '',
        'Anchors.',
        '',
        '## Facts',
        '',
        '- A page. [[src:sources/plan.pdf#p12]]',
        '- A sheet. [[src:sources/budget.xlsx#s2]]',
        '- A sheet and row. [[src:sources/budget.xlsx#s2r14]]',
        '- A row. [[src:sources/orders.csv#r89]]',
        '- A heading. [[src:sources/spec.docx#h:error-handling]]',
        '- A line. [[src:sources/log.txt#l204]]',
        '',
        '## Decisions',
        '',
        '## Open questions',
        '',
        '## Not in sources',
      ].join('\n'),
    ),
    expectedOk: true,
    expectedCodes: [],
  },
  {
    name: 'a citation naming a source the page does not declare is refused',
    input: page(
      FRONTMATTER,
      BODY.replace('[[src:sources/plan.pdf#p2]]', '[[src:sources/other.pdf#p2]]'),
    ),
    expectedOk: false,
    expectedCodes: ['citation-target-missing'],
  },
  {
    name: 'describes on a draft is an unapproved claim about the graph',
    input: page(
      FRONTMATTER.replace('status: draft', 'status: draft\ndescribes:\n  - capabilities/mcp-server'),
      BODY,
    ),
    expectedOk: false,
    expectedCodes: ['describes-needs-approval'],
  },
  {
    name: 'describes on a reviewed page is allowed',
    input: page(
      FRONTMATTER.replace('status: draft', 'status: reviewed\ndescribes:\n  - capabilities/mcp-server'),
      BODY,
    ),
    expectedOk: true,
    expectedCodes: [],
  },
  {
    name: 'an empty file fails on everything the contract asks for',
    input: '',
    expectedOk: false,
    expectedCodes: [
      'missing-field:title',
      'missing-field:created_by',
      'missing-field:compiled_at',
      'missing-field:sources',
      'missing-field:source_hash',
      'missing-field:status',
      'missing-field:summary',
      'section-order',
    ],
  },
  {
    name: 'a citation inside a fenced code block is prose, not a claim',
    input: page(
      FRONTMATTER,
      BODY.replace(
        '## Open questions',
        ['## Open questions', '', '```', '- not a bullet [[src:nowhere]]', '```', ''].join('\n'),
      ),
    ),
    expectedOk: true,
    expectedCodes: [],
  },
];

/** Sources that exist on disk, for the `knownSources` arm of the contract. */
export const WIKI_PAGE_KNOWN_SOURCES = [
  'sources/plan.pdf',
  'sources/budget.xlsx',
  'sources/orders.csv',
  'sources/spec.docx',
  'sources/log.txt',
];

/**
 * Folder-level cases for `validateWikiFolder`: each is a whole folder, the expected codes
 * are listed per page path. Both implementations must return exactly these.
 */
function folderPage(name, links = [], sources = ['sources/plan.pdf']) {
  const fm = [
    '---',
    `title: ${name}`,
    'created_by: agent:claude',
    'compiled_at: 2026-09-06T10:00:00Z',
    'sources:',
    ...sources.map((source) => `  - ${source}`),
    'source_hash:',
    ...sources.map((source) => `  ${source}: 3b1f0a00000000000000000000000000000000000000000000000000000000ab`),
    'status: draft',
    `summary: About ${name}.`,
    '---',
  ].join('\n');
  const body = [
    '## Summary',
    '',
    `${name}. ${links.map((link) => `See [[${link}]].`).join(' ')}`,
    '',
    '## Facts',
    '',
    `- A fact. [[src:${sources[0]}#p2]]`,
    '',
    '## Decisions',
    '',
    '## Open questions',
    '',
    '## Not in sources',
  ].join('\n');
  return { path: `wiki/${name}.md`, raw: `${fm}\n\n${body}\n` };
}

export const WIKI_FOLDER_CASES = [
  {
    name: 'one page alone is not an orphan — there is nobody to link it',
    pages: [folderPage('alone')],
    expected: { 'wiki/alone.md': [] },
  },
  {
    name: 'two pages that link each other are clean',
    pages: [folderPage('a', ['wiki/b']), folderPage('b', ['wiki/a'], ['sources/other.csv'])],
    expected: { 'wiki/a.md': [], 'wiki/b.md': [] },
  },
  {
    name: 'a page nobody links is an orphan',
    pages: [folderPage('a', ['wiki/b']), folderPage('b', [], ['sources/other.csv'])],
    expected: { 'wiki/a.md': ['orphan-page'], 'wiki/b.md': [] },
  },
  {
    name: 'a link to a page that is not there dangles',
    pages: [folderPage('a', ['wiki/missing']), folderPage('b', ['wiki/a'], ['sources/other.csv'])],
    expected: { 'wiki/a.md': ['dangling-wikilink'], 'wiki/b.md': ['orphan-page'] },
  },
  {
    name: 'a source a page merely cites does not fan out: only a primary source shared without a link is reported',
    pages: [
      folderPage('a', ['wiki/d'], ['sources/a.pdf', 'sources/minutes.txt']),
      folderPage('b', ['wiki/d'], ['sources/b.pdf', 'sources/minutes.txt']),
      folderPage('c', ['wiki/d'], ['sources/minutes.txt']),
      folderPage('d', ['wiki/a', 'wiki/b', 'wiki/c'], ['sources/d.pdf']),
    ],
    // a and b both cite minutes.txt only for a note and are silent about each other: fine.
    // c was written from minutes.txt; a and b cite it and do not link c: reported on both sides.
    expected: {
      'wiki/a.md': ['shared-source-unlinked'],
      'wiki/b.md': ['shared-source-unlinked'],
      'wiki/c.md': ['shared-source-unlinked', 'shared-source-unlinked'],
      'wiki/d.md': [],
    },
  },
  {
    name: 'two pages sharing a source without linking are told about each other, on both',
    pages: [folderPage('a', ['wiki/c']), folderPage('b', ['wiki/c']), folderPage('c', ['wiki/a', 'wiki/b'], ['sources/other.csv'])],
    expected: { 'wiki/a.md': ['shared-source-unlinked'], 'wiki/b.md': ['shared-source-unlinked'], 'wiki/c.md': [] },
  },
  {
    name: 'a bare [[slug]] resolves inside wiki/, and a citation is never a link',
    pages: [folderPage('a', ['b']), folderPage('b', ['a'], ['sources/other.csv'])],
    expected: { 'wiki/a.md': [], 'wiki/b.md': [] },
  },
];
