import { memo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { detachedCopy } from '@/shared/lib/detached-copy';

import { splitMarkdownBlocks } from '../../model/markdown-blocks';

const REMARK_PLUGINS = [remarkGfm];

const MarkdownBlock = memo(function MarkdownBlock({
  text,
  components,
}: {
  text: string;
  components: Components;
}) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
      {text}
    </ReactMarkdown>
  );
});

function settleBlocks(text: string, previous: readonly string[]): readonly string[] {
  return splitMarkdownBlocks(text).map((piece, index) =>
    previous[index] === piece ? previous[index] : detachedCopy(piece),
  );
}

export const ChatMarkdown = memo(function ChatMarkdown({
  text,
  components,
}: {
  text: string;
  components: Components;
}) {
  const [settled, setSettled] = useState(() => ({ text, blocks: settleBlocks(text, []) }));
  let blocks = settled.blocks;
  if (settled.text !== text) {
    blocks = settleBlocks(text, settled.blocks);
    setSettled({ text, blocks });
  }
  return blocks.map((block, index) => (
    <MarkdownBlock key={index} text={block} components={components} />
  ));
});
