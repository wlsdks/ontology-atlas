'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

import { AGENT_TOOL_LABELS, type AgentTool, type HarnessReport } from '@/entities/agent-files';
import { cn } from '@/shared/lib/cn';
import { Button, EmptyState, RowButton, Surface } from '@/shared/ui';
import { SegmentedControl } from '@/shared/ui/fields/segmented-control';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import {
  buildHarnessSetup,
  itemHolds,
  type SetupGroup,
  type SetupProblem,
  type SetupSectionId,
  type ToolFilter,
} from '../model/harness-setup';
import { SetupItemDetail, type TranslateFn } from './HarnessGuideDetail';
import { HarnessSetupSection } from './HarnessSetupSection';
import { formatBytes } from './harness-setup-format';

/** The slot must hold three columns and the 24rem detail side by side; rem, so zoomed text drops to the drill-in. */
const DETAIL_BESIDE_FROM_REM = 76;

const ALL_TOOLS = 'all';

function useDetailBeside(slot: HTMLElement | null): boolean {
  const [beside, setBeside] = useState(true);
  useLayoutEffect(() => {
    if (!slot) return;
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setBeside(slot.clientWidth >= DETAIL_BESIDE_FROM_REM * rem);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    return () => observer.disconnect();
  }, [slot]);
  return beside;
}

function problemText(problem: SetupProblem, t: TranslateFn): string {
  return problem.kind === 'hook-missing'
    ? t('problemHookMissing', { path: problem.path })
    : t('problemCodexCap', { size: formatBytes(problem.bytes) });
}

function groupKey(section: SetupSectionId, group: SetupGroup): string {
  return `${section}:${group.id}`;
}

export function HarnessSetupView({ report, sourceRoot }: { report: HarnessReport; sourceRoot: string }) {
  const t = useTranslations('harness');
  const [filter, setFilter] = useState<ToolFilter>(null);
  const setup = useMemo(() => buildHarnessSetup(report, filter), [report, filter]);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const beside = useDetailBeside(slot);
  const detailRef = useRef<HTMLElement | null>(null);

  const arrivalKey =
    setup.problems.find((problem) => setup.items.has(problem.itemKey))?.itemKey ??
    setup.sections.flatMap((section) => section.groups).find((group) => group.items.length > 0)?.items[0]?.key ??
    null;
  const [chosen, setChosen] = useState<string | null>(null);
  /* Beside the columns the detail always shows something; as a drill-in it waits for a press. */
  const selectedKey = chosen !== null && setup.items.has(chosen) ? chosen : beside ? arrivalKey : null;
  const selected = selectedKey ? setup.items.get(selectedKey) ?? null : null;

  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const isOpen = useCallback(
    (section: SetupSectionId) => (group: SetupGroup) =>
      toggled.get(groupKey(section, group)) ?? group.items.some((item) => itemHolds(item, selectedKey)),
    [toggled, selectedKey],
  );
  const toggle = useCallback(
    (section: SetupSectionId) => (group: SetupGroup) => {
      const key = groupKey(section, group);
      setToggled((current) => {
        const open = current.get(key) ?? group.items.some((item) => itemHolds(item, selectedKey));
        return new Map(current).set(key, !open);
      });
    },
    [selectedKey],
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  /* The row that opened the drill-in and where the list stood, so closing it returns there. */
  const returnTo = useRef<{ selector: string; scrollTop: number } | null>(null);

  const open = useCallback(
    (key: string, opener: string) => {
      if (!beside) {
        returnTo.current = { selector: opener, scrollTop: scrollRef.current?.scrollTop ?? 0 };
        /* Keep the row's group open after the drill-in closes, so focus has a row to land on. */
        const holder = setup.sections.flatMap((section) =>
          [...section.groups, ...section.aside].filter((group) => group.items.some((item) => itemHolds(item, key))).map((group) => groupKey(section.id, group)),
        );
        if (holder.length > 0) setToggled((current) => new Map(current).set(holder[0]!, true));
      }
      setChosen(key);
      const pane = detailRef.current;
      if (pane) pane.scrollTop = 0;
    },
    [beside, setup.sections],
  );
  const select = useCallback((key: string) => open(key, `[data-harness-item="${CSS.escape(key)}"]`), [open]);
  const close = useCallback(() => setChosen(null), []);

  const drillIn = !beside && selected !== null;
  useLayoutEffect(() => {
    if (drillIn) {
      backRef.current?.focus();
      return;
    }
    const target = returnTo.current;
    if (!target) return;
    returnTo.current = null;
    if (scrollRef.current) scrollRef.current.scrollTop = target.scrollTop;
    scrollRef.current?.querySelector<HTMLElement>(target.selector)?.focus();
  }, [drillIn]);

  useEffect(() => {
    if (!drillIn) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drillIn, close]);

  const toolOptions = useMemo(
    () => [
      { value: ALL_TOOLS, label: t('toolAll') },
      ...setup.tools.map((tool) => ({ value: tool as string, label: <span className="whitespace-nowrap">{AGENT_TOOL_LABELS[tool]}</span> })),
    ],
    [setup.tools, t],
  );

  const total = setup.sections.reduce((sum, section) => sum + section.total, 0);
  if (total === 0 && filter === null) {
    return <EmptyState title={t('empty')} description={t('emptyBody')} />;
  }

  const lead = (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <p className="max-w-prose text-pretty text-body text-[color:var(--color-text-secondary)]">{t('explainer')}</p>
      {setup.tools.length > 1 ? (
        <SegmentedControl<string>
          ariaLabel={t('toolFilterAria')}
          testId="harness-tool-filter"
          size="md"
          variant={beside ? 'well' : 'chips'}
          value={filter ?? ALL_TOOLS}
          options={toolOptions}
          onChange={(next) => setFilter(next === ALL_TOOLS ? null : (next as AgentTool))}
        />
      ) : null}
    </div>
  );

  const problems =
    setup.problems.length > 0 ? (
      <ul
        aria-label={t('problemsAria')}
        data-testid="harness-problems"
        className="flex flex-col divide-y divide-[color:var(--color-amber-source-a35)] overflow-hidden rounded-panel border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)]"
      >
        {setup.problems.map((problem) => (
          <li key={problem.key}>
            <RowButton
              data-harness-problem={problem.kind}
              hoverSurface="lift"
              size="md"
              data-harness-problem-key={problem.key}
              onClick={() => open(problem.itemKey, `[data-harness-problem-key="${CSS.escape(problem.key)}"]`)}
              className="w-full gap-2.5 rounded-none"
            >
              <AlertTriangle size={ICON_SIZE.sm} aria-hidden className="shrink-0 text-[color:var(--color-amber-source-a90)]" />
              <span className="min-w-0 flex-1 break-all text-left text-body text-[color:var(--color-text-primary)]">
                {problemText(problem, t)}
              </span>
            </RowButton>
          </li>
        ))}
      </ul>
    ) : null;

  const columns = (
    <div className="grid items-stretch gap-3 lg:grid-cols-3">
      {setup.sections.map((section) => (
        <HarnessSetupSection
          key={section.id}
          section={section}
          isOpen={isOpen(section.id)}
          onToggle={toggle(section.id)}
          selectedKey={selectedKey}
          showTools={filter === null}
          onSelect={select}
          claudeSessionBytes={setup.claudeSessionBytes}
          codexSession={setup.codexSession}
          t={t}
        />
      ))}
    </div>
  );

  const detail = selected ? (
    <div className="@container/guide-detail px-5 py-4" key={selected.key}>
      <SetupItemDetail item={selected} report={report} current headingId="harness-item-detail-title" t={t} />
    </div>
  ) : null;

  return (
    <section
      ref={setSlot}
      data-testid="harness-setup"
      className={cn(
        'grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]',
        beside ? 'grid-cols-[minmax(0,1fr)_24rem] gap-5' : 'grid-cols-[minmax(0,1fr)]',
      )}
    >
      <div ref={scrollRef} data-testid="harness-setup-scroll" className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain">
        {drillIn ? (
          <div className="flex flex-col gap-3">
            <Button
              ref={backRef}
              variant="ghost"
              size="sm"
              className="atlas-touch-floor self-start"
              onClick={close}
              data-testid="harness-detail-back"
            >
              <ArrowLeft size={ICON_SIZE.sm} aria-hidden />
              {t('back')}
            </Button>
            <Surface
              as="section"
              motion="overlay"
              open
              aria-labelledby="harness-item-detail-title"
              data-testid="harness-detail-pane"
              className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]"
            >
              {detail}
            </Surface>
          </div>
        ) : (
          <>
            {lead}
            {problems}
            {columns}
            <p className="text-label text-[color:var(--color-text-quaternary)]">{t('sourceRoot', { path: sourceRoot })}</p>
          </>
        )}
      </div>
      {beside ? (
        <Surface
          as="aside"
          motion="overlay"
          open
          ref={detailRef}
          aria-labelledby="harness-item-detail-title"
          data-testid="harness-detail-pane"
          className="min-h-0 overflow-y-auto overscroll-contain rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]"
        >
          {detail}
        </Surface>
      ) : null}
    </section>
  );
}
