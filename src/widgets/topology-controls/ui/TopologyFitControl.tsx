'use client';

import { useTranslations } from 'next-intl';
import { Maximize2 } from 'lucide-react';
import { ChromeTile, Tooltip } from '@/shared/ui';

interface TopologyFitControlProps {
  /** The "fit the whole map" callback — fits the camera to the graph's bounds on click. */
  onFitView: () => void;
  density?: 'default' | 'compact-focus';
  /** A phone INDEX sheet owns the map area while it is expanded. */
  mobileObscured?: boolean;
}

/**
 * The Fit (fit-to-view) tile on the map's right utility rail. The former
 * `TopologyControls` panel (search, hubs-only, overlay, depth, force sliders,
 * shortcut help) was a dead control board the v2 canvas engine never consumed, so it
 * was demolished and only the Fit callback — which was genuinely live — remains.
 * Touch and keyboard users share the same explicit overview return. It keeps the
 * collapsed stack's first-tile position and token contract
 * (--topology-floating-control-*) so the right rail's "?" tile offset rhythm stays aligned.
 */
export function TopologyFitControl({ onFitView, density = 'default', mobileObscured = false }: TopologyFitControlProps) {
  const t = useTranslations('topologyWidgets.controls');

  return (
    <div
      className={`topology-ui-scale pointer-events-auto absolute bottom-[var(--topology-floating-control-phone-bottom)] right-4 z-20 ${mobileObscured ? 'hidden md:flex' : 'flex'} flex-col gap-2 md:bottom-auto md:right-6 md:top-[var(--topology-floating-control-desktop-top)] xl:right-8`}
      data-testid="topology-fit-control"
      data-agent-dock-adjacent-rail="true"
      data-controls-density={density}
      data-control-phone-bottom-token="--topology-floating-control-phone-bottom"
      data-control-desktop-top-token="--topology-floating-control-desktop-top"
    >
      {/* A flex wrapper has no text line box. At 200% root text, the former plain
          div grew to a 48px line box around this 36px tile and shifted it into
          the tour control below. */}
      <div className="flex">
        <Tooltip content={t('fitViewTooltip')} side="left">
          <ChromeTile
            icon={<Maximize2 />}
            title=""
            aria-label={t('fitViewTooltip')}
            onClick={onFitView}
          />
        </Tooltip>
      </div>
    </div>
  );
}
