import { X } from "lucide-react";

import { Chip, RowButton } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

/** A group's heading: label left, count right, quiet. 38 px including the gap above it. */
export function IndexGroupHeading({ label, count, locale }: { label: string; count: number; locale: string }) {
  return (
    <div
      role="heading"
      aria-level={3}
      data-index-heading=""
      className="flex h-[38px] flex-none items-center justify-between gap-2 px-2 pt-2 text-label font-[var(--font-weight-emphasis)] tracking-label text-[color:var(--color-text-tertiary)]"
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className="flex-none font-normal tabular-nums">
        {count.toLocaleString(locale)}
      </span>
    </div>
  );
}

/** The line under a cut group, set on the rows' title edge. */
export function IndexGroupMore({
  label,
  onPress,
  rowIndex,
  tabIndex,
  onFocus,
}: {
  label: string;
  onPress: () => void;
  rowIndex: number;
  tabIndex: number;
  onFocus: () => void;
}) {
  return (
    <RowButton
      size="sm"
      hoverSurface="lift"
      data-row-index={rowIndex}
      data-index-more=""
      tabIndex={tabIndex}
      onFocus={onFocus}
      onClick={onPress}
      className="h-8 flex-none py-0 pl-[26px] pr-2"
    >
      <span className="min-w-0 truncate text-label text-[color:var(--color-indigo-accent)]">{label}</span>
    </RowButton>
  );
}

/** The group shown alone: its label and count; pressing it brings the whole index back. */
export function IndexGroupChip({
  label,
  count,
  clearLabel,
  onClear,
  locale,
}: {
  label: string;
  count: number;
  clearLabel: string;
  onClear: () => void;
  locale: string;
}) {
  return (
    <Chip
      size="sm"
      active
      onClick={onClear}
      aria-label={`${label} ${count.toLocaleString(locale)} · ${clearLabel}`}
      title={clearLabel}
      data-index-chip=""
      className="mx-2 mb-0.5 mt-2.5 max-w-[calc(100%-1rem)] gap-2 self-start pr-1.5"
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className="flex-none tabular-nums text-[color:var(--color-text-tertiary)]">{count.toLocaleString(locale)}</span>
      <X aria-hidden size={ICON_SIZE.sm} className="flex-none text-[color:var(--color-text-tertiary)]" />
    </Chip>
  );
}
