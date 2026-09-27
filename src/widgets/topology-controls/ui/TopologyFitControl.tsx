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
 * The fit-to-view tile on the map's right rail; keeps the first-tile position tokens
 * (--topology-floating-control-*) so the rail's rhythm stays aligned.
 */
export function TopologyFitControl({ onFitView, density = 'default', mobileObscured = false }: TopologyFitControlProps) {
  const t = useTranslations('topologyWidgets.controls');

  return (
    <div
      className={`topology-ui-scale pointer-events-auto absolute bottom-[var(--topology-floating-control-phone-bottom)] right-4 z-20 ${mobileObscured ? 'hidden md:flex' : 'flex'} flex-col gap-2 md:bottom-auto md:right-[var(--chrome-inset)] md:top-[var(--topology-floating-control-desktop-top)]`}
      data-testid="topology-fit-control"
      data-agent-dock-adjacent-rail="true"
      // The rail column is chrome on the map; map fits keep clear of it
      // (`widgets/ontology-map/interaction/free-area.ts#measureEdgeFitObstacle`).
      data-map-fit-obstacle="right"
      data-controls-density={density}
      data-control-phone-bottom-token="--topology-floating-control-phone-bottom"
      data-control-desktop-top-token="--topology-floating-control-desktop-top"
    >
      {/* A flex wrapper has no line box, so 200% root text cannot grow it around the tile. */}
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
