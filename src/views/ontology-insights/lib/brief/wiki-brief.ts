import { isAfter, type BriefCore, type BriefLine } from './brief-model';

/** The slice of `LibrarySourceRow` the brief reads. */
interface WikiBriefSource {
  path: string;
  state: 'not-compiled' | 'compiled' | 'partial' | 'stale' | 'checking';
  citedBy: readonly string[];
}

/** The slice of `LibraryWikiPage` the brief reads. */
interface WikiBriefPage {
  slug: string;
  sourcePaths: readonly string[];
}

/** Deterministic folder checks (`validateWikiFolder` codes), already counted by the caller. */
interface WikiFolderProblemCounts {
  orphanPages: number;
  danglingLinks: number;
}

/** The last agent-judged check, parsed from the wiki log's JSON block. Null when none ran. */
interface WikiLintCounts {
  disagreement: number;
  superseded: number;
}

interface WikiBriefPass {
  endedAt: string;
  outcome: 'held' | 'stale' | 'redrafted' | 'refused' | 'failed' | 'asleep';
}

interface WikiBriefLogEntry {
  at: string;
  kind: string;
}

export interface WikiBriefInput {
  sources: readonly WikiBriefSource[];
  pages: readonly WikiBriefPage[];
  folderProblems: WikiFolderProblemCounts | null;
  lint: WikiLintCounts | null;
  passes: readonly WikiBriefPass[];
  log: readonly WikiBriefLogEntry[];
  /** Ms since epoch: "since you last looked". */
  anchorMs: number;
}

const WRITE_KINDS = new Set(['compile', 'fix', 'answer', 'redraft']);

/**
 * Wiki pages by state. A page is `stale` when any source it cites changed under it
 * (`stale`) or was only partly read (`partial`); `unknown` when a cited source is still being
 * hashed or is not in the folder; `current` otherwise. A page citing nothing is `unknown`:
 * with no receipt there is nothing to check against.
 */
export function buildWikiBrief(input: WikiBriefInput): BriefCore {
  const byPath = new Map(input.sources.map((source) => [source.path, source] as const));
  let current = 0;
  let stale = 0;
  let unknown = 0;
  for (const page of input.pages) {
    if (page.sourcePaths.length === 0) {
      unknown += 1;
      continue;
    }
    let pageState: 'current' | 'stale' | 'unknown' = 'current';
    for (const path of page.sourcePaths) {
      const source = byPath.get(path);
      if (!source || source.state === 'checking') {
        if (pageState === 'current') pageState = 'unknown';
        continue;
      }
      if (source.state === 'stale' || source.state === 'partial') {
        pageState = 'stale';
        break;
      }
    }
    if (pageState === 'current') current += 1;
    else if (pageState === 'stale') stale += 1;
    else unknown += 1;
  }

  const notCompiled = input.sources.filter((source) => source.state === 'not-compiled').length;
  const disagreements = input.lint ? input.lint.disagreement + input.lint.superseded : 0;
  const passesSince = input.passes.filter(
    (pass) => pass.outcome !== 'asleep' && isAfter(pass.endedAt, input.anchorMs),
  );
  const redraftedSince = passesSince.filter((pass) => pass.outcome === 'redrafted').length;
  const troubledSince = passesSince.filter(
    (pass) => pass.outcome === 'refused' || pass.outcome === 'failed',
  ).length;
  const writtenSince = input.log.filter(
    (entry) => WRITE_KINDS.has(entry.kind) && isAfter(entry.at, input.anchorMs),
  ).length;

  const lines: BriefLine[] = [
    { id: 'wiki-stale-pages', count: stale, state: 'stale' },
    { id: 'wiki-disagreements', count: disagreements, state: 'stale' },
    { id: 'wiki-sources-unwritten', count: notCompiled, state: 'unknown' },
    { id: 'wiki-orphan-pages', count: input.folderProblems?.orphanPages ?? 0, state: 'unknown' },
    { id: 'wiki-dangling-links', count: input.folderProblems?.danglingLinks ?? 0, state: 'stale' },
    { id: 'wiki-written-since', count: writtenSince, state: 'current' },
    { id: 'wiki-redrafted-since', count: redraftedSince, state: 'current' },
    { id: 'wiki-passes-troubled-since', count: troubledSince, state: 'current' },
  ];

  const hasAnything = input.pages.length > 0 || input.sources.length > 0;
  return {
    core: 'wiki',
    availability: hasAnything ? 'measured' : 'no-data',
    headline: input.pages.length,
    current,
    stale,
    unknown,
    lines,
  };
}
