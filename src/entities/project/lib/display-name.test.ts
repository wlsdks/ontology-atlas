import { describe, expect, it } from 'vitest';
import { projectDisplayName, projectHasDisplayName, readDisplayNames } from './display-name';

describe('projectDisplayName', () => {
  it('draws the locale display name when the document carries one', () => {
    const project = { name: 'Online Store', displayNames: { ko: '온라인 쇼핑몰', en: 'Online Store' } };
    expect(projectDisplayName(project, 'ko')).toBe('온라인 쇼핑몰');
    expect(projectDisplayName(project, 'en')).toBe('Online Store');
    expect(projectHasDisplayName(project, 'ko')).toBe(true);
  });

  it('falls back to the canonical name for a locale the document does not name, or a blank one', () => {
    expect(projectDisplayName({ name: 'Online Store', displayNames: { ko: '  ' } }, 'ko')).toBe('Online Store');
    expect(projectDisplayName({ name: 'Online Store' }, 'ko')).toBe('Online Store');
    expect(projectHasDisplayName({ displayNames: { ko: ' ' } }, 'ko')).toBe(false);
  });
});

describe('readDisplayNames', () => {
  it('collects display_<xx> keys and nothing else', () => {
    expect(
      readDisplayNames({ display_ko: '주문', display_en: 'Orders', display: 'x', display_kor: 'no', title: 'Orders' }),
    ).toEqual({ ko: '주문', en: 'Orders' });
  });

  it('returns undefined when no key is present, so the entity stays honest to the file', () => {
    expect(readDisplayNames({ title: 'Orders' })).toBeUndefined();
    expect(readDisplayNames({ display_ko: '' })).toBeUndefined();
  });
});
