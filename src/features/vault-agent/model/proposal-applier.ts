import type { AgentProposal, ProposalChange } from './types';
import {
  changesCompetencyQualification,
  SOURCE_BACKED_COMPETENCY_MESSAGE,
} from './competency-qualification-boundary';

/**
 * Applies consented diffs: preflight, checkpoint, exact writes, refresh.
 * Preflight blocks write nothing. Later failures report the confirmed saved prefix.
 */

export interface VaultWritePort {
  /** A new file. Must fail if one already exists. */
  createDoc(slug: string, content: string): Promise<void>;
  /** Overwrite an existing file. */
  saveDoc(slug: string, content: string, options?: { expectedMtime?: number }): Promise<void>;
  /** The current mtime on disk. Undefined when unknown. */
  currentMtime(slug: string): number | undefined;
  /** Reload the manifest, refreshing the map. */
  refresh(): Promise<void>;
  /** A git save point before applying; null outside git, which the card states. */
  snapshot(label: string): Promise<string | null>;
}

export type ApplyOutcome =
  | { status: 'applied'; snapshotSha: string | null; writtenPaths: string[] }
  | { status: 'conflict'; conflictedPaths: string[] }
  | { status: 'failed'; message: string; writtenPaths: string[]; snapshotSha: string | null; refreshError?: string };

function slugOf(path: string): string {
  return path.replace(/\.md$/, '');
}

function proposalChangesCompetencyQualification(change: ProposalChange): boolean {
  return change.files.some((file) => changesCompetencyQualification(file.before, file.after));
}

export async function applyProposal(
  proposal: AgentProposal,
  port: VaultWritePort,
  options: { snapshotLabel: string },
): Promise<ApplyOutcome> {
  const selected = proposal.changes.filter((change) => change.selected);
  if (selected.length === 0) {
    return { status: 'applied', snapshotSha: null, writtenPaths: [] };
  }
  if (selected.some(proposalChangesCompetencyQualification)) {
    return { status: 'failed', message: SOURCE_BACKED_COMPETENCY_MESSAGE, writtenPaths: [], snapshotSha: null };
  }

  const conflicted: string[] = [];
  for (const change of selected) {
    if (change.expectedMtime === undefined) continue;
    for (const file of change.files) {
      if (file.kind !== 'modify') continue;
      const current = port.currentMtime(slugOf(file.path));
      // An unknown mtime cannot guard: neither invent a conflict nor claim safety.
      if (current === undefined) continue;
      if (current !== change.expectedMtime) conflicted.push(file.path);
    }
  }
  if (conflicted.length > 0) {
    // Zero files changed.
    return { status: 'conflict', conflictedPaths: conflicted };
  }

  let snapshotSha: string | null = null;
  if (proposal.snapshotRequested) {
    try {
      snapshotSha = await port.snapshot(options.snapshotLabel);
    } catch (error) {
    // Writing after failing to create a save point makes the promise "this can be undone" false.
      return { status: 'failed', message: String(error), writtenPaths: [], snapshotSha: null };
    }
  }

  /*
   * Changes to one file chain on each other's `after`. Selected changes must form an unbroken
   * prefix of the chain, or deselected content reaches disk; the last selected `after` is written once.
   */
  const chains = new Map<string, { change: ProposalChange; file: ProposalChange['files'][number] }[]>();
  for (const change of proposal.changes) {
    for (const file of change.files) {
      const chain = chains.get(file.path) ?? [];
      chain.push({ change, file });
      chains.set(file.path, chain);
    }
  }
  const writes: { path: string; kind: 'create' | 'modify'; content: string; expectedMtime?: number }[] = [];
  for (const [path, chain] of chains) {
    let lastSelected = -1;
    for (let i = 0; i < chain.length; i += 1) {
      if (chain[i].change.selected) lastSelected = i;
    }
    if (lastSelected === -1) continue;
    const gap = chain.slice(0, lastSelected + 1).find((entry) => !entry.change.selected);
    if (gap) {
      return {
        status: 'failed',
        writtenPaths: [],
        snapshotSha,
        message:
          `"${gap.change.summary}" is unchecked, but a later selected change to ${path} ` +
          'builds on it. Select it as well, or uncheck the later change.',
      };
    }
    writes.push({
      path,
      kind: chain[0].file.kind === 'create' ? 'create' : chain[lastSelected].file.kind,
      content: chain[lastSelected].file.after,
      expectedMtime: chain[0].change.expectedMtime,
    });
  }
  const written: string[] = [];
  try {
    for (const write of writes) {
      const slug = slugOf(write.path);
      if (write.kind === 'create') {
        await port.createDoc(slug, write.content);
      } else {
        await port.saveDoc(slug, write.content, { expectedMtime: write.expectedMtime });
      }
      written.push(write.path);
    }
  } catch (error) {
    let refreshError: string | undefined;
    try {
      await port.refresh();
    } catch (reloadError) {
      refreshError = String(reloadError);
    }
    return { status: 'failed', message: String(error), writtenPaths: written, snapshotSha,
      ...(refreshError ? { refreshError } : {}) };
  }

  try {
    await port.refresh();
  } catch (error) {
    return { status: 'failed', message: String(error), writtenPaths: written, snapshotSha };
  }
  return { status: 'applied', snapshotSha, writtenPaths: written };
}

/** For a read-only vault — the string [copy this change] gives instead of [apply]. */
export function proposalToClipboardPacket(proposal: AgentProposal): string {
  const lines: string[] = [
    'Apply these vault changes with the ontology-atlas MCP tools:',
    '',
  ];
  for (const change of proposal.changes.filter((c) => c.selected)) {
    lines.push(`- ${change.summary}`);
    for (const file of change.files) {
      lines.push(`  file: ${file.path} (${file.kind})`);
    }
  }
  lines.push('', 'Full content of each file after the change:');
  for (const change of proposal.changes.filter((c) => c.selected)) {
    for (const file of change.files) {
      lines.push('', `--- ${file.path} ---`, file.after);
    }
  }
  return lines.join('\n');
}

/** The card header's totals, such as "3 files · +42 −3". */
export function summarizeChangeVolume(changes: readonly ProposalChange[]): {
  files: number;
  added: number;
  removed: number;
} {
  let files = 0;
  let added = 0;
  let removed = 0;
  for (const change of changes) {
    for (const file of change.files) {
      files += 1;
      const beforeLines = file.before === null ? [] : file.before.split('\n');
      const afterLines = file.after.split('\n');
      const beforeSet = new Set(beforeLines);
      const afterSet = new Set(afterLines);
      for (const line of afterLines) if (!beforeSet.has(line)) added += 1;
      for (const line of beforeLines) if (!afterSet.has(line)) removed += 1;
    }
  }
  return { files, added, removed };
}
