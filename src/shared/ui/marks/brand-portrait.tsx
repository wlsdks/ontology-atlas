import { BrandCompanion, type CompanionLabels } from './brand-companion';
import { BrandWaitingMark } from './brand-waiting-mark';

export function BrandPortrait(props: { expression: 'welcome'; labels: CompanionLabels; busy?: boolean } | { expression: 'curious' }) {
  const { expression } = props;
  if (props.expression === 'welcome') return <BrandCompanion context={props.busy ? 'waiting' : 'folder'} labels={props.labels} />;
  return (
    <span data-brand-portrait={expression} data-brand-native-size="128" className="inline-flex size-32 shrink-0">
      <BrandWaitingMark active motion="curious" scale={2} />
    </span>
  );
}
