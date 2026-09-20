import type { HarnessReport } from '@/entities/agent-files';

import type { HarnessAnatomy, AnatomySlot } from './harness-anatomy';

/**
 * **The screen, as something a person can hand to an agent.**
 *
 * The owner's goal for this destination is that an empty place is visible *and addable*. The rows
 * do the first half and offer the address for the second, but the person then has to retype what
 * they just read into whatever agent they use. This is that retyping, done once and correctly.
 *
 * **English, deliberately, and in the third person.** It lands in someone else's session as
 * material rather than as the person's own words, so it reads as a report about a repository, not
 * as an instruction pretending to be theirs. The same reasoning the first-run prompt records: a
 * button that hands over a description should hand over a description.
 *
 * **It carries its own limits, because an agent will otherwise read a count as a guarantee.** Every
 * number here is a declaration found in a file: a hook that is wired exists on disk and may never
 * run; a check script is named in `package.json` and may never have caught anything. The closing
 * lines say so, and they are not decoration — an agent handed "5 gates" with no qualifier will
 * happily tell its user the repository is protected.
 *
 * **It never suggests.** No "you should add", no priority order, no score. What is absent is listed
 * as absent with the address a part like it lives at, and what the tool owns is named as
 * unreadable. The person and their agent decide what, if anything, to do about it.
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
