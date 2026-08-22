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
 * One turn's state machine.
 *
 * **Three contracts:**
 *
 * 1. **It responds on the frame it was pressed.** `startTurn` does not wait for
 *    the network; it returns **synchronously** with the turn holding the user's
 *    bubble, and the screen draws that result immediately.
 * 2. **Every run can be interrupted.** `abort()` cuts an in-flight request where
 *    it stands and leaves a "read this far" closing row. Closing the panel takes
 *    the same path — closing is stopping, not continuing in the background.
 * 3. **There is no path that runs without a user turn.** Round trips happen only
 *    inside `run()` and are capped (6). Zero autonomous execution.
 *
 * **Progress shows only what has actually happened.** A tool row is confirmed
 * only **after its round trip completes**. Marking something "read" before it is
 * sent makes the screen state something that has not happened yet. While in
 * flight there is one pending dot and nothing else — no fake progress bar is
 * ever built.
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
  system: string;
  model: string;
  /** Cap-reached, aborted, and error copy arrive in the screen's language — the model does not write them. */
  notices: {
    roundCap: string;
    /**
     * The single line for a turn that stopped without calling a tool. The round
     * number is carried so it is **symmetric** with the cap-reached copy — both
     * say "which round it stopped at".
     */
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

/**
 * The turn created on **the very frame** [send] was pressed. There is no network
 * yet. The screen draws this value as is, locking the input and seating the bubble.
 */
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

function noticeFor(deps: AgentLoopDeps, status: number | null, message: string): AgentEvent {
  if (status === 429) return { kind: 'notice', code: 'rate-limited', text: deps.notices.rateLimited };
  if (status === 401 || status === 403) {
    return { kind: 'notice', code: 'rejected', text: deps.notices.rejected };
  }
  if (message.includes('감사 기록') || message.includes('기록을 남기지')) {
    return { kind: 'notice', code: 'audit-blocked', text: deps.notices.auditBlocked };
  }
  if (message.includes('시간 안에') || /timed?\s*out/i.test(message)) {
    return { kind: 'notice', code: 'timed-out', text: deps.notices.timedOut };
  }
  return { kind: 'notice', code: 'network-failed', text: deps.notices.networkFailed };
}

/**
 * Runs one turn to completion. If `signal` is cut it tidies up where it stands and
 * returns.
 *
 * The return value is **a new turn object**, and intermediate states are streamed
 * through `onProgress` so the screen can redraw on every round trip.
 */
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

  const snapshot = (): AgentTurn => ({
    id: initial.id,
    events: [...events],
    roundsUsed: rounds,
    sentChars,
    auditCount,
    status,
  });

  const emit = () => options.onProgress?.(snapshot());
  emit();

  while (rounds < AGENT_ROUND_CAP) {
    if (options.signal.aborted) {
      status = 'aborted';
      events.push({ kind: 'notice', code: 'aborted', text: deps.notices.aborted });
      emit();
      return { turn: snapshot(), readSlugs, writeIntents };
    }

    const assembly = {
      model: deps.model,
      system: deps.system,
      userText: question,
      screenContextBlock,
      exchanges,
      tools: deps.tools,
    };
    const payload = deps.adapter.buildBody(assembly);

    let echo: LlmChatEcho;
    try {
      echo = await deps.send({
        body: payload,
        model: deps.model,
        question,
        scope: {
          nodes: [...new Set(readSlugs)],
          // Measured only — the byte length actually sent in this round trip.
          promptChars: payload.length,
          vaultChars,
          tools: [...toolRefs],
        },
      });
    } catch (error) {
      if (options.signal.aborted) {
        status = 'aborted';
        events.push({ kind: 'notice', code: 'aborted', text: deps.notices.aborted });
      } else {
        status = 'failed';
        events.push(noticeFor(deps, null, String(error)));
      }
      emit();
      return { turn: snapshot(), readSlugs, writeIntents };
    }

    rounds += 1;
    sentChars += payload.length;
    auditCount += 1;

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
      /**
       * **A turn that ended without calling a single tool must not die quietly.**
       *
       * This branch catches two things at once: ① a normal finish that wraps up
       * after using tools (where `toolRefs` is populated) ② a turn that stopped
       * without ever opening the vault. ② is "it stopped here" exactly as the cap
       * is, but unlike `round-cap` it gave no notice at all, so the screen could
       * not be told apart from a normal completion. Those are the turns that
       * appear in the measured audit log as `agent ok tools=[]`.
       *
       * The notice attaches to ② only — attaching it to ① adds wallpaper to every
       * normal turn.
       */
      if (toolRefs.length === 0) {
        events.push({
          kind: 'notice',
          code: 'no-tool-call',
          text: deps.notices.noToolCall({ round: rounds, cap: AGENT_ROUND_CAP }),
        });
      }
      status = 'done';
      emit();
      return { turn: snapshot(), readSlugs, writeIntents };
    }

    // If text arrived alongside, seat it before the tool rows — it must read in the
    // order the model said what it was going to do.
    if (parsed.text.trim()) pushAssistant(parsed.text);

    const results: ToolResultPayload[] = [];
    // Parallel tool calls are executed **sequentially** — the screen's rows are
    // sequential too, so the user can follow what went out when.
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

    if (options.signal.aborted) {
      status = 'aborted';
      events.push({ kind: 'notice', code: 'aborted', text: deps.notices.aborted });
      emit();
      return { turn: snapshot(), readSlugs, writeIntents };
    }

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
      const closingAssembly = {
        model: deps.model,
        system: deps.system,
        userText: question,
        screenContextBlock,
        exchanges,
        tools: [],
      };
      const closingBody = deps.adapter.buildBody(closingAssembly);
      const echo = await deps.send({
        body: closingBody,
        model: deps.model,
        question,
        scope: {
          nodes: [...new Set(readSlugs)],
          promptChars: closingBody.length,
          vaultChars,
          tools: [...toolRefs],
        },
      });
      sentChars += closingBody.length;
      auditCount += 1;
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
    // A failed wrap-up is not a failure of the turn — what was read is already on screen.
    }
  }
  status = 'done';
  events.push({ kind: 'notice', code: 'round-cap', text: deps.notices.roundCap });
  emit();
  return { turn: snapshot(), readSlugs, writeIntents };

  function pushAssistant(text: string) {
    // Split off the next-step line **first** — letting it into citation validation
    // draws the marker as a paragraph, showing the model's internal notation to the user.
    const { body, nextStep } = splitNextStep(text);
    const cited = extractCitations(body, readSlugs);
    events.push({
      kind: 'assistant',
      paragraphs: cited.paragraphs,
      grounding: cited.grounding,
    // Carry the read list as of this moment so the screen can draw evidence even
    // with no citation notation (the material for compensation that does not rely
    // on the model complying).
      sources: [...readSlugs],
      nextStep,
    });
  }
}
