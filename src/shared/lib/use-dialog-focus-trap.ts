"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface UseDialogFocusTrapOptions {
  open: boolean;
  onEscape?: () => void;
  initialFocus?: "container" | "first" | "none";
  restoreFocus?: boolean;
  /**
   * Tab/Shift+Tab 을 이 표면 안에 가둘 것인가. 기본 `true`(모달).
   *
   * **비모달 표면은 반드시 `false`** — 바깥이 살아 있는데 초점만 가두면
   * 키보드 사용자만 그 바깥에 못 간다. WAI-ARIA 도 non-modal dialog 는 초점을
   * 가두지 않는다고 못박는다. 설정 도크가 이 경우다: 지도를 보며 값을 맞추는
   * 표면이라 지도로 Tab 해 나갈 수 있어야 한다.
   */
  trapTab?: boolean;
}

/**
 * Modal focus contract shared by product overlays:
 * - move focus into the dialog on open,
 * - keep Tab/Shift+Tab inside,
 * - optionally consume Escape,
 * - restore the exact opener on close.
 */
export function useDialogFocusTrap<T extends HTMLElement>({
  open,
  onEscape,
  initialFocus = "container",
  restoreFocus = true,
  trapTab = true,
}: UseDialogFocusTrapOptions): RefObject<T | null> {
  const containerRef = useRef<T | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!open) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) =>
          !element.hasAttribute("disabled") &&
          element.getAttribute("aria-hidden") !== "true",
      );

    if (initialFocus === "container") {
      container.focus({ preventScroll: true });
    } else if (initialFocus === "first") {
      focusables()[0]?.focus({ preventScroll: true });
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onEscapeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onEscapeRef.current();
        return;
      }
      if (event.key !== "Tab" || !trapTab) return;

      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }

      const active = document.activeElement;
      if (!container.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (event.shiftKey && (active === first || active === container)) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (!restoreFocus) return;
      const previous = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previous?.isConnected) {
        previous.focus({ preventScroll: true });
        return;
      }
      /**
       * **여는 컨트롤이 사라졌어도 `body` 로 떨어뜨리지 않는다**
       * (2026-07-29 키보드 실측).
       *
       * 단축키 시트를 여는 버튼은 시트가 켜지면 **언마운트된다** — 시트가
       * 세우는 `topologyBlockingOverlayActive` 가 그 버튼의 렌더 조건을
       * 끄기 때문이다. 그래서 닫을 때 돌려줄 원소가 이미 없고, 포커스가
       * `body` 로 갔다. 그 다음 Tab 은 문서 처음(건너뛰기 링크)부터
       * 다시 시작한다 — 실측으로 원래 자리에서 29 정거장 뒤였다.
       *
       * 같은 시트를 **살아남는 원소**(자동 정렬 타일)에서 `?` 로 열면
       * 복원이 정상이었다. 즉 이건 트랩의 결함이 아니라 "돌아갈 곳이
       * 사라지는 경우"의 미처리다.
       *
       * `<main>` 은 건너뛰기 링크 수정으로 이미 포커스를 받을 수 있다.
       * 페이지 처음이 아니라 **본문 시작**으로 돌려주면, 사라진 트리거
       * 근처에서 다시 시작할 수 있다.
       */
      const main = document.querySelector<HTMLElement>("main#main");
      if (main) main.focus({ preventScroll: true });
    };
  }, [initialFocus, open, restoreFocus, trapTab]);

  return containerRef;
}
