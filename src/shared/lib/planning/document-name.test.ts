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
    ['\u0007', 'untitled.md'],
  ])('turns title row %# into a safe visible file name', (title, expected) => {
    expect(planningDocumentFileName(title, new Set())).toBe(expected);
  });

  it('appends -2, -3 to a name already taken in any letter case', () => {
    expect(planningDocumentFileName('Plan', new Set(['plan.md', 'plan-2.md']))).toBe('Plan-3.md');
  });
});
