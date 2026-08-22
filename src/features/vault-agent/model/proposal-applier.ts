import type { AgentProposal, ProposalChange } from './types';
import {
  changesCompetencyQualification,
  SOURCE_BACKED_COMPETENCY_MESSAGE,
} from './competency-qualification-boundary';

/**
 * The **only** module that writes a consented proposal to disk.
 *
 * **Why this file exists.** The price of stopping the executor from writing is
 * that writes gather in this one place. It should be called from exactly one
 * place — the consent card's [apply] handler. Calling it elsewhere breaks "it
 * writes only when the user presses".
 *
 * **The order is the contract:**
 *
 * 1. Re-check mtime — if a person edited the same file after the proposal,
 *    **nothing is written.**
 * 2. (When checked and this is a git repository) the save point first.
 * 3. Write the `after` string **verbatim** — the same value the card drew.
 * 4. Re-read to refresh the map.
 *
 * Blocking at any stage ends with **zero files changed**. To avoid a half-applied
 * state, every mtime check completes before any write begins.
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
  /**
   * A git save point taken right before applying. Returns null when this is not a
   * git vault — and the card states that honestly ("this folder is not a git
   * repository, so no save point can be made").
   */
  snapshot(label: string): Promise<string | null>;
}

export type ApplyOutcome =
  | { status: 'applied'; snapshotSha: string | null; writtenPaths: string[] }
  | { status: 'conflict'; conflictedPaths: string[] }
  | { status: 'failed'; message: string };

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
    return { status: 'failed', message: SOURCE_BACKED_COMPETENCY_MESSAGE };
  }

  // ── 1. Check everything before writing ──────────────────────────────
  const conflicted: string[] = [];
  for (const change of selected) {
    if (change.expectedMtime === undefined) continue;
    for (const file of change.files) {
      if (file.kind !== 'modify') continue;
      const current = port.currentMtime(slugOf(file.path));
      // With an unknown mtime (static mode, say) no guard can be applied — do not
      // invent a conflict from a fact that does not exist, and do not claim safety either.
      if (current === undefined) continue;
      if (current !== change.expectedMtime) conflicted.push(file.path);
    }
  }
  if (conflicted.length > 0) {
    // Zero files changed. The card degrades to "this document just changed".
    return { status: 'conflict', conflictedPaths: conflicted };
  }

  // ── 2. Save point ───────────────────────────────────────────────────
  let snapshotSha: string | null = null;
  if (proposal.snapshotRequested) {
    try {
      snapshotSha = await port.snapshot(options.snapshotLabel);
    } catch (error) {
    // Writing after failing to create a save point makes the promise "this can be undone" false.
      return { status: 'failed', message: String(error) };
    }
  }

  // ── 3. Write ────────────────────────────────────────────────────────
  const written: string[] = [];
  try {
    for (const change of selected) {
      for (const file of change.files) {
        const slug = slugOf(file.path);
        if (file.kind === 'create') {
          await port.createDoc(slug, file.after);
        } else {
          await port.saveDoc(slug, file.after, {
            expectedMtime: change.expectedMtime,
          });
        }
        written.push(file.path);
      }
    }
  } catch (error) {
    return { status: 'failed', message: String(error) };
  }

  // ── 4. Refresh the map ──────────────────────────────────────────────
  await port.refresh();
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

/** The card header's totals — "3 files · +42 −3". Stops the diff from being a folded rubber stamp. */
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
