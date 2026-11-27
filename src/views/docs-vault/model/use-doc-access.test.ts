import { describe, expect, it } from 'vitest';

import { CodedFailure } from '@/shared/lib/failures/failure-code';
import { readEditableVaultFileText } from './use-doc-access';

const handles = (files: Record<string, Uint8Array<ArrayBuffer>>) =>
  new Map(Object.entries(files).map(([slug, bytes]) => [slug, { getFile: async () => new File([bytes], `${slug}.md`) }]));

describe('the text the docs editor starts from', () => {
  it('is the document as written when it is UTF-8', async () => {
    const read = readEditableVaultFileText(handles({ order: new TextEncoder().encode('# Order\n\n주문') }));
    expect(await read('order')).toBe('# Order\n\n주문');
  });

  it('is refused for a document that is not UTF-8, so a save cannot overwrite its bytes', async () => {
    const read = readEditableVaultFileText(handles({ legacy: Uint8Array.of(0x23, 0x20, 0xb0, 0xe1, 0x0a) }));
    const refusal = await read('legacy').catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(CodedFailure);
    expect((refusal as CodedFailure).code).toBe('not-utf8');
  });
});
