import { createHash } from 'node:crypto';
export const digest = (text: string) => createHash('sha256').update(text).digest('hex');
export const wiki = (title: string, source: string, hash: string, fact: string) => [
  '---', `title: ${title}`, 'created_by: agent:fixture', 'compiled_at: 2026-09-20T00:00:00Z',
  'sources:', `  - ${source}`, 'source_hash:', `  ${source}: ${hash}`, 'status: draft',
  `summary: ${title}.`, '---', '## Summary', `${title}.`, '## Facts',
  `- ${fact} [[src:${source}#l2]]`, '## Decisions', '## Open questions', '## Not in sources',
].join('\n');
