'use client';

import { type ReactNode, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { DESTINATION_IDS } from '@/shared/config/destinations';
import { cn } from '@/shared/lib/cn';
import { useSurfaceSwap } from '@/shared/lib/use-presence';
import { useViewportBelow } from '@/shared/lib/use-viewport-below';
import { controlClass } from '@/shared/ui/control-class';
import { TabBar } from '@/shared/ui/tab-bar';

import { type GatewayScreenFile, gatewayScreenSrc } from '../model/gateway-screens';
import { SurfaceCapture, type SurfaceHref } from './SurfaceCapture';

/** The map is live further up and the agents have their own section, so neither is captured. */
const CAPTURED = ['architecture', 'library', 'automations', 'insights', 'projects', 'git'] as const;
type CapturedId = (typeof CAPTURED)[number];

const SCREENS: Record<CapturedId, { file: GatewayScreenFile; href: SurfaceHref }> = {
  architecture: { file: 'harness', href: '/architecture' },
  library: { file: 'library', href: '/library' },
  automations: { file: 'automations', href: '/automations' },
  insights: { file: 'insights', href: '/ontology/insights' },
  projects: { file: 'projects', href: '/projects' },
  git: { file: 'git', href: '/git' },
};

const SCREEN_ORDER: readonly CapturedId[] = DESTINATION_IDS.filter(
  (id): id is CapturedId => (CAPTURED as readonly string[]).includes(id),
);

/** Half the 2672px capture. */
const CAPTURE_WIDTH = 1336;
const CAPTURE_HEIGHT = 860;

const COLUMN_FROM_PX = 1440;

/**
 * The app's other destinations as tabs in the rail's order and labels (`docs/DECISIONS.md`,
 * 2026-09-24 direction B). Every panel stays mounted in one grid cell, invisible when inactive, so
 * lazy images are ready and a swap moves nothing; captions stack the same way. Names form a strip
 * below 90rem and a column above, where from 112rem the section head joins them.
 */
export function ScreensStage({ intro }: { intro: ReactNode }) {
  const t = useTranslations('download.screens');
  const tRail = useTranslations('navRail');
  const locale = useLocale();
  const [active, setActive] = useState<CapturedId>(SCREEN_ORDER[0]!);
  /** No entrance on first paint: the section's scroll entrance is the arrival. */
  const [swapped, setSwapped] = useState(false);
  const { leaving } = useSurfaceSwap(active);
  const narrow = useViewportBelow(COLUMN_FROM_PX);

  /** Shared by the panels and the captions. */
  const stateOf = (id: CapturedId) =>
    id === active ? 'active' : id === leaving ? 'leaving' : 'hidden';
  const swapClass = (id: CapturedId) => {
    const state = stateOf(id);
    return cn(
      state === 'active' && 'relative z-[1]',
      state === 'active' && swapped && 'gateway-screen-in',
      state === 'leaving' && 'gateway-screen-out',
      state === 'hidden' && 'invisible',
    );
  };

  return (
    <div
      data-testid="gateway-screens-stage"
      className="grid min-w-0 gap-y-3 min-[90rem]:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] min-[90rem]:grid-rows-[auto_auto_minmax(0,1fr)] min-[90rem]:gap-x-10 min-[90rem]:gap-y-6"
    >
      <div
        data-testid="gateway-screens-head"
        className="mb-6 min-w-0 min-[90rem]:col-span-2 min-[90rem]:row-start-1 min-[90rem]:mb-3 min-[112rem]:col-span-1 min-[112rem]:col-start-1"
      >
        {intro}
      </div>
      <div className="flex min-w-0 items-end max-[90rem]:mb-3 min-[90rem]:col-start-1 min-[90rem]:row-start-2 min-[90rem]:flex-col min-[90rem]:items-stretch min-[90rem]:gap-0.5">
        {/* The map row scrolls back up to the live map; the ↑ is a direction, not decoration (`.claude/rules/forbidden.md`). */}
        <a
          href="#evidence"
          data-testid="gateway-screens-map"
          aria-label={t('mapLink')}
          className={controlClass({
            shape: 'row',
            size: 'md',
            hoverInk: 'strong',
            hoverSurface: 'lift',
            className: cn(
              // The same box as a tab row beside it.
              'min-h-[var(--control-h-lg)] w-auto shrink-0 gap-2 whitespace-nowrap px-3 py-0 leading-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)] min-[90rem]:w-full',
              'rounded-none border-b border-[color:var(--color-divider)] min-[90rem]:rounded-card min-[90rem]:border-b-0',
            ),
          })}
        >
          {tRail('map')}
          {/* The tabs' type step; only its ink steps down, or the row reads as another kind. */}
          <span
            aria-hidden
            className="text-body font-normal leading-body text-[color:var(--color-text-quaternary)]"
          >
            ↑ {t('mapHint')}
          </span>
        </a>
        <div className="min-w-0 flex-1 min-[90rem]:flex-none">
          <TabBar
            ariaLabel={t('listLabel')}
            idPrefix="gateway-screens"
            testId="gateway-screens-list"
            orientation={narrow ? 'horizontal' : 'vertical'}
            activeKey={active}
            onSelect={(key) => {
              const next = SCREEN_ORDER.find((id) => id === key);
              if (!next) return;
              setSwapped(true);
              setActive(next);
            }}
            items={SCREEN_ORDER.map((id) => ({
              key: id,
              label: tRail(id),
              testId: `gateway-screens-tab-${id}`,
            }))}
          />
        </div>
      </div>

      {/* Capped at the capture's CSS size, or wide screens stretch it blurry. */}
      <div className="gateway-scroll-stage grid w-full min-w-0 max-w-[83.5rem] min-[90rem]:col-start-2 min-[90rem]:row-span-2 min-[90rem]:row-start-2 min-[112rem]:row-span-3 min-[112rem]:row-start-1 [&>*]:[grid-area:1/1]">
        {SCREEN_ORDER.map((id) => {
          const isActive = id === active;
          const name = tRail(id);
          return (
            <div
              key={id}
              role="tabpanel"
              id={`gateway-screens-tabpanel-${id}`}
              aria-labelledby={`gateway-screens-tab-${id}`}
              aria-describedby={`gateway-screens-caption-${id}`}
              /* Old section test ids, so specs locating the architecture or library still work. */
              data-testid={`gateway-${id}-section`}
              data-state={stateOf(id)}
              inert={!isActive}
              className={cn('min-w-0', swapClass(id))}
            >
              <SurfaceCapture
                testId={`gateway-${id}-capture`}
                src={gatewayScreenSrc(SCREENS[id].file, locale)}
                width={CAPTURE_WIDTH}
                height={CAPTURE_HEIGHT}
                alt={t('alt', { name })}
              />
            </div>
          );
        })}
      </div>

      {/* Sans face: Hangul in the mono face reads as spaced-out printout. */}
      <div
        data-testid="gateway-screens-captions"
        className="grid min-w-0 min-[90rem]:col-start-1 min-[90rem]:row-start-3 min-[90rem]:self-start min-[90rem]:border-t min-[90rem]:border-[color:var(--color-divider)] min-[90rem]:pt-5 [&>*]:[grid-area:1/1]"
      >
        {SCREEN_ORDER.map((id) => {
          const name = tRail(id);
          return (
            <div
              key={id}
              data-state={stateOf(id)}
              inert={id !== active}
              className={cn(
                'flex min-w-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-3 min-[90rem]:flex-col min-[90rem]:flex-nowrap min-[90rem]:items-start min-[90rem]:justify-start',
                swapClass(id),
              )}
            >
              <p
                id={`gateway-screens-caption-${id}`}
                className="min-w-0 max-w-[var(--measure-doc-column)] text-body leading-body text-[color:var(--color-text-secondary)]"
              >
                {t(`caption.${id}`)}
              </p>
              <Link
                href={SCREENS[id].href}
                data-testid={`gateway-${id}-door`}
                className={cn(
                  controlClass({ shape: 'link', size: 'md' }),
                  // The touch-hit-expand class gives a 44px coarse-pointer target without moving layout.
                  'touch-hit-expand shrink-0 text-body font-[var(--font-weight-emphasis)] leading-body text-[color:var(--color-indigo-text-soft)] underline decoration-[color:var(--color-indigo-a40)] underline-offset-4 hover:decoration-[color:var(--color-indigo-accent)]',
                )}
              >
                {t('door', { name })}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
