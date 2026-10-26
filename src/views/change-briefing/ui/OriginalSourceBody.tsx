import { useLayoutEffect, useMemo, useRef } from 'react';
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { PluggableList } from 'unified';
import { Button } from '@/shared/ui';
import { useArrivalMemory } from '@/shared/lib/navigation/route-arrival-memory';
import { MARKDOWN_PROSE_CLASS } from '@/shared/ui/tokens/markdown-prose';
import { sourcePassages, type NarrativeSource } from '../model/narrative';

type Element = NonNullable<ExtraProps['node']>;
const REMARK_PLUGINS = [remarkGfm];

function externalUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch { return undefined; }
}

const COMPONENTS: Components = {
  a: ({ href, children }) => {
    const url = externalUrl(href);
    return url ? <a href={url} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>;
  },
  img: ({ src, alt }) => {
    const url = externalUrl(typeof src === 'string' ? src : undefined);
    return url ? <a href={url} target="_blank" rel="noopener noreferrer">{alt || url}</a> : <span>{alt}</span>;
  },
  table: ({ children, node: _node, ...props }) => <div className="max-w-full overflow-x-auto"><table {...props}>{children}</table></div>,
};

function annotateSourceBlocks({ source, selected, bodyOffset }: { source: NarrativeSource; selected: string | null; bodyOffset: number }) {
  let offset = 0;
  const ranges = sourcePassages(source).map(passage => {
    const start = offset; offset += passage.text.length;
    return { id: passage.id, start, end: offset };
  });
  return (tree: { children: { type: string }[] }) => {
    let first = 0;
    for (const child of tree.children) {
      if (child.type !== 'element') continue;
      const node = child as Element;
      if (node.position?.start.offset === undefined || node.position.end.offset === undefined) continue;
      const start = node.position.start.offset + bodyOffset;
      const end = node.position.end.offset + bodyOffset;
      while (first < ranges.length && ranges[first].end <= start) first++;
      const ids: string[] = [];
      for (let index = first; index < ranges.length && ranges[index].start < end; index++) ids.push(ranges[index].id);
      node.properties['data-source-passage'] = ids.join(' ');
      if (selected && ids.includes(selected)) {
        node.properties['data-source-selected'] = 'true';
        node.properties.className = ['rounded-card', 'bg-[color:var(--color-overlay-2)]', 'p-3'];
      }
    }
  };
}

export function OriginalSourceBody({ source, passage, memory, readerId, rawLabel, readingLabel }: {
  source: NarrativeSource; passage: string | null; memory: string; readerId: string; rawLabel: string; readingLabel: string;
}) {
  const initial = { readerId, raw: false, located: source.kind !== 'pr' || !passage };
  const [remembered, setDisplay] = useArrivalMemory(`${memory}:reader-format`, initial);
  const display = remembered.readerId === readerId ? remembered : initial;
  const root = useRef<HTMLDivElement>(null);
  const bodyOffset = source.kind === 'pr' && source.text.startsWith(`${source.title}\n\n`) ? source.title.length + 2 : 0;
  const plugins = useMemo<PluggableList>(() => [[annotateSourceBlocks, { source, selected: passage, bodyOffset }]], [source, passage, bodyOffset]);
  const formatted = source.kind === 'pr' && !display.raw;
  useLayoutEffect(() => {
    if (!passage || display.located) return;
    const target = root.current?.querySelector(`[data-source-passage~="${CSS.escape(passage)}"]`);
    setDisplay({ readerId, raw: formatted && target?.getAttribute('data-source-passage')?.split(' ')[0] !== passage, located: true });
  }, [display.located, formatted, passage, readerId, setDisplay]);
  return <div className="space-y-3">
    {source.kind === 'pr' && <Button variant="ghost" size="sm" onClick={() => setDisplay({ readerId, raw: !display.raw, located: true })}>{display.raw ? readingLabel : rawLabel}</Button>}
    <div ref={root}>
      {formatted ? <div className={`min-w-0 max-w-prose break-words text-body-lg ${MARKDOWN_PROSE_CLASS}`} data-testid="briefing-source-reading"><ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={plugins} components={COMPONENTS}>{source.text.slice(bodyOffset)}</ReactMarkdown></div>
        : <div data-testid="briefing-source-text">{sourcePassages(source).map(value => <pre key={value.id} data-source-passage={value.id} data-source-selected={passage === value.id ? 'true' : undefined} className={`whitespace-pre-wrap break-words font-mono text-body ${passage === value.id ? 'rounded-card bg-[color:var(--color-overlay-2)] p-3' : ''}`}>{value.text}</pre>)}</div>}
    </div>
  </div>;
}
