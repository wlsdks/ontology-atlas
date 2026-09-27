import type { HarnessReport } from '@/entities/agent-files';

import type { HarnessAnatomy, AnatomySlot } from './harness-anatomy';

/**
 * The screen as text a person can hand to an agent: English, third person, so it reads as a report
 * rather than as the person's instruction. It never suggests, and it carries its own limits,
 * because an agent reads an unqualified count as a guarantee.
 */

function line(slot: AnatomySlot, label: string): string | null {
  if (slot.status !== 'present') return null;
  const names = slot.items.length > 0 ? ` (${slot.items.join(', ')}${slot.overflow > 0 ? `, +${slot.overflow} more` : ''})` : '';
  return `${label}: ${slot.count}${names}`;
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const LABELS: Readonly<Record<string, string>> = Object.freeze({
  always: 'read every turn',
  scoped: 'attached by path',
  skills: 'skills',
  subagents: 'sub-agent briefs',
  tools: 'MCP servers',
  toolGates: 'hooks that can refuse a tool call',
  permissions: 'permission rules that deny or ask',
  blind: 'exclusion files',
  gitGates: 'files under .githooks/',
  watchers: 'hooks that watch after the fact',
  checks: 'check scripts a command names',
  discoveredTests: 'test files a runner discovers',
  pipeline: 'workflows that run after a push',
});

export function buildHarnessBrief(
  anatomy: HarnessAnatomy,
  report: HarnessReport,
  sourceRoot: string,
  today: string,
): string {
  const present: string[] = [];
  const absent: string[] = [];
  for (const slot of anatomy.slots) {
    if (slot.band === 'tool') continue;
    const label = LABELS[slot.id] ?? slot.id;
    if (slot.status === 'present') {
      const rendered = line(slot, label);
      if (rendered) present.push(`- ${rendered}`);
    } else {
      absent.push(`- ${label}: none${slot.fillPath ? ` (one lives at ${slot.fillPath})` : ''}`);
    }
  }

  const weight: string[] = [];
  if (anatomy.alwaysBytes > 0) {
    weight.push(`- ${kb(anatomy.alwaysBytes)} is read on every turn before any code is opened.`);
  }
  if (anatomy.deepestNested) {
    weight.push(
      `- Working inside ${anatomy.deepestNested.path.replace(/\/[^/]+$/, '')} adds ${kb(anatomy.deepestNested.bytes)}, for ${kb(anatomy.alwaysBytes + anatomy.deepestNested.bytes)} a turn.`,
    );
  }

  const warnings: string[] = [];
  if (anatomy.silentGuards.missing.length > 0) {
    warnings.push(
      `- A config names ${anatomy.silentGuards.missing.join(', ')}, and the file is not on disk. That produces no block and no error.`,
    );
  }
  if (anatomy.silentGuards.unresolved.length > 0) {
    warnings.push(
      `- ${anatomy.silentGuards.unresolved.length} hook command(s) could not be resolved to a script path, so nothing could be checked about them.`,
    );
  }
  if (anatomy.approvalGates.length > 0) {
    warnings.push(
      `- Hooks in ${anatomy.approvalGates.join(', ')} run only once a person has trusted them inside the tool, and that approval lives in no file.`,
    );
  }

  return [
    `Agent harness of ${sourceRoot}, read from files on ${today} by Ontology Atlas.`,
    '',
    'What this repository gives an agent:',
    ...present,
    '',
    'What a turn costs:',
    ...(weight.length > 0 ? weight : ['- Nothing is read unconditionally.']),
    ...(absent.length > 0 ? ['', 'Not here:', ...absent] : []),
    ...(warnings.length > 0 ? ['', 'Worth knowing:', ...warnings] : []),
    '',
    'Limits of this report:',
    `- Every number is a declaration found in a file. ${report.checks.total} checks are declared; whether any of them runs, or has ever caught anything, is not readable from a repository.`,
    '- The agent loop, the model, and what gets dropped when the context fills belong to the tool, not to this folder, and are not measured here.',
    '- Nothing above is a recommendation. A repository with no sub-agents and no MCP servers may be exactly right.',
  ].join('\n');
}
