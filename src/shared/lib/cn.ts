import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Tailwind 클래스명 결합 유틸리티.
 * clsx로 조건부 합치고 tailwind-merge로 충돌 해결 (나중 값이 이김).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
