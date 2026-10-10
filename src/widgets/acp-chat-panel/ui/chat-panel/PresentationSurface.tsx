import type { ComponentProps } from 'react';

import { Surface } from '@/shared/ui';

import { AcpPresentationPanel } from '../AcpPresentationPanel';
import type { ChatT } from './types';

type PanelProps = ComponentProps<typeof AcpPresentationPanel>;

interface PresentationSurfaceProps {
  t: ChatT;
  visible: boolean;
  trace: PanelProps['trace'] | null;
  activeIndex: number;
  onChangeScene: PanelProps['onChangeScene'];
  onFocusCitation: PanelProps['onFocusCitation'];
  onOpenMap: PanelProps['onOpenMap'];
  onAsk: PanelProps['onAsk'];
  onClose: PanelProps['onClose'];
}

export function PresentationSurface({
  t,
  visible,
  trace,
  activeIndex,
  onChangeScene,
  onFocusCitation,
  onOpenMap,
  onAsk,
  onClose,
}: PresentationSurfaceProps) {
  return (
    <Surface
      open={visible}
      as="section"
      motion="overlay"
      role="region"
      aria-label={t('presentation.ariaLabel')}
      data-testid="acp-presentation-surface"
      className="absolute inset-0 flex min-h-0 flex-col bg-[color:var(--color-canvas)]"
    >
      <AcpPresentationPanel
        trace={trace!}
        activeIndex={Math.min(activeIndex, (trace?.scenes.length ?? 1) - 1)}
        onChangeScene={onChangeScene}
        onFocusCitation={onFocusCitation}
        onOpenMap={onOpenMap}
        onAsk={onAsk}
        onClose={onClose}
      />
    </Surface>
  );
}
