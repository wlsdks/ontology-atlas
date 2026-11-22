"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button, Surface, controlClass } from "@/shared/ui";
import { transientSurface } from "@/shared/ui/surfaces/transient-surface";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

export interface ProjectMenuItem {
  label: string;
  icon: ReactNode;
  testId: string;
  href?: string;
  /** Runs after the menu has closed and focus is back on its trigger. */
  onSelect?: (trigger: HTMLButtonElement) => void;
  disabled?: boolean;
  describedBy?: string;
}

const ITEM_CLASS = controlClass({
  shape: "row",
  size: "md",
  tone: "secondary",
  hoverSurface: "lift",
  hoverInk: "strong",
  className: "w-full gap-2.5 whitespace-nowrap px-2.5 text-left",
});

export function ProjectMoreMenu({ label, items }: { label: string; items: readonly ProjectMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    const enabled = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
    const index = enabled.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "ArrowDown" ? (index + 1) % enabled.length
        : event.key === "ArrowUp" ? (index - 1 + enabled.length) % enabled.length
          : event.key === "Home" ? 0
            : event.key === "End" ? enabled.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    enabled[next]?.focus();
  };
  const select = (item: ProjectMenuItem) => {
    close();
    if (triggerRef.current) item.onSelect?.(triggerRef.current);
  };

  return (
    <div ref={containerRef} className="relative" onKeyDown={onMenuKeyDown}>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        data-testid="project-detail-more"
        onClick={() => setOpen((value) => !value)}
        className="atlas-touch-floor w-8 px-0"
      >
        <MoreHorizontal size={ICON_SIZE.md} aria-hidden />
      </Button>
      <Surface
        ref={menuRef}
        open={open}
        origin="top right"
        role="menu"
        aria-label={label}
        data-testid="project-detail-more-menu"
        {...transientSurface("menu")}
        className="absolute top-full right-0 z-10 mt-1.5 flex min-w-56 flex-col gap-px rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-1 shadow-[var(--shadow-elevation-2)]"
      >
        {items.map((item) =>
          item.href ? (
            <Link
              key={item.testId}
              href={item.href}
              role="menuitem"
              tabIndex={-1}
              data-testid={item.testId}
              onClick={() => setOpen(false)}
              className={ITEM_CLASS}
            >
              {item.icon}
              {item.label}
            </Link>
          ) : (
            <button
              key={item.testId}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              aria-describedby={item.describedBy}
              data-testid={item.testId}
              onClick={() => select(item)}
              className={ITEM_CLASS}
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
