"use client";

import type { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { AgentDoor } from "./AgentDoor";

/**
 * **No agent on this computer: one notice with its way out, not dead doors** (design sweep,
 * 2026-09-25).
 *
 * Measured at 1512 on the no-agent folder, the index column's top 120px held Check and
 * Compile at opacity 0.55 (text about 2.3:1) over a two-line paragraph saying why. The
 * features are still named here — the sentence says what they would do — and the reason
 * keeps its one place, now with the press that removes it. "Availability is a state with
 * its reason" (`docs/DECISIONS.md`, 2026-09-11) holds: the state is this card, and it ends
 * in a door.
 *
 * ⚠️ **One card for one state, wherever the Library draws it** (2026-09-25). The index took
 * this card and the Check-results page it opens kept its own Check control on screen,
 * disabled, over a caption and with no door at all — one missing agent in two grammars a
 * press apart. Both now draw this component, so the state reads the same on both.
 *
 * ⚠️ **One box edge, one text line, and not the loudest thing around it** (design sweep
 * round 2, 2026-09-25). The door used to be a full-width white-ink outline button inside
 * this card's padding: its box stood at 87 while every other box in the column stood at 76,
 * and it out-shouted the selected page card. The card is the only box; its sentence and its
 * door both start on one text line after the glyph slot, and the door is the accent link a
 * pressable fact wears.
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
