import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { detectCallout } from './detect-callout';

const paragraph = (...children: unknown[]) => createElement('p', null, ...(children as never[]));

describe('detectCallout', () => {
  it('reads the kind and title from a `[!kind] Title` first line, any case', () => {
    expect(detectCallout([paragraph('[!WARNING] Careful\nbody text')])).toMatchObject({
      kind: 'warning',
      title: 'Careful',
    });
  });

  it('names the callout by its kind when no title follows the marker', () => {
    expect(detectCallout([paragraph('[!tip]', createElement('em', null, 'body'))])).toMatchObject({ kind: 'tip', title: 'TIP' });
  });

  it('keeps the rest of the first paragraph as the body', () => {
    const found = detectCallout([paragraph('[!note] Title\nthe body')])!;
    const rest = found.rest as Array<{ props: { children: unknown[] } }>;
    expect(rest[0]!.props.children).toEqual(['the body']);
  });

  it('drops the first paragraph when the marker line was all of it', () => {
    const found = detectCallout(['\n', paragraph('[!info] Only a title'), paragraph('Next')])!;
    expect((found.rest as unknown[]).length).toBe(2);
  });

  it('leaves ordinary quotes and unknown kinds alone', () => {
    expect(detectCallout([paragraph('just a quote')])).toBeNull();
    expect(detectCallout([paragraph('[!bug] not a kind')])).toBeNull();
    expect(detectCallout(['plain text only'])).toBeNull();
  });
});
