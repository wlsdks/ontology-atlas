"use client";

import type { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { AgentDoor } from "./AgentDoor";

/**
 * One card for one state wherever the Library draws it: the index and the Check-results page both
 * render this, so a missing agent reads the same on both.
 */
export function AgentMissingNotice({
  id,
  testId = "library-agent-missing",
  doorTestId = "library-agent-missing-door",
  className,
  t,
}: {
  /** The sentence's id, for a control elsewhere that is described by it. */
  id?: string;
  testId?: string;
  doorTestId?: string;
  /** Placement only: the card's own shape is the same everywhere it is drawn. */
  className?: string;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "grid grid-cols-[1rem_minmax(0,1fr)] gap-x-1.5 gap-y-1 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-2.5",
        className,
      )}
    >
      <span className="flex h-[var(--leading-label)] items-center justify-center">
        <Sparkles size={ICON_SIZE.sm} aria-hidden className="text-[color:var(--color-indigo-accent)]" />
      </span>
      <p
        id={id}
        className="min-w-0 text-label leading-label text-[color:var(--color-text-secondary)] [word-break:keep-all]"
      >
        {t("wiki.agentMissing")}
      </p>
      <span className="col-start-2 flex min-w-0">
        <AgentDoor testId={doorTestId} variant="link" label={t("wiki.agentMissingDoor")} />
      </span>
    </div>
  );
}
