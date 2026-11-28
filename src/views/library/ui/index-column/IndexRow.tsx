import { cn } from "@/shared/lib/cn";
import { RowButton } from "@/shared/ui";

export interface IndexRowProps {
  title: string;
  /** Line 2, left: where the page came from, or why it needs a look. */
  detail: string;
  /** Line 2, right; absent when the page has no date to show. */
  date: string | null;
  /** Draws the dot, for a page that needs a person. */
  attention: boolean;
  selected: boolean;
  /** The row's accessible name and hover text: everything line 1 and 2 cut. */
  label: string;
  onPress: () => void;
  rowIndex: number;
  tabIndex: number;
  onFocus: () => void;
  /** Set on the page's own row only, so a page also listed under "Needs a look" is named once. */
  testId?: string;
}

/** One index entry: 44 px and two lines whatever its copy, so every row in a column is one height. */
export function IndexRow({ title, detail, date, attention, selected, label, onPress, rowIndex, tabIndex, onFocus, testId }: IndexRowProps) {
  return (
    <RowButton
      size="lg"
      hoverSurface="lift"
      active={selected}
      data-row-index={rowIndex}
      data-index-row=""
      data-testid={testId}
      tabIndex={tabIndex}
      onFocus={onFocus}
      onClick={onPress}
      aria-label={label}
      aria-current={selected ? "page" : undefined}
      title={label}
      className="grid h-11 flex-none grid-cols-[10px_minmax(0,1fr)_auto] grid-rows-[20px_16px] content-center gap-x-2 gap-y-0 px-2 py-0"
    >
      {attention ? (
        <span aria-hidden className="col-start-1 row-start-1 size-1.5 place-self-center rounded-full bg-[color:var(--color-status-warning)]" />
      ) : null}
      <span
        className={cn(
          "col-start-2 col-end-4 row-start-1 truncate text-body",
          selected ? "text-[color:var(--color-text-primary)]" : "text-[color:var(--color-text-secondary)]",
        )}
      >
        {title}
      </span>
      <span className="col-start-2 row-start-2 truncate text-label text-[color:var(--color-text-tertiary)]">{detail}</span>
      {date ? (
        <span className="col-start-3 row-start-2 whitespace-nowrap text-label tabular-nums text-[color:var(--color-text-tertiary)]">
          {date}
        </span>
      ) : null}
    </RowButton>
  );
}
