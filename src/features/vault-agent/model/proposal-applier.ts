import type { AgentProposal, ProposalChange, ProposedFileChange } from './types';
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

export function planProposalFiles(changes: readonly ProposalChange[]): {
  files: Array<ProposedFileChange & { expectedMtime?: number }>;
  conflict: { path: string; summary: string } | null;
} {
  const chains = new Map<string, { change: ProposalChange; file: ProposedFileChange }[]>();
  for (const change of changes) {
    for (const file of change.files) {
      const chain = chains.get(file.path) ?? [];
      chain.push({ change, file });
      chains.set(file.path, chain);
    }
  }
  const files: Array<ProposedFileChange & { expectedMtime?: number }> = [];
  for (const [path, chain] of chains) {
    const last = chain.findLastIndex(({ change }) => change.selected);
    if (last < 0) continue;
    const gap = chain.slice(0, last + 1).find(({ change }) => !change.selected);
    if (gap) return { files: [], conflict: { path, summary: gap.change.summary } };
    files.push({
      path,
      kind: chain[0].file.kind,
      before: chain[0].file.before,
      after: chain[last].file.after,
      expectedMtime: chain[0].change.expectedMtime,
    });
  }
  return { files, conflict: null };
}

function selectionConflictMessage(conflict: { path: string; summary: string }): string {
  return `"${conflict.summary}" is unchecked, but a later selected change to ${conflict.path} ` +
    'builds on it. Select it as well, or uncheck the later change.';
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
  const plan = planProposalFiles(proposal.changes);
  if (plan.conflict) {
    return { status: 'failed', message: selectionConflictMessage(plan.conflict), writtenPaths: [], snapshotSha: null };
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

  const written: string[] = [];
  try {
    for (const write of plan.files) {
      const slug = slugOf(write.path);
      if (write.kind === 'create') {
        await port.createDoc(slug, write.after);
      } else {
        await port.saveDoc(slug, write.after, { expectedMtime: write.expectedMtime });
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
  const plan = planProposalFiles(proposal.changes);
  if (plan.conflict) throw new Error(selectionConflictMessage(plan.conflict));
  if (plan.files.length === 0) return '';
  const lines: string[] = [
    'Apply these vault changes with the ontology-atlas MCP tools:',
    '',
  ];
  for (const change of proposal.changes.filter((c) => c.selected)) {
    lines.push(`- ${change.summary}`);
  }
  for (const file of plan.files) lines.push(`  file: ${file.path} (${file.kind})`);
  lines.push('', 'Full content of each file after the change:');
  for (const file of plan.files) lines.push('', `--- ${file.path} ---`, file.after);
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
  const net = new Map<string, { before: string | null; after: string }>();
  for (const change of changes) {
    if (!change.selected) continue;
    for (const file of change.files) {
      const original = net.get(file.path);
      net.set(file.path, { before: original ? original.before : file.before, after: file.after });
    }
  }
  files = net.size;
  for (const file of net.values()) {
    for (const line of proposalLineDiff(file.before, file.after)) {
      if (line.kind === 'added') added += 1;
      if (line.kind === 'removed') removed += 1;
    }
  }
  return { files, added, removed };
}

export interface ProposalDiffLine {
  kind: 'added' | 'removed' | 'unchanged';
  text: string;
}

function textLines(text: string | null): string[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function commonLineLengths(before: readonly string[], after: readonly string[]): Uint32Array {
  const lengths = new Uint32Array(after.length + 1);
  for (const line of before) {
    let diagonal = 0;
    for (let index = 0; index < after.length; index += 1) {
      const previous = lengths[index + 1];
      lengths[index + 1] = line === after[index] ? diagonal + 1 : Math.max(previous, lengths[index]);
      diagonal = previous;
    }
  }
  return lengths;
}

function commonLineSplit(before: readonly string[], after: readonly string[], middle: number): number {
  const left = commonLineLengths(before.slice(0, middle), after);
  const right = commonLineLengths(before.slice(middle).reverse(), [...after].reverse());
  let split = 0;
  let longest = -1;
  for (let index = 0; index <= after.length; index += 1) {
    const common = left[index] + right[after.length - index];
    if (common > longest) { longest = common; split = index; }
  }
  return split;
}

/** Ordered LCS diff: O(N*M) worst-case time, O((N+M)*log N) space; common ends and disjoint spans are linear. */
export function proposalLineDiff(beforeText: string | null, afterText: string): ProposalDiffLine[] {
  const rows: ProposalDiffLine[] = [];
  function emit(kind: ProposalDiffLine['kind'], lines: readonly string[]) {
    for (const text of lines) rows.push({ kind, text });
  }
  function append(before: string[], after: string[]) {
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) {
      rows.push({ kind: 'unchanged', text: before[start] });
      start += 1;
    }
    let beforeEnd = before.length;
    let afterEnd = after.length;
    while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) {
      beforeEnd -= 1;
      afterEnd -= 1;
    }
    const suffix = before.slice(beforeEnd);
    before = before.slice(start, beforeEnd);
    after = after.slice(start, afterEnd);
    const oldLines = new Set(before);
    if (!before.length || !after.length || !after.some(line => oldLines.has(line))) {
      emit('removed', before);
      emit('added', after);
    } else if (before.length === 1) {
      const match = after.indexOf(before[0]);
      emit('added', after.slice(0, match));
      rows.push({ kind: 'unchanged', text: before[0] });
      emit('added', after.slice(match + 1));
    } else {
      const middle = Math.floor(before.length / 2);
      const split = commonLineSplit(before, after, middle);
      append(before.slice(0, middle), after.slice(0, split));
      append(before.slice(middle), after.slice(split));
    }
    emit('unchanged', suffix);
  }
  append(textLines(beforeText), textLines(afterText));
  return rows;
}
