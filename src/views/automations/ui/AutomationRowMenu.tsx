'use client';

import { forwardRef, useCallback, useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { IconButton, Surface } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { transientSurface } from '@/shared/ui/surfaces/transient-surface';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

export interface AutomationRowMenuItem {
  label: string;
  icon: ReactNode;
  testId: string;
  danger?: boolean;
  onSelect: () => void;
}

/**
 * A row's less frequent actions, in the app's menu layer above the trigger with right edges
 * aligned. Opening focuses the first item; Escape and a press outside close it.
 */
export const AutomationRowMenu = forwardRef<HTMLButtonElement, {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  items: readonly AutomationRowMenuItem[];
}>(function AutomationRowMenu({ label, open, onOpenChange, disabled = false, items }, triggerRef) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, onOpenChange]);

  // The menu mounts a frame after `open` turns true, so its first item takes focus as it mounts.
  const focusOnMount = useCallback((item: HTMLButtonElement | null) => item?.focus({ preventScroll: true }), []);

  const focusTrigger = () => {
    if (triggerRef && typeof triggerRef !== 'function') triggerRef.current?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    const entries = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = entries.indexOf(document.activeElement as HTMLElement);
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step !== undefined) {
      event.preventDefault();
      entries[(at + step + entries.length) % entries.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      entries[event.key === 'Home' ? 0 : entries.length - 1]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
      focusTrigger();
    } else if (event.key === 'Tab') {
      onOpenChange(false);
    }
  };

  return (
    <div ref={containerRef} className="relative" onKeyDown={onMenuKeyDown}>
      <IconButton ref={triggerRef} label={label} size="lg" hoverInk="strong" hoverSurface="lift" active={open}
        aria-haspopup="menu" aria-controls={open ? menuId : undefined}
        // Only an open menu is announced as expanded: a schedule row never unfolds in place.
        aria-expanded={open || undefined}
        disabled={disabled}
        data-testid="automations-row-menu"
        onClick={() => onOpenChange(!open)}
        className="atlas-touch-floor">
        <MoreHorizontal size={ICON_SIZE.md} aria-hidden />
      </IconButton>
      <Surface ref={menuRef} id={menuId} open={open} origin="bottom right" role="menu" aria-label={label}
        data-testid="automations-row-menu-list" {...transientSurface('menu')}
        className="absolute bottom-full right-0 z-30 mb-1.5 flex w-max min-w-40 flex-col gap-0.5 rounded-card border border-[color:var(--color-indigo-line-a90)] bg-[color:var(--color-elevated)] p-1 shadow-[var(--shadow-elevation-2)]">
        {items.map((item, index) => (
          <button key={item.testId} ref={index === 0 ? focusOnMount : undefined} type="button" role="menuitem" tabIndex={-1} data-testid={item.testId}
            onClick={() => {
              onOpenChange(false);
              item.onSelect();
            }}
            className={controlClass({
              shape: 'row', size: 'sm', tone: item.danger ? 'danger' : 'secondary', hoverSurface: 'lift',
              hoverInk: item.danger ? 'none' : 'strong', className: cn('w-full justify-start gap-2 text-left'),
            })}>
            {item.icon}
            <span className="min-w-0 truncate">{item.label}</span>
          </button>
        ))}
      </Surface>
    </div>
  );
});
