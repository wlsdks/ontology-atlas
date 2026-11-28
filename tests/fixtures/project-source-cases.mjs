/**
 * Vault documents and graph nodes for the project-source contract
 * (`tests/contract/analysis/project-source-connect.contract.test.ts`). The answers the script server
 * gave for them are recorded in `project-source-golden.json`.
 */

export const MUSIC_DOCS = [
  {
    slug: 'music-streaming',
    frontmatter: { kind: 'project', slug: 'music-streaming', title: 'Music', path: 'src/app' },
    body: [
      '## Competency answers',
      '',
      '### scope — answered',
      '',
      'What outcome defines this project?',
      '',
      'People can play music.',
      '',
      '- Evidence: `README.md`, `docs/PRODUCT.md`',
      '- Paths: `src/play/engine.ts`',
    ].join('\n'),
    meaningEvidencePaths: ['docs/PRODUCT.md', 'README.md', 'src/play/engine.ts'],
  },
  {
    slug: 'capabilities/play',
    frontmatter: {
      kind: 'capability',
      title: 'Play',
      path: 'src/play',
      elements: ['src/play/engine.ts', 'elements/engine'],
    },
  },
  { slug: 'elements/engine', frontmatter: { kind: 'element', title: 'src/play/engine.ts' } },
  { slug: 'elements/mixer', frontmatter: { kind: 'element', title: 'src/play/mixer.ts' } },
  { slug: 'domains/audio', frontmatter: { kind: 'domain', title: 'Audio' } },
];

export const MUSIC_NODES = [
  { id: 'project:music-streaming', kind: 'project', title: 'Music', projectIds: [], agentSlug: 'music-streaming' },
  { id: 'capability:play', kind: 'capability', title: 'Play', projectIds: ['music-streaming'], agentSlug: 'capabilities/play' },
  { id: 'element:engine', kind: 'element', title: 'src/play/engine.ts', projectIds: ['music-streaming'], agentSlug: 'elements/engine' },
  { id: 'element:mixer', kind: 'element', title: 'src/play/mixer.ts', projectIds: ['music-streaming'], agentSlug: 'elements/mixer' },
  { id: 'domain:audio', kind: 'domain', title: 'Audio', projectIds: ['music-streaming'], agentSlug: 'domains/audio' },
];

/** A repository-root claim and single-segment directories. */
export const ROOT_CLAIM_DOCS = [
  {
    slug: 'music-streaming',
    frontmatter: { kind: 'project', slug: 'music-streaming', title: 'Music' },
    body: [
      '## Competency answers',
      '',
      '### scope — answered',
      '',
      'Question',
      '',
      'Answer',
      '',
      '- Evidence: `generate`',
      '- Paths: `.`, `jsonschema`, `transform`',
    ].join('\n'),
    meaningEvidencePaths: ['.', 'generate', 'jsonschema', 'transform'],
  },
  { slug: 'capabilities/play', frontmatter: { kind: 'capability', path: 'transform' } },
];

export const ROOT_CLAIM_NODES = [
  { id: 'project:music-streaming', kind: 'project', title: 'Music', projectIds: [], agentSlug: 'music-streaming' },
  { id: 'capability:play', kind: 'capability', title: 'Play', projectIds: ['music-streaming'], agentSlug: 'capabilities/play' },
];

/** Slugs that sort differently in a Korean and an English process. */
export const LOCALE_DOCS = [
  { slug: 'music-streaming', frontmatter: { kind: 'project', slug: 'music-streaming', title: 'Music' } },
  { slug: 'capabilities/재생', frontmatter: { kind: 'capability', path: 'src/play.ts' } },
  { slug: 'capabilities/queue', frontmatter: { kind: 'capability', path: 'src/queue.ts' } },
];

export const LOCALE_NODES = [
  { id: 'project:music-streaming', kind: 'project', title: 'Music', projectIds: [], agentSlug: 'music-streaming' },
  { id: 'capability:재생', kind: 'capability', title: '재생', projectIds: ['music-streaming'], agentSlug: 'capabilities/재생' },
  { id: 'capability:queue', kind: 'capability', title: 'Queue', projectIds: ['music-streaming'], agentSlug: 'capabilities/queue' },
];

export const RECEIPT_PROBE = {
  sourceId: 'sha256:abc',
  kind: 'git',
  revision: 'deadbeef',
  fingerprint: 'sha256:def',
  dirty: false,
  truncated: false,
  files: ['src/app/page.tsx', 'src/play/engine.ts'],
};

export const NEXT_ACTION_IDS = [
  'connect_source',
  'repair_source_binding',
  'measure_source',
  'record_source_role',
  'repair_source_path',
  'review_inventory_limit',
  'remeasure_source',
  'use_current_evidence',
];
