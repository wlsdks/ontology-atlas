'use client';

import { cloneElement, isValidElement, useEffect, useState } from 'react';
import { cn } from '@/shared/lib/cn';

interface StaggeredFadeInProps {
  /** 자식들. `as` 가 list-style 이면 li 들의 배열. */
  children: React.ReactNode;
  /** 한 자식 사이의 stagger 간격 (ms). default 60ms — 디자인 시스템 권장. */
  stagger?: number;
  /** 트랜지션 길이 (ms). default 200ms. */
  duration?: number;
  /** 컨테이너 element 종류 — 의미 있는 wrapper 면 div 가 아닐 수도. */
  as?: 'div' | 'ul' | 'ol' | 'section';
  /** 추가 className — 컨테이너에 적용. */
  className?: string;
  /** Y 이동량 (px). default 8 — Toss/Apple 톤 살짝. */
  translateY?: number;
  /** 컨테이너에 그대로 전달할 aria-label (의미 있는 region wrapper 용). */
  ariaLabel?: string;
}

/**
 * Stagger fade-in — `opacity 0 → 1` + `translateY {y}px → 0` 을 자식들에
 * 순차 적용. 디자인 시스템이 약속한 motion 패턴을 단일 컴포넌트로 통일.
 *
 * 동작:
 * - mount 후 1 tick 뒤에 `opacity` + `transform` 활성화 (initial paint
 *   에서 hidden 상태가 보이지 않게 setTimeout 0).
 * - 각 자식에 `transition-delay = i * stagger` 적용.
 * - `prefers-reduced-motion` 사용자는 즉시 표시 (transition 0).
 *
 * 사용:
 * ```tsx
 * <StaggeredFadeIn as="ol" className="grid gap-3 md:grid-cols-3">
 *   <li>...</li>
 *   <li>...</li>
 *   <li>...</li>
 * </StaggeredFadeIn>
 * ```
 */
export function StaggeredFadeIn({
  children,
  stagger = 60,
  duration = 200,
  as: Tag = 'div',
  className,
  translateY = 8,
  ariaLabel,
}: StaggeredFadeInProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // first paint 에 hidden 상태가 박혀야 transition 이 의미 있게 동작.
    // requestAnimationFrame 으로 다음 frame 에 mounted=true.
    // prefers-reduced-motion 사용자는 child 의 motion-reduce:! 클래스가
    // !important 로 inline style 을 override 하므로 별도 JS 분기 불필요.
    const handle = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(handle);
  }, []);

  const items = Array.isArray(children) ? children : [children];

  return (
    <Tag className={className} aria-label={ariaLabel}>
      {items.map((child, i) =>
        applyTransitionStyle(child, i, {
          mounted,
          duration,
          delay: i * stagger,
          translateY,
        }),
      )}
    </Tag>
  );
}

interface ApplyOptions {
  mounted: boolean;
  duration: number;
  delay: number;
  translateY: number;
}

/**
 * 자식 element 에 inline transition style 을 직접 주입한다.
 *
 * 이전엔 `<span style={display: contents}>` 로 감쌌으나 부모가 `<ol>` / `<ul>`
 * 일 때 `<span>` 이 `<li>` 사이에 삽입돼 HTML invalid + 스크린 리더가 list
 * semantics 를 잃었음. `React.cloneElement` 로 child 자체에 style 을 주입하면
 * DOM 트리는 `<ol><li/><li/></ol>` 그대로 유지된다.
 *
 * 비-element child (string / number / null) 는 그대로 통과 — 호출자는
 * Tag 를 적절히 골라 사용 (ul / ol / div 등).
 */
function applyTransitionStyle(
  child: React.ReactNode,
  index: number,
  { mounted, duration, delay, translateY }: ApplyOptions,
): React.ReactNode {
  if (!isValidElement<{ style?: React.CSSProperties; className?: string }>(child)) {
    return child;
  }
  const existing = child.props.style ?? {};
  const inlineTransition: React.CSSProperties = {
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0)' : `translateY(${translateY}px)`,
    transition: `opacity ${duration}ms ease-out ${delay}ms, transform ${duration}ms ease-out ${delay}ms`,
    willChange: mounted ? undefined : 'opacity, transform',
  };
  return cloneElement(child, {
    key: child.key ?? index,
    style: { ...existing, ...inlineTransition },
    // motion-reduce: 클래스 보존 (prefers-reduced-motion CSS rules 와 호환).
    className: cn(
      child.props.className,
      'motion-reduce:!transform-none motion-reduce:!opacity-100 motion-reduce:!transition-none',
    ),
  });
}
