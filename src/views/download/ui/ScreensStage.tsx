'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { DESTINATION_IDS } from '@/shared/config/destinations';
import { cn } from '@/shared/lib/cn';
import { useSurfaceSwap } from '@/shared/lib/use-presence';
import { useViewportBelow } from '@/shared/lib/use-viewport-below';
import { controlClass } from '@/shared/ui/control-class';
import { TabBar } from '@/shared/ui/tab-bar';

import { type GatewayScreenFile, gatewayScreenSrc } from '../model/gateway-screens';
import { SurfaceCapture, type SurfaceHref } from './SurfaceCapture';

/**
 * The destinations the stage shows as captured screens, **in the app rail's own order**
 * (`DESTINATION_IDS`). Two rail entries are not here and each says why: the map is live further up
 * this page, so its row is a way back up rather than a picture of itself, and the agents already
 * have their own section below with a moving scene.
 */
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

/** The rail's order with the two rows that are not pictures taken out. */
const SCREEN_ORDER: readonly CapturedId[] = DESTINATION_IDS.filter(
  (id): id is CapturedId => (CAPTURED as readonly string[]).includes(id),
);

/** The captures are 2672×1720 PNGs shown at half size. */
const CAPTURE_WIDTH = 1336;
const CAPTURE_HEIGHT = 860;

/** From `xl` the names stand as a column beside the picture; below it they are a strip above. */
const COLUMN_FROM_PX = 1280;

/**
 * **One stage, the app's own rail** (owner, 2026-09-24 — direction B, `docs/DECISIONS.md`).
 *
 * Until now the architecture and the library were two sections of their own, each a captured
 * screen with a caption; five other destinations of the same folder were nowhere on the page. This
 * section is the rest of the product in one place: the app's destination names in the rail's order
 * on the left, and pressing one swaps **in place** the captured screen, its one caption sentence
 * and its door. The names are the rail's own labels (`navRail`), so a visitor who installs the app
 * meets the same words in the same order.
 *
 * - **Tabs, not links.** A name changes what this stage shows and does not leave the page, which
 *   is the tab pattern; `TabBar` is the app's one implementation of it (roving focus, Up/Down in a
 *   column, Home/End), so this file only supplies the panels its `aria-controls` point at.
 * - **Every panel is mounted, stacked in one grid cell.** The inactive ones are `invisible` (out
 *   of the accessibility tree and the tab order, but laid out, so their lazy images load before
 *   they are asked for and the crossfade never waits on the network). The cell is as tall as one
 *   picture, so a swap moves nothing below it.
 * - **The swap is a crossfade.** `useSurfaceSwap` holds the leaving panel for the exit window
 *   under `.gateway-screen-out` while the arriving one plays `.gateway-screen-in`; reduced motion
 *   keeps the same fade on `--motion-fast` (`app/globals.css`).
 */
export function ScreensStage() {
  const t = useTranslations('download.screens');
  const tRail = useTranslations('navRail');
  const locale = useLocale();
  const [active, setActive] = useState<CapturedId>(SCREEN_ORDER[0]!);
  /** No entrance on the first paint — the stage's arrival is the section's scroll entrance. */
  const [swapped, setSwapped] = useState(false);
  const { leaving } = useSurfaceSwap(active);
  const narrow = useViewportBelow(COLUMN_FROM_PX);

  return (
    <div
      data-testid="gateway-screens-stage"
      className="mt-9 grid min-w-0 gap-6 xl:grid-cols-[11rem_minmax(0,1fr)] xl:gap-10"
    >
      <div className="flex min-w-0 items-end xl:flex-col xl:items-stretch xl:gap-0.5">
        {/*
         * The map is the first rail entry and the one screen this page shows live, so its row
         * goes back up to it instead of repeating it as a picture. The `↑` is the direction of
         * that move, not decoration (`.claude/rules/forbidden.md`, label decoration).
         */}
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
              // The same box as a tab row beside it: the lg control floor, the row inset, the
              // body step and the secondary ink. In the strip it is only as wide as its words.
              'min-h-[var(--control-h-lg)] w-auto shrink-0 whitespace-nowrap px-3 py-0 leading-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)] xl:w-full',
              // In the strip it stands on the strip's rule; in the column it is one more row.
              'rounded-none border-b border-[color:var(--color-divider)] xl:rounded-card xl:border-b-0',
            ),
          })}
        >
          {tRail('map')}
          <span
            aria-hidden
            className="font-mono text-label leading-label text-[color:var(--color-text-quaternary)]"
          >
            ↑ {t('mapHint')}
          </span>
        </a>
        <div className="min-w-0 flex-1 xl:flex-none">
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

      {/* The picture stops at its own CSS size (1336px): at 2560 the column is 1920 and a full-width
          picture would be a 2672px capture stretched past 2× — bigger, and blurrier. */}
      <div className="grid w-full min-w-0 max-w-[83.5rem] [&>*]:[grid-area:1/1]">
        {SCREEN_ORDER.map((id) => {
          const isActive = id === active;
          const isLeaving = id === leaving && !isActive;
          const name = tRail(id);
          return (
            <div
              key={id}
              role="tabpanel"
              id={`gateway-screens-tabpanel-${id}`}
              aria-labelledby={`gateway-screens-tab-${id}`}
              /* The two panels that were sections until 2026-09-24 keep their old test ids, so
                 anything that located the architecture or the library still finds it. */
              data-testid={`gateway-${id}-section`}
              data-state={isActive ? 'active' : isLeaving ? 'leaving' : 'hidden'}
              inert={!isActive}
              className={cn(
                'min-w-0',
                isActive && 'relative z-[1]',
                isActive && swapped && 'gateway-screen-in',
                isLeaving && 'gateway-screen-out',
                !isActive && !isLeaving && 'invisible',
              )}
            >
              <SurfaceCapture
                testId={`gateway-${id}-capture`}
                src={gatewayScreenSrc(SCREENS[id].file, locale)}
                width={CAPTURE_WIDTH}
                height={CAPTURE_HEIGHT}
                alt={t('alt', { name })}
                caption={t(`caption.${id}`)}
                href={SCREENS[id].href}
                door={t('door', { name })}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
