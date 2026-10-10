import { createElement, type ReactNode } from 'react';

import { linkSlugs } from '@/features/acp-session';

function markChildren(
  children: ReactNode,
  known: ReadonlySet<string>,
  onHoverSlug: ((slug: string | null) => void) | undefined,
  key: string,
): ReactNode {
  if (typeof children === 'string') {
    const segments = linkSlugs(children, known);
    if (!segments.some((seg) => 'slug' in seg)) return children;
    return segments.map((seg, i) =>
      'slug' in seg ? (
        <span
          key={`${key}-${i}`}
          data-testid="acp-chat-slug"
          data-slug={seg.slug}
          className="cursor-default underline decoration-dotted decoration-[color:var(--color-border-strong)] underline-offset-2 hover:decoration-[color:var(--color-indigo-a46)]"
          onPointerEnter={() => onHoverSlug?.(seg.slug)}
          onPointerLeave={() => onHoverSlug?.(null)}
        >
          {seg.text}
        </span>
      ) : (
        seg.text
      ),
    );
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => markChildren(child, known, onHoverSlug, `${key}-${i}`));
  }
  return children;
}

const SLUG_MARKED_TAGS = ['p', 'li', 'td', 'th', 'code', 'strong', 'em'] as const;

export function slugMarkComponents(
  known: ReadonlySet<string> | undefined,
  onHoverSlug: ((slug: string | null) => void) | undefined,
): Record<string, (props: { children?: ReactNode }) => ReactNode> | undefined {
  if (!known || known.size === 0) return undefined;
  const out: Record<string, (props: { children?: ReactNode }) => ReactNode> = {};
  for (const tag of SLUG_MARKED_TAGS) {
    out[tag] = ({ children, ...rest }) =>
      createElement(tag, rest, markChildren(children, known, onHoverSlug, tag));
  }
  return out;
}
