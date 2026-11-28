import type { useTranslations } from "use-intl";
import { X } from "lucide-react";

import type { LibrarySourceRow } from "@/entities/docs-vault";
import { cn } from "@/shared/lib/cn";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { sourceStateFill } from "@/widgets/library-sources-overview";

import type { SourceStateFilter } from "../../model/sources/use-source-filter";

type SourceState = LibrarySourceRow["state"];

/** One press per state the folder holds, in the bar's order; each narrows the list and lights its marks. */
export function SourceStateLegend({ presses, byState, total, complete, compact, filter, grouped, t }: {
  presses: readonly SourceState[];
  byState: Record<SourceState, number>;
  total: number;
  complete: boolean;
  /** Three or more presses in a narrow pane keep swatch and count; the word stays in `title` and for a screen reader. */
  compact: boolean;
  filter: SourceStateFilter;
  grouped: Intl.NumberFormat;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  return (
    <div
      role="group"
      aria-label={t("sources.statesAria")}
      data-testid="library-source-states"
      className="-ml-1.5 flex min-h-6 min-w-0 flex-wrap items-center gap-x-0.5"
    >
      {presses.map((state) => {
        const label = t(`sources.state.${state}.label`);
        const pressed = filter.state === state;
        return (
          <button
            key={state}
            type="button"
            data-testid={`library-source-states-${state}`}
            aria-pressed={pressed}
            title={t("sources.filterShow", { label })}
            onClick={() => filter.press(state)}
            className={controlClass({
              shape: "segment",
              size: "xs",
              tone: "muted",
              hoverInk: "strong",
              hoverSurface: "lift",
              active: pressed,
              className: "flex-none gap-1.5 whitespace-nowrap",
            })}
          >
            <span
              aria-hidden
              data-testid={`library-source-states-swatch-${state}`}
              className="inline-block size-2 flex-none rounded-full"
              style={{ background: sourceStateFill(state, complete) }}
            />
            {/* Three or more presses in a narrow pane keep swatch and count; the word stays in `title` and for a screen reader. */}
            <span className={cn(compact && "@max-[60rem]:sr-only")}>{label}</span>
            <span className="tabular-nums">{grouped.format(byState[state])}</span>
          </button>
        );
      })}
      {/*
       * The clear press holds its slot from the first paint, so pressing a state resizes nothing;
       * at rest it is invisible, inert and out of the tab order, and it fades in with a filter.
       */}
      <button
        type="button"
        data-testid="library-source-states-all"
        aria-label={t("sources.filterAll", { count: total })}
        title={t("sources.filterAll", { count: total })}
        aria-hidden={filter.state === null || undefined}
        inert={filter.state === null || undefined}
        tabIndex={filter.state === null ? -1 : undefined}
        data-shown={filter.state === null ? undefined : ""}
        onClick={filter.clear}
        className={controlClass({
          shape: "segment",
          size: "xs",
          tone: "muted",
          hoverInk: "strong",
          hoverSurface: "lift",
          className: cn(
            "flex-none px-1.5 transition-opacity duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
            filter.state === null ? "opacity-0" : "opacity-100",
          ),
        })}
      >
        <X size={ICON_SIZE.sm} aria-hidden />
      </button>
    </div>
  );
}
