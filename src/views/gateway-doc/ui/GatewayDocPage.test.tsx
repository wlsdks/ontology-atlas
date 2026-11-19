import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { PROSE_COMPONENTS, proseComponentsWithAnchors } from './GatewayDocPage';

/** One of every element the prose map renders, so a renderer that forwards `node` cannot hide. */
const EVERY_ELEMENT = [
  '## Heading two',
  '### Heading three',
  'A paragraph with **strong** text, `inline code` and a [link](/guide/relations).',
  '- bullet',
  '1. numbered',
  '> quoted',
  '---',
  '```ts\nconst block = 1;\n```',
  '| head |\n| --- |\n| cell |',
].join('\n\n');

function render(components: typeof PROSE_COMPONENTS): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={{}}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {EVERY_ELEMENT}
      </ReactMarkdown>
    </NextIntlClientProvider>,
  );
}

describe('gateway prose renderers', () => {
  it.each([
    ['the guide map', PROSE_COMPONENTS],
    ['the changelog map with heading anchors', proseComponentsWithAnchors(new Map([['heading two', 'h-two']]))],
  ])('emit no markdown node attribute in %s', (_label, components) => {
    const html = render(components);
    expect(html).toContain('<h2');
    expect(html).toContain('<td');
    expect(html).not.toMatch(/\snode="/);
  });
});
