"use client";

import type { ReactNode } from "react";
import { useSurfaceSwap } from "@/shared/lib/use-presence";
import { WorkGlyph, type WorkPhase } from "./work-glyph";
export type { WorkPhase } from "./work-glyph";

export function WorkStatus({
  phase,
  label,
  detail,
  progress,
  testId,
}: {
  phase: WorkPhase;
  label: string;
  detail?: ReactNode;
  progress?: { done: number; total: number | null };
  testId?: string;
}) {
  const { leaving } = useSurfaceSwap(label);

  return (
    <span data-testid={testId} data-work-phase={phase} className="inline-flex min-w-0 items-center gap-1.5">
      <WorkGlyph phase={phase} progress={progress} />
      <span className="inline-grid min-w-0">
        <span key={label} className={`col-start-1 row-start-1 truncate${leaving === null ? "" : " motion-swap-in"}`}>
          {label}
        </span>
        {leaving === null ? null : (
          <span
            key={`leaving:${leaving}`}
            aria-hidden
            inert
            className="motion-swap-out pointer-events-none col-start-1 row-start-1 truncate"
          >
            {leaving}
          </span>
        )}
      </span>
      {detail == null ? null : <span className="shrink-0">{detail}</span>}
    </span>
  );
}
