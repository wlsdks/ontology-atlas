import type { Components } from 'react-markdown';

import { ChatCodeBlock } from './ChatCodeBlock';
import { ChatTableFrame } from './ChatTableFrame';
import { slugMarkComponents } from './slug-marks';

export function chatMarkdownComponents(
  known: ReadonlySet<string> | undefined,
  onHoverSlug: ((slug: string | null) => void) | undefined,
): Components {
  const marked = slugMarkComponents(known, onHoverSlug) ?? {};
  return {
    ...marked,
    pre: ({ node: _node, ...props }) => <ChatCodeBlock {...props} />,
    table: ({ node: _node, ...props }) => (
      <ChatTableFrame>
        <table
          {...props}
          className="w-max min-w-full border-collapse text-left text-label leading-label [&_thead]:bg-[color:var(--color-overlay-2)] [&_tr]:border-b [&_tr]:border-[color:var(--color-divider)] [&_tbody_tr:last-child]:border-b-0 [&_th]:px-2.5 [&_th]:py-2 [&_th]:font-[var(--font-weight-emphasis)] [&_th]:text-[color:var(--color-text-primary)] [&_td]:px-2.5 [&_td]:py-2 [&_td]:align-top [&_td]:text-[color:var(--color-text-secondary)]"
        />
      </ChatTableFrame>
    ),
  };
}
