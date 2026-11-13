import Image from 'next/image';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { BrandCompanion, type CompanionLabels } from './brand-companion';

export function BrandPortrait(props: { expression: 'welcome'; labels: CompanionLabels; busy?: boolean } | { expression: 'curious' }) {
  const { expression } = props;
  if (props.expression === 'welcome') return <BrandCompanion context={props.busy ? 'waiting' : 'folder'} labels={props.labels} />;
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
