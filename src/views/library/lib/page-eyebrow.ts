import { latinEyebrowClass } from '@/shared/lib/latin-eyebrow';

export function libraryEyebrowClass(locale: string): string {
  return `text-caption leading-caption text-[color:var(--color-text-quaternary)] ${latinEyebrowClass(locale, 'tracking-[var(--tracking-caps-16)]')}`.trim();
}
