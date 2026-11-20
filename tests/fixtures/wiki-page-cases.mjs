/**
 * The wiki-page contract, as a table.
 *
 * One input, one expected set of problem codes, run through every implementation of the
 * contract (`mcp/src/library/wiki-schema.mjs` and `src/shared/lib/library/wiki-page-schema.ts`) by
 * `tests/contract/library/wiki-page-schema.contract.test.ts`. The MCP package is delivered
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

/**
 * Every document of the folder the `describes:` rows judge against, as `buildWikiNodeIndex` takes
 * them: concepts, a `slug:` alias, an NFC Hangul slug, a tail two concepts share, a tail a concept
 * shares with a wiki page, wiki pages and the vault README.
 */
export const WIKI_PAGE_NODES = [
  { slug: 'capabilities/login', kind: 'capability' },
  { slug: 'capabilities/session-token-issue', kind: 'capability' },
  { slug: 'elements/jwt-signer', kind: 'element', alias: 'signer' },
  { slug: 'capabilities/결제', kind: 'capability' },
  { slug: 'capabilities/checkout', kind: 'capability' },
  { slug: 'elements/checkout', kind: 'element' },
  { slug: 'capabilities/refunds', kind: 'capability' },
  { slug: 'wiki/refunds' },
  { slug: 'wiki/plan' },
  { slug: 'README', kind: 'vault-readme' },
];

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
    name: 'a page that read part of one of its own sources records it and stays valid',
    input: page(
      FRONTMATTER.replace(
        'status: draft',
        'sources_truncated:\n  - sources/plan.pdf\nstatus: draft',
      ),
      BODY,
    ),
    expectedOk: true,
    expectedCodes: [],
  },
  {
    name: 'a truncation record naming a file the page does not cite places no boundary',
    input: page(
      FRONTMATTER.replace(
        'status: draft',
        'sources_truncated:\n  - sources/other.pdf\nstatus: draft',
      ),
      BODY,
    ),
    expectedOk: false,
    expectedCodes: ['bad-truncation-record'],
  },
  {
    name: 'a truncation record that is not a list of paths records nothing at all',
    input: page(
      FRONTMATTER.replace('status: draft', 'sources_truncated: {}\nstatus: draft'),
      BODY,
    ),
    expectedOk: false,
    expectedCodes: ['bad-truncation-record'],
  },
  {
    name: 'describes on a draft is not checked when the caller passes no node list',
    input: page(
      FRONTMATTER.replace('status: draft', 'status: draft\ndescribes:\n  - capabilities/gone'),
      BODY,
    ),
    expectedOk: true,
    expectedCodes: [],
  },
  {
    name: 'a draft page names the concepts it is about, each with a reason',
    nodes: WIKI_PAGE_NODES,
    input: page(
      FRONTMATTER.replace(
        'status: draft',
        [
          'status: draft',
          'describes:',
          '  - capabilities/session-token-issue',
          '  - elements/jwt-signer',
          'relation_notes:',
          '  capabilities/session-token-issue: "Facts 1-2 state when a token is issued."',
          '  elements/jwt-signer: "Fact 2 names the signer."',
        ].join('\n'),
      ),
      BODY,
    ),
    expectedOk: true,
    expectedCodes: [],
  },
  {
    name: 'an empty describes records that a writer checked and found no concept',
    nodes: WIKI_PAGE_NODES,
    input: page(FRONTMATTER.replace('status: draft', 'status: draft\ndescribes: []'), BODY),
    expectedOk: true,
    expectedCodes: [],
  },
  {
    name: 'a page without describes is not asked for one',
    nodes: WIKI_PAGE_NODES,
    input: page(FRONTMATTER, BODY),
    expectedOk: true,
    expectedCodes: [],
  },
  {
    name: 'a full slug, a unique tail and a slug: alias each name one concept',
    nodes: WIKI_PAGE_NODES,
    input: page(
      FRONTMATTER.replace(
        'status: draft',
        'status: draft\ndescribes:\n  - capabilities/login\n  - session-token-issue\n  - signer',
      ),
      BODY,
    ),
    expectedOk: true,
    expectedCodes: [],
  },
  {
    name: 'a Hangul slug typed in NFD names the concept stored in NFC',
    nodes: WIKI_PAGE_NODES,
    input: page(
      FRONTMATTER.replace('status: draft', `status: draft\ndescribes:\n  - ${'capabilities/결제'.normalize('NFD')}`),
      BODY,
    ),
    expectedOk: true,
    expectedCodes: [],
  },
  {
    name: 'a slug no document has names no concept',
    nodes: WIKI_PAGE_NODES,
    input: page(FRONTMATTER.replace('status: draft', 'status: draft\ndescribes:\n  - capabilities/gone'), BODY),
    expectedOk: false,
    expectedCodes: ['describes-target-missing'],
  },
  {
    name: 'a tail two concepts share names neither',
    nodes: WIKI_PAGE_NODES,
    input: page(FRONTMATTER.replace('status: draft', 'status: draft\ndescribes:\n  - checkout'), BODY),
    expectedOk: false,
    expectedCodes: ['describes-target-missing'],
  },
  {
    name: 'a tail a concept shares with a wiki page is ambiguous, as find_backlinks reads it',
    nodes: WIKI_PAGE_NODES,
    input: page(FRONTMATTER.replace('status: draft', 'status: draft\ndescribes:\n  - refunds'), BODY),
    expectedOk: false,
    expectedCodes: ['describes-target-missing'],
  },
  {
    name: 'a wiki page is not a concept',
    nodes: WIKI_PAGE_NODES,
    input: page(FRONTMATTER.replace('status: draft', 'status: draft\ndescribes:\n  - wiki/plan'), BODY),
    expectedOk: false,
    expectedCodes: ['describes-target-missing'],
  },
  {
    name: 'the vault README is not a concept',
    nodes: WIKI_PAGE_NODES,
    input: page(FRONTMATTER.replace('status: draft', 'status: draft\ndescribes:\n  - README'), BODY),
    expectedOk: false,
    expectedCodes: ['describes-target-missing'],
  },
  {
    name: 'a lone describes value is not a list, so no reader takes it as a link',
    nodes: WIKI_PAGE_NODES,
    input: page(FRONTMATTER.replace('status: draft', 'status: draft\ndescribes: capabilities/login'), BODY),
    expectedOk: false,
    expectedCodes: ['bad-describes'],
  },
  {
    name: 'a describes that is not a list is reported without a node list too',
    input: page(FRONTMATTER.replace('status: draft', 'status: draft\ndescribes:'), BODY),
    expectedOk: false,
    expectedCodes: ['bad-describes'],
  },
  {
    name: 'each entry that names no concept is reported once, the good ones not at all',
    nodes: WIKI_PAGE_NODES,
    input: page(
      FRONTMATTER.replace(
        'status: draft',
        'status: draft\ndescribes:\n  - capabilities/login\n  - capabilities/gone\n  - capabilities/gone\n  - wiki/plan',
      ),
      BODY,
    ),
    expectedOk: false,
    expectedCodes: ['describes-target-missing', 'describes-target-missing'],
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
  /*
   * `validateWikiFolder` is handed only the `wiki/` folder, so it cannot know whether a linked concept
   * exists; a link into the rest of the vault must stay silent, not `dangling-wikilink`.
   */
  {
    name: 'a link into the vault outside wiki/ is left to the vault, not called dangling',
    pages: [
      folderPage('a', ['wiki/b', 'capabilities/checkout']),
      folderPage('b', ['wiki/a', 'domains/commerce'], ['sources/other.csv']),
    ],
    expected: { 'wiki/a.md': [], 'wiki/b.md': [] },
  },
  {
    name: 'a link into wiki/ is still judged when the concept link beside it is not',
    pages: [
      folderPage('a', ['wiki/missing', 'capabilities/checkout']),
      folderPage('b', ['wiki/a'], ['sources/other.csv']),
    ],
    expected: { 'wiki/a.md': ['dangling-wikilink'], 'wiki/b.md': ['orphan-page'] },
  },
  {
    name: 'three pages from one primary source: the linked pair is quiet, each unlinked pair is reported',
    pages: [
      folderPage('a', ['wiki/b', 'wiki/d']),
      folderPage('b', ['wiki/a', 'wiki/d']),
      folderPage('c', ['wiki/d']),
      folderPage('d', ['wiki/a', 'wiki/b', 'wiki/c'], ['sources/other.csv']),
    ],
    expected: {
      'wiki/a.md': ['shared-source-unlinked'],
      'wiki/b.md': ['shared-source-unlinked'],
      'wiki/c.md': ['shared-source-unlinked', 'shared-source-unlinked'],
      'wiki/d.md': [],
    },
    partners: {'wiki/a.md': ['wiki/c.md'], 'wiki/b.md': ['wiki/c.md'], 'wiki/c.md': ['wiki/a.md', 'wiki/b.md'], 'wiki/d.md': []},
  },
  {
    name: 'two primary sources in one folder pair only the pages written from the same one',
    pages: [
      folderPage('a', ['wiki/c', 'wiki/d'], ['sources/plan.pdf']),
      folderPage('b', ['wiki/c'], ['sources/plan.pdf']),
      folderPage('c', ['wiki/a', 'wiki/b'], ['sources/budget.xlsx']),
      folderPage('d', ['wiki/a'], ['sources/budget.xlsx']),
    ],
    expected: {
      'wiki/a.md': ['shared-source-unlinked'],
      'wiki/b.md': ['shared-source-unlinked'],
      'wiki/c.md': ['shared-source-unlinked'],
      'wiki/d.md': ['shared-source-unlinked'],
    },
    partners: {'wiki/a.md': ['wiki/b.md'], 'wiki/b.md': ['wiki/a.md'], 'wiki/c.md': ['wiki/d.md'], 'wiki/d.md': ['wiki/c.md']},
  },
  {
    name: 'a page listing another page\'s primary source second is paired, whichever comes first in the input',
    pages: [
      folderPage('b', ['wiki/c'], ['sources/b.pdf', 'sources/a.pdf']),
      folderPage('a', ['wiki/c'], ['sources/a.pdf']),
      folderPage('e', ['wiki/c'], ['sources/e.pdf', 'sources/a.pdf']),
      folderPage('c', ['wiki/a', 'wiki/b', 'wiki/e'], ['sources/c.pdf']),
    ],
    expected: {
      'wiki/b.md': ['shared-source-unlinked'],
      'wiki/a.md': ['shared-source-unlinked', 'shared-source-unlinked'],
      'wiki/e.md': ['shared-source-unlinked'],
      'wiki/c.md': [],
    },
    partners: {'wiki/b.md': ['wiki/a.md'], 'wiki/a.md': ['wiki/b.md', 'wiki/e.md'], 'wiki/e.md': ['wiki/a.md'], 'wiki/c.md': []},
  },
  {
    name: 'a page paired through two sources names its partners in input order',
    pages: [
      folderPage('p0', ['wiki/hub'], ['sources/a.pdf', 'sources/b.pdf']),
      folderPage('p1', ['wiki/hub'], ['sources/b.pdf']),
      folderPage('p2', ['wiki/hub'], ['sources/x.pdf', 'sources/a.pdf']),
      folderPage('hub', ['wiki/p0', 'wiki/p1', 'wiki/p2'], ['sources/hub.pdf']),
    ],
    expected: {
      'wiki/p0.md': ['shared-source-unlinked', 'shared-source-unlinked'],
      'wiki/p1.md': ['shared-source-unlinked'],
      'wiki/p2.md': ['shared-source-unlinked'],
      'wiki/hub.md': [],
    },
    partners: {
      'wiki/p0.md': ['wiki/p1.md', 'wiki/p2.md'],
      'wiki/p1.md': ['wiki/p0.md'],
      'wiki/p2.md': ['wiki/p0.md'],
      'wiki/hub.md': [],
    },
  },
  /*
   * Past ten unlinked partners a page names the first ten in input order and counts the rest in
   * one more finding, so pages written from one document cost linear time and memory.
   */
  (() => {
    const names = Array.from({ length: 12 }, (_, index) => `m${String(index).padStart(2, '0')}`);
    const path = (name) => `wiki/${name}.md`;
    return {
      name: 'twelve pages from one primary source name ten partners each and count the eleventh',
      pages: [
        ...names.map((name) => folderPage(name, ['wiki/hub'])),
        folderPage('hub', names.map((name) => `wiki/${name}`), ['sources/hub.pdf']),
      ],
      expected: {
        ...Object.fromEntries(names.map((name) => [path(name), Array(11).fill('shared-source-unlinked')])),
        'wiki/hub.md': [],
      },
      partners: {
        ...Object.fromEntries(names.map((name) => [
          path(name),
          [...names.filter((other) => other !== name).slice(0, 10).map(path), undefined],
        ])),
        'wiki/hub.md': [],
      },
    };
  })(),
];

/**
 * A seeded folder of `count` pages mixing every shape the page and folder halves judge: missing
 * fields, `kind:`, `describes:` as a list and as a lone value, truncation records, sections out of
 * order, wrapped and uncited facts, malformed citations, fenced text, links bare, aliased, anchored,
 * with `.md`, to themselves, twice, outside `wiki/` and to missing pages, and sources shared as
 * primaries (each primary is shared by about twenty pages, past the ten partners a page names).
 * Equal inputs give equal folders, so a failure reproduces.
 */
export function generatedWikiFolder(count = 600, seed = 20261120) {
  let state = seed >>> 0;
  const random = () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
  const chance = (p) => random() < p;
  const pick = (list) => list[Math.floor(random() * list.length)];
  const pool = Array.from({ length: 30 }, (_, index) => `sources/doc-${index}.${['pdf', 'md', 'csv'][index % 3]}`);
  const knownSources = pool.filter((_, index) => index % 7 !== 3);
  const anchor = () => pick(['p1', 'p12', 's2', 's2r4', 'r9', 'l3', 'h:scope-note']);
  const linkTo = (self) => {
    const other = `page-${Math.floor(random() * (count + 40))}`;
    return pick([
      `[[wiki/${other}]]`,
      `[[${other}]]`,
      `[[${other}|the other page]]`,
      `[[wiki/${other}#Facts]]`,
      `[[${other}.md]]`,
      `[[wiki/${self}]]`,
      '[[capabilities/checkout]]',
      '[[domains/commerce]]',
    ]);
  };
  const pages = [];
  for (let index = 0; index < count; index += 1) {
    const self = `page-${index}`;
    const sources = [...new Set(Array.from({ length: chance(0.1) ? 0 : 1 + Math.floor(random() * 3) }, () => pick(pool)))];
    if (sources.length > 1 && chance(0.1)) sources.push(sources[0]);
    const cite = () => (chance(0.85) && sources.length > 0 ? `[[src:${pick(sources)}#${anchor()}]]` : `[[src:${pick(pool)}#${anchor()}]]`);
    const fm = ['---'];
    if (chance(0.95)) fm.push(`title: Page ${index}`);
    if (chance(0.95)) fm.push('created_by: agent:claude');
    if (chance(0.95)) fm.push('compiled_at: 2026-09-06T10:00:00Z');
    if (chance(0.05)) fm.push('kind: document');
    if (chance(0.05) && sources.length > 0) fm.push(`sources: ${sources[0]}`);
    else if (chance(0.97)) fm.push(sources.length > 0 ? `sources:\n${sources.map((source) => `  - ${source}`).join('\n')}` : 'sources: []');
    if (chance(0.95)) fm.push('source_hash: {}');
    if (chance(0.1)) fm.push(`sources_truncated:\n  - ${chance(0.7) && sources.length > 0 ? sources[0] : pick(pool)}`);
    if (chance(0.05)) fm.push('sources_truncated: yes');
    if (chance(0.3)) fm.push(`describes:\n${Array.from({ length: 1 + Math.floor(random() * 2) }, () => `  - ${pick(WIKI_PAGE_NODES).slug}`).join('\n')}`);
    else if (chance(0.03)) fm.push('describes: capabilities/login');
    if (chance(0.95)) fm.push('status: draft');
    if (chance(0.95)) fm.push(`summary: About page ${index}.`);
    fm.push('---');
    const sections = {
      Summary: [`Page ${index} reads ${linkTo(self)} and ${linkTo(self)}.`],
      Facts: Array.from({ length: Math.floor(random() * 4) }, () => (chance(0.15)
        ? `- A wrapped claim that goes on\n  past its first line. ${chance(0.6) ? cite() : ''}`
        : `- A claim. ${chance(0.8) ? cite() : ''} ${chance(0.3) ? linkTo(self) : ''}`)),
      Decisions: chance(0.3) ? [`- A decision. ${cite()}`] : [],
      'Open questions': chance(0.2) ? [`- Malformed: [[src:${pick(pool)}]] and [[src:plan.pdf#p2]].`] : [],
      'Not in sources': chance(0.2) ? ['```', `[[src:not-a-source]] ${linkTo(self)}`, '```'] : [],
    };
    let order = Object.keys(sections);
    if (chance(0.05)) order = [order[1], order[0], ...order.slice(2)];
    if (chance(0.05)) order = order.filter((title) => title !== 'Decisions');
    const body = order.flatMap((title) => [`## ${title}`, '', ...sections[title], '']);
    pages.push({ path: `wiki/${self}.md`, raw: `${fm.join('\n')}\n\n${body.join('\n')}` });
  }
  return { pages, knownSources, nodes: WIKI_PAGE_NODES };
}
