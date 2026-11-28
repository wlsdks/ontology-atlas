import { ScrollText, Stethoscope, TextSearch } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/shared/lib/cn";
import { RowButton } from "@/shared/ui";
import { BrandMark } from "@/shared/ui/marks/brand-mark";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

import { INDEX_HOME_ROW_TEST_ID, type IndexHomeRow } from "../../model/index-column/index-home-row";

/** One view above the groups: a glyph, its name, and a quiet value on the right. 32 px, like a group's line. */
function ViewRow({
  testId,
  icon,
  label,
  value,
  active = false,
  onPress,
  state,
}: {
  testId: string;
  icon: ReactNode;
  label: string;
  value: ReactNode;
  active?: boolean;
  /** Absent when there is nothing to open yet; the row then states its value and is not a control. */
  onPress?: () => void;
  state?: string;
}) {
  const body = (
    <>
      <span aria-hidden className="col-start-1 flex items-center justify-center text-[color:var(--color-text-tertiary)]">{icon}</span>
      <span className={cn("col-start-2 truncate text-body", active ? "text-[color:var(--color-text-primary)]" : "text-[color:var(--color-text-secondary)]")}>
        {label}
      </span>
      <span className="col-start-3 flex items-center gap-1.5 whitespace-nowrap text-label tabular-nums text-[color:var(--color-text-tertiary)]">{value}</span>
    </>
  );
  const shape = "grid h-8 w-full flex-none grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-x-2 px-2 py-0";
  if (!onPress) {
    return (
      <div data-testid={testId} data-index-view="" className={shape}>
        {body}
      </div>
    );
  }
  return (
    <RowButton
      size="sm"
      hoverSurface="lift"
      active={active}
      aria-current={active ? "page" : undefined}
      data-testid={testId}
      data-index-view=""
      data-report-state={state}
      onClick={onPress}
      className={shape}
    >
      {body}
    </RowButton>
  );
}

export interface WikiViewRowsProps {
  /** The tab's home, the question desk; absent where no home is drawn. */
  home?: IndexHomeRow | null;
  logLabel: string;
  /** The latest log line's day, or the words for no line yet. */
  logValue: string;
  checkLabel: string;
  /** A finding count, the last check's day, or the words for never checked. */
  checkValue: string;
  checkOpen: boolean;
  onOpenCheck: () => void;
  /** A check is in flight: the mark replaces the value. */
  checkRunning: boolean;
  /** A check finished and its results have not been opened since. */
  checkUnseen: boolean;
  runningText: string;
  unseenText: string;
}

/**
 * The column's views above the groups and a hairline: the home, the Log and Check results. The Log
 * states when the wiki last changed; it becomes a press when the Log view exists to open.
 */
export function WikiViewRows({
  home = null,
  logLabel,
  logValue,
  checkLabel,
  checkValue,
  checkOpen,
  onOpenCheck,
  checkRunning,
  checkUnseen,
  runningText,
  unseenText,
}: WikiViewRowsProps) {
  return (
    <div data-testid="library-index-views" className="flex flex-none flex-col px-2 pb-1.5">
      {home ? (
        <ViewRow
          testId={INDEX_HOME_ROW_TEST_ID}
          icon={<TextSearch size={ICON_SIZE.sm} />}
          label={home.label}
          value={null}
          active={home.active}
          onPress={home.onPress}
        />
      ) : null}
      <ViewRow
        testId="library-index-log"
        icon={<ScrollText size={ICON_SIZE.sm} />}
        label={logLabel}
        value={logValue}
      />
      <ViewRow
        testId="library-open-report"
        icon={<Stethoscope size={ICON_SIZE.sm} />}
        label={checkLabel}
        active={checkOpen}
        onPress={onOpenCheck}
        state={checkRunning ? "running" : checkUnseen ? "unseen" : undefined}
        value={
          checkRunning ? (
            <span data-testid="library-report-running" className="relative flex size-3.5 items-center">
              <BrandMark
                detail="micro"
                alt=""
                aria-hidden
                className="atlas-inline-waiting-mark absolute left-1/2 top-1/2 size-4 max-w-none -translate-x-1/2 -translate-y-1/2"
              />
              <span aria-live="polite" className="sr-only">{runningText}</span>
            </span>
          ) : (
            <>
              {checkUnseen ? (
                <span data-testid="library-report-unseen" className="flex items-center">
                  <span aria-hidden className="size-1.5 rounded-full bg-[color:var(--color-indigo-brand)]" />
                  <span className="sr-only">{unseenText}</span>
                </span>
              ) : null}
              {checkValue}
            </>
          )
        }
      />
    </div>
  );
}
