import { BrandCompanion, type CompanionLabels } from './brand-companion';
import { BrandWaitingMark } from './brand-waiting-mark';

export function BrandPortrait(props: { expression: 'welcome'; labels: CompanionLabels; busy?: boolean } | { expression: 'curious'; held?: boolean }) {
  const { expression } = props;
  if (props.expression === 'welcome') return <BrandCompanion context={props.busy ? 'waiting' : 'folder'} labels={props.labels} />;
  return (
    <span data-brand-portrait={expression} data-brand-native-size="128" className="inline-flex shrink-0 [&_.atlas-waiting-mark]:align-top">
      <BrandWaitingMark active motion="curious" scale={2} held={props.held} />
    </span>
  );
}
