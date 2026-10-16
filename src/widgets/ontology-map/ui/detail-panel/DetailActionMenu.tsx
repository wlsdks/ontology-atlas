import { type ReactNode, useEffect, useRef } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { Link } from "@/i18n/navigation";
import { controlClass, Surface } from "@/shared/ui";
import { transientSurface } from "@/shared/ui/surfaces/transient-surface";

export interface DetailActionItem {
  label: string;
  icon: ReactNode;
  testId: string;
  href?: string;
  onSelect?: () => void;
}

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

  if (items.length === 0) return null;
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
        /*
         * The icon-only trigger is the 32px icon step (`lg`) to match the 32px `Button sm` and `Edit`
         * chip in its row. The labelled trigger sets its word in the primary `Button sm`'s type
         * (`text-body-lg`) so "Edit" is not smaller than the primary beside it.
         */
        className={controlClass({
          shape: iconOnly ? "icon" : "chip",
          size: iconOnly ? "lg" : "md",
          tone: "default",
          className:
            (iconOnly ? "" : "py-1 text-body-lg ") +
            "atlas-touch-floor atlas-touch-floor-wide border-[color:var(--map-panel-action-border)] bg-[color:var(--map-panel-action-surface)] hover:border-[color:var(--map-panel-domain-border-hover)] hover:bg-[color:var(--map-panel-row-hover)]",
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
      <Surface
        open={open}
        origin="top right"
        role="menu"
        data-testid={menuTestId}
        {...transientSurface("menu")}
        className="absolute right-0 top-full z-30 mt-1 flex min-w-44 flex-col gap-0.5 rounded-chip border border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] p-1 shadow-[var(--map-panel-shadow)]"
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
              {item.label}
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
              {item.label}
            </button>
          ),
        )}
      </Surface>
    </div>
  );
}
