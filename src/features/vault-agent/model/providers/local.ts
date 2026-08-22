import type { NormalizedResponse, ProviderAdapter, TurnAssembly } from '../provider-adapter';
import { openaiAdapter } from './openai';

const LOCAL_TOOL_ROUND_CAP = 3;
const LOCAL_SYNTHESIS_INSTRUCTION =
  'Tool access is closed. Answer the original question now, in the same language as the person, from only the evidence you verified. Cite exact slugs you read and mark every uninspected area incomplete. For a structure audit, a census, list, child count, fan-out number, or mix of kinds only selects suspects; none proves a defect, a preferred node count, or a bridge. Never invent or recommend a numeric node target. Recommend a bridge only when the bodies and resolved neighbors you read establish at least three exact sibling slugs that share one behavior, and state that behavior in one sentence. Absence of that evidence proves neither that a bridge is needed nor that it is unnecessary; say only that the verified scope does not establish one. Do not describe another plan or tool call.';

function verifiedDetailSlugs(exchanges: TurnAssembly['exchanges']): string[] {
  const slugs = new Set<string>();
  for (const exchange of exchanges) {
    for (const result of exchange.toolResults) {
      if (result.isError || !['get_concept', 'get_concepts'].includes(result.name)) continue;
      try {
        const payload = JSON.parse(result.content) as Record<string, unknown>;
        if (result.name === 'get_concept') {
          if (payload.found !== false && typeof payload.slug === 'string') slugs.add(payload.slug);
          continue;
        }
        if (!Array.isArray(payload.concepts)) continue;
        for (const concept of payload.concepts) {
          if (!concept || typeof concept !== 'object') continue;
          const row = concept as Record<string, unknown>;
          if (row.found !== false && typeof row.slug === 'string') slugs.add(row.slug);
        }
      } catch {
        // The runner guarantees valid JSON, but at the boundary with an
        // externally compatible runner one broken past exchange must not block all
        // subsequent composition.
      }
    }
  }
  return [...slugs];
}

function synthesisInstruction(exchanges: TurnAssembly['exchanges']): string {
  const slugs = verifiedDetailSlugs(exchanges);
  if (slugs.length === 0) return LOCAL_SYNTHESIS_INSTRUCTION;
  const receipt = slugs.map((slug) => `[[${slug}]]`).join(', ');
  const siblingBoundary =
    slugs.length < 3
      ? ' Fewer than three concept evidence rows survived the evidence cap, so do not say a bridge is needed or unnecessary; say only that the verified scope does not establish one.'
      : '';
  return `${LOCAL_SYNTHESIS_INSTRUCTION} Only these concept evidence rows were delivered: ${receipt}. They were found; do not say they were missing. Treat every bodyInfo, neighborsInfo, and frontmatterInfo truncation marker as an evidence boundary; never infer omitted content. Cite at least one of these exact slugs in the answer.${siblingBoundary}`;
}

function hasVerifiedCitation(text: string, slugs: readonly string[]): boolean {
  const verified = new Set(slugs);
  return [...text.matchAll(/\[\[([^\]\n]+)\]\]/g)].some((match) => verified.has(match[1]));
}

function missedKoreanResponse(userText: string, responseText: string): boolean {
  return /[가-힣]/.test(userText) && !/[가-힣]/.test(responseText);
}

function isStructureAudit(userText: string): boolean {
  return /(?:ontology|structure|fan[ -]?out|bridge|duplicate|온톨로지|구조|팬[ -]?아웃|브릿지|중복)/i.test(
    userText,
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function listedCandidateSlugs(exchanges: TurnAssembly['exchanges']): string[] {
  for (const exchange of [...exchanges].reverse()) {
    const result = exchange.toolResults.find(
      (candidate) => candidate.name === 'list_concepts' && !candidate.isError,
    );
    if (!result) continue;
    try {
      const payload = JSON.parse(result.content) as Record<string, unknown>;
      const rows = Array.isArray(payload.rows)
        ? payload.rows
        : Array.isArray(payload.nodes)
          ? payload.nodes
          : [];
      return rows.flatMap((row) => {
        const slug = asRecord(row).slug;
        return typeof slug === 'string' ? [slug] : [];
      });
    } catch {
      return [];
    }
  }
  return [];
}

function requiredReadInstruction(turn: TurnAssembly, toolName: string): string {
  if (!isStructureAudit(turn.userText)) {
    return `The required evidence read did not happen. Call ${toolName} now. Do not answer or describe a plan.`;
  }
  if (toolName === 'list_kinds') {
    return 'Call list_kinds now to read the ontology census. Do not answer or describe a plan.';
  }
  if (toolName === 'list_concepts') {
    return 'Call list_concepts now with kind "domain", summary true, and limit 12. A project row alone cannot support a whole-map structure audit. Do not answer.';
  }
  if (toolName === 'get_concepts') {
    const candidates = listedCandidateSlugs(turn.exchanges).slice(0, 8);
    const exact =
      candidates.length > 0 ? candidates.join(', ') : 'the exact slugs from the preceding list';
    return `Call get_concepts now with body "full" and these candidate slugs: ${exact}. Use every listed candidate when there are eight or fewer. Do not answer.`;
  }
  return `Call ${toolName} now. Do not answer or describe a plan.`;
}

function requiredReadArgumentIssue(
  turn: TurnAssembly,
  toolName: string,
  argsValue: unknown,
): string | null {
  if (!isStructureAudit(turn.userText)) return null;
  const args = asRecord(argsValue);
  if (toolName === 'list_concepts') {
    return args.kind === 'domain' && args.summary === true && args.limit === 12
      ? null
      : requiredReadInstruction(turn, toolName);
  }
  if (toolName !== 'get_concepts') return null;

  const candidates = listedCandidateSlugs(turn.exchanges).slice(0, 8);
  const selected = Array.isArray(args.slugs)
    ? args.slugs.filter((slug): slug is string => typeof slug === 'string')
    : [];
  const selectedSet = new Set(selected);
  const includesExpected =
    candidates.length === 0
      ? selected.length > 0
      : candidates.every((slug) => selectedSet.has(slug));
  return args.body === 'full' && selected.length === candidates.length && includesExpected
    ? null
    : requiredReadInstruction(turn, toolName);
}

function kindCensus(exchanges: TurnAssembly['exchanges']): Record<string, number> {
  for (const exchange of exchanges) {
    const result = exchange.toolResults.find(
      (candidate) => candidate.name === 'list_kinds' && !candidate.isError,
    );
    if (!result) continue;
    try {
      const payload = JSON.parse(result.content) as Record<string, unknown>;
      const byKind = asRecord(payload.byKind);
      return Object.fromEntries(
        Object.entries(byKind).filter((entry): entry is [string, number] =>
          typeof entry[1] === 'number'),
      );
    } catch {
      return {};
    }
  }
  return {};
}

function deniesExistingKind(text: string, kind: 'capability' | 'element'): boolean {
  const term = kind === 'capability' ? '(?:capabilit(?:y|ies)|역량)' : '(?:elements?|요소)';
  return new RegExp(
    `(?:\\bno\\s+${term}|${term}.{0,60}(?:없|정의되지|존재하지|not defined|none))`,
    'i',
  ).test(text);
}

function evidenceConsistencyIssue(
  turn: TurnAssembly,
  responseText: string,
  detailSlugs: readonly string[],
): string | null {
  const census = kindCensus(turn.exchanges);
  const contradictions = (['capability', 'element'] as const).filter(
    (kind) => (census[kind] ?? 0) > 0 && deniesExistingKind(responseText, kind),
  );
  const overstatesBridgeBoundary =
    detailSlugs.length < 3 &&
    /(?:bridge|브릿지).{0,80}(?:not needed|unnecessary|필요하지 않|불필요)/i.test(responseText);
  if (contradictions.length === 0 && !overstatesBridgeBoundary) return null;

  const counts = Object.entries(census)
    .map(([kind, count]) => `${kind}=${count}`)
    .join(', ');
  const receipt = detailSlugs.map((slug) => `[[${slug}]]`).join(', ');
  return `Answer again in the original question's language and correct every evidence conflict. The verified census is ${counts || 'unavailable'}; do not claim a positive kind count is absent. The delivered concept receipt is ${receipt || 'empty'}. ${detailSlugs.length < 3 ? 'With fewer than three evidence rows, say only that the verified scope does not establish whether a bridge is needed.' : ''} Cite an exact receipt slug and do not call a tool.`;
}

function hasFocusedConcept(screenContextBlock: string): boolean {
  return /\nlooking_at:\s+[^\s(]+/.test(screenContextBlock);
}

function firstReadTool(screenContextBlock: string): 'get_concept' | 'list_kinds' {
  return hasFocusedConcept(screenContextBlock) ? 'get_concept' : 'list_kinds';
}

function withOnlyTool(turn: TurnAssembly, toolName: string): TurnAssembly {
  return {
    ...turn,
    tools: turn.tools.filter((tool) => tool.name === toolName),
  };
}

function completedReadRounds(exchanges: TurnAssembly['exchanges']): number {
  return exchanges.filter((exchange) =>
    exchange.toolResults.some((result) => !result.isError),
  ).length;
}

function forcedReadTool(turn: TurnAssembly): string | null {
  const completed = completedReadRounds(turn.exchanges);
  if (completed === 0) return firstReadTool(turn.screenContextBlock);
  if (hasFocusedConcept(turn.screenContextBlock)) return null;
  if (completed === 1) return 'list_concepts';
  if (completed === 2) return 'get_concepts';
  return null;
}

/**
 * The adapter for the "connect by address" branch — local and open-source runners.
 *
 * **Why the OpenAI-compatible grammar rather than the native `/api/chat`.**
 * Ollama opens both doors: native `/api/chat` and OpenAI-compatible
 * `/v1/chat/completions`. The compatible one was chosen because **this branch is
 * not for Ollama alone** — LM Studio, llama.cpp server, vLLM, and LocalAI all
 * expose the same compatible grammar, so the same adapter runs unchanged with
 * only the address swapped. Choosing native would mean one adapter per runner,
 * which is exactly the long tail `secrets.rs` avoids by freezing named vendors at three.
 *
 * The cost is stated honestly: **compatibility depends on the runner's version.**
 * Tool calling (`tools` / `tool_calls`) arrived relatively late in the compatible
 * layer and is at different levels of completeness per runner. So the screen does
 * not say "this should work" — it carries the runner's own error sentence through
 * verbatim alongside the model name, so choosing a model that cannot use tools is
 * visible to the user right there.
 *
 * Body assembly and response parsing are delegated to the OpenAI adapter. The
 * address branch does add the OpenAI-compatible `reasoning_effort` and
 * `tool_choice` fields according to the turn's position. The first round trip has
 * no evidence yet and product discipline requires a read, so the tool is pinned by
 * name: `get_concept` on a selected node, `list_kinds` on the whole map. The whole
 * map then picks candidates with `list_concepts` and reads their bodies together
 * with `get_concepts`. After three tool round trips the answer comes from a
 * synthesis instruction with the tools withdrawn. Every local round trip runs at
 * `reasoning_effort: none`.
 *
 * A prompt-only turn limit was ignored by gemma4:12b, which burned all six tool
 * turns — the execution contract has to enforce that limit. Measured 2026-08-02
 * against real Ollama with gemma4:12b on a complex audit: the first tool call took
 * 59.7s at `low` and 0.632s at `none` + `required`, and both were `list_kinds`.
 * Both `required` and a named tool choice can be ignored depending on the model,
 * so required turns also narrow the allowed tools to one. Local quality is never
 * assumed from thinking time — it is judged only by actual reads, citations, and
 * defect reproduction. Just before synthesis, the detail slugs still present in the
 * real payload after the result cap are handed back as a receipt, and if none of
 * them is cited, or a Korean question is answered without Korean, it re-synthesizes
 * once. Breaking it a second time discards the answer rather than showing a fluent guess.
 */
export const localAdapter: ProviderAdapter = {
  provider: 'local',
  /**
   * There is **no default model.** Named vendors have models whose names we know,
   * but in this branch only that computer knows what is installed. So the user
   * picks from a list in settings, and until they do this branch does not turn on
   * (`isLocalEndpointReady`). Pinning any name as a default kills the first round
   * trip with "model not found", with the reason nowhere on screen.
   */
  defaultModel: '',

  buildBody(turn: TurnAssembly): string {
    const shouldSynthesize =
      turn.tools.length === 0 || completedReadRounds(turn.exchanges) >= LOCAL_TOOL_ROUND_CAP;
    const forcedToolName = shouldSynthesize ? null : forcedReadTool(turn);
    const effectiveTurn = shouldSynthesize
      ? { ...turn, tools: [] }
      : forcedToolName
        ? withOnlyTool(turn, forcedToolName)
        : turn;
    const body = JSON.parse(openaiAdapter.buildBody(effectiveTurn)) as Record<string, unknown>;
    if (shouldSynthesize) {
      const messages = body.messages as Array<Record<string, unknown>>;
      messages.push({ role: 'user', content: synthesisInstruction(turn.exchanges) });
      body.reasoning_effort = 'none';
    } else if (forcedToolName) {
      const messages = body.messages as Array<Record<string, unknown>>;
      messages.push({ role: 'user', content: requiredReadInstruction(turn, forcedToolName) });
      body.reasoning_effort = 'none';
      // Ollama's models can ignore a named tool_choice too. The list of tools allowed
      // in this round trip must also be narrowed to one to stop it leaking into
      // another census tool.
      body.tool_choice = {
        type: 'function',
        function: { name: forcedToolName },
      };
    } else {
      body.reasoning_effort = 'none';
    }
    return JSON.stringify(body);
  },

  reviewResponse(turn, response) {
    const expectedTool = forcedReadTool(turn);
    if (expectedTool) {
      const expectedCall = response.toolCalls.find((call) => call.name === expectedTool);
      const argumentIssue = expectedCall
        ? requiredReadArgumentIssue(turn, expectedTool, expectedCall.args)
        : requiredReadInstruction(turn, expectedTool);
      if (expectedCall && !argumentIssue) {
        return { action: 'accept' };
      }
      const alreadyRetried = turn.exchanges.some(
        (exchange) => exchange.retry?.expectedTool === expectedTool,
      );
      if (alreadyRetried) {
        return {
          action: 'fail',
          expectedTool,
          message: `The local model skipped or mis-scoped the required ${expectedTool} evidence read twice. The answer was not accepted.`,
        };
      }
      return {
        action: 'retry',
        expectedTool,
        message: argumentIssue ?? requiredReadInstruction(turn, expectedTool),
      };
    }

    const detailSlugs = verifiedDetailSlugs(turn.exchanges);
    const consistencyIssue =
      response.toolCalls.length === 0
        ? evidenceConsistencyIssue(turn, response.text, detailSlugs)
        : null;
    if (consistencyIssue) {
      const expectedConsistency = 'evidence-consistency';
      const alreadyRetried = turn.exchanges.some(
        (exchange) => exchange.retry?.expectedTool === expectedConsistency,
      );
      if (alreadyRetried) {
        return {
          action: 'fail',
          expectedTool: expectedConsistency,
          message:
            'The local model contradicted verified ontology evidence twice. The answer was not accepted.',
        };
      }
      return {
        action: 'retry',
        expectedTool: expectedConsistency,
        message: consistencyIssue,
      };
    }

    if (response.toolCalls.length === 0 && missedKoreanResponse(turn.userText, response.text)) {
      const expectedLanguage = 'response-language';
      const alreadyRetried = turn.exchanges.some(
        (exchange) => exchange.retry?.expectedTool === expectedLanguage,
      );
      if (alreadyRetried) {
        return {
          action: 'fail',
          expectedTool: expectedLanguage,
          message:
            'The local model answered a Korean question without any Korean text twice. The answer was not accepted.',
        };
      }
      return {
        action: 'retry',
        expectedTool: expectedLanguage,
        message:
          'Answer again in Korean, the language of the original question. Preserve the verified exact [[slug]] citations. Do not call a tool.',
      };
    }

    if (
      response.toolCalls.length > 0 ||
      detailSlugs.length === 0 ||
      hasVerifiedCitation(response.text, detailSlugs)
    ) {
      return { action: 'accept' };
    }
    const expectedCitation = 'verified-citation';
    const alreadyRetried = turn.exchanges.some(
      (exchange) => exchange.retry?.expectedTool === expectedCitation,
    );
    if (alreadyRetried) {
      return {
        action: 'fail',
        expectedTool: expectedCitation,
        message:
          'The local model omitted every verified concept citation twice. The answer was not accepted.',
      };
    }
    return {
      action: 'retry',
      expectedTool: expectedCitation,
      message: `The answer did not cite a concept read in detail. Answer again from these verified reads only: ${detailSlugs.map((slug) => `[[${slug}]]`).join(', ')}. These concepts were found. Include at least one exact citation. Do not call a tool.`,
    };
  },

  parseResponse(body: string): NormalizedResponse {
    return openaiAdapter.parseResponse(body);
  },
};
