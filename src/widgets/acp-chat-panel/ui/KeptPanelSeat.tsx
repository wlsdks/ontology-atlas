'use client';

import { useLayoutEffect, useRef } from 'react';

import { keptPanels } from '../model/kept-panels';
import type { AcpChatPanelProps } from './chat-panel/types';

export function KeptPanelSeat({ keepKey, props }: { keepKey: string; props: AcpChatPanelProps }) {
  const seatRef = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  useLayoutEffect(() => {
    seatRef.current?.appendChild(keptPanels.seat(keepKey, latest.current));
    return () => keptPanels.leave(keepKey);
  }, [keepKey]);
  useLayoutEffect(() => {
    keptPanels.update(keepKey, props);
  });
  return <div ref={seatRef} className="contents" data-kept-agent-seat={keepKey} />;
}
