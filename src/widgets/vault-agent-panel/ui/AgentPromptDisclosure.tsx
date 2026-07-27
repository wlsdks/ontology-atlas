'use client';

/**
 * "지침" 열람 — 편집은 불가하되 **열람은 1클릭**.
 *
 * 숨긴 프롬프트는 신뢰 부채다. 사용자가 자기 볼트 내용과 함께 어떤 지시가
 * 나가는지 알아야 한다. 여기 그려지는 문자열은 실제로 전송되는 문자열과
 * **같은 함수의 결과**다 — 다르면 그 열람은 투명성이 아니라 장식이다.
 *
 * ## 왜 카드가 아니라 내용만인가
 *
 * 이 열람과 「터미널에서 이어가기」는 둘 다 **떠날 때·의심될 때** 여는
 * 곁가지인데, 각자 테두리 있는 띠로 상주하면서 입력칸과 같은 무게로 바닥에
 * 쌓여 있었다(1512×950 실측: 바닥 4개 띠). 이제 여닫는 자리는 입력칸 아래
 * 한 줄이 소유하고, 열리는 영역도 **한 번에 하나**다 — 이 파일은 그 영역에
 * 들어갈 내용만 그린다.
 */
export function AgentPromptText({
  systemPrompt,
  note,
}: {
  systemPrompt: string;
  note: string;
}) {
  return (
    <div data-testid="agent-prompt-disclosure">
      <p className="mb-2 text-label tracking-label text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
        {note}
      </p>
      <pre
        data-testid="agent-prompt-text"
        className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-caption leading-caption text-[color:var(--color-text-tertiary)]"
      >
        {systemPrompt}
      </pre>
    </div>
  );
}
