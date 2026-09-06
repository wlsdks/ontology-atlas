import { wrapUntrusted } from './concept-evidence-pack';
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
import {
  buildWikiPageProposal,
  type CompileSourceRead,
  type WikiPageProposal,
} from './wiki-proposal';

/**
 * The Compile turn's tool executor — **the second place in this feature where a model's
 * write call does not reach the disk.**
 *
 * It is injected with a `SourceReadPort` (no write method) and returns proposals; the file
 * is created only by `applyProposal`, from the consent card's handler, exactly as a
 * concept change is. `propose_wiki_page` is declared `effect: 'write'` and is still
 * executed here, because "executing" it means assembling and judging a page — no byte
 * leaves this module.
 *
 * **Two facts a model may not assert are asserted here instead**: which sources it
 * actually received, and the sha256 of each. Both are recorded as the read happens, and
 * `wiki-proposal.ts` builds the frontmatter from this record rather than from the writer's
 * answer.
 *
 * **A failed proposal is returned to the writer, not swallowed.** The problems come back
 * as the tool result so the next round can fix them; only the last proposal for a given
 * page survives, so a corrected second attempt replaces the first rather than queueing two
 * cards for one file.
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
    outcome: name === 'read_source_text' || name === 'propose_wiki_page' ? 'error' : 'unknown-tool',
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
    /*
     * The hash is of **the whole file**, never of the capped slice. `deriveSourceState`
     * in `vault-library.ts` compares a page's recorded hash against the file's own
     * sha256, so a partial-bytes hash would render a brand-new page stale the moment it
     * landed (PO steward, 2026-09-06). What the cap costs is stated instead: `truncated`
     * rides the result, the page says it under Not in sources, and the card says it too.
     */
    let sha256: string | null = null;
    try {
      sha256 = await deps.sourcePort.hashSource(path);
    } catch {
      sha256 = null;
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

    const text = numberParagraphs(decoded.text);
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
      }),
      isError: false,
      outcome: 'ok',
      target: path,
      summary: decoded.truncated
        ? `Read the first ${SOURCE_TEXT_CHAR_CAP.toLocaleString('en-US')} characters of ${path}`
        : `Read ${path}`,
      readSlugs: [],
      // Measured: these are the characters that ride the next round trip and land in the
      // audit line's `vaultChars`. A source's contents leaving this computer is the fact
      // the transfer sentence on the shelf is about, so it is counted, never estimated.
      vaultChars: text.length,
    };
  }

  async function proposePage(args: Record<string, unknown>): Promise<ToolExecution> {
    if (proposals.size >= deps.pageCap && !proposals.has(String(args.slug ?? ''))) {
      return fail('propose_wiki_page', String(args.slug ?? ''), 'Page cap reached', {
        proposed: false,
        hint: `This turn proposes at most ${deps.pageCap} pages. Stop here; the person decides on the ones already proposed.`,
      });
    }

    const draft = buildWikiPageProposal(
      {
        slug: String(args.slug ?? ''),
        title: String(args.title ?? ''),
        summary: String(args.summary ?? ''),
        overview: stringList(args.overview),
        facts: stringList(args.facts),
        decisions: stringList(args.decisions),
        openQuestions: stringList(args.open_questions),
        notInSources: stringList(args.not_in_sources),
      },
      { reads, model: deps.model, now: deps.now(), existing: null },
    );

    const existing = await deps.readExistingPage(draft.slug);
    const proposal: WikiPageProposal = { ...draft, existing };
    proposals.set(draft.slug, proposal);

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
      if (call.name === 'propose_wiki_page') return proposePage(args);
      return {
        content: JSON.stringify({
          error: `No tool named ${call.name} on this turn. You have read_source_text and propose_wiki_page.`,
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
