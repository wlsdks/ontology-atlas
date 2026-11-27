import { describe, expect, it } from 'vitest';

import { CodedFailure, failureCodeOf } from '@/shared/lib/failures/failure-code';
import { readStrictUtf8Text } from './strict-utf8-text';

const bytes = (...values: number[]) => new File([Uint8Array.from(values)], 'note.md');

describe('the text of a vault file about to be written back', () => {
  it('is the file as written when it is UTF-8', async () => {
    await expect(readStrictUtf8Text(new File(['# 주문\n'], 'note.md'), 'capabilities/note.md')).resolves.toBe('# 주문\n');
  });

  it('is refused for a file that is not UTF-8, naming the file', async () => {
    const refusal = await readStrictUtf8Text(bytes(0x23, 0x20, 0xb0, 0xe1, 0x0a), 'capabilities/legacy.md').catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(CodedFailure);
    expect(failureCodeOf(refusal)).toBe('not-utf8');
    expect((refusal as CodedFailure).detail).toBe('capabilities/legacy.md');
  });
});
