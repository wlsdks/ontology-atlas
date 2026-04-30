"use client";

import { useEffect } from "react";

interface Combo {
  /** 토큰 소문자 (예: "k", "f", "?"). `?`는 Shift+/ 조합에서 나오는 실제 key.*/
  key: string;
  /** Cmd/Ctrl 필수 여부. 기본 false. */
  meta?: boolean;
  /** Shift 필수 여부. `?`는 key가 이미 Shift 결과라 false 유지 권장. */
  shift?: boolean;
}

export interface TypingShortcut {
  combo: Combo;
  onFire: () => void;
  /** 비활성 조건(예: 다른 오버레이 열림). true면 콜백 실행 안 함. */
  disabled?: boolean;
}

/**
 * input·textarea·contenteditable에 포커스 있을 때는 실행을 건너뛰는 글로벌
 * 키 단축키 훅. HomePage와 ProjectDetailPage 모두가 같은 규칙으로 `?`
 * 치트시트·`Cmd+K` 검색·`F` 프레젠테이션을 공유하도록 추출.
 */
export function useTypingShortcuts(shortcuts: TypingShortcut[]) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isTyping) return;

      for (const shortcut of shortcuts) {
        if (shortcut.disabled) continue;
        const { combo, onFire } = shortcut;
        const metaRequired = combo.meta ?? false;
        const metaDown = event.metaKey || event.ctrlKey;
        if (metaRequired !== metaDown) continue;
        if (combo.shift && !event.shiftKey) continue;
        if (event.key.toLowerCase() !== combo.key.toLowerCase() && event.key !== combo.key)
          continue;
        event.preventDefault();
        onFire();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts]);
}
