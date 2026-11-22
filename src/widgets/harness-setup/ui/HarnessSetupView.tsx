'use client';

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Info } from 'lucide-react';

import { AGENT_TOOL_LABELS, hookEventStep, type AgentTool, type HarnessReport } from '@/entities/agent-files';
import { scopeFindings, scopeHookKey } from '@/entities/agent-scopes';
import type { HarnessScopes, ScopeFile, ScopeHook } from '@/shared/lib/harness-scopes/tauri-harness-scopes';
import { cn } from '@/shared/lib/cn';
import { Chip, CloseButton, Dialog, EmptyState } from '@/shared/ui';
import { SegmentedControl } from '@/shared/ui/fields/segmented-control';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import {
  buildHarnessSetup,
  itemHolds,
  type HarnessSetup,
  type SetupGroup,
  type SetupProblem,
  type SetupGroupId,
  type ToolFilter,
} from '../model/harness-setup';
import {
  displayPath,
  isHookGroup,
  reportItemFor,
  scopeHookGroups,
  scopeOptionKey,
  type ScopeHookGroup,
} from '../model/scope-hook-groups';
import { ScopeHookDetail, ScopeHookList, type ExplainScope } from './ScopeHooks';
import { SetupItemDetail, type TranslateFn } from './HarnessGuideDetail';
import {
  categorySize,
  HarnessItemList,
  HarnessSetupSection,
  moveInPane,
  type ItemOption,
  type SetupArea,
  type SetupCategory,
} from './HarnessSetupSection';
import { formatBytes } from './harness-setup-format';

/** Pane 1 (17.5rem) and pane 2 (22.5rem) beside a detail of at least 24rem; rem, so zoomed text drops to the dialog. */
const THREE_PANES_FROM_REM = 64;

const ALL_TOOLS = 'all';

const DETAIL_TITLE_ID = 'harness-item-detail-title';

const ITEMS_TITLE_ID = 'harness-items-title';

const PANE_SCROLL = 'lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain';

function useThreePanes(slot: HTMLElement | null): boolean {
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => {
    if (!slot) return;
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setFits(slot.clientWidth >= THREE_PANES_FROM_REM * rem);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    return () => observer.disconnect();
  }, [slot]);
  return fits;
}

function problemText(problem: SetupProblem, t: TranslateFn): string {
  return problem.kind === 'hook-missing'
    ? t('problemHookMissing', { path: problem.path })
    : t('problemCodexCap', { size: formatBytes(problem.bytes) });
}

function categoryKey(section: string, group: SetupGroup['id']): string {
  return `${section}:${group}`;
}

function optionsOf(category: SetupCategory | undefined): ItemOption[] {
  return (category?.items ?? []).flatMap((item) => [
    { item, parent: null },
    ...(item.files ?? []).map((file) => ({ item: file, parent: item })),
  ]);
}

/**
 * Every category the repository has, in reading order, with what the tool filter leaves in it: a
 * category the filter empties stays listed with 0. O(categories + items + problems).
 */
function areasOf(
  all: HarnessSetup,
  shown: HarnessSetup,
  scopeGroups: ReadonlyMap<SetupGroupId, ScopeHookGroup> | null,
): SetupArea[] {
  const categoryOfItem = new Map<string, string>();
  for (const section of shown.sections) {
    for (const group of [...section.groups, ...section.aside]) {
      for (const item of group.items) {
        for (const key of [item.key, ...(item.files ?? []).map((file) => file.key)]) {
          categoryOfItem.set(key, categoryKey(section.id, group.id));
        }
      }
    }
  }
  const problemsByCategory = new Map<string, number>();
  for (const problem of shown.problems) {
    const key = categoryOfItem.get(problem.itemKey);
    if (key) problemsByCategory.set(key, (problemsByCategory.get(key) ?? 0) + 1);
  }
  return all.sections.map((section) => {
    const shownSection = shown.sections.find((candidate) => candidate.id === section.id);
    const category = (group: SetupGroup): SetupCategory => {
      const key = categoryKey(section.id, group.id);
      const visible = [...(shownSection?.groups ?? []), ...(shownSection?.aside ?? [])].find((candidate) => candidate.id === group.id);
      const count = scopeGroups && isHookGroup(group.id) ? (scopeGroups.get(group.id)?.count ?? 0) : undefined;
      return {
        key,
        id: group.id,
        items: visible?.items ?? [],
        bytes: visible?.bytes ?? 0,
        problems: problemsByCategory.get(key) ?? 0,
        count,
      };
    };
    const categories = section.groups.map(category);
    const aside = section.aside.map(category);
    return {
      id: section.id,
      total: scopeGroups ? categories.reduce((sum, entry) => sum + categorySize(entry), 0) : (shownSection?.total ?? 0),
      problems: [...categories, ...aside].reduce((sum, entry) => sum + entry.problems, 0),
      categories,
      aside,
    };
  });
}

/**
 * `initialCategory` names the category to open first (`<section>:<group>`, as `categoryKey` builds
 * it). `reveal={false}` keeps the view from scrolling its host page or moving focus, and
 * `showVendorMarks={false}` leaves the agent tools' logos out (their names stay), for a copy of the
 * screen that plays inside another page.
 */
export function HarnessSetupView({
  report,
  sourceRoot,
  initialCategory,
  reveal: revealOnSelect = true,
  showVendorMarks = true,
  scopes = null,
  scopesReading = false,
  onExplainScope,
}: {
  report: HarnessReport;
  sourceRoot: string;
  initialCategory?: string;
  reveal?: boolean;
  showVendorMarks?: boolean;
  /** Every scope's settings files, once the app has read them; `null` lists the repository's alone. */
  scopes?: HarnessScopes | null;
  /** The first read of the other settings files is still running. */
  scopesReading?: boolean;
  onExplainScope?: ExplainScope;
}) {
  const t = useTranslations('harness');
  const [filter, setFilter] = useState<ToolFilter>(null);
  const scopeGroupsAll = useMemo(() => (scopes ? scopeHookGroups(scopes, null) : null), [scopes]);
  const scopeGroups = useMemo(
    () => (scopes ? (filter === null ? scopeGroupsAll : scopeHookGroups(scopes, filter)) : null),
    [scopes, scopeGroupsAll, filter],
  );
  const keep = useMemo(() => new Set(scopeGroupsAll?.keys() ?? []), [scopeGroupsAll]);
  const findings = useMemo(
    () => (scopes ? scopeFindings(scopes, (event) => hookEventStep(event) === 'guardrails') : null),
    [scopes],
  );
  const all = useMemo(() => buildHarnessSetup(report, null, keep), [report, keep]);
  const setup = useMemo(() => (filter === null ? all : buildHarnessSetup(report, filter, keep)), [all, report, filter, keep]);
  const areas = useMemo(() => areasOf(all, setup, scopeGroups), [all, setup, scopeGroups]);
  const categories = useMemo(() => areas.flatMap((area) => [...area.categories, ...area.aside]), [areas]);

  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const threePanes = useThreePanes(slot);

  const problemKeys = useMemo(() => new Set(setup.problems.map((problem) => problem.itemKey)), [setup.problems]);
  const firstProblem = setup.problems[0] ?? null;

  const [chosenCategory, setChosenCategory] = useState<string | null>(initialCategory ?? null);
  const [chosenItem, setChosenItem] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const category =
    categories.find((entry) => entry.key === chosenCategory && categorySize(entry) > 0) ??
    categories.find((entry) => entry.problems > 0) ??
    categories.find((entry) => categorySize(entry) > 0);
  const scopeGroup = category && scopes && isHookGroup(category.id) ? (scopeGroups?.get(category.id) ?? null) : null;
  const scopeOptions = scopeGroup
    ? scopeGroup.headings.flatMap(({ file, hooks }) => hooks.map((hook) => ({ key: scopeOptionKey(file, hook), file, hook })))
    : [];
  const reportItemOf = (file: ScopeFile, hook: ScopeHook) => (scopes ? reportItemFor(file, hook, scopes, all.items) : null);
  const selectedScope = scopeGroup
    ? (scopeOptions.find((option) => option.key === chosenItem) ??
      scopeOptions.find((option) => {
        const item = reportItemOf(option.file, option.hook);
        return item !== null && problemKeys.has(item.key);
      }) ??
      scopeOptions[0] ??
      null)
    : null;
  const options = scopeGroup ? [] : optionsOf(category);
  const selectedOption =
    options.find((option) => option.item.key === chosenItem) ??
    options.find((option) => problemKeys.has(option.item.key)) ??
    options[0] ??
    null;
  const selected = selectedOption?.item ?? null;
  const outside = findings?.lines.find((finding) => finding.kind === 'outside') ?? null;
  const outsideFiles = scopes
    ? scopes.files.filter(
        (file) =>
          (file.picked || file.scope === 'user' || file.scope === 'managed' || file.scope === 'system') &&
          file.hooks.length > 0 &&
          (filter === null || file.tool === filter),
      )
    : [];

  const itemsRef = useRef<HTMLDivElement | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const selectedKey = selectedScope?.key ?? selected?.key ?? null;
  useLayoutEffect(() => {
    if (detailRef.current) detailRef.current.scrollTop = 0;
    if (!revealOnSelect || !selectedKey || !window.matchMedia('(min-width: 64rem)').matches) return;
    itemsRef.current?.querySelector<HTMLElement>(`[data-option-key="${CSS.escape(selectedKey)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedKey, revealOnSelect]);

  const selectCategory = (key: string) => {
    setChosenCategory(key);
    setChosenItem(null);
  };
  const openItem = (key: string) => {
    setChosenItem(key);
    if (!threePanes) setDialogOpen(true);
  };
  const reveal = (key: string) => {
    if (!threePanes || !revealOnSelect) return;
    requestAnimationFrame(() => {
      itemsRef.current?.querySelector<HTMLElement>(`[data-option-key="${CSS.escape(key)}"]`)?.focus();
    });
  };
  /* With every scope read, a hook category lists hooks by file, so a scanned hook's key is found through its file. */
  const scopeKeyOfItem = (itemKey: string): { category: string; key: string } | null => {
    if (!scopes || !scopeGroups) return null;
    for (const entry of categories) {
      const group = isHookGroup(entry.id) ? scopeGroups.get(entry.id) : undefined;
      for (const { file, hooks } of group?.headings ?? []) {
        const hook = hooks.find((candidate) => reportItemFor(file, candidate, scopes, all.items)?.key === itemKey);
        if (hook) return { category: entry.key, key: scopeOptionKey(file, hook) };
      }
    }
    return null;
  };
  const showFirstProblem = () => {
    if (!firstProblem) return;
    const inScope = scopeKeyOfItem(firstProblem.itemKey);
    const holder = inScope?.category ?? categories.find((entry) => entry.items.some((item) => itemHolds(item, firstProblem.itemKey)))?.key;
    if (holder) setChosenCategory(holder);
    const key = inScope?.key ?? firstProblem.itemKey;
    openItem(key);
    reveal(key);
  };
  const showFirstOutside = () => {
    if (outside?.kind !== 'outside' || !scopes || !scopeGroups) return;
    for (const entry of categories) {
      const group = isHookGroup(entry.id) ? scopeGroups.get(entry.id) : undefined;
      const heading = group?.headings.find(({ file }) => file.id === outside.first.fileId);
      const hook = heading?.hooks.find((candidate) => scopeHookKey(heading.file.id, candidate) === outside.first.hookKey);
      if (!heading || !hook) continue;
      const key = scopeOptionKey(heading.file, hook);
      setChosenCategory(entry.key);
      openItem(key);
      reveal(key);
      return;
    }
  };

  const tools = useMemo(() => {
    const found = new Set<AgentTool>([...all.tools, ...(scopes?.files ?? []).filter((file) => file.hooks.length > 0).map((file) => file.tool)]);
    return (Object.keys(AGENT_TOOL_LABELS) as AgentTool[]).filter((tool) => found.has(tool));
  }, [all.tools, scopes]);
  const toolOptions = useMemo(
    () => [
      { value: ALL_TOOLS, label: t('toolAll') },
      ...tools.map((tool) => ({ value: tool as string, label: <span className="whitespace-nowrap">{AGENT_TOOL_LABELS[tool]}</span> })),
    ],
    [tools, t],
  );

  if (categories.length === 0) {
    return <EmptyState title={t('empty')} description={t('emptyBody')} />;
  }

  const lead = (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <p className="max-w-prose text-pretty text-body text-[color:var(--color-text-secondary)]">{t('explainer')}</p>
      {tools.length > 1 ? (
        <SegmentedControl<string>
          ariaLabel={t('toolFilterAria')}
          testId="harness-tool-filter"
          size="md"
          variant={threePanes ? 'well' : 'chips'}
          value={filter ?? ALL_TOOLS}
          options={toolOptions}
          onChange={(next) => setFilter(next === ALL_TOOLS ? null : (next as AgentTool))}
        />
      ) : null}
    </div>
  );

  const problemRow = firstProblem ? (
    <div data-testid="harness-problems" className="flex min-w-0 items-center gap-2.5">
      <AlertTriangle size={ICON_SIZE.sm} aria-hidden className="shrink-0 text-[color:var(--color-amber-source-a90)]" />
      <p className="min-w-0 truncate text-body text-[color:var(--color-text-secondary)]" title={problemText(firstProblem, t)}>
        <span className="text-[color:var(--color-text-primary)]">{t('problemCount', { count: setup.problems.length })}</span>
        {' · '}
        {problemText(firstProblem, t)}
      </p>
      <Chip
        size="sm"
        hoverSurface="lift"
        data-harness-problem={firstProblem.kind}
        onClick={showFirstProblem}
        className="shrink-0"
      >
        {t('problemShow', { count: setup.problems.length })}
      </Chip>
    </div>
  ) : null;

  const say = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const outsideRow =
    outside?.kind === 'outside' && scopes ? (
      <div data-testid="harness-scopes-outside" className="flex min-w-0 items-center gap-2.5">
        <Info size={ICON_SIZE.sm} aria-hidden className="shrink-0 text-[color:var(--color-text-tertiary)]" />
        <p className="min-w-0 truncate text-body text-[color:var(--color-text-secondary)]">
          <span className="text-[color:var(--color-text-primary)]">{say('scopes.finding.outside', { count: outside.count })}</span>
          {outsideFiles.map((file) => (
            <span key={file.id} className="text-[color:var(--color-text-tertiary)]">
              {' · '}
              <code className="font-mono text-label text-[color:var(--color-text-secondary)]">{displayPath(file.path, scopes)}</code> {file.hooks.length}
            </span>
          ))}
        </p>
        <Chip size="sm" hoverSurface="lift" data-testid="harness-scopes-outside-show" onClick={showFirstOutside} className="shrink-0">
          {say('scopes.finding.outsideShow')}
        </Chip>
      </div>
    ) : null;

  const categoryPane = (
    <div
      data-testid="harness-categories"
      onKeyDown={(event) => moveInPane(event, selectCategory)}
      className={cn('flex flex-col gap-6 pb-4 pt-4 lg:pr-4', PANE_SCROLL)}
    >
      {areas.map((area) => (
        <HarnessSetupSection
          key={area.id}
          area={area}
          selectedKey={category?.key ?? null}
          focusKey={category?.key ?? null}
          onSelect={selectCategory}
          claudeSessionBytes={setup.claudeSessionBytes}
          codexSession={setup.codexSession}
          t={t}
        />
      ))}
      <p className="mt-auto break-all px-2.5 text-label text-[color:var(--color-text-quaternary)]">{t('sourceRoot', { path: sourceRoot })}</p>
    </div>
  );

  const itemPane = (
    <div
      ref={itemsRef}
      data-testid="harness-items"
      onKeyDown={(event) => moveInPane(event, setChosenItem)}
      className={cn('flex flex-col gap-2 pb-4 pt-4 max-lg:border-t lg:border-l lg:px-4 border-[color:var(--color-border-soft)]', PANE_SCROLL)}
    >
      {category ? (
        <>
          <h2 id={ITEMS_TITLE_ID} className="flex items-baseline gap-2.5 px-2.5 text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
            <span className="min-w-0 flex-1">{t(`groups.${category.id}`)}</span>
            <span className="shrink-0 text-label font-normal tabular-nums text-[color:var(--color-text-secondary)]">
              {t('sectionTotal', { count: categorySize(category) })}
            </span>
          </h2>
          {scopeGroup && scopes && findings ? (
            <ScopeHookList
              group={scopeGroup}
              categoryId={category.id}
              scopes={scopes}
              findings={findings}
              reportItems={all.items}
              selectedKey={selectedScope?.key ?? null}
              labelledBy={ITEMS_TITLE_ID}
              onSelect={openItem}
              onExplain={onExplainScope}
              t={t}
            />
          ) : (
          <HarnessItemList
            labelledBy={ITEMS_TITLE_ID}
            options={options}
            selectedKey={selected?.key ?? null}
            problemKeys={problemKeys}
            showTools={filter === null}
            onSelect={openItem}
            t={t}
          />
          )}
          {scopesReading && isHookGroup(category.id) ? (
            <p data-testid="harness-scopes-reading" className="flex items-center gap-2 px-2.5 pt-3 text-label text-[color:var(--color-text-quaternary)]">
              <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-[color:var(--color-text-quaternary)] motion-reduce:animate-none" />
              {say('scopes.reading', { file: '~/.claude/settings.json · ~/.codex/hooks.json' })}
            </p>
          ) : null}
        </>
      ) : (
        <p className="px-2.5 text-label text-[color:var(--color-text-quaternary)]">{t('sectionNone')}</p>
      )}
    </div>
  );

  const detail = (action?: ReactNode) =>
    selectedScope && scopes && findings ? (
      <div className="@container/guide-detail" key={selectedScope.key}>
        <ScopeHookDetail
          file={selectedScope.file}
          hook={selectedScope.hook}
          scopes={scopes}
          findings={findings}
          reportItem={reportItemOf(selectedScope.file, selectedScope.hook)}
          headingId={DETAIL_TITLE_ID}
          action={action}
          onExplain={onExplainScope}
          t={t}
        />
      </div>
    ) : selected ? (
      <div className="@container/guide-detail" key={selected.key}>
        <SetupItemDetail
          item={selected}
          report={report}
          current
          headingId={DETAIL_TITLE_ID}
          action={action}
          showVendorMarks={showVendorMarks}
          t={t}
        />
      </div>
    ) : null;

  return (
    <section
      ref={setSlot}
      data-testid="harness-setup"
      data-harness-layout={threePanes ? 'three' : 'dialog'}
      className="flex min-h-0 flex-1 flex-col gap-4 max-lg:overflow-y-auto"
    >
      {lead}
      {problemRow}
      {outsideRow}
      <div
        className={cn(
          'grid min-h-0 flex-1 border-t border-[color:var(--color-border-soft)] lg:grid-rows-[minmax(0,1fr)]',
          threePanes ? 'grid-cols-[17.5rem_22.5rem_minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)] lg:grid-cols-[17.5rem_minmax(0,1fr)]',
        )}
      >
        {categoryPane}
        {itemPane}
        {threePanes ? (
          <aside
            ref={detailRef}
            aria-labelledby={DETAIL_TITLE_ID}
            data-testid="harness-detail-pane"
            className={cn('border-l border-[color:var(--color-border-soft)] pb-4 pl-6 pt-4', PANE_SCROLL)}
          >
            {detail()}
          </aside>
        ) : null}
      </div>
      {!threePanes ? (
        <Dialog
          open={dialogOpen && (selected !== null || selectedScope !== null)}
          onClose={() => setDialogOpen(false)}
          size="lg"
          labelledBy={DETAIL_TITLE_ID}
          testId="harness-detail-pane"
          className="p-0"
        >
          <div ref={detailRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {detail(<CloseButton label={t('close')} onClick={() => setDialogOpen(false)} data-testid="harness-detail-close" className="-mr-2 -mt-1.5 shrink-0" />)}
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}
