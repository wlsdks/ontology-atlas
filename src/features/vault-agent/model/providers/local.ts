import type { NormalizedResponse, ProviderAdapter, TurnAssembly } from '../provider-adapter';
import { openaiAdapter } from './openai';

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
 * 본문 조립과 응답 해석은 OpenAI 어댑터와 **바이트 단위로 같다.** 복제하지
 * 않고 위임하는 이유가 그것이다: 한쪽만 고쳐지는 순간 같은 문법을 두 곳에서
 * 다르게 알게 된다.
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
    return openaiAdapter.buildBody(turn);
  },

  parseResponse(body: string): NormalizedResponse {
    return openaiAdapter.parseResponse(body);
  },
};
