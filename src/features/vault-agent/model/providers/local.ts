import type { NormalizedResponse, ProviderAdapter, TurnAssembly } from '../provider-adapter';
import { openaiAdapter } from './openai';

const LOCAL_TOOL_ROUND_CAP = 3;
const LOCAL_SYNTHESIS_INSTRUCTION =
  'Tool access is closed. Answer the original question now from only the evidence you verified. Cite exact slugs you read and mark every uninspected area incomplete. Do not describe another plan or tool call.';

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

function forcedReadTool(turn: TurnAssembly): string | null {
  if (turn.exchanges.length === 0) return firstReadTool(turn.screenContextBlock);
  if (hasFocusedConcept(turn.screenContextBlock)) return null;
  if (turn.exchanges.length === 1) return 'list_concepts';
  if (turn.exchanges.length === 2) return 'get_concepts';
  return null;
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
 * 읽기·인용·결함 재현으로만 판정한다.
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
      turn.tools.length === 0 || turn.exchanges.length >= LOCAL_TOOL_ROUND_CAP;
    const forcedToolName = shouldSynthesize ? null : forcedReadTool(turn);
    const effectiveTurn = shouldSynthesize
      ? { ...turn, tools: [] }
      : forcedToolName
        ? withOnlyTool(turn, forcedToolName)
        : turn;
    const body = JSON.parse(openaiAdapter.buildBody(effectiveTurn)) as Record<string, unknown>;
    if (shouldSynthesize) {
      const messages = body.messages as Array<Record<string, unknown>>;
      messages.push({ role: 'user', content: LOCAL_SYNTHESIS_INSTRUCTION });
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

  parseResponse(body: string): NormalizedResponse {
    return openaiAdapter.parseResponse(body);
  },
};
