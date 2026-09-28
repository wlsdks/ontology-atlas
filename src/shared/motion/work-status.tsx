"use client";

import { useState, type ReactNode } from "react";
import { useSurfaceSwap } from "@/shared/lib/use-presence";
import { DrawnCheck } from "./drawn-check";

export type WorkPhase = "waiting" | "running" | "done" | "failed";

const GLYPH = 12;
const RADIUS = 5;
const RING_STROKE: Readonly<Record<WorkPhase, string>> = {
  waiting: "var(--color-overlay-2)",
  running: "var(--color-overlay-2)",
  done: "var(--color-status-success)",
  failed: "var(--color-status-danger)",
};

function useDrawsIntoDone(phase: WorkPhase): boolean {
  const [leftDone, setLeftDone] = useState(phase !== "done");
  if (phase !== "done" && !leftDone) setLeftDone(true);
  return leftDone;
}

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
  const draws = useDrawsIntoDone(phase);
  const { leaving } = useSurfaceSwap(label);
  const determinate = progress?.total != null && progress.total > 0;
  const ratio = determinate ? Math.min(1, progress.done / (progress.total as number)) : 0;

  return (
    <span data-testid={testId} data-work-phase={phase} className="inline-flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden
        data-work-glyph
        className="relative inline-grid shrink-0 place-items-center"
        style={{ width: GLYPH, height: GLYPH }}
      >
        <svg width={GLYPH} height={GLYPH} viewBox="0 0 12 12" fill="none" className="col-start-1 row-start-1">
          <circle cx={6} cy={6} r={RADIUS} strokeWidth={1.5} stroke={RING_STROKE[phase]} className="motion-work-ring" />
          {phase === "running" ? (
            <circle
              cx={6}
              cy={6}
              r={RADIUS}
              strokeWidth={1.5}
              stroke="var(--color-indigo-a60)"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={determinate ? "1 1" : "0.25 0.75"}
              strokeDashoffset={determinate ? 1 - ratio : 0}
              transform="rotate(-90 6 6)"
              className={determinate ? "motion-work-arc" : "motion-work-spin"}
            />
          ) : null}
          {phase === "failed" ? (
            <path
              d="M4.25 4.25l3.5 3.5M7.75 4.25l-3.5 3.5"
              strokeWidth={1.5}
              strokeLinecap="round"
              stroke="var(--color-status-danger)"
              className="motion-work-mark"
            />
          ) : null}
        </svg>
        {phase === "done" ? (
          <span className="col-start-1 row-start-1 grid place-items-center text-[color:var(--color-status-success)]">
            <DrawnCheck size={8} drawn={draws} settle />
          </span>
        ) : null}
      </span>
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
