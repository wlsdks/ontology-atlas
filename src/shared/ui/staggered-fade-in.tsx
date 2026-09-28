'use client';

import { Children, cloneElement, isValidElement, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { useStaggerOnce } from '@/shared/motion/stagger';

interface StaggeredFadeInProps {
  children: ReactNode;
  vaultKey: string;
  scopeKey: string;
  as?: 'div' | 'ul' | 'ol' | 'section';
  className?: string;
  ariaLabel?: string;
}

export function StaggeredFadeIn({
  children,
  vaultKey,
  scopeKey,
  as: Tag = 'div',
  className,
  ariaLabel,
}: StaggeredFadeInProps) {
  const items = Children.toArray(children);
  const ids = items.map((child, index) => String(isValidElement(child) && child.key !== null ? child.key : index));
  const itemProps = useStaggerOnce({ vaultKey, listKey: scopeKey, ids });

  return (
    <Tag className={className} aria-label={ariaLabel}>
      {items.map((child, index) => {
        if (!isValidElement<{ style?: CSSProperties; className?: string }>(child)) return child;
        const stagger = itemProps(ids[index], index);
        if (!stagger.className) return child;
        return cloneElement(child, {
          style: { ...child.props.style, ...stagger.style },
          className: cn(child.props.className, stagger.className),
        });
      })}
    </Tag>
  );
}
