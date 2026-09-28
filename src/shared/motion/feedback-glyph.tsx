import { X } from "lucide-react";
import type { ReactNode } from "react";
import type { CopyFeedbackState } from "@/shared/lib/use-copy-feedback";
import { DrawnCheck } from "./drawn-check";

const LAYER =
  "col-start-1 row-start-1 grid place-items-center transition-opacity duration-[var(--motion-fast)] ease-[var(--motion-ease)]";

export function FeedbackGlyph({
  state,
  icon,
  size,
}: {
  state: CopyFeedbackState;
  icon: ReactNode;
  size: number;
}) {
  const succeeded = state === "copied" || state === "done";
  return (
    <span aria-hidden data-feedback-glyph={state} className="inline-grid shrink-0" style={{ width: size, height: size }}>
      <span className={`${LAYER} ${state === "idle" ? "opacity-100" : "opacity-0"}`}>{icon}</span>
      {succeeded ? (
        <span className={`${LAYER} text-[color:var(--color-status-success)]`}>
          <DrawnCheck size={size} settle />
        </span>
      ) : null}
      <span
        className={`${LAYER} text-[color:var(--color-status-danger)] ${state === "failed" ? "opacity-100" : "opacity-0"}`}
      >
        <X size={size} aria-hidden />
      </span>
    </span>
  );
}
