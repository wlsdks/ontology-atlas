import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import { matchSlashCommands, slashQuery } from '@/features/acp-session';

import type { SessionState } from './types';

/** Measured: 47 slash commands arrive; listing all of them turns a menu into a wall of scroll. */
const SLASH_MENU_LIMIT = 8;

export function useSlashMenu({
  draft,
  slashCommands,
}: {
  draft: string;
  slashCommands: SessionState['slashCommands'];
}) {
  const [slashDismissed, setSlashDismissed] = useState(false);

  const [slashActive, setSlashActive] = useState(0);
  const slashMatches = useMemo(() => {
    if (slashDismissed) return [];
    const query = slashQuery(draft);
    return query === null ? [] : matchSlashCommands(slashCommands, query).slice(0, SLASH_MENU_LIMIT);
  }, [draft, slashCommands, slashDismissed]);
  const slashOpen = slashMatches.length > 0;

  const slashActiveIndex = slashOpen
    ? Math.min(Math.max(slashActive, 0), slashMatches.length - 1)
    : 0;

  const slashMenuRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    if (!slashOpen) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (slashMenuRef.current?.contains(target ?? null)) return;
      if (target?.closest?.('[data-acp-composer]')) return;
      setSlashDismissed(true);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [slashOpen]);
  return { slashMatches, slashOpen, slashActiveIndex, slashMenuRef, setSlashDismissed, setSlashActive };
}

export function useHistoryMenu({ sessionCount }: { sessionCount: number }) {
  const [historyOpen, setHistoryOpen] = useState(false);

  const historyListRef = useRef<HTMLUListElement | null>(null);
  const [historyEdge, setHistoryEdge] = useState({ top: false, bottom: false });
  const measureHistoryEdges = useCallback(() => {
    const list = historyListRef.current;
    if (!list) return;
    const top = list.scrollTop > 1;
    const bottom = list.scrollTop < list.scrollHeight - list.clientHeight - 1;
    setHistoryEdge((previous) =>
      previous.top === top && previous.bottom === bottom ? previous : { top, bottom },
    );
  }, []);
  useEffect(() => {
    if (!historyOpen) return;
    measureHistoryEdges();
  }, [historyOpen, measureHistoryEdges, sessionCount]);
  return { historyOpen, setHistoryOpen, historyListRef, historyEdge, measureHistoryEdges };
}

export function useHistoryEscape(historyOpen: boolean, setHistoryOpen: Dispatch<SetStateAction<boolean>>) {
  useEffect(() => {
    if (!historyOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setHistoryOpen(false);
    };
    // Capture phase, so the dock's close-one-level handler never sees this Escape and closes the panel.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [historyOpen, setHistoryOpen]);
}
