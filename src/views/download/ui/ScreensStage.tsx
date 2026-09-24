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

/** From 90rem the names stand as a column beside the picture; below it they are a strip above. */
const COLUMN_FROM_PX = 1440;

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
 * - **The caption and the door stand under the names** (2026-09-25). They used to sit under the
 *   picture while the rail stopped at the last name: measured 1512, a 250px list beside a 613px
 *   picture left 320px of empty column under "Git". Standing them at the rail's foot only framed
 *   that gap (≈230px between "Git" and a caption-step footnote in an 11rem track). So the rail is
 *   a quarter of the stage instead of a fixed 11rem, and the active screen's sentence follows the
 *   names directly on the body step, under a rule: the names, then what the chosen one does, then
 *   its door — one reading order, top down. Below the split the same block follows the picture.
 *   The captions stack and crossfade exactly as the panels do, so the block's height is the
 *   tallest caption's and a swap moves nothing.
 * - **The split opens at 90rem, and from 112rem the section head joins the rail** (2026-09-25).
 *   At `xl` (1280) the quarter-width rail was 210px: the caption ran four lines and the door hung
 *   35px under the picture. Below 90rem the names are a strip above a full-width picture. At
 *   1920 the picture is 715px tall against a ≈410px rail, and the rail ended 300px short; the
 *   head (`intro`) standing at the rail's top is what the demo and agent sections already do,
 *   and it closes that column to within ≈150px. Between 90 and 112rem the picture is short
 *   enough that the head above the split fits better, so it spans both tracks there. Only the
 *   picture carries the scroll entrance; the head, names and caption are still.
 */
export function ScreensStage({ intro }: { intro: ReactNode }) {
  const t = useTranslations('download.screens');
  const tRail = useTranslations('navRail');
  const locale = useLocale();
  const [active, setActive] = useState<CapturedId>(SCREEN_ORDER[0]!);
  /** No entrance on the first paint — the stage's arrival is the section's scroll entrance. */
  const [swapped, setSwapped] = useState(false);
  const { leaving } = useSurfaceSwap(active);
  const narrow = useViewportBelow(COLUMN_FROM_PX);

  /** Where each screen stands in the swap — the panels and the captions share one reading. */
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
              'min-h-[var(--control-h-lg)] w-auto shrink-0 gap-2 whitespace-nowrap px-3 py-0 leading-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)] min-[90rem]:w-full',
              // In the strip it stands on the strip's rule; in the column it is one more row.
              'rounded-none border-b border-[color:var(--color-divider)] min-[90rem]:rounded-card min-[90rem]:border-b-0',
            ),
          })}
        >
          {tRail('map')}
          {/* The hint is on the tabs' own type step (2026-09-25) — it was the mono label step,
              so the first row of the list read as a different kind of row. Only its ink steps
              down, which is what makes it a hint. */}
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

      {/* The picture stops at its own CSS size (1336px): at 2560 the column is 1920 and a full-width
          picture would be a 2672px capture stretched past 2× — bigger, and blurrier. */}
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
              /* The two panels that were sections until 2026-09-24 keep their old test ids, so
                 anything that located the architecture or the library still finds it. */
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

      {/* The active screen's sentence and its door — under the names from `xl`, under the
          picture below it. Sans face: these are sentences, and Hangul in the mono face read as
          spaced-out printout (2026-09-25). */}
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
                className="min-w-0 max-w-[var(--measure-doc-column)] break-keep text-body leading-body text-[color:var(--color-text-secondary)]"
              >
                {t(`caption.${id}`)}
              </p>
              <Link
                href={SCREENS[id].href}
                data-testid={`gateway-${id}-door`}
                className={cn(
                  controlClass({ shape: 'link', size: 'md' }),
                  // `touch-hit-expand`: a link's own box is 24px tall, and a coarse pointer needs
                  // 44 (`touch-target-contract.spec.ts`). The class buys the finger target without
                  // moving a pixel of layout.
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
