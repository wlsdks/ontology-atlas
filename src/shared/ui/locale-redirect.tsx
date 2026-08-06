'use client';

import { useEffect } from 'react';
import { withBasePath } from '../lib/base-path';

const STORAGE_KEY = 'ontology-atlas:locale';
type Supported = 'en' | 'ko';

function detect(): Supported {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'ko') return stored;
  } catch {
    // localStorage unavailable — fall through to browser hint
  }
  const lang = (navigator.language || 'en').toLowerCase();
  return lang.startsWith('ko') ? 'ko' : 'en';
}

/**
 * **`/` 는 언어만 판정한다.** 마지막으로 본 라우트로 복원하지 않는다.
 *
 * ## 왜 복원을 지웠나 (2026-07-30, 소유자 확정)
 *
 * 라우트 복원은 **앱**의 미덕이다 — 작업하던 자리로 돌아가기. **관문**에서는
 * 악덕이다: 이 사이트의 얼굴이 방문자의 과거에 따라 달라지고, 그래서 **소유자조차
 * 자기 첫인상을 볼 수 없다.**
 *
 * 실제로 그 값을 치렀다. 소유자가 `/` 를 열면 계속 `/ko/topology/` 가 나와서
 * *"이 페이지 아직도 지도로 redirect 되네?"* 라고 결함으로 보고했는데, 코드는
 * 설계대로 동작하고 있었다 — 그 브라우저에 `/ko/topology/` 기억이 있었을 뿐이다.
 * **결함이 아닌데 결함처럼 보이는 화면은 결함이다.** 링크를 공유해도 받는 사람이
 * 무엇을 볼지 보내는 사람이 모른다.
 *
 * **앱 사용자가 잃는 것은 없다.** 앱에서 `/` 는 볼트가 있으니 지도로 간다
 * (`isGatewaySurface()`). 복원이 벌어 주던 것이 앱에서는 다른 경로로 이미 있다.
 *
 * 되돌릴 조건: 앱/웹 사용자가 매 진입마다 지도를 다시 찾아가는 것이 관측되면
 * — 그때는 복원을 되살리는 게 아니라 **관문에서 지도로 가는 길**을 손본다.
 */
export function LocaleRedirect() {
  useEffect(() => {
    window.location.replace(withBasePath(`/${detect()}/`));
  }, []);

  return (
    <div
      className="flex min-h-[60vh] items-center justify-center"
      style={{
        minHeight: '60vh',
        // 디자인 토큰 참조 — hardcoded hex 대신 var() 를 써서 토큰 변경이
        // 이 redirect 화면에도 자동 반영되게 한다 (design.md 토큰 규율).
        background: 'var(--color-canvas)',
        color: 'var(--color-text-secondary)',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <p
        className="text-body-lg text-[color:var(--color-text-tertiary)]"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          margin: 0,
          fontSize: '0.875rem',
        }}
      >
        Opening Ontology Atlas…
        {/* raw <a>, not next/link — this root redirect fallback must survive failed hydration */}
        <a style={{ color: 'var(--color-indigo-accent)' }} href={withBasePath('/en/')}>
          English
        </a>
        <span aria-hidden="true">·</span>
        {/* raw <a>, not next/link — this root redirect fallback must survive failed hydration */}
        <a style={{ color: 'var(--color-indigo-accent)' }} href={withBasePath('/ko/')}>
          한국어
        </a>
        <noscript>
          JavaScript is required for automatic routing.
        </noscript>
      </p>
    </div>
  );
}
