import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { Chip } from '@/shared/ui';
import { copyText } from '@/shared/lib/copy-text';

import { useHorizontalOverflowEdges } from './use-horizontal-overflow-edges';

export function ChatCodeBlock({ children, ...rest }: { node?: unknown; children?: ReactNode }) {
  const t = useTranslations('acpChat');
  const [copied, setCopied] = useState(false);
  const edges = useHorizontalOverflowEdges<HTMLPreElement>();
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <div className="my-2 grid gap-1 justify-items-start">
      <pre data-testid="acp-chat-code-block" {...rest} {...edges} className="atlas-scroll-quiet w-full">
        {children}
      </pre>
      <Chip
        data-testid="acp-chat-code-copy"
        size="sm"
        tone="muted"
        hoverInk="strong"
        onClick={() => {

          void copyText(edges.ref.current?.textContent ?? '').then((ok) => setCopied(ok));
        }}
      >
        {t(copied ? 'codeCopied' : 'codeCopy')}
      </Chip>
    </div>
  );
}
