"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Settings } from "lucide-react";
import { LocaleSwitch } from "@/features/locale-switch";
import { ThemeToggle } from "@/features/theme-toggle";

/**
 * Topology utility-rail settings gear (`docs/prototypes/chrome-datasheet-final.html`
 * — the RIGHT rail's "설정" icon next to fit-view). Opens a compact machined
 * popover with the three settings an owner needs without leaving the map:
 * 언어 (real locale switch, `LocaleSwitch` — `@/i18n/navigation` locale
 * routing under the hood), 테마 (`ThemeToggle`, same logic used everywhere
 * else), and INDEX 기본 상태 (expanded/collapsed — writes the SAME
 * localStorage key `HomePage.tsx`'s INDEX panel reads via
 * `useLocalStorageBoolean(INDEX_PANEL_COLLAPSED_KEY, …)`, wired through
 * `onChangeIndexDefaultCollapsed`).
 *
 * Transient-surface contract: this is a self-closing anchored popover, not a
 * modal — no dim/backdrop (`.claude/rules/design.md` reserves scrim for
 * blocking composers). It owns its OWN Escape handling and stops the
 * keypress from reaching the window so the topology's global Esc ladder
 * (`resolveTopologyEscLadderAction`) never also acts on the same keypress —
 * the same "one overlay owns one Escape" contract `SearchPalette` and the
 * global search dialog already rely on (see that ladder's `searchOpen`
 * tier's doc comment). Outside-click follows the SAME pattern as
 * `OperationsNav`'s `AppSettingsMenu` (document `mousedown` + a ref check).
 */

export interface TopologyV2SettingsGearLabels {
  /** Gear trigger button aria-label/title. */
  trigger: string;
  /** Popover heading. */
  heading: string;
  locale: string;
  theme: string;
  indexDefault: string;
  indexDefaultExpanded: string;
  indexDefaultCollapsed: string;
}

export interface TopologyV2SettingsGearProps {
  /** Current INDEX-panel-collapsed-by-default preference. */
  indexDefaultCollapsed: boolean;
  onChangeIndexDefaultCollapsed: (next: boolean) => void;
  labels: TopologyV2SettingsGearLabels;
  className?: string;
}

export function TopologyV2SettingsGear({
  indexDefaultCollapsed,
  onChangeIndexDefaultCollapsed,
  labels,
  className,
}: TopologyV2SettingsGearProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      close(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open, close]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    // Own this keypress — the global topology Esc ladder must not ALSO act
    // (e.g. deselect a node) on the same press. See module doc.
    event.stopPropagation();
    close(true);
  };

  // Two wrappers on purpose — outer takes the CALLER's page-level position
  // classes (e.g. `absolute right-6 top-[...]` for the utility rail), inner
  // is always `relative` so the popover can anchor to it. Putting both
  // "relative" and a caller-supplied "absolute" on the SAME element is a
  // cascade footgun: Tailwind's generated stylesheet order (not the class
  // list order in JSX) decides which position wins, so it can silently pick
  // "relative" and leave the whole thing unpositioned (regression found in
  // live QA — the gear rendered off-screen at x:-32).
  return (
    <div className={className ?? "inline-block"}>
      <div ref={rootRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={labels.trigger}
        title={labels.trigger}
        data-testid="topology-v2-settings-gear-trigger"
        className="flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--topology-floating-control-border)] bg-[color:var(--topology-floating-control-surface)] text-[color:var(--topology-floating-control-icon)] shadow-[var(--topology-floating-control-shadow)] transition-colors hover:bg-[color:var(--topology-floating-control-hover-surface)] hover:text-[color:var(--topology-floating-control-icon-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset"
      >
        <Settings className="h-4 w-4" aria-hidden />
      </button>
      {open ? (
        <div
          role="group"
          aria-label={labels.heading}
          data-testid="topology-v2-settings-gear-popover"
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[228px] rounded-md border border-[color:var(--topology-floating-panel-border)] bg-[color:var(--topology-floating-panel-surface)] shadow-[var(--topology-floating-panel-shadow)]"
        >
          <div className="border-b border-[color:var(--topology-floating-panel-divider)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {labels.heading}
          </div>
          <div className="flex flex-col gap-3 p-3">
            <SettingsRow label={labels.locale}>
              <LocaleSwitch />
            </SettingsRow>
            <SettingsRow label={labels.theme}>
              <ThemeToggle />
            </SettingsRow>
            <SettingsRow label={labels.indexDefault}>
              <div
                role="group"
                aria-label={labels.indexDefault}
                className="inline-flex items-center gap-px rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-px text-[11px]"
              >
                {(
                  [
                    { value: false, label: labels.indexDefaultExpanded },
                    { value: true, label: labels.indexDefaultCollapsed },
                  ] as const
                ).map((option) => {
                  const active = option.value === indexDefaultCollapsed;
                  return (
                    <button
                      key={String(option.value)}
                      type="button"
                      onClick={() => onChangeIndexDefaultCollapsed(option.value)}
                      aria-pressed={active}
                      className={[
                        "flex h-8 items-center justify-center rounded-[4px] px-2 font-medium transition-colors",
                        active
                          ? "bg-[color:var(--color-panel)] text-[color:var(--color-text-primary)]"
                          : "text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-secondary)]",
                      ].join(" ")}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </SettingsRow>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}

function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-[color:var(--color-text-tertiary)]">{label}</span>
      {children}
    </div>
  );
}
