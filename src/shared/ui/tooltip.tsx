"use client";

import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  forwardRef,
} from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

/**
 * Radix UI 기반 tooltip wrapper (Fire 5).
 *
 * Tailwind `title` HTML 속성 대신 사용 — 모바일 터치 호환 + 스타일 일관성 +
 * keyboard focus 시 표시. 단일 mount 만 필요한 사이트는 `Tooltip` 컴포넌트로,
 * 여러 tooltip 을 한 트리에서 쓰면 `TooltipProvider` 한 번만 감싸면 된다.
 *
 * 디자인 헌장 §11 준수:
 * - solid 무채색 panel (rgba 0,0,0 alpha) + indigo border alpha
 * - glow / scale / 그라디언트 없음
 * - sideOffset 6 + small radius
 *
 * 사용:
 *   <Tooltip content="중앙 정렬">
 *     <button>...</button>
 *   </Tooltip>
 */
export const TooltipProvider = TooltipPrimitive.Provider;

export const TooltipContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={
      className ??
      "z-[80] rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:var(--color-panel)] px-2 py-1 text-[11px] text-[color:var(--color-text-primary)] shadow-[0_8px_22px_rgba(0,0,0,0.48)] data-[state=delayed-open]:animate-in data-[state=closed]:animate-out"
    }
    {...props}
  />
));
TooltipContent.displayName = "TooltipContent";

export interface TooltipProps {
  /** 툴팁 텍스트. ReactNode 도 OK 지만 무거운 트리는 비추 (a11y aria-label). */
  content: ReactNode;
  /** trigger element. 보통 button / Link / icon. */
  children: ReactNode;
  /** Radix Side. 기본 'top'. */
  side?: TooltipPrimitive.TooltipContentProps["side"];
  /** 자체 Provider 없이 단발 사용 시 true (default). 트리에 이미
   *  `TooltipProvider` 가 있으면 false 로 두어 중복 wrap 회피. */
  withProvider?: boolean;
  /** 표시 지연 ms. 기본 300. */
  delayMs?: number;
}

/**
 * 단발 사용 — provider 까지 포함한 한 줄 wrapper.
 *
 * 다수 사이트에서 쓸 땐 상위 layout 에 `<TooltipProvider>` 한 번 두고 본
 * 컴포넌트는 `withProvider={false}` 로 사용해 dom 중복 회피.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  withProvider = true,
  delayMs = 300,
}: TooltipProps) {
  const inner = (
    <TooltipPrimitive.Root delayDuration={delayMs}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipContent side={side}>{content}</TooltipContent>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
  if (!withProvider) return inner;
  return <TooltipProvider delayDuration={delayMs}>{inner}</TooltipProvider>;
}
