import type { ReactNode } from 'react';
import type { CopyFeedbackState } from '@/shared/lib/use-copy-feedback';
import { FeedbackGlyph } from './feedback-glyph';
import { WorkGlyph } from './work-glyph';

export type ActionFeedbackState = CopyFeedbackState | 'working';

export function ActionFeedbackGlyph({ state, icon, size }: {
  state: ActionFeedbackState; icon: ReactNode; size: number;
}) {
  const working = state === 'working';
  return (
    <span aria-hidden data-action-feedback={state} className="inline-grid shrink-0" style={{ width: size, height: size }}>
      <span className={`col-start-1 row-start-1 grid place-items-center transition-opacity duration-[var(--motion-fast)] ease-[var(--motion-ease)] ${working ? 'opacity-0' : 'opacity-100'}`}>
        <FeedbackGlyph state={working ? 'idle' : state} icon={icon} size={size} />
      </span>
      {working ? <span className="col-start-1 row-start-1 grid place-items-center"><WorkGlyph phase="running" size={size} inControl /></span> : null}
    </span>
  );
}
