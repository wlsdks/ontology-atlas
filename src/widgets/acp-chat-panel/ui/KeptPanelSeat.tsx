'use client';

import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';

import { folderHolder, keptPanels } from '../model/kept-panels';
import type { AcpChatPanelProps } from './chat-panel/types';

/**
 * While another conversation's turn holds this folder, this one is seated with its session off:
 * it starts and resumes nothing, and its Stop is that turn's.
 */
export function useFolderBusy(keepKey: string, vaultRoot: string | null): AcpChatPanelProps['folderBusy'] {
  const stop = useSyncExternalStore(
    keptPanels.subscribe,
    () => folderHolder(keepKey, vaultRoot)?.stop ?? null,
    () => null,
  );
  return stop ? { stop } : null;
}

export function KeptPanelSeat({ keepKey, props }: { keepKey: string; props: AcpChatPanelProps }) {
  const seatRef = useRef<HTMLDivElement>(null);
  const folderBusy = useFolderBusy(keepKey, props.vaultRoot);
  const seated = folderBusy ? { ...props, sessionEnabled: false, folderBusy } : props;
  const latest = useRef(seated);
  useLayoutEffect(() => {
    latest.current = seated;
  });
  useLayoutEffect(() => {
    seatRef.current?.appendChild(keptPanels.seat(keepKey, latest.current));
    return () => keptPanels.leave(keepKey);
  }, [keepKey]);
  useLayoutEffect(() => {
    keptPanels.update(keepKey, seated);
  });
  return <div ref={seatRef} className="contents" data-kept-agent-seat={keepKey} />;
}
