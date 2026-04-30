"use client";

interface Props {
  /** 스크린리더에 알릴 텍스트. 값이 바뀌면 즉시 읽힌다. */
  message: string;
  /** "polite" 는 현재 말이 끝난 후, "assertive" 는 즉시 끼어들어 읽힘. */
  politeness?: "polite" | "assertive";
}

/**
 * 시각적으로 숨겨진 aria-live 영역.
 * 드로어 열림·투어 단계 변경 같은 상태 변화를 스크린리더 사용자에게 전달한다.
 *
 * iOS VoiceOver 가 같은 텍스트의 반복 업데이트를 무시하는 경향이 있어,
 * 같은 내용이라도 앞뒤 비가시 문자로 살짝 다르게 보내 업데이트를 강제.
 */
export function LiveAnnouncer({ message, politeness = "polite" }: Props) {
  const text = message ? message + "\u200b" : "";

  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
    >
      {text}
    </div>
  );
}
