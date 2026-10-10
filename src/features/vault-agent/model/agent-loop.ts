import type { LlmChatScope, LlmChatEcho } from '@/shared/lib/tauri-llm';

import { extractCitations } from './citation';
import { splitNextStep } from './next-step';
import type { AgentToolDefinition } from './tool-catalog';
import type {
  NormalizedToolCall,
  ProviderAdapter,
  ToolResultPayload,
  WireExchange,
} from './provider-adapter';
import { formatScreenContextBlock } from './screen-context';
import type { ToolExecution } from './tool-executor';
import {
  AGENT_ROUND_CAP,
  AGENT_TURN_VAULT_CHAR_CAP,
  type AgentEvent,
  type AgentTurn,
  type ScreenContextSnapshot,
  type ToolCallRecord,
} from './types';

/**
 * One turn's state machine: `startTurn` returns synchronously, `abort()` stops in place, and
 * round trips run only inside `runTurn` under a cap. A tool row is confirmed only after its round trip.
 */

export interface AgentLoopDeps {
  adapter: ProviderAdapter;
  /** The Rust bridge. Throws on failure. */
  send(args: {
    body: string;
    scope: LlmChatScope;
    question: string;
    model: string;
  }): Promise<LlmChatEcho>;
  execute(call: NormalizedToolCall): Promise<ToolExecution>;
  /** The tool list carried in this turn. */
  tools: readonly AgentToolDefinition[];
  /** Defaults to `AGENT_ROUND_CAP`; Compile passes more, but always a finite cap. */
  roundCap?: number;
  system: string;
  model: string;
  /** Cap-reached, aborted, and error copy arrive in the screen's language — the model does not write them. */
  notices: {
    roundCap: string;
    /** The line for a turn that stopped without a tool, carrying the round like the cap notice. */
    noToolCall: (args: { round: number; cap: number }) => string;
    aborted: string;
    networkFailed: string;
    timedOut: string;
    rateLimited: string;
    rejected: string;
    auditBlocked: string;
    providerRefused: string;
    failed: string;
  };
}

export interface StartTurnInput {
  text: string;
  screenContext: ScreenContextSnapshot;
}

export interface TurnRunResult {
  turn: AgentTurn;
  /** The node slugs actually read this turn — used to decide the proposal card's warning row. */
  readSlugs: string[];
  /** The writes the model attempted — the caller turns these into proposal cards. */
  writeIntents: Array<{ name: string; args: unknown }>;
}

let turnSeq = 0;

/** The turn created on the frame [send] was pressed, before any network. */
export function startTurn(input: StartTurnInput): AgentTurn {
  turnSeq += 1;
  return {
    id: `turn-${turnSeq}`,
    events: [
      { kind: 'user', text: input.text, screenContext: input.screenContext },
    ],
    roundsUsed: 0,
    sentChars: 0,
    auditCount: 0,
    status: 'sending',
  };
}

/**
 * Prefixes in `src-tauri/src/llm`, mirrored because Rust cannot export to TypeScript;
 * tests/contract/agent-notice-codes.contract.test.ts keeps the copies equal.
 */
export const AUDIT_BLOCKED_PREFIX = 'audit-blocked:';
export const TIMED_OUT_PREFIX = 'timed-out:';

function noticeFor(deps: AgentLoopDeps, status: number | null, message: string): AgentEvent {
  if (status === 429) return { kind: 'notice', code: 'rate-limited', text: deps.notices.rateLimited };
  if (status === 401 || status === 403) {
    return { kind: 'notice', code: 'rejected', text: deps.notices.rejected };
  }
  // Codes, not prose, or an unwritable vault reads as a network failure;
  // tests/contract/agent-notice-codes.contract.test.ts holds both sides.
  if (message.includes(AUDIT_BLOCKED_PREFIX)) {
    return { kind: 'notice', code: 'audit-blocked', text: deps.notices.auditBlocked };
  }
  if (message.includes(TIMED_OUT_PREFIX) || /timed?\s*out/i.test(message)) {
    return { kind: 'notice', code: 'timed-out', text: deps.notices.timedOut };
  }
  return { kind: 'notice', code: 'network-failed', text: deps.notices.networkFailed };
}

/** Runs one turn to completion, tidying up where it stands if `signal` is cut. */
export async function runTurn(
  deps: AgentLoopDeps,
  initial: AgentTurn,
  options: { signal: AbortSignal; onProgress?: (turn: AgentTurn) => void },
): Promise<TurnRunResult> {
  const events: AgentEvent[] = [...initial.events];
  const userEvent = events.find((event) => event.kind === 'user');
  const question = userEvent?.kind === 'user' ? userEvent.text : '';
  const screenContext =
    userEvent?.kind === 'user' ? userEvent.screenContext : null;
  const screenContextBlock = screenContext
    ? formatScreenContextBlock(screenContext)
    : '<screen_context></screen_context>';

  const exchanges: WireExchange[] = [];
  const readSlugs: string[] = [];
  const writeIntents: Array<{ name: string; args: unknown }> = [];
  const toolRefs: Array<{ name: string; target: string }> = [];

  let rounds = 0;
  let sentChars = 0;
  let auditCount = 0;
  let vaultChars = 0;
  let status: AgentTurn['status'] = 'running';
  const roundCap = deps.roundCap ?? AGENT_ROUND_CAP;

  const snapshot = (): AgentTurn => ({
    id: initial.id,
    events: [...events],
    roundsUsed: rounds,
    sentChars,
    auditCount,
    status,
  });

  const emit = () => options.onProgress?.(snapshot());
  const finishAborted = () => {
    status = 'aborted';
    events.push({ kind: 'notice', code: 'aborted', text: deps.notices.aborted });
    emit();
    return { turn: snapshot(), readSlugs, writeIntents };
  };
  emit();

  const assemble = (tools: AgentLoopDeps['tools']) => ({
    model: deps.model,
    system: deps.system,
    userText: question,
    screenContextBlock,
    exchanges,
    tools,
  });
  const sendScope = (body: string) => ({
    nodes: [...new Set(readSlugs)],
    // Measured: the UTF-16 length actually sent in this round trip.
    promptChars: body.length,
    vaultChars,
    tools: [...toolRefs],
  });

  while (rounds < roundCap) {
    if (options.signal.aborted) return finishAborted();

    const assembly = assemble(deps.tools);
    const payload = deps.adapter.buildBody(assembly);

    let echo: LlmChatEcho;
    try {
      echo = await deps.send({
        body: payload,
        model: deps.model,
        question,
        scope: sendScope(payload),
      });
    } catch (error) {
      if (options.signal.aborted) return finishAborted();
      status = 'failed';
      events.push(noticeFor(deps, null, String(error)));
      emit();
      return { turn: snapshot(), readSlugs, writeIntents };
    }

    rounds += 1;
    sentChars += payload.length;
    auditCount += 1;
    if (options.signal.aborted) return finishAborted();

    if (echo.status < 200 || echo.status >= 300) {
      status = 'failed';
      events.push(noticeFor(deps, echo.status, echo.body));
      emit();
      return { turn: snapshot(), readSlugs, writeIntents };
    }

    const parsed = deps.adapter.parseResponse(echo.body);
    if (parsed.stop === 'error' || parsed.stop === 'refusal') {
      status = 'failed';
      events.push({
        kind: 'notice',
        code: parsed.stop === 'refusal' ? 'provider-refused' : 'failed',
        text: parsed.errorMessage
          ? `${parsed.stop === 'refusal' ? deps.notices.providerRefused : deps.notices.failed} (${parsed.errorMessage})`
          : parsed.stop === 'refusal'
            ? deps.notices.providerRefused
            : deps.notices.failed,
      });
      emit();
      return { turn: snapshot(), readSlugs, writeIntents };
    }

    const review = deps.adapter.reviewResponse?.(assembly, parsed) ?? { action: 'accept' as const };
    if (review.action === 'retry') {
      exchanges.push({
        assistant: parsed.raw,
        toolResults: [],
        retry: { expectedTool: review.expectedTool, instruction: review.message },
      });
      continue;
    }
    if (review.action === 'fail') {
      status = 'failed';
      events.push({
        kind: 'notice',
        code: 'failed',
        text: `${deps.notices.failed} (${review.message})`,
      });
      emit();
      return { turn: snapshot(), readSlugs, writeIntents };
    }

    if (parsed.toolCalls.length === 0) {
      pushAssistant(parsed.text);
      /* A turn that never called a tool gets a notice like the cap; a normal finish after tools does not. */
      if (toolRefs.length === 0) {
        events.push({
          kind: 'notice',
          code: 'no-tool-call',
          text: deps.notices.noToolCall({ round: rounds, cap: roundCap }),
        });
      }
      status = 'done';
      emit();
      return { turn: snapshot(), readSlugs, writeIntents };
    }

    // Text before the tool rows, in the order the model said it.
    if (parsed.text.trim()) pushAssistant(parsed.text);

    const results: ToolResultPayload[] = [];
    // Parallel tool calls run sequentially so the rows show what went out when.
    for (const call of parsed.toolCalls) {
      if (options.signal.aborted) break;
      const execution = await deps.execute(call);
      const record: ToolCallRecord = {
        id: call.id,
        name: call.name,
        args: call.args,
        target: execution.target,
    // The character count this result will carry into the next round trip — measured.
        sentChars: execution.content.length,
        outcome: execution.outcome,
        summary: execution.summary,
      };
      events.push({ kind: 'toolLine', call: record });
      emit();

      for (const slug of execution.readSlugs) {
        if (!readSlugs.includes(slug)) readSlugs.push(slug);
      }
      vaultChars += execution.vaultChars;
      toolRefs.push({ name: call.name, target: execution.target });
      if (execution.writeIntent) writeIntents.push(execution.writeIntent);
      results.push({
        id: call.id,
        name: call.name,
        content: execution.content,
        isError: execution.isError,
      });
    }

    exchanges.push({ assistant: parsed.raw, toolResults: results });

    if (options.signal.aborted) return finishAborted();

    if (vaultChars > AGENT_TURN_VAULT_CHAR_CAP) {
      status = 'done';
      events.push({ kind: 'notice', code: 'round-cap', text: deps.notices.roundCap });
      emit();
      return { turn: snapshot(), readSlugs, writeIntents };
    }
  }

  // Cap reached — ask once more to wrap up (with no tools).
  if (!options.signal.aborted) {
    try {
      const closingAssembly = assemble([]);
      const closingBody = deps.adapter.buildBody(closingAssembly);
      const echo = await deps.send({
        body: closingBody,
        model: deps.model,
        question,
        scope: sendScope(closingBody),
      });
      sentChars += closingBody.length;
      auditCount += 1;
      if (options.signal.aborted) return finishAborted();
      const parsed = deps.adapter.parseResponse(echo.body);
      const review =
        deps.adapter.reviewResponse?.(closingAssembly, parsed) ?? { action: 'accept' as const };
      if (review.action !== 'accept') {
        status = 'failed';
        events.push({
          kind: 'notice',
          code: 'failed',
          text: `${deps.notices.failed} (${review.message})`,
        });
        emit();
        return { turn: snapshot(), readSlugs, writeIntents };
      }
      if (parsed.text.trim()) pushAssistant(parsed.text);
    } catch {
      if (options.signal.aborted) return finishAborted();
    // A failed wrap-up is not a failure of the turn — what was read is already on screen.
    }
  }
  if (options.signal.aborted) return finishAborted();
  status = 'done';
  events.push({ kind: 'notice', code: 'round-cap', text: deps.notices.roundCap });
  emit();
  return { turn: snapshot(), readSlugs, writeIntents };

  function pushAssistant(text: string) {
    // Split off the next-step line first, or citation validation draws it as a paragraph.
    const { body, nextStep } = splitNextStep(text);
    const cited = extractCitations(body, readSlugs);
    events.push({
      kind: 'assistant',
      paragraphs: cited.paragraphs,
      grounding: cited.grounding,
    // The read list lets the screen show evidence without relying on citation markers.
      sources: [...readSlugs],
      nextStep,
    });
  }
}
