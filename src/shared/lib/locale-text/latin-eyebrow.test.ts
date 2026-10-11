import { describe, expect, it } from 'vitest';
import { isLatinScriptLocale, latinEyebrowClass } from './latin-eyebrow';

describe('latinEyebrowClass — 라틴 전용 장식은 한글에 얹지 않는다 (E-10)', () => {
  it('영문 로케일은 아이브로를 유지한다 — 라틴에서는 정상 신호다', () => {
    expect(latinEyebrowClass('en', 'tracking-[0.2em]')).toBe(
      'font-mono uppercase tracking-[0.2em]',
    );
    expect(latinEyebrowClass('en-US')).toBe('font-mono uppercase');
  });

  it('한국어 로케일은 mono·uppercase·wide tracking 전부 걷는다', () => {
    // Hangul has no capitalisation, so only the tracking widens; and under mono
    // Hangul falls back, leaving only the spaces monospaced — the reason
    // 「First run」 read as 「First  run」.
    expect(latinEyebrowClass('ko', 'tracking-[0.2em]')).toBe('');
    expect(latinEyebrowClass('ko-KR')).toBe('');
  });

  it('스크립트 판정은 지역 서브태그를 무시한다', () => {
    expect(isLatinScriptLocale('en-GB')).toBe(true);
    expect(isLatinScriptLocale('KO')).toBe(false);
    // An unregistered locale is conservatively treated as non-Latin: applying
    // the decoration wrongly costs more than omitting it, because it breaks
    // legibility.
    expect(isLatinScriptLocale('ja')).toBe(false);
  });
});
