'use client';

import { useLocale } from 'next-intl';

/**
 * 라틴 전용 아이브로(mono + uppercase + wide tracking)를 **라틴 스크립트
 * 로케일에서만** 켠다.
 *
 * `docs/DESIGN-SYSTEM.md` "라틴 전용 장식은 한글에 얹지 않는다"(2026-07-26)의
 * 코드 쪽 단일 출처다. 그 절이 남긴 두 문장이 이 함수의 전부다:
 *
 * - `uppercase` + wide tracking 은 라틴에서 대문자 소제목의 결이지만, 한글에는
 *   대문자화가 없어 **자간만** 벌어진다.
 * - `font-mono`(JetBrains Mono)는 latin 서브셋이라 한글은 폴백되고 **공백만**
 *   등폭 advance 로 남는다 — 그래서 「첫 실행」이 「첫  실행」으로 읽힌다.
 * - 그러나 아이브로 자체는 금지가 아니다. 영문 라벨·탭·범례에서는 정상 신호다.
 *
 * 그래서 조건을 로케일로 내린다. 진입 검수 E-10 실측(1512×950 ko): 첫 화면
 * 12곳이 자간 1.36~2.09px 를 한글에 얹고 있었다.
 *
 * `tracking` 은 호출자가 자기 값을 그대로 넘긴다 — 아이브로마다 폭이 다르고,
 * Tailwind 소스 스캐너가 그 리터럴을 호출 지점에서 보게 두는 편이 안전하다.
 */
const LATIN_SCRIPT_LOCALES = new Set(['en']);

export function isLatinScriptLocale(locale: string): boolean {
  return LATIN_SCRIPT_LOCALES.has(locale.split('-')[0].toLowerCase());
}

export function latinEyebrowClass(locale: string, tracking = ''): string {
  if (!isLatinScriptLocale(locale)) return '';
  return tracking ? `font-mono uppercase ${tracking}` : 'font-mono uppercase';
}

/**
 * 컴포넌트용 — 현재 화면 언어로 아이브로 클래스를 고른다.
 *
 * intl 컨텍스트가 없으면(라벨을 prop 으로 주입받아 provider 없이 렌더되는
 * 위젯 단위 테스트 경로) **장식을 얹지 않는다**. 잘못 얹는 쪽이 빠뜨리는 쪽보다
 * 비싸다 — 한글 위의 아이브로는 읽기를 깨고, 영문에서 빠진 아이브로는 결이
 * 밋밋해질 뿐이다. 앱 런타임에는 `app/[locale]/layout.tsx` 가 항상 provider 를
 * 두르므로 이 폴백은 테스트/스토리 경로만 탄다.
 */
export function useLatinEyebrow(tracking = ''): string {
  let locale: string | null = null;
  try {
    // 훅 자체는 조건 없이 호출된다(호출 순서 불변) — throw 는 컨텍스트 부재일 때만.
    locale = useLocale();
  } catch {
    locale = null;
  }
  return locale === null ? '' : latinEyebrowClass(locale, tracking);
}
