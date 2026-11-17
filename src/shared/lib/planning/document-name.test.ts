import { describe, expect, it } from 'vitest';
import { planningDocumentFileName } from './document-name';

describe('planningDocumentFileName', () => {
  it.each([
    ['Checkout redesign', 'Checkout-redesign.md'],
    ['  a:b/c*d?"e"<f>|g\\h  ', 'abcdefgh.md'],
    ['tabs\tand\n\nlines', 'tabs-and-lines.md'],
    ['..hidden plan', 'hidden-plan.md'],
    ['결제 개편', '결제-개편.md'],
    ['???', 'untitled.md'],
    ['CON', 'CON-document.md'],
    ['lpt1', 'lpt1-document.md'],
    ['Console', 'Console.md'],
    ['\u0007', 'untitled.md'],
    ['​', 'untitled.md'],
  ])('turns title row %# into a safe visible file name', (title, expected) => {
    expect(planningDocumentFileName(title, [])).toBe(expected);
  });

  it('appends -2, -3 to a name already taken in any letter case', () => {
    expect(planningDocumentFileName('Plan', ['plan.md', 'PLAN-2.md'])).toBe('Plan-3.md');
  });

  it('treats a decomposed name on disk as taken by the same composed title', () => {
    expect(planningDocumentFileName('Résumé'.normalize('NFD'), [`${'résumé'.normalize('NFD')}.md`])).toBe(`${'Résumé'.normalize('NFC')}-2.md`);
  });

  it('keeps a long title within 200 UTF-8 bytes before its suffix and extension', () => {
    const bytes = (value: string) => new TextEncoder().encode(value).length;
    for (const title of ['가'.repeat(120), '😀'.repeat(120), 'a'.repeat(300)]) {
      expect(bytes(planningDocumentFileName(title, []).replace(/\.md$/, ''))).toBeLessThanOrEqual(200);
    }
  });
});
