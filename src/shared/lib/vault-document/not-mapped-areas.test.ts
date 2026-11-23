import { describe, expect, it } from 'vitest';

import { notMappedAreas } from './not-mapped-areas';

const project = (uncertainty: string, before = '') =>
  `A banking core.\n\n${before}## Includes\n\n- Loans\n\n## Uncertainty\n\n${uncertainty}\n\n## Related\n\n- Not mapped yet: 9 of 9 areas, 90 of 90 abilities.\n`;

describe('notMappedAreas', () => {
  it('reads the areas and abilities the project keeps under Uncertainty', () => {
    const body = project('Not mapped yet: 12 of 45 areas, 300 of 383 abilities.\n- Not mapped yet: src/loans (30 abilities, 2 capabilities)');
    expect(notMappedAreas(body)).toEqual({ remaining: 12, total: 45, abilitiesUncovered: 300, abilitiesTotal: 383 });
  });

  it('reads one area in the singular, a list marker, and zero remaining', () => {
    expect(notMappedAreas(project('- Not mapped yet: 1 of 1 area, 2 of 3 abilities.'))).toEqual({ remaining: 1, total: 1, abilitiesUncovered: 2, abilitiesTotal: 3 });
    expect(notMappedAreas(project('Not mapped yet: 0 of 45 areas, 0 of 383 abilities.'))).toEqual({ remaining: 0, total: 45, abilitiesUncovered: 0, abilitiesTotal: 383 });
  });

  it('treats a line in the earlier form, without abilities, as absent', () => {
    expect(notMappedAreas(project('Not mapped yet: 12 of 45 areas.\n- Not mapped yet: src/loans (30 abilities, 2 capabilities)'))).toBeNull();
  });

  it('ignores the same line outside the Uncertainty section', () => {
    expect(notMappedAreas(project('Nothing is uncertain.', 'Not mapped yet: 3 of 8 areas, 4 of 20 abilities.\n\n'))).toBeNull();
    expect(notMappedAreas('Not mapped yet: 3 of 8 areas, 4 of 20 abilities.\n')).toBeNull();
  });

  it('rejects zero areas or abilities and more remaining than there are', () => {
    expect(notMappedAreas(project('Not mapped yet: 0 of 0 areas, 0 of 5 abilities.'))).toBeNull();
    expect(notMappedAreas(project('Not mapped yet: 9 of 8 areas, 1 of 5 abilities.'))).toBeNull();
    expect(notMappedAreas(project('Not mapped yet: 1 of 8 areas, 0 of 0 abilities.'))).toBeNull();
    expect(notMappedAreas(project('Not mapped yet: 1 of 8 areas, 6 of 5 abilities.'))).toBeNull();
  });

  it('rejects a count too large to hold exactly', () => {
    expect(notMappedAreas(project('Not mapped yet: 1 of 8 areas, 5 of 99999999999999999999 abilities.'))).toBeNull();
    expect(notMappedAreas(project('Not mapped yet: 1 of 8 areas, 99999999999999999998 of 99999999999999999999 abilities.'))).toBeNull();
  });
});
