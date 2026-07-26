import type { LlmChatScope, LlmChatEcho } from '@/shared/lib/tauri-llm';

import { extractCitations } from './citation';
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
 * 한 턴의 상태 기계.
 *
 * ## 세 가지가 계약이다
 *
 * 1. **누른 프레임에 반응한다.** `startTurn` 은 네트워크를 기다리지 않고
 *    사용자 말풍선이 앉은 턴을 **동기적으로** 돌려준다. 화면은 그 결과를
 *    바로 그린다.
 * 2. **모든 진행은 끊을 수 있다.** `abort()` 는 진행 중 요청을 그 자리에서
 *    끊고 "여기까지 읽었어요" 정리 행을 남긴다. 패널을 닫는 것도 같은
 *    경로다 — 닫힘 = 중단이지 백그라운드 계속이 아니다.
 * 3. **사용자 턴 없이 도는 경로가 없다.** 왕복은 `run()` 안에서만 일어나고
 *    상한(6)이 있다. 자율 실행 0.
 *
 * ## 진행 표시는 실제 사건만
 *
 * 도구 행은 **왕복이 끝난 뒤** 확정된다. 전송 전에 "읽음" 으로 찍으면 화면이
 * 아직 일어나지 않은 일을 말하는 것이다. 진행 중에는 pending 점 하나뿐이고,
 * 가짜 진행바는 만들지 않는다.
 */

export interface AgentLoopDeps {
  adapter: ProviderAdapter;
  /** Rust 브리지. 실패하면 throw. */
  send(args: {
    body: string;
    scope: LlmChatScope;
    question: string;
    model: string;
  }): Promise<LlmChatEcho>;
  execute(call: NormalizedToolCall): Promise<ToolExecution>;
  /** 이 턴에 실어 보낼 도구 목록. */
  tools: readonly AgentToolDefinition[];
  system: string;
  model: string;
  /** 상한 도달·중단·오류 문구는 화면 언어로 온다 — 모델이 짓지 않는다. */
  notices: {
    roundCap: string;
    aborted: string;
    networkFailed: string;
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
  /** 이 턴에 실제로 읽은 노드 slug 들 — 제안 카드의 경고 행 판정에 쓴다. */
  readSlugs: string[];
  /** 모델이 시도한 쓰기들 — 호출자가 제안 카드로 바꾼다. */
  writeIntents: Array<{ name: string; args: unknown }>;
}

let turnSeq = 0;

/**
 * [보내기] 를 누른 **그 프레임**에 만들어지는 턴. 네트워크는 아직 없다.
 * 화면은 이 값을 그대로 그려 입력칸을 잠그고 말풍선을 앉힌다.
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
  return { kind: 'notice', code: 'network-failed', text: deps.notices.networkFailed };
}

/**
 * 한 턴을 끝까지 돈다. `signal` 이 끊기면 그 자리에서 정리하고 돌아온다.
 *
 * 반환값은 **새 턴 객체**다 — 화면이 매 왕복마다 다시 그릴 수 있도록
 * `onProgress` 로 중간 상태도 흘려준다.
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

    const payload = deps.adapter.buildBody({
      model: deps.model,
      system: deps.system,
      userText: question,
      screenContextBlock,
      exchanges,
      tools: deps.tools,
    });

    let echo: LlmChatEcho;
    try {
      echo = await deps.send({
        body: payload,
        model: deps.model,
        question,
        scope: {
          nodes: [...new Set(readSlugs)],
          // 실측만 — 이 왕복에 실제로 나간 바이트 길이.
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

    if (parsed.toolCalls.length === 0) {
      pushAssistant(parsed.text);
      status = 'done';
      emit();
      return { turn: snapshot(), readSlugs, writeIntents };
    }

    // 텍스트가 함께 왔으면 도구 행보다 먼저 앉힌다 — 모델이 무엇을 하려는지
    // 말한 순서 그대로 읽혀야 한다.
    if (parsed.text.trim()) pushAssistant(parsed.text);

    const results: ToolResultPayload[] = [];
    // 병렬 tool call 도 **순차** 실행한다 — 화면 행도 순차라야 사용자가
    // 무엇이 언제 나갔는지 따라갈 수 있다.
    for (const call of parsed.toolCalls) {
      if (options.signal.aborted) break;
      const execution = await deps.execute(call);
      const record: ToolCallRecord = {
        id: call.id,
        name: call.name,
        args: call.args,
        target: execution.target,
        // 이 결과가 다음 왕복에 실려 나갈 글자수 — 실측.
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

  // 상한 도달 — 마무리 한 번만 더 청한다 (도구 없이).
  if (!options.signal.aborted) {
    try {
      const closingBody = deps.adapter.buildBody({
        model: deps.model,
        system: deps.system,
        userText: question,
        screenContextBlock,
        exchanges,
        tools: [],
      });
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
      if (parsed.text.trim()) pushAssistant(parsed.text);
    } catch {
      // 마무리 실패는 턴 자체의 실패가 아니다 — 읽은 것은 이미 화면에 있다.
    }
  }
  status = 'done';
  events.push({ kind: 'notice', code: 'round-cap', text: deps.notices.roundCap });
  emit();
  return { turn: snapshot(), readSlugs, writeIntents };

  function pushAssistant(text: string) {
    const cited = extractCitations(text, readSlugs);
    events.push({ kind: 'assistant', paragraphs: cited.paragraphs, demoted: cited.demoted });
  }
}
