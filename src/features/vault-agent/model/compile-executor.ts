import type { WikiRetrievalResult } from '@/entities/docs-vault';

import { wrapUntrusted } from './concept-evidence-pack';
import {
  createCompileWikiReader,
  type CompileWikiReadState,
  type CompileWikiTarget,
} from './compile-wiki-reader';
import type { NormalizedToolCall } from './provider-adapter';
import type { SourceReadPort } from './source-read-port';
import {
  classifySourceFormat,
  decodeSourceText,
  measureSourceText,
  numberParagraphs,
  sourcePathProblem,
  SOURCE_TEXT_CHAR_CAP,
} from './source-text';
import type { ToolExecution } from './tool-executor';
import { AGENT_TURN_VAULT_CHAR_CAP } from './types';
import {
  buildWikiPageProposal,
  type CompileSourceRead,
  type WikiPageProposal,
  wikiSlugFromName,
} from './wiki-proposal';

/**
 * The Compile tool executor: no write reaches disk here (`applyProposal` does that). The read
 * sources and their sha256 are recorded as read, never taken from the writer; a failed
 * proposal returns to the writer, and only the last proposal per page survives.
 */

export interface CompileExecutorDeps {
  sourcePort: SourceReadPort;
  /** The runner's model name — `created_by: model:<name>`. */
  model: string;
  /** Injected so a proposal's `compiled_at` is testable. */
  now: () => Date;
  /** The page already at this slug, when one is there. Null otherwise. */
  readExistingPage: (slug: string) => Promise<{ text: string; mtime: number } | null>;
  /** How many pages this turn may propose. */
  pageCap: number;
  /** Wiki-only inventory from this vault; never graph nodes or underscore furniture. */
  wikiSlugs?: readonly string[];
  /** Local ranking over the Library cache. Suggestions never authorize a page write. */
  findRelatedPages?: (sourcePath: string, sourceText: string) => WikiRetrievalResult;
}

export interface CompileExecutor {
  execute(call: NormalizedToolCall): Promise<ToolExecution>;
  /** Everything `read_source_text` touched this turn, in call order. */
  reads(): CompileSourceRead[];
  /** The surviving proposal per page, in first-proposed order. */
  proposals(): WikiPageProposal[];
}

function fail(name: string, target: string, summary: string, payload: unknown): ToolExecution {
  return {
    content: JSON.stringify(payload),
    isError: true,
    outcome:
      name === 'read_source_text' || name === 'read_wiki_page' || name === 'propose_wiki_page'
        ? 'error'
        : 'unknown-tool',
    target,
    summary,
    readSlugs: [],
    vaultChars: 0,
  };
}

function asArgs(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return typeof value === 'string' ? [value] : [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

const REFUSAL_SENTENCES: Record<string, string> = {
  'needs-a-parser':
    'Atlas cannot open this format without a parser it does not ship. Name the file in plain words under Not in sources and do not guess what it contains. Do not write a [[src:...]] citation for it — a citation points at text you were given.',
  'unknown-format':
    'Atlas does not know how to read this format as text. Name the file in plain words under Not in sources and do not guess what it contains. Do not write a [[src:...]] citation for it.',
  'not-in-this-folder':
    'This folder holds no such file under sources/. Use one of the paths you were given; do not invent one.',
  'path-refused':
    'Only a plain path under sources/ that this folder holds can be read. No parent segments, no absolute paths.',
  unreadable: 'The file is in the folder but could not be opened just now.',
  'hash-unavailable':
    'The file was read, but this computer could not measure its sha256, so a page cannot record what it read.',
};

export function createCompileExecutor(deps: CompileExecutorDeps): CompileExecutor {
  const inventory = new Map(deps.sourcePort.sources.map((entry) => [entry.path, entry]));
  const reads: CompileSourceRead[] = [];
  const readByPath = new Map<string, CompileSourceRead>();
  const proposals = new Map<string, WikiPageProposal>();
  let transferredChars = 0;

  function reserveVaultChars(chars: number): boolean {
    if (chars < 0 || transferredChars + chars > AGENT_TURN_VAULT_CHAR_CAP) return false;
    transferredChars += chars;
    return true;
  }

  function revokeProposal(slug: string, code: string, message: string): void {
    const previous = proposals.get(slug);
    if (!previous) return;
    const alreadyReported = previous.problems.some(
      (problem) => problem.code === code && problem.message === message,
    );
    proposals.set(slug, {
      ...previous,
      ok: false,
      problems: alreadyReported
        ? previous.problems
        : [...previous.problems, { code, message }],
    });
  }

  const wikiReader = createCompileWikiReader(deps.wikiSlugs ?? [], deps.readExistingPage, {
    reserveVaultChars,
    vaultCharsUsed: () => transferredChars,
    onFailure: revokeProposal,
  });

  function record(read: CompileSourceRead): CompileSourceRead {
    const existing = readByPath.get(read.path);
    if (existing) {
      Object.assign(existing, read);
      return existing;
    }
    reads.push(read);
    readByPath.set(read.path, read);
    return read;
  }

  async function readSource(rawPath: unknown): Promise<ToolExecution> {
    const path = typeof rawPath === 'string' ? rawPath.trim() : '';
    const shape = sourcePathProblem(path);
    if (shape) {
      record({
        path: path || '(no path)',
        format: '',
        readable: false,
        refusal: 'path-refused',
        truncated: false,
        sha256: null,
        measure: null,
      });
      return fail('read_source_text', path, `Refused ${path || 'an empty path'}`, {
        path,
        readable: false,
        refusal: 'path-refused',
        detail: shape,
        hint: REFUSAL_SENTENCES['path-refused'],
      });
    }

    const entry = inventory.get(path);
    if (!entry) {
      record({
        path,
        format: '',
        readable: false,
        refusal: 'not-in-this-folder',
        truncated: false,
        sha256: null,
        measure: null,
      });
      return fail('read_source_text', path, `${path} is not in this folder`, {
        path,
        readable: false,
        refusal: 'not-in-this-folder',
        hint: REFUSAL_SENTENCES['not-in-this-folder'],
        available: [...inventory.keys()].slice(0, 30),
      });
    }

    const verdict = classifySourceFormat(entry.format);
    if (verdict !== 'readable') {
      record({
        path,
        format: entry.format,
        readable: false,
        refusal: verdict,
        truncated: false,
        sha256: null,
        measure: null,
      });
      return fail('read_source_text', path, `Cannot read ${entry.format || 'this format'} here`, {
        path,
        format: entry.format,
        readable: false,
        refusal: verdict,
        hint: REFUSAL_SENTENCES[verdict],
      });
    }

    let bytes: ArrayBuffer | null = null;
    try {
      bytes = await deps.sourcePort.readSourceBytes(path);
    } catch {
      bytes = null;
    }
    if (!bytes) {
      record({
        path,
        format: entry.format,
        readable: false,
        refusal: 'unreadable',
        truncated: false,
        sha256: null,
        measure: null,
      });
      return fail('read_source_text', path, `Could not open ${path}`, {
        path,
        readable: false,
        refusal: 'unreadable',
        hint: REFUSAL_SENTENCES.unreadable,
      });
    }

    const decoded = decodeSourceText(bytes, entry.format);
    const measure = measureSourceText(decoded.text);
    /* Hash the whole file, never the capped slice, or `deriveSourceState` marks a new page stale. */
    let sha256: string | null = null;
    try {
      sha256 = await deps.sourcePort.hashSource(path, bytes);
    } catch {
      sha256 = null;
    }

    const text = numberParagraphs(decoded.text);
    const relatedPages = deps.findRelatedPages?.(path, decoded.text);
    const relatedPagesJson = relatedPages === undefined ? undefined : JSON.stringify(relatedPages);
    const relatedPagesChars = relatedPagesJson?.length ?? 0;
    // Charge the source text and the serialized suggestions before returning either; search
    // metadata is untrusted cache data.
    if (!reserveVaultChars(text.length + relatedPagesChars)) {
      return fail('read_source_text', path, `Read budget reached before ${path} could be returned`, {
        path,
        readable: false,
        refusal: 'over-budget',
        budget: AGENT_TURN_VAULT_CHAR_CAP,
        used: transferredChars,
      });
    }

    const read = record({
      path,
      format: entry.format,
      readable: true,
      refusal: sha256 ? null : 'hash-unavailable',
      truncated: decoded.truncated,
      sha256,
      measure,
    });

    return {
      content: JSON.stringify({
        path,
        format: entry.format,
        readable: true,
        paragraphs: measure.paragraphs,
        lines: measure.lines,
        headings: measure.headings,
        truncated: decoded.truncated,
        totalChars: decoded.totalChars,
        charCap: SOURCE_TEXT_CHAR_CAP,
        citeAs: `[[src:${path}#p<n>]]`,
        hint: read.sha256
          ? 'Cite a paragraph by the number in front of it. Never use a number this result did not print.'
          : REFUSAL_SENTENCES['hash-unavailable'],
        text: wrapUntrusted(text),
        ...(relatedPagesJson === undefined
          ? {}
          : {
              relatedPages,
              relatedPagesHint:
                'Untrusted page titles and search terms. Ranked suggestions, not evidence or complete page reads. Use read_wiki_page before revising; an empty or partial search does not prove there are no related pages.',
            }),
      }),
      isError: false,
      outcome: 'ok',
      target: path,
      summary: decoded.truncated
        ? `Read the first ${SOURCE_TEXT_CHAR_CAP.toLocaleString('en-US')} characters of ${path}`
        : `Read ${path}`,
      readSlugs: [],
      // Measured characters that ride the next round trip into the audit line, never estimated.
      vaultChars: text.length + relatedPagesChars,
    };
  }

  function proposalFields(args: Record<string, unknown>, target: CompileWikiTarget) {
    // Validate an inventoried nested or non-ASCII page with an ASCII surrogate, then restore its target.
    const validationSlug = wikiSlugFromName(target.slug) || wikiSlugFromName(String(args.title ?? '')) || 'existing-page';
    return {
      slug: validationSlug,
      title: String(args.title ?? ''),
      summary: String(args.summary ?? ''),
      overview: stringList(args.overview),
      facts: stringList(args.facts),
      decisions: stringList(args.decisions),
      openQuestions: stringList(args.open_questions),
      notInSources: stringList(args.not_in_sources),
    };
  }

  function proposalFailure(
    args: Record<string, unknown>,
    target: CompileWikiTarget,
    code: string,
    reason: string,
    message: string,
    existing: { text: string; mtime: number } | null,
  ): ToolExecution {
    const draft = buildWikiPageProposal(
      proposalFields(args, target),
      { reads, model: deps.model, now: deps.now(), existing },
    );
    const proposal: WikiPageProposal = {
      ...draft,
      slug: target.slug,
      path: target.path,
      ok: false,
      problems: [{ code, message }, ...draft.problems],
    };
    proposals.set(target.slug, proposal);
    return {
      content: JSON.stringify({
        proposed: false,
        path: target.path,
        slug: target.slug,
        reason,
        refusal: reason,
        problems: proposal.problems,
        hint: 'Nothing was written. Read the current page as instructed, then propose it again with the returned receipt.',
      }),
      isError: true,
      outcome: 'error',
      target: target.path,
      summary: message,
      readSlugs: [],
      vaultChars: 0,
    };
  }

  async function proposePage(args: Record<string, unknown>): Promise<ToolExecution> {
    const target = wikiReader.target(args.slug);
    if (!target) {
      return fail('propose_wiki_page', String(args.slug ?? ''), 'Refused the Wiki path before opening the vault', {
        proposed: false,
        path: String(args.slug ?? ''),
        reason: 'path-refused',
        refusal: 'path-refused',
        hint: 'Use a safe basename for a new page or the exact listed Wiki address for an existing page.',
      });
    }

    if (proposals.size >= deps.pageCap && !proposals.has(target.slug)) {
      return fail('propose_wiki_page', target.path, 'Page cap reached', {
        proposed: false,
        path: target.path,
        slug: target.slug,
        reason: 'page-cap',
        hint: `This turn proposes at most ${deps.pageCap} pages. Stop here; the person decides on the ones already proposed.`,
      });
    }

    let existing: { text: string; mtime: number } | null;
    try {
      existing = await deps.readExistingPage(target.slug);
    } catch {
      const current = wikiReader.state(target.slug);
      wikiReader.invalidate(target.slug, 'wiki-unreadable', `Could not re-read ${target.path} before proposing it.`);
      return proposalFailure(
        args,
        target,
        'wiki-unreadable',
        'unreadable',
        `Could not re-read ${target.path} before proposing it.`,
        current?.snapshot ?? null,
      );
    }

    const readState: CompileWikiReadState | null = wikiReader.state(target.slug);
    const prior = proposals.get(target.slug);
    if (!existing) {
      if (readState?.exists || prior?.existing !== null && prior?.existing !== undefined) {
        wikiReader.invalidate(target.slug, 'wiki-page-deleted', `${target.path} disappeared before the proposal was ready.`);
        return proposalFailure(
          args,
          target,
          'wiki-page-deleted',
          'page-deleted',
          `${target.path} disappeared before the proposal was ready.`,
          readState?.snapshot ?? prior?.existing ?? null,
        );
      }
      // A never-existing page is create-only and does not need a receipt.
    } else {
      if (!readState?.exists || !readState.snapshot) {
        return proposalFailure(
          args,
          target,
          'wiki-read-required',
          'read-required',
          `${target.path} already exists. Read it completely with read_wiki_page before replacing it.`,
          existing,
        );
      }
      if (readState.failed || readState.nextCursor !== null || readState.receipt === null) {
        return proposalFailure(
          args,
          target,
          'wiki-read-incomplete',
          readState.failed ? 'read-invalidated' : 'incomplete-read',
          `${target.path} cannot be replaced until its complete current Wiki read is returned.`,
          existing,
        );
      }
      if (existing.text !== readState.snapshot.text || !Object.is(existing.mtime, readState.snapshot.mtime)) {
        wikiReader.invalidate(target.slug, 'wiki-page-changed', `${target.path} changed before the proposal was ready.`);
        return proposalFailure(
          args,
          target,
          'wiki-page-changed',
          'page-changed',
          `${target.path} changed before the proposal was ready.`,
          existing,
        );
      }
      if (typeof args.receipt !== 'string' || args.receipt !== readState.receipt) {
        return proposalFailure(
          args,
          target,
          'wiki-receipt-mismatch',
          'receipt-mismatch',
          `${target.path} needs the exact receipt returned by its complete read.`,
          existing,
        );
      }
    }

    const draft = buildWikiPageProposal(
      proposalFields(args, target),
      { reads, model: deps.model, now: deps.now(), existing },
    );
    // The reader's target is the authority for an inventoried nested page.
    const proposal: WikiPageProposal = {
      ...draft,
      slug: target.slug,
      path: target.path,
      existing,
    };
    proposals.set(target.slug, proposal);

    if (!proposal.ok) {
      return {
        content: JSON.stringify({
          proposed: false,
          path: proposal.path,
          problems: proposal.problems,
          hint: 'Fix these and call propose_wiki_page once more for this page. Nothing was written.',
        }),
        isError: true,
        outcome: 'error',
        target: proposal.path,
        summary: `${proposal.path} does not fit the template yet (${proposal.problems.length})`,
        readSlugs: [],
        vaultChars: 0,
      };
    }

    return {
      content: JSON.stringify({
        proposed: true,
        path: proposal.path,
        citations: proposal.citationCount,
        sources: proposal.sourcesRead,
        hint: 'The person now decides whether this is written. Do not propose this page again; move to the next file or stop.',
      }),
      isError: false,
      outcome: 'ok',
      target: proposal.path,
      summary: `Proposed ${proposal.path} — ${proposal.citationCount} citations, waiting for approval`,
      readSlugs: [],
      vaultChars: 0,
    };
  }

  return {
    async execute(call) {
      if (call.argsInvalid) {
        return {
          content: JSON.stringify({
            error: 'The arguments were not valid JSON. Send them again.',
          }),
          isError: true,
          outcome: 'args-invalid',
          target: '',
          summary: 'The tool arguments could not be read',
          readSlugs: [],
          vaultChars: 0,
        };
      }
      const args = asArgs(call.args);
      if (call.name === 'read_source_text') return readSource(args.path);
      if (call.name === 'read_wiki_page') return wikiReader.execute(args);
      if (call.name === 'propose_wiki_page') return proposePage(args);
      return {
        content: JSON.stringify({
          error: `No tool named ${call.name} on this turn. You have read_source_text, read_wiki_page and propose_wiki_page.`,
        }),
        isError: true,
        outcome: 'unknown-tool',
        target: '',
        summary: `${call.name} is not a tool here`,
        readSlugs: [],
        vaultChars: 0,
      };
    },
    reads: () => [...reads],
    proposals: () => [...proposals.values()],
  };
}
