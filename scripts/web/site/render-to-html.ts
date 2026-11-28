import type { ReactElement } from 'react';
import { prerenderToNodeStream } from 'react-dom/static';

/**
 * A page's element as the text of its document. Without a limit React sets a large boundary aside as a hidden
 * segment that a script moves into place, which a reader without scripts would never see.
 */
export async function renderToHtml(element: ReactElement): Promise<string> {
  const { prelude } = await prerenderToNodeStream(element, { progressiveChunkSize: Number.POSITIVE_INFINITY });
  const chunks: Buffer[] = [];
  for await (const chunk of prelude) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}
