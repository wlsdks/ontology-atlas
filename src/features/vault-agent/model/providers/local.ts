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
        // 실행기는 유효 JSON을 보장하지만, 외부 호환 러너와의 경계에서는
        // 깨진 과거 exchange 하나가 이후 합성 전체를 막게 하지 않는다.
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
      ? ' Fewer than three detailed concepts survived the evidence cap, so do not say a bridge is needed or unnecessary; say only that the verified scope does not establish one.'
      : '';
  return `${LOCAL_SYNTHESIS_INSTRUCTION} Only these concepts had detailed content delivered: ${receipt}. They were found; do not say they were missing. Cite at least one of these exact slugs in the answer.${siblingBoundary}`;
}

function hasVerifiedCitation(text: string, slugs: readonly string[]): boolean {
  const verified = new Set(slugs);
  return [...text.matchAll(/\[\[([^\]\n]+)\]\]/g)].some((match) => verified.has(match[1]));
}

function missedKoreanResponse(userText: string, responseText: string): boolean {
  return /[가-힣]/.test(userText) && !/[가-힣]/.test(responseText);
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

function requiredReadInstruction(toolName: string): string {
  return `The required evidence read did not happen. Call ${toolName} now. Do not answer or describe a plan.`;
}

/**
 * 「주소로 연결」 갈래의 어댑터 — 로컬/오픈소스 러너.
 *
 * ## 왜 OpenAI 호환 문법을 그대로 쓰는가 (네이티브 `/api/chat` 이 아니라)
 *
 * Ollama 는 두 문을 다 연다: 네이티브 `/api/chat` 과 OpenAI 호환
 * `/v1/chat/completions`. 호환 쪽을 고른 이유는 **이 갈래가 Ollama 하나를
 * 위한 것이 아니기 때문**이다 — LM Studio · llama.cpp server · vLLM ·
 * LocalAI 가 전부 같은 호환 문법을 내놓으므로, 주소만 바꾸면 같은 어댑터가
 * 그대로 돈다. 네이티브를 골랐다면 러너마다 어댑터를 하나씩 써야 하고, 그건
 * `secrets.rs` 가 명명 벤더를 3에서 동결하며 피하려던 바로 그 롱테일이다.
 *
 * 대가는 정직하게 적는다: **호환성이 러너 버전에 달렸다.** 도구 호출
 * (`tools` / `tool_calls`)은 호환 층에서 비교적 늦게 붙었고 러너마다 완성도가
 * 다르다. 그래서 화면은 "될 겁니다" 라고 말하지 않고, 러너가 준 오류 문장을
 * 모델 이름과 함께 그대로 옮긴다 — 도구를 못 쓰는 모델을 골랐다는 사실이
 * 사용자에게 그 자리에서 보인다.
 *
 * 본문 조립과 응답 해석은 OpenAI 어댑터에 위임한다. 단, 주소 갈래는
 * OpenAI 호환 필드인 `reasoning_effort` / `tool_choice` 를 턴의 위치에 맞게
 * 추가한다. 첫 왕복은 아직 근거가 없고 제품 규율상 반드시 읽어야 하므로
 * 선택 노드에서는 `get_concept`, 전체 지도에서는 `list_kinds` 를 이름으로
 * 고정한다. 전체 지도는 이어서 `list_concepts` 로 후보를 고르고
 * `get_concepts` 로 실제 본문을 묶어 읽는다. 세 도구 왕복 뒤에는 도구를 회수한
 * 합성 지시로 답을 받는다. 모든 로컬
 * 왕복은 `reasoning_effort: none` 이다. 프롬프트만의
 * 턴 제한은 gemma4:12b 가 무시해 6회 도구 턴을 모두 소진했다. 실행 계약이
 * 그 제한을 지켜야 한다. 2026-08-02 실물 Ollama + gemma4:12b 의 복잡한 감사
 * 첫 tool call 은 low 59.7초, none+required 0.632초였고 둘 다 `list_kinds`였다.
 * `required` 와 named tool choice 모두 모델에 따라 무시될 수 있어 필수 턴은
 * 허용 도구도 하나로 줄인다. 로컬 품질은 사고 시간으로 가정하지 않고 실제
 * 읽기·인용·결함 재현으로만 판정한다. 합성 직전에는 결과 상한 뒤에도 실제
 * payload에 남은 상세 slug만 receipt로 다시 주고, 그중 하나도 인용하지 않거나
 * 한국어 질문을 한국어 없이 답하면 한 번 재합성한다. 두 번째에도 어기면 유창한
 * 추측을 보여주는 대신 답을 폐기한다.
 */
export const localAdapter: ProviderAdapter = {
  provider: 'local',
  /**
   * 기본 모델이 **없다.** 명명 벤더는 우리가 이름을 아는 모델이 있지만, 이
   * 갈래에서 무엇이 설치돼 있는지는 그 컴퓨터만 안다. 그래서 사용자가 설정에서
   * 목록을 보고 고르고, 고르기 전까지 이 갈래는 켜지지 않는다
   * (`isLocalEndpointReady`). 아무 이름이나 기본값으로 박아 두면 첫 왕복이
   * "model not found" 로 죽고, 그 이유가 화면 어디에도 없다.
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
      body.reasoning_effort = 'none';
      // Ollama 의 모델은 named tool_choice 도 무시할 수 있다. 이 왕복에 허용된
      // 도구 목록까지 하나로 줄여야 다른 census 도구로 새는 것을 막을 수 있다.
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
      if (response.toolCalls.some((call) => call.name === expectedTool)) {
        return { action: 'accept' };
      }
      const alreadyRetried = turn.exchanges.some(
        (exchange) => exchange.retry?.expectedTool === expectedTool,
      );
      if (alreadyRetried) {
        return {
          action: 'fail',
          expectedTool,
          message: `The local model skipped the required ${expectedTool} evidence read twice. The answer was not accepted.`,
        };
      }
      return {
        action: 'retry',
        expectedTool,
        message: requiredReadInstruction(expectedTool),
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

    const detailSlugs = verifiedDetailSlugs(turn.exchanges);
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
