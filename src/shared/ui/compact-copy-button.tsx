"use client";

import { Clipboard } from "lucide-react";
import { useState, type HTMLAttributes } from "react";
import type { CopyFeedbackState } from "@/shared/lib/use-copy-feedback";
import { FeedbackGlyph } from "@/shared/motion/feedback-glyph";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { controlClass } from '@/shared/ui/control-class';

export interface CompactCopyButtonProps {
  copied: boolean;
  state?: CopyFeedbackState;
  label: string;
  ariaLabel: string;
  onClick: () => void;
  className?: string;
  /** The label stays the tooltip and `ariaLabel` the accessible name. */
  iconOnly?: boolean;
}

/**
 * A compact copy pill whose icon becomes the result, announced as well as drawn.
 */
export function CompactCopyButton({
  copied,
  state,
  label,
  ariaLabel,
  onClick,
  className = "",
  iconOnly = false,
  ...attrs
}: CompactCopyButtonProps & Omit<HTMLAttributes<HTMLButtonElement>, "className" | "onClick">) {
  const feedback: CopyFeedbackState = state ?? (copied ? "copied" : "idle");
  const [idleText, setIdleText] = useState({ label, ariaLabel });
  if (feedback === "idle" && (idleText.label !== label || idleText.ariaLabel !== ariaLabel)) {
    setIdleText({ label, ariaLabel });
  }
  const announcement =
    feedback === "idle"
      ? ""
      : ariaLabel !== idleText.ariaLabel
        ? ariaLabel
        : label !== idleText.label
          ? label
          : ariaLabel;

  return (
    <>
      <button
        {...attrs}
        type="button"
        onClick={onClick}
        data-feedback={feedback}
        data-feedback-travel={iconOnly ? "" : undefined}
        className={controlClass({
          shape: 'chip',
          size: 'md',
          tone: 'muted',
          className: `min-h-9 min-w-0 justify-center px-2 py-1 transition-[background-color,color,translate] duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)] active:translate-y-px motion-reduce:translate-none ${className}`,
        })}
        aria-label={ariaLabel}
        title={label}
      >
        <FeedbackGlyph state={feedback} size={ICON_SIZE.sm} icon={<Clipboard size={ICON_SIZE.sm} aria-hidden />} />
        {iconOnly ? null : <span className="min-w-0 truncate">{label}</span>}
      </button>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </>
  );
}
