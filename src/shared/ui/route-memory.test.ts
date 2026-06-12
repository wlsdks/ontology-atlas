import { describe, expect, it } from 'vitest';
import { isRestorableRoute } from './route-memory';

describe('RouteMemory', () => {
  it('locale 하위 작업 surface 만 복원 대상으로 허용한다', () => {
    expect(isRestorableRoute('/en/topology/')).toBe(true);
    expect(isRestorableRoute('/ko/ontology/')).toBe(true);
    expect(isRestorableRoute('/en/docs')).toBe(true);
  });

  it('locale root 와 외부 URL 형태는 복원하지 않는다', () => {
    expect(isRestorableRoute('/en/')).toBe(false);
    expect(isRestorableRoute('/ko/')).toBe(false);
    expect(isRestorableRoute('/topology/')).toBe(false);
    expect(isRestorableRoute('//example.com')).toBe(false);
    expect(isRestorableRoute('https://example.com/en/topology/')).toBe(false);
    expect(isRestorableRoute('/en/<script>')).toBe(false);
  });
});
