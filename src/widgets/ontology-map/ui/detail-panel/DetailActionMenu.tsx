import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { Link } from "@/i18n/navigation";
import { controlClass, Surface } from "@/shared/ui";
import { transientSurface } from "@/shared/ui/surfaces/transient-surface";
import { panelActionClass } from "./PanelFooter";

export interface DetailActionItem {
  label: string;
  icon: ReactNode;
  testId: string;
  href?: string;
  onSelect?: () => void;
}

const TRIGGER_SKIN =
  "atlas-touch-floor atlas-touch-floor-wide border-[color:var(--map-panel-action-border)] bg-[color:var(--map-panel-action-surface)] hover:border-[color:var(--map-panel-domain-border-hover)] hover:bg-[color:var(--map-panel-row-hover)]";

/** The panel's own side padding, kept between an open menu and the panel's left edge. */
function panelLeftLimit(anchor: HTMLElement): number {
  const panel = anchor.closest<HTMLElement>('[data-testid="map-detail-panel"]');
  if (!panel) return 0;
  const pad = Number.parseFloat(getComputedStyle(panel).getPropertyValue("--map-panel-pad")) || 0;
  return panel.getBoundingClientRect().left + pad;
}

/** One action stands as itself, labelled with its own name; two or more open a menu above the trigger. */
export function DetailActionMenu({
  label,
  triggerTestId,
  menuTestId,
  iconOnly = false,
  open,
  onOpenChange,
  items,
}: {
  label: string;
  triggerTestId: string;
  menuTestId: string;
  iconOnly?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly DetailActionItem[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [maxWidthPx, setMaxWidthPx] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onOpenChange(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, onOpenChange]);

  // The menu keeps its right edge on the trigger's, so its width stops at the panel's left padding.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!open || !container) return;
    setMaxWidthPx(container.getBoundingClientRect().right - panelLeftLimit(container));
  }, [open]);

  if (items.length === 0) return null;
  if (items.length === 1) {
    const [only] = items as [DetailActionItem];
    return only.href ? (
      <Link href={only.href} data-testid={only.testId} className={panelActionClass(false)}>
        {only.label}
      </Link>
    ) : (
      <button type="button" data-testid={only.testId} onClick={only.onSelect} className={panelActionClass(false)}>
        {only.label}
      </button>
    );
  }
  const itemClass = controlClass({
    shape: "row",
    size: "sm",
    tone: "secondary",
    className:
      "gap-2 rounded-micro px-2 hover:bg-[color:var(--map-panel-row-hover)] hover:text-[color:var(--map-panel-text-primary)]",
  });
  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        data-testid={triggerTestId}
        onClick={() => onOpenChange(!open)}
        // The icon-only trigger is the 32px icon step (`lg`), the height of the `Button sm` in its row.
        className={controlClass({
          shape: iconOnly ? "icon" : "chip",
          size: iconOnly ? "lg" : "md",
          tone: "default",
          className: TRIGGER_SKIN,
        })}
      >
        {iconOnly ? <MoreHorizontal size={ICON_SIZE.md} aria-hidden /> : label}
        {!iconOnly ? (
          <ChevronDown
            size={ICON_SIZE.sm}
            aria-hidden
            className="transition-transform duration-[var(--motion-fast)]"
            style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        ) : null}
      </button>
      {/* A layer above the panel: the app's menu surface, the popover elevation and a line-ramp edge. */}
      <Surface
        open={open}
        origin="bottom right"
        role="menu"
        aria-label={label}
        data-testid={menuTestId}
        {...transientSurface("menu")}
        style={maxWidthPx === null ? undefined : { maxWidth: maxWidthPx }}
        className="absolute bottom-full right-0 z-30 mb-1.5 flex w-max min-w-44 flex-col gap-0.5 rounded-card border border-[color:var(--color-indigo-line-a90)] bg-[color:var(--color-elevated)] p-1 shadow-[var(--shadow-elevation-2)]"
      >
        {items.map((item) =>
          item.href ? (
            <Link
              key={item.testId}
              href={item.href}
              role="menuitem"
              data-testid={item.testId}
              onClick={() => onOpenChange(false)}
              className={itemClass}
            >
              {item.icon}
              <span className="min-w-0 truncate">{item.label}</span>
            </Link>
          ) : (
            <button
              key={item.testId}
              type="button"
              role="menuitem"
              data-testid={item.testId}
              onClick={() => {
                onOpenChange(false);
                item.onSelect?.();
              }}
              className={itemClass}
            >
              {item.icon}
              <span className="min-w-0 truncate">{item.label}</span>
            </button>
          ),
        )}
      </Surface>
    </div>
  );
}
