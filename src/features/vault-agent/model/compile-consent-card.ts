import type { AgentProposal, ProposalChange } from './types';
import type { CompileSourceRefusal, WikiPageProposal } from './wiki-proposal';

/**
 * The card a Compile turn ends at: which page, written from what, and what could not be read
 * (docs/DECISIONS.md 2026-09-06). A page that fails validation has no write action at all.
 */

export interface CompileCardRow {
  /** `wiki/quarter-plan.md`. */
  path: string;
  title: string;
  ok: boolean;
  /** True when a page of this name is already in the folder and would be replaced. */
  replaces: boolean;
  /** Exact previously read bytes, so a replacement can be judged before approval. */
  before: string | null;
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
  /** Null when nothing may be written, so "Allow" has nothing to call. */
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
    before: proposal.existing?.text ?? null,
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
            /* A wiki page reads no graph node; its sources are on the card's rows. */
            readNodesThisTurn: [],
          },
  };
}
