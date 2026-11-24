'use client';

import { useCallback, useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { LandedChange } from '@/shared/lib/work-status/tauri-work-status';
import { LandedLog, landedRowId } from './LandedLog';
import { LandedPanel } from './LandedPanel';

/**
 * A building with no room to draw: the base branch's empty room on top, and under it the work that
 * already landed, which opens beside it as it does under a full building.
 */
export function QuietBuilding({ children, landed, root, baseBranch, nowMs }: {
  children: ReactNode;
  landed: readonly LandedChange[] | null;
  root: string;
  baseBranch: string;
  nowMs: number;
}) {
  const panelId = useId();
  const [hash, setHash] = useState<string | null>(null);
  const selected = landed?.find(change => change.hash === hash) ?? null;
  const select = useCallback((next: string) => setHash(current => (current === next ? null : next)), []);
  const close = useCallback(() => {
    setHash(current => {
      if (current) document.getElementById(landedRowId(current))?.focus();
      return null;
    });
  }, []);
  const closeOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented || selected === null) return;
    event.preventDefault();
    close();
  };
  return (
    <div className="flex min-h-0 flex-1" onKeyDown={closeOnEscape}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto" data-testid="work-quiet-viewport">
        {children}
        <LandedLog changes={landed} baseBranch={baseBranch} nowMs={nowMs} selectedHash={selected?.hash ?? null} onSelect={select} panelId={panelId} />
      </div>
      <LandedPanel change={selected} root={root} nowMs={nowMs} id={panelId} onClose={close} />
    </div>
  );
}
