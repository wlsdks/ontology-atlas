import type { NormalizedResponse, ProviderAdapter, TurnAssembly } from './provider-adapter';
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

function proposedCount(exchanges: TurnAssembly['exchanges']): number {
  let count = 0;
  for (const exchange of exchanges) {
    for (const result of exchange.toolResults) {
      if (result.name === 'propose_wiki_page' && !result.isError) count += 1;
    }
  }
  return count;
}

/**
 * The adapter a Compile turn uses on the connect-by-address route.
 *
 * **Why not `localAdapter`.** That adapter is the ontology conversation's, and it
 * enforces that conversation's shape: the first round trip is pinned to `get_concept` or
 * `list_kinds` by name, the allowed tools are narrowed to that one, and after three tool
 * rounds the tools are withdrawn and an answer is forced. Every one of those is right for
 * "answer a question about the map" and wrong here — a Compile turn's first call is
 * `read_source_text`, and narrowing the tool list to `list_kinds` would leave it with no
 * tool at all. Sharing that adapter would mean adding a job-kind branch to a file whose
 * rules were each written for one measured failure of a different job.
 *
 * What is kept is the one measurement that is about the runner rather than the job:
 * `reasoning_effort: 'none'`. Measured 2026-08-02 against Ollama with gemma4:12b, the
 * first tool call took 59.7s at `low` and 0.632s at `none`. A local runner thinking for a
 * minute before opening a file it was told to open is time a person spends watching
 * nothing happen.
 *
 * Body assembly and response parsing are the OpenAI-compatible ones, which is what lets
 * Ollama, LM Studio, llama.cpp server, and vLLM run this unchanged with only the address
 * swapped.
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

  /**
   * **A turn that read a file and then talked about it is not finished.**
   *
   * Measured 2026-09-06 in the installed app against Ollama: gemma4:12b called
   * `read_source_text` once, received the text, and answered in prose. The loop takes a
   * response with no tool call as a completed turn, so the person got a spinner that
   * vanished and no card — the whole transfer spent for nothing. The same model produced
   * two clean pages once told, in one deterministic sentence, to call the tool.
   *
   * This is the mechanism `providers/local.ts` already uses for the ontology conversation
   * and for the same reason: a small model's compliance with a prompt-only instruction
   * cannot be assumed, so the execution contract asks again. It is bounded — two nudges,
   * inside the turn's own round cap — and it never fires once a page has been proposed,
   * because then the turn really is finished.
   */
  reviewResponse(turn: TurnAssembly, parsed: NormalizedResponse) {
    if (parsed.toolCalls.length > 0) return { action: 'accept' as const };
    if (turn.tools.length === 0) return { action: 'accept' as const };
    if (proposedCount(turn.exchanges) > 0) return { action: 'accept' as const };
    const read = readablePathsRead(turn.exchanges);
    if (read.length === 0) return { action: 'accept' as const };
    if (turn.exchanges.filter((exchange) => exchange.retry).length >= COMPILE_NUDGE_CAP) {
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
