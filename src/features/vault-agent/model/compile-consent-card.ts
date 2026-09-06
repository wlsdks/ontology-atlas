import type { AgentProposal, ProposalChange } from './types';
import type { CompileSourceRefusal, WikiPageProposal } from './wiki-proposal';

/**
 * **The one card a Compile turn ends at.**
 *
 * The concept card answers "which nodes change"; this one answers a different question,
 * and it is the question `docs/DECISIONS.md` (2026-09-06) named as the price of the local
 * route: *which page, written from what, and what could not be read.* A person who cannot
 * open the sources themselves in the time it takes to approve — that is the whole point of
 * compiling — needs those three facts in front of the button, not behind it.
 *
 * **A page that fails validation has no write action at all.** Not a disabled one, not one
 * behind a warning: `proposal` is null for it and it contributes nothing writable, so the
 * only thing the screen can do with a bad page is show what is wrong with it. That is the
 * structural version of "the card shows the exact failure and offers nothing to write".
 *
 * Everything here is pure. The `AgentProposal` it returns is the ordinary shape
 * `applyProposal` already takes, so the write path, the mtime guard, and the "zero files
 * changed on any refusal" contract are the existing ones rather than a second copy.
 */

export interface CompileCardRow {
  /** `wiki/quarter-plan.md`. */
  path: string;
  title: string;
  ok: boolean;
  /** True when a page of this name is already in the folder and would be replaced. */
  replaces: boolean;
  sections: Array<{ name: string; entries: number }>;
  citationCount: number;
  /** Sources this page was written from. */
  sourcesRead: string[];
  /** Sources read only up to the cap — the page says so too, but the card says it first. */
  sourcesTruncated: string[];
  /** Sources this turn could not open, and why. */
  sourcesUnreadable: Array<{ path: string; refusal: CompileSourceRefusal }>;
  /** Exactly what is wrong, when something is. Empty when `ok`. */
  problems: Array<{ code: string; message: string }>;
  /** The bytes that would be written — the same string the diff draws. Null when not ok. */
  page: string | null;
}

export interface CompileConsentCard {
  rows: CompileCardRow[];
  /** How many pages would be written if the person allows. */
  writableCount: number;
  /** How many were refused before the person saw them. */
  refusedCount: number;
  /**
   * The proposal `applyProposal` takes, or **null when nothing may be written.**
   *
   * Null is the card's whole safety statement: with no proposal there is no argument to
   * pass to the applier, so "Allow" has nothing to call.
   */
  proposal: AgentProposal | null;
}

export interface CompileConsentCardLabels {
  createFile: (path: string) => string;
  modifyFile: (path: string) => string;
}

let compileProposalSeq = 0;

export function buildCompileConsentCard(
  proposals: readonly WikiPageProposal[],
  options: { vaultIsGit: boolean; labels: CompileConsentCardLabels },
): CompileConsentCard {
  const rows: CompileCardRow[] = proposals.map((proposal) => ({
    path: proposal.path,
    title: proposal.title,
    ok: proposal.ok,
    replaces: proposal.existing !== null,
    sections: proposal.sections.map((section) => ({ name: section.name, entries: section.entries })),
    citationCount: proposal.citationCount,
    sourcesRead: [...proposal.sourcesRead],
    sourcesTruncated: [...proposal.sourcesTruncated],
    sourcesUnreadable: proposal.sourcesUnreadable.map((entry) => ({
      path: entry.path,
      refusal: entry.refusal,
    })),
    problems: proposal.problems.map((problem) => ({ code: problem.code, message: problem.message })),
    page: proposal.ok ? proposal.page : null,
  }));

  const writable = proposals.filter((proposal) => proposal.ok);
  const changes: ProposalChange[] = writable.map((proposal, index) => ({
    id: `wiki-${index}`,
    tool: 'propose_wiki_page',
    summary:
      proposal.existing === null
        ? options.labels.createFile(proposal.path)
        : options.labels.modifyFile(proposal.path),
    files: [
      {
        path: proposal.path,
        kind: proposal.existing === null ? 'create' : 'modify',
        before: proposal.existing?.text ?? null,
        after: proposal.page,
      },
    ],
    selected: true,
    ...(proposal.existing ? { expectedMtime: proposal.existing.mtime } : {}),
  }));

  compileProposalSeq += 1;
  return {
    rows,
    writableCount: writable.length,
    refusedCount: rows.length - writable.length,
    proposal:
      changes.length === 0
        ? null
        : {
            id: `compile-${compileProposalSeq}`,
            status: 'pending',
            changes,
            snapshotRequested: options.vaultIsGit,
            /*
             * A wiki page is not a graph node, so no node was read to author it and the
             * concept card's "this edits a file you did not read" warning has no subject
             * here. The sources it was written from are on the card's own rows, which is
             * the fact that matters for this kind of page.
             */
            readNodesThisTurn: [],
          },
  };
}
