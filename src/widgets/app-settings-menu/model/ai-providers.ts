import type { ConnectionProvider } from '@/shared/lib/tauri-secrets';

/**
 * 벤더 라벨의 i18n 키 — 설정 시트의 요약 칩과 [AI 연결] 서브뷰가 **같은 이름**을
 * 써야 한다.
 *
 * 삼항(`provider === 'anthropic' ? … : …`)으로 두면 벤더가 늘 때마다 두 화면
 * 중 한쪽만 고쳐져서, 요약 칩만 옛 이름을 들고 있는 어긋남이 생긴다. 레코드로
 * 두면 새 벤더를 더할 때 타입이 빠진 자리를 먼저 알려준다.
 */
export const AI_PROVIDER_LABEL_KEY: Record<ConnectionProvider, string> = {
  anthropic: 'providerAnthropic',
  openai: 'providerOpenai',
  gemini: 'providerGemini',
  // 네 번째 행은 벤더가 아니라 **갈래**다 — 사용자가 주소를 적는 자리라
  // 이름이 벤더 하나를 가리키면(예: "Ollama") LM Studio 로 붙인 사람의
  // 화면이 거짓말을 한다.
  local: 'providerLocal',
};
