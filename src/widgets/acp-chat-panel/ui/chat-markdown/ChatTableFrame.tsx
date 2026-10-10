import type { ReactNode } from 'react';

import { useHorizontalOverflowEdges } from './use-horizontal-overflow-edges';

export function ChatTableFrame({ children }: { children?: ReactNode }) {
  const edges = useHorizontalOverflowEdges<HTMLDivElement>();
  return (
    <div
      data-testid="acp-chat-markdown-table"
      className="my-2 max-w-full overflow-x-auto rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]"
      {...edges}
    >
      {children}
    </div>
  );
}
