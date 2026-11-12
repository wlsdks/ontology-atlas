import Image from 'next/image';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { BrandWaitingMark } from './brand-waiting-mark';

export function BrandPortrait({ expression }: { expression: 'welcome' | 'curious' }) {
  if (expression === 'welcome') return <BrandWaitingMark active motion="greeting" />;
  return (
    <Image
      src={withBasePath(`/brand/mascot-${expression}.png`)}
      width={32}
      height={32}
      alt=""
      aria-hidden="true"
      draggable={false}
      unoptimized
      data-brand-portrait={expression}
      data-brand-native-size="32"
      className="atlas-inline-waiting-mark size-8 shrink-0"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
