import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const RAW_SOURCE_SLUG = 'sources/Planning/roadmap';
export const RAW_SOURCE_PATH = `${RAW_SOURCE_SLUG}.md`;
export const RAW_SOURCE_TEXT = [
  '---',
  'kind: domain',
  'title: Roadmap',
  'relates: [domains/planning]',
  '---',
  '',
  '# Roadmap',
  '',
  'Q4 ships the importer.',
  '',
].join('\n');

const PLANNING_DOMAIN = [
  '---',
  'uid: 0b1c2d3e-4f50-4a61-8b72-9c83d4e5f601',
  'kind: domain',
  'title: Planning',
  '---',
  '',
  'Owns the quarterly plan and what ships in it.',
  '',
  '## Includes',
  '',
  '- The roadmap',
  '',
  '## Excludes',
  '',
  '- Hiring',
  '',
  '## Uncertainty',
  '',
  '- Who reads the plan outside the team was never checked',
  '',
].join('\n');

function wikiPageCiting(sourceHash) {
  return [
    '---',
    'title: Roadmap notes',
    'created_by: agent:claude',
    'compiled_at: 2026-09-27T00:00:00Z',
    'sources:',
    `  - ${RAW_SOURCE_PATH}`,
    'source_hash:',
    `  ${RAW_SOURCE_PATH}: ${sourceHash}`,
    'status: draft',
    'summary: What the roadmap says ships in Q4.',
    '---',
    '',
    '## Summary',
    '',
    'The roadmap names one Q4 deliverable.',
    '',
    '## Facts',
    '',
    `- Q4 ships the importer. [[src:${RAW_SOURCE_PATH}#l9]]`,
    '',
    '## Decisions',
    '',
    '- None recorded.',
    '',
    '## Open questions',
    '',
    '- None.',
    '',
    '## Not in sources',
    '',
    '- Nothing.',
    '',
  ].join('\n');
}

export function makeRawSourceVault() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-raw-source-'));
  const files = {
    'domains/planning.md': PLANNING_DOMAIN,
    [RAW_SOURCE_PATH]: RAW_SOURCE_TEXT,
    'wiki/roadmap-notes.md': wikiPageCiting(createHash('sha256').update(RAW_SOURCE_TEXT).digest('hex')),
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}
