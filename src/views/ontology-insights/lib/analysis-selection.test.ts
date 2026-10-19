import { expect, it } from 'vitest';
import { filterAnalysisItems } from './analysis-selection';

it('matches every query word across recorded names while preserving identity and order', () => {
  const items = [{ id: 'a', names: ['주문', '재고', 'Orders', 'Stock'] }, { id: 'b', names: ['상품', '재고'] }];
  expect(filterAnalysisItems(items, ' 재고   주문 ', item => item.names)).toEqual([items[0]]);
  expect(filterAnalysisItems(items, 'ＯＲＤＥＲＳ stock', item => item.names)[0]).toBe(items[0]);
  expect(filterAnalysisItems(items, 'missing', item => item.names)).toEqual([]);
  expect(filterAnalysisItems(items, '  ', item => item.names)).toBe(items);
  expect(items).toHaveLength(2);
});
