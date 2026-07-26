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
    // 한글에는 대문자화가 없어 자간만 벌어지고, mono 는 한글이 폴백돼
    // 공백만 등폭으로 남는다 — 「첫 실행」이 「첫  실행」으로 읽힌 원인.
    expect(latinEyebrowClass('ko', 'tracking-[0.2em]')).toBe('');
    expect(latinEyebrowClass('ko-KR')).toBe('');
  });

  it('스크립트 판정은 지역 서브태그를 무시한다', () => {
    expect(isLatinScriptLocale('en-GB')).toBe(true);
    expect(isLatinScriptLocale('KO')).toBe(false);
    // 등록되지 않은 로케일은 보수적으로 비-라틴 취급 — 장식을 잘못 얹는 쪽이
    // 빠뜨리는 쪽보다 비싸다(읽기가 깨진다).
    expect(isLatinScriptLocale('ja')).toBe(false);
  });
});
