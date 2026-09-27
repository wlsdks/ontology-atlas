"use client";

import { Check, Clipboard } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import type { HTMLAttributes } from "react";
import { controlClass } from '@/shared/ui/control-class';

export interface CompactCopyButtonProps {
  copied: boolean;
  label: string;
  ariaLabel: string;
  onClick: () => void;
  className?: string;
  /** The label stays the tooltip and `ariaLabel` the accessible name. */
  iconOnly?: boolean;
}

/**
 * A compact copy pill whose icon flips to a check; shared so every copy affordance reads as one
 * control.
 */
export function CompactCopyButton({
  copied,
  label,
  ariaLabel,
  onClick,
  className = "",
  iconOnly = false,
  ...attrs
}: CompactCopyButtonProps & Omit<HTMLAttributes<HTMLButtonElement>, "className" | "onClick">) {
  return (
    <button
      {...attrs}
      type="button"
      onClick={onClick}
      className={controlClass({
        shape: 'chip',
        size: 'md',
        tone: 'muted',
        className: `min-h-9 min-w-0 justify-center px-2 py-1 transition-[background-color,color,transform] duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)] active:translate-y-[1px] motion-reduce:transition-none motion-reduce:transform-none ${className}`,
      })}
      aria-label={ariaLabel}
      title={label}
    >
      {copied ? <Check size={ICON_SIZE.sm} aria-hidden /> : <Clipboard size={ICON_SIZE.sm} aria-hidden />}
      {iconOnly ? null : <span className="min-w-0 truncate">{label}</span>}
    </button>
  );
}
