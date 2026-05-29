import { useCallback, useEffect, useRef, useState } from "react";
import { copyText } from "./copy-text";

export type CopyFeedbackState = "idle" | "copied" | "failed";

/**
 * 클립보드 복사 + 일시적 상태 피드백(idle → copied/failed → idle) 공용 훅.
 *
 * 16+ 곳에서 같은 로직(useState copyState · resetTimer ref · unmount cleanup ·
 * copyText 후 setTimeout 으로 idle 복귀)을 손으로 반복하던 것을 한 곳으로.
 * 스타일은 각 사이트가 그대로 유지하고, 상태 로직만 이 훅으로 공유한다.
 *
 * @param resetMs copied/failed 표시 후 idle 로 돌아가기까지 ms (기본 1500).
 * @returns state 와 copy(text) — copy 는 성공 여부 boolean 도 반환해 toast 등
 *   추가 피드백을 호출자가 붙일 수 있다.
 */
export function useCopyFeedback(resetMs = 1500): {
  state: CopyFeedbackState;
  copy: (text: string) => Promise<boolean>;
} {
  const [state, setState] = useState<CopyFeedbackState>("idle");
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) {
        window.clearTimeout(resetTimer.current);
      }
    };
  }, []);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      const ok = await copyText(text);
      if (resetTimer.current !== null) {
        window.clearTimeout(resetTimer.current);
      }
      setState(ok ? "copied" : "failed");
      resetTimer.current = window.setTimeout(() => setState("idle"), resetMs);
      return ok;
    },
    [resetMs],
  );

  return { state, copy };
}
