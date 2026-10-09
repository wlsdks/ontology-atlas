import { expect, it } from 'vitest';
import { visibleAnalysisItems } from './analysis-selection';

it('keeps a later selected claim visible without increasing the bound or duplicating it', () => {
  const items = Array.from({ length: 54 }, (_, index) => ({ id: String(index) }));
  const shown = visibleAnalysisItems(items, 6, '22', item => item.id);
  expect(shown.map(item => item.id)).toEqual(['22', '0', '1', '2', '3', '4']);
  expect(new Set(shown).size).toBe(6);
  expect(items[0].id).toBe('0');
});
it('never inserts a selected identity from another scope', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  expect(visibleAnalysisItems(items, 1, 'other-vault', item => item.id)).toEqual([items[0]]);
  expect(visibleAnalysisItems(items, 0, 'b', item => item.id)).toEqual([]);
});
