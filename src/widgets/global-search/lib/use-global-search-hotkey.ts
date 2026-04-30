import { useEffect } from "react";

export interface GlobalSearchHotkeyOptions {
  /**
   * shift 도 함께 눌려야 fire. 기본 false (= 단순 ⌘K).
   *
   * Fire 2 — 홈 토폴로지의 SearchPalette (project 전용 ⌘K) 와 동거 시 충돌
   * 회피용. ontology 검색은 ⇧⌘K 로 분리.
   */
  shift?: boolean;
  /**
   * hotkey binding 자체를 비활성화 (controlled-mount 시 외부 hotkey 가 open
   * state 를 관리할 때 사용).
   */
  disabled?: boolean;
}

/**
 * ⌘K (mac) / Ctrl+K (그 외) — 글로벌 검색 토글 hotkey.
 *
 * input · textarea · contentEditable 안에서는 동작 안 함 (이미 검색이 열려
 * 있으면 닫는 동작은 허용 — 검색 input 안에서 ⌘K 로 닫기 가능).
 *
 * options.shift=true 면 ⇧⌘K (홈에서 SearchPalette 와 분리), disabled=true 면
 * binding 자체 무효 (외부 hotkey 가 open 을 관리하는 controlled mount).
 */
export function useGlobalSearchHotkey(
  open: boolean,
  setOpen: (next: boolean) => void,
  options: GlobalSearchHotkeyOptions = {},
) {
  const { shift = false, disabled = false } = options;
  useEffect(() => {
    if (disabled) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return;
      if (shift && !event.shiftKey) return;
      if (!shift && event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable = tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
      if (isEditable && !open) return;
      event.preventDefault();
      setOpen(!open);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, setOpen, shift, disabled]);
}
