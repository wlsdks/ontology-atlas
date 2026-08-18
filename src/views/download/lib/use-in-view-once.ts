'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 뷰포트에 처음 들어온 순간 한 번 참이 되는 훅 — 관문의 「등장 후 영구 정지」
 * 문법의 발화 장치다. 등장 안무는 절이 눈앞에 올 때 한 번 일어나고, 다시
 * 되감지 않는다(스크롤할 때마다 움직이는 화면은 정보가 아니라 소음이다).
 *
 * `IntersectionObserver` 가 없는 환경(jsdom · 구형 브라우저)에서는 **즉시
 * 보이는 것으로** 판정한다 — 안무를 잃는 쪽이 내용을 잃는 쪽보다 낫다.
 */
export function useInViewOnce<T extends HTMLElement>(
  threshold = 0.18,
): { ref: React.RefObject<T | null>; inView: boolean } {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      // rAF 콜백이라 effect 본문의 동기 setState 가 아니다.
      const id = requestAnimationFrame(() => setInView(true));
      return () => cancelAnimationFrame(id);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, threshold]);

  return { ref, inView };
}
