import { describe, expect, it } from 'vitest';

import { notMappedAreas } from './not-mapped-areas';

const project = (uncertainty: string, before = '') =>
  `A banking core.\n\n${before}## Includes\n\n- Loans\n\n## Uncertainty\n\n${uncertainty}\n\n## Related\n\n- Not mapped yet: 9 of 9 areas.\n`;

describe('notMappedAreas', () => {
  it('reads the count the project keeps under Uncertainty', () => {
    const body = project('Not mapped yet: 12 of 45 areas.\n- `src/loans` (30 abilities, 2 capabilities)\n- `src/savings`');
    expect(notMappedAreas(body)).toEqual({ remaining: 12, total: 45 });
  });

  it('reads one area in the singular and zero remaining', () => {
    expect(notMappedAreas(project('- Not mapped yet: 1 of 1 area.'))).toEqual({ remaining: 1, total: 1 });
    expect(notMappedAreas(project('Not mapped yet: 0 of 45 areas.'))).toEqual({ remaining: 0, total: 45 });
  });

  it('ignores the same line outside the Uncertainty section', () => {
    expect(notMappedAreas(project('Nothing is uncertain.', 'Not mapped yet: 3 of 8 areas.\n\n'))).toBeNull();
    expect(notMappedAreas('Not mapped yet: 3 of 8 areas.\n')).toBeNull();
  });

  it('rejects a count of zero areas and more remaining than there are', () => {
    expect(notMappedAreas(project('Not mapped yet: 0 of 0 areas.'))).toBeNull();
    expect(notMappedAreas(project('Not mapped yet: 9 of 8 areas.'))).toBeNull();
  });
});
