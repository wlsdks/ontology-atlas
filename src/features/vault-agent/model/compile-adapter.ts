import type { NormalizedResponse, ProviderAdapter, TurnAssembly } from './provider-adapter';
import { isCompileWikiPath } from './compile-wiki-reader';
import { openaiAdapter } from './providers/openai';

/** How many times one turn may be told to stop answering in prose and propose the page. */
const COMPILE_NUDGE_CAP = 2;

function readablePathsRead(exchanges: TurnAssembly['exchanges']): string[] {
  const paths: string[] = [];
  for (const exchange of exchanges) {
    for (const result of exchange.toolResults) {
      if (result.name !== 'read_source_text' || result.isError) continue;
      try {
        const payload = JSON.parse(result.content) as { path?: unknown; readable?: unknown };
        if (payload.readable === true && typeof payload.path === 'string') paths.push(payload.path);
      } catch {
        // A malformed past result must not stop the rest of the turn from being judged.
      }
    }
  }
  return [...new Set(paths)];
}

interface WikiReadObservation {
  path: string;
  complete: boolean;
  exists: boolean | null;
  nextCursor: number | null;
  isError: boolean;
}

function payloadOf(result: TurnAssembly['exchanges'][number]['toolResults'][number]): Record<string, unknown> {
  try {
    const payload = JSON.parse(result.content) as unknown;
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function wikiPath(value: unknown): string | null {
  return typeof value === 'string' && isCompileWikiPath(value) ? value : null;
}

function wikiTargetsMentioned(userText: string): string[] {
  const paths: string[] = [];
  const regex = /\bwiki\/[a-z0-9]+(?:-[a-z0-9]+)*\.md\b/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(userText)) !== null) {
    if (!paths.includes(match[0]!)) paths.push(match[0]!);
  }
  return paths;
}

function wikiReads(exchanges: TurnAssembly['exchanges']): Map<string, WikiReadObservation> {
  const states = new Map<string, WikiReadObservation>();
  for (const exchange of exchanges) {
    for (const result of exchange.toolResults) {
      if (result.name !== 'read_wiki_page') continue;
      const payload = payloadOf(result);
      const path = wikiPath(payload.path);
      if (!path) continue;
      states.set(path, {
        path,
        complete: payload.complete === true && !result.isError,
        exists: typeof payload.exists === 'boolean' ? payload.exists : null,
        nextCursor: typeof payload.nextCursor === 'number' ? payload.nextCursor : null,
        isError: result.isError,
      });
    }
  }
  return states;
}

/** Only the latest proposal result for a page decides whether it remains ready. */
function finalProposalStatuses(exchanges: TurnAssembly['exchanges']): Map<string, boolean> {
  const statuses = new Map<string, boolean>();
  for (const exchange of exchanges) {
    for (const result of exchange.toolResults) {
      const payload = payloadOf(result);
      const path = wikiPath(payload.path);
      if (!path) continue;
      if (result.name === 'propose_wiki_page') statuses.set(path, !result.isError);
      // A later read of the same path makes an earlier proposal for it stale.
      if (result.name === 'read_wiki_page' && statuses.has(path)) statuses.set(path, false);
    }
  }
  return statuses;
}

/**
 * The Compile adapter for the connect-by-address route, apart from `localAdapter`, whose
 * pinned first tool would leave Compile no tool. It keeps `reasoning_effort: 'none'` (first tool
 * call 59.7s at `low`, 0.632s at `none`, gemma4:12b on Ollama).
 */
export const compileAdapter: ProviderAdapter = {
  provider: 'local',
  defaultModel: '',

  buildBody(turn: TurnAssembly): string {
    const base = JSON.parse(openaiAdapter.buildBody(turn)) as Record<string, unknown>;
    return JSON.stringify({ ...base, reasoning_effort: 'none' });
  },

  parseResponse(body: string) {
    return openaiAdapter.parseResponse(body);
  },

  /** A turn that read a file and answered in prose is nudged to propose, at most twice. */
  reviewResponse(turn: TurnAssembly, parsed: NormalizedResponse) {
    if (parsed.toolCalls.length > 0) return { action: 'accept' as const };
    if (turn.tools.length === 0) return { action: 'accept' as const };
    if ([...finalProposalStatuses(turn.exchanges).values()].some(Boolean)) {
      return { action: 'accept' as const };
    }

    const retryCount = turn.exchanges.filter((exchange) => exchange.retry).length;
    const reads = wikiReads(turn.exchanges);
    const requiredWiki = wikiTargetsMentioned(turn.userText);
    const unfinished = [...reads.values()].filter(
      (read) => !read.isError && !read.complete && read.nextCursor !== null,
    );
    const missingRequired = requiredWiki.filter((path) => {
      const read = reads.get(path);
      return !read || read.isError || !read.complete;
    });

    if (unfinished.length > 0 || missingRequired.length > 0) {
      if (retryCount >= COMPILE_NUDGE_CAP) return { action: 'accept' as const };
      if (unfinished.length > 0) {
        return {
          action: 'retry' as const,
          expectedTool: 'read_wiki_page',
          message:
            `Continue reading ${unfinished.map((read) => `\`${read.path}\``).join(', ')} ` +
            'with the exact `nextCursor` from the last result. Do not propose or answer in prose until the complete current page has been returned.',
        };
      }
      return {
        action: 'retry' as const,
        expectedTool: 'read_wiki_page',
        message:
          `Read the existing page ${missingRequired.map((path) => `\`${path}\``).join(', ')} ` +
          'through `read_wiki_page` before proposing a replacement. Follow every cursor and echo the final receipt; do not answer in prose.',
      };
    }

    const read = readablePathsRead(turn.exchanges);
    if (read.length === 0) return { action: 'accept' as const };
    if (retryCount >= COMPILE_NUDGE_CAP) {
      return { action: 'accept' as const };
    }
    return {
      action: 'retry' as const,
      expectedTool: 'propose_wiki_page',
      message:
        `You already have the text of ${read.map((path) => `\`${path}\``).join(', ')}. ` +
        'Call propose_wiki_page now, once per file, with the fields for the page. ' +
        'Do not answer in prose and do not describe what you would write: nothing reaches ' +
        'the person until that tool is called.',
    };
  },
};
