'use client';

import { useTranslations } from 'next-intl';
import { Maximize2 } from 'lucide-react';
import { ChromeTile, Tooltip } from '@/shared/ui';

interface TopologyFitControlProps {
  /** The "fit the whole map" callback — fits the camera to the graph's bounds on click. */
  onFitView: () => void;
  density?: 'default' | 'compact-focus';
}

/**
 * The Fit (fit-to-view) tile on the map's right utility rail. The former
 * `TopologyControls` panel (search, hubs-only, overlay, depth, force sliders,
 * shortcut help) was a dead control board the v2 canvas engine never consumed, so it
 * was demolished and only the Fit callback — which was genuinely live — remains.
 * Desktop only: mobile fits by pinch-zoom, so the tile is hidden. It keeps the
 * collapsed stack's first-tile position and token contract
 * (--topology-floating-control-*) so the right rail's "?" tile offset rhythm stays aligned.
 */
export function TopologyFitControl({ onFitView, density = 'default' }: TopologyFitControlProps) {
  const t = useTranslations('topologyWidgets.controls');

  return (
    <div
      className="topology-ui-scale pointer-events-auto absolute bottom-[var(--topology-floating-control-phone-bottom)] right-4 z-20 flex flex-col gap-2 md:bottom-auto md:right-6 md:top-[var(--topology-floating-control-desktop-top)] xl:right-8"
      data-testid="topology-fit-control"
      data-agent-dock-adjacent-rail="true"
      data-controls-density={density}
      data-control-phone-bottom-token="--topology-floating-control-phone-bottom"
      data-control-desktop-top-token="--topology-floating-control-desktop-top"
    >
      {/* Desktop only — mobile can fit by pinch-zoom. */}
      <div className="hidden md:block">
        <Tooltip content={t('fitViewTooltip')} side="left" withProvider={false}>
          <ChromeTile
            icon={<Maximize2 />}
            title={t('fitViewTooltip')}
            aria-label={t('fitViewAriaLabel')}
            onClick={onFitView}
          />
        </Tooltip>
      </div>
    </div>
  );
}
