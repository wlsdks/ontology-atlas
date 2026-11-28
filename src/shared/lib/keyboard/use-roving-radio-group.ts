import { useRef, type KeyboardEvent } from "react";

/**
 * Behaviour layer of a radiogroup: roving tabindex, arrow-key wrapping, selection-follows-focus; the
 * container belongs to the site. No Home/End, no Escape handling, no group-level `disabled` (it
 * would remove the only tab stop). A literal `role="radiogroup"` is refused by lint
 * (`handAssembledRoleSelectors` in `eslint.config.mjs`), so a hand-built group comes here.
 */

export interface RovingRadioGroupOptions<T> {
  value: T;
  values: readonly T[];
  onChange: (next: T) => void;
  /** A transition is in flight — locks re-selection only; focus stays alive. Never disables the group. */
  busy?: boolean;
}

interface RovingRadioItemProps {
  ref: (element: HTMLButtonElement | null) => void;
  role: "radio";
  "aria-checked": boolean;
  "aria-disabled": true | undefined;
  tabIndex: 0 | -1;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

export interface RovingRadioGroup {
  groupProps: { role: "radiogroup"; "aria-busy": true | undefined };
  itemProps: (index: number) => RovingRadioItemProps;
  checkedIndex: number;
}

export function useRovingRadioGroup<T>({
  value,
  values,
  onChange,
  busy,
}: RovingRadioGroupOptions<T>): RovingRadioGroup {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const checkedIndex = values.findIndex((v) => v === value);
  // APG: with no checked item, the first item is the tab stop.
  const tabStopIndex = checkedIndex >= 0 ? checkedIndex : 0;

  const select = (index: number) => {
    if (busy) return;
    if (index < 0 || index >= values.length) return;
    itemRefs.current[index]?.focus({ preventScroll: true });
    const next = values[index];
    if (next !== value) onChange(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      select((index + 1) % values.length);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      select((index - 1 + values.length) % values.length);
    } else if (event.key === " ") {
      event.preventDefault();
      select(index);
    }
  };

  return {
    groupProps: { role: "radiogroup", "aria-busy": busy || undefined },
    checkedIndex,
    itemProps: (index) => ({
      ref: (element) => {
        itemRefs.current[index] = element;
      },
      role: "radio",
      "aria-checked": index === checkedIndex,
      "aria-disabled": busy || undefined,
      tabIndex: index === tabStopIndex ? 0 : -1,
      onClick: () => select(index),
      onKeyDown: (event) => handleKeyDown(event, index),
    }),
  };
}
