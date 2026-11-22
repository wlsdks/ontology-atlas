'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';

import type { HarnessScanProgress } from '@/entities/agent-files';
import { cn } from '@/shared/lib/cn';
import { Button, PageHeaderBar, TabBar } from '@/shared/ui';
import { HARNESS_GUTTER_X } from '@/shared/ui/layout/page-header-bar';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { HarnessScanProgressPanel, HarnessSetupView } from '@/widgets/harness-setup';

import { EXAMPLE_SOURCE_ROOT, type ExampleRead } from '../../lib/harness-film/harness-example';
import { createHarnessDirector, type Director } from '../../lib/harness-film/harness-director';
import { WINDOW } from '../../lib/harness-film/harness-scene';

export { readExample } from '../../lib/harness-film/harness-example';

const OPENS_ON = 'context:instructions';

const VIEWS = ['overview', 'architecture'] as const;

const noop = () => {};

/**
 * The app's Harness › Setup screen, as the film plays it: the real header, scan panel and Setup
 * view on the example repository, in a window that takes no input and is hidden from assistive
 * technology (the act list beside the film carries the meaning). The film's own nodes live in one
 * layer above the screen; `harness-director.ts` presses the screen's controls and animates what
 * moved.
 */
export function HarnessFilmWindow({
  example,
  scale,
  onReady,
}: {
  example: ExampleRead;
  scale: () => number;
  onReady: (director: Director | null) => void;
}) {
  const t = useTranslations('harness');
  const [generation, setGeneration] = useState(0);
  const [progress, setProgress] = useState<HarnessScanProgress | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const pointer = useRef<SVGSVGElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const handlers = useRef({ scale, onReady });
  useEffect(() => {
    handlers.current = { scale, onReady };
  });

  useEffect(() => {
    if (!root.current || !layer.current || !pointer.current || !ring.current || !scrim.current) return;
    const director = createHarnessDirector({
      root: root.current,
      layer: layer.current,
      pointer: pointer.current as unknown as HTMLElement,
      ring: ring.current,
      scrim: scrim.current,
      progress: example.progress,
      setProgress: (next) => flushSync(() => setProgress(next)),
      remount: () =>
        flushSync(() => {
          setGeneration((value) => value + 1);
          setProgress(null);
        }),
      commit: (update) => flushSync(update),
      scale: () => handlers.current.scale(),
    });
    handlers.current.onReady(director);
    return () => {
      director.dispose();
      handlers.current.onReady(null);
    };
  }, [example]);

  return (
    <div
      ref={root}
      inert
      aria-hidden
      data-film-window
      /* The edge is an outline, not a border, so the body keeps the 1024px slot the three panes need. */
      className="relative overflow-hidden bg-[color:var(--color-canvas)] shadow-[var(--shadow-elevation-3)] outline outline-1 outline-[color:var(--color-border-strong)] [&_*]:[scrollbar-width:none]"
      style={{ width: WINDOW.w, height: WINDOW.h, borderRadius: WINDOW.radius }}
    >
      <div key={generation} className="@container/harness isolate flex h-full flex-col">
        <PageHeaderBar
          frame="harness"
          titleAs="p"
          title={t('title')}
          className="static"
          tabs={
            <TabBar
              ariaLabel={t('viewsAria')}
              variant="segmented"
              idPrefix="harness-film"
              activeKey="overview"
              onSelect={noop}
              items={VIEWS.map((id) => ({ key: id, label: t(`views.${id}`) }))}
            />
          }
          actions={
            <Button
              variant="ghost"
              size="sm"
              tabIndex={-1}
              className="border-[color:var(--color-border-soft)] text-[color:var(--color-text-secondary)]"
            >
              <RefreshCw size={ICON_SIZE.sm} aria-hidden />
              <span>{t('reread')}</span>
            </Button>
          }
        />
        <div className={cn('relative flex min-h-0 flex-1 flex-col overflow-hidden pt-6 pb-[var(--page-bottom-breath)]', HARNESS_GUTTER_X)}>
          <HarnessSetupView
            report={example.report}
            sourceRoot={EXAMPLE_SOURCE_ROOT}
            initialCategory={OPENS_ON}
            reveal={false}
            showVendorMarks={false}
          />
          <div data-film-scan className="absolute inset-0 flex flex-col justify-center bg-[color:var(--color-canvas)]">
            <HarnessScanProgressPanel progress={progress} />
          </div>
        </div>
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-x-[14px] top-0 z-40 h-px bg-[color:var(--color-overlay-2)]" />
      <div ref={layer} data-film-layer className="pointer-events-none absolute inset-0 z-30">
        <div
          ref={scrim}
          data-film-node="scrim"
          className="absolute inset-0 z-[2] bg-[color:var(--color-canvas)] opacity-0"
        />
        <div
          ref={ring}
          data-film-node="ring"
          className="absolute z-[3] opacity-0 outline outline-[1.5px] outline-[color:var(--color-indigo-pale-a28)]"
        />
        <svg
          ref={pointer}
          data-film-node="pointer"
          width="18"
          height="18"
          viewBox="0 0 18 18"
          className="absolute left-0 top-0 z-[4] origin-top-left opacity-0"
        >
          <path
            d="M1.5 1.5 L1.5 15 L5.2 11.4 L7.9 16.6 L10.2 15.4 L7.6 10.3 L12.8 10.3 Z"
            fill="var(--color-text-primary)"
            stroke="var(--color-canvas)"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
