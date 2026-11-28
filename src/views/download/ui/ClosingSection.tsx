import { useTranslations } from 'use-intl';
import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import type { StageGraph } from '../lib/stage-graph';
import type { MacosReleaseAsset, WindowsReleaseAsset } from '../lib/release/release-state';
import { DownloadActions } from './release/DownloadActions';
import { FactsStrip } from './release/FactsStrip';
import { TrustLine } from './release/TrustLine';
import { ClosingContact } from './ClosingContact';
import { ClosingMap } from './ClosingMap';

export function ClosingSection({
  graph,
  published,
  primaryAsset,
  windowsInstaller,
  windowsPrimary,
  fileWins,
  handheld,
}: {
  graph: StageGraph;
  published: boolean;
  primaryAsset: MacosReleaseAsset | null;
  windowsInstaller: WindowsReleaseAsset | null;
  windowsPrimary: boolean;
  fileWins: boolean;
  handheld: boolean;
}) {
  const t = useTranslations('download');
  return (
    <section
      data-testid="gateway-closing"
      aria-labelledby="gateway-closing-title"
      className={cn(PAGE_GUTTER, 'mt-[var(--gateway-section-gap)]', 'w-full overflow-x-clip')}
    >
      <div className={cn(PAGE_COLUMN, '@container min-w-0 border-t border-[color:var(--color-divider)] pt-16 sm:pt-20')}>
        <div className="grid min-w-0 gap-x-12 gap-y-8 @min-[52rem]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] @min-[52rem]:gap-y-12">
          <div className="min-w-0">
            <h2
              id="gateway-closing-title"
              className="max-w-full pb-[0.08em] [text-wrap:balance] text-monument font-[var(--font-weight-signature)] tracking-[var(--tracking-monument)] text-[color:var(--color-text-primary)]"
            >
              {t('closingTitle')}
            </h2>
            <DownloadActions
              scope="closing"
              className="mt-10 justify-start"
              fileWins={fileWins}
              primaryAsset={primaryAsset}
              windowsInstaller={windowsInstaller}
              windowsPrimary={windowsPrimary}
            />
            <TrustLine
              testId="gateway-closing-trust"
              className="mt-5 text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]"
              windowsPrimary={windowsPrimary}
              handheld={handheld}
            />
            <FactsStrip
              scope="gateway-closing"
              row
              className="mt-8"
              published={published}
              primaryAsset={primaryAsset}
              windowsAsset={windowsInstaller}
              windowsPrimary={windowsPrimary}
              sizeOnCta={fileWins}
              heroIn
              handheld={handheld}
            />
          </div>
          <div className="relative min-w-0 @min-[52rem]:col-start-2 @min-[52rem]:row-span-2 @min-[52rem]:row-start-1 @min-[52rem]:min-h-[30rem]">
            <ClosingMap
              graph={graph}
              className="aspect-square w-full @min-[52rem]:absolute @min-[52rem]:-inset-y-10 @min-[52rem]:left-0 @min-[52rem]:right-[calc(2rem-var(--gateway-origin))] @min-[52rem]:aspect-auto @min-[52rem]:w-auto"
            />
          </div>
          <ClosingContact className="@min-[52rem]:col-start-1 @min-[52rem]:row-start-2 @min-[52rem]:self-end" />
        </div>
      </div>
    </section>
  );
}
