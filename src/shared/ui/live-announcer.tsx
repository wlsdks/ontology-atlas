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
 * 같은 message 가 연속으로 들어오면 AT (특히 iOS VoiceOver) 가 dedup 으로
 * 무시할 수 있다. 같은 알림을 다시 강제로 announce 하고 싶은 호출자는
 * key prop 으로 리마운트하거나 prefix/suffix 로 명시적 차이를 만든다.
 */
export function LiveAnnouncer({ message, politeness = "polite" }: Props) {
  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      suppressHydrationWarning
      className="sr-only"
    >
      {message}
    </div>
  );
}
