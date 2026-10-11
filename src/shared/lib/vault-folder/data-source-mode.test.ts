import { describe, expect, it } from 'vitest';
import { getDataSourceMode } from './data-source-mode';

describe('getDataSourceMode', () => {
  it('vault loaded → local (사용자 디스크 = 진실원)', () => {
    expect(getDataSourceMode({ vaultLoaded: true })).toBe('local');
  });

  it('vault 미선택 → static (빌드타임 dogfood manifest)', () => {
    expect(getDataSourceMode({ vaultLoaded: false })).toBe('static');
  });
});
