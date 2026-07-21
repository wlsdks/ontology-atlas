'use client';

import { useTranslations } from 'next-intl';
import { Maximize2 } from 'lucide-react';
import { ChromeTile, Tooltip } from '@/shared/ui';

interface TopologyFitControlProps {
  /** "지도 전체 맞추기" 콜백 — 클릭 시 카메라를 그래프 bounds 에 맞춘다. */
  onFitView: () => void;
  density?: 'default' | 'compact-focus';
}

/**
 * 지도 우측 유틸리티 레일의 Fit(전체 맞추기) 타일. 과거 `TopologyControls`
 * 패널(검색·허브만·overlay·depth·force 슬라이더·단축키 도움말)은 v2 캔버스
 * 엔진이 소비하지 않는 죽은 제어반이라 철거됐고, 실제로 살아 있던 Fit 콜백만
 * 남긴다. 데스크톱 전용 — 모바일은 pinch-zoom 으로 맞추므로 타일을 숨긴다.
 * 접힘 스택의 첫 타일 위치·토큰 계약(--topology-floating-control-*)을 그대로
 * 유지해 우측 레일 "?" 타일 오프셋 리듬이 어긋나지 않게 한다.
 */
export function TopologyFitControl({ onFitView, density = 'default' }: TopologyFitControlProps) {
  const t = useTranslations('topologyWidgets.controls');

  return (
    <div
      className="topology-ui-scale pointer-events-auto absolute bottom-[var(--topology-floating-control-phone-bottom)] right-4 z-20 flex flex-col gap-2 md:bottom-auto md:right-6 md:top-[var(--topology-floating-control-desktop-top)] xl:right-8"
      data-testid="topology-fit-control"
      data-controls-density={density}
      data-control-phone-bottom-token="--topology-floating-control-phone-bottom"
      data-control-desktop-top-token="--topology-floating-control-desktop-top"
    >
      {/* 데스크톱에서만 노출 — 모바일은 pinch-zoom 으로 fit 가능. */}
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
