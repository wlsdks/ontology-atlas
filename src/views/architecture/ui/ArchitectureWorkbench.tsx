"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Check, ChevronDown } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import {
  buildArchitectureAgentPrompt,
  buildArchitectureLayout,
  type ArchitectureAgentTaskKind,
  type ArchitectureHandoffContext,
  type ArchitectureProfile,
  type ArchitectureProfileProblem,
} from '@/entities/architecture-profile';
import type { ArchitectureRecord } from '@/entities/architecture-record';
import type { AcpTurnActivity } from '@/features/acp-session';
import { useVaultSessionIdentityScope } from '@/entities/vault-session';
import { cn } from '@/shared/lib/cn';
import { copyText } from '@/shared/lib/clipboard/copy-text';
import { LG_BREAKPOINT_PX, useViewportBelow } from '@/shared/lib/use-viewport-below';
import { Button, Surface } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { transientSurface } from '@/shared/ui/surfaces/transient-surface';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import type { ArchitectureAgentRequest, ArchitectureAgentRoute } from '../model/architecture-agent';
import type { DraftPreviewSource } from '../model/draft-preview';
import { arrivalRole, buildImportMatrix, roleImports, type ImportCell } from '../model/import-matrix';
import type { RoleConcept } from '../model/role-concepts';
import { buildRoleMembers, patternPathLabel } from '../model/role-members';
import type { RoleSourceModule } from '../model/source-modules';
import { ArchitectureDraftHero } from './ArchitectureDraftHero';
import { ArchitectureImportMatrix } from './ArchitectureImportMatrix';
import { ArchitectureRoleDetail } from './ArchitectureRoleDetail';
import { ArchitectureVerdict } from './ArchitectureVerdict';
import { HARNESS_GUTTER_LEFT } from './harness-frame';
import { guardedHistoryWrite } from '@/shared/lib/navigation/history-write-guard';

const EMPTY_PROFILE_PROBLEMS: ReadonlyArray<ArchitectureProfileProblem> = [];
const EMPTY_EDGES: ArchitectureRecord['brief']['conformance']['violations'] = [];
/** The width from which the table, verdict and pane share one window-high row (`xl`). */
const WORKBENCH_MIN_PX = 1280;

function buildArchitectureHref(role: string | null, pathname: string): string {
  /* Preserve orthogonal route flags (`guides=off`, fixtures, view options). */
  const query = new URLSearchParams(typeof window === 'undefined' ? undefined : window.location.search);
  query.delete('stage');
  query.delete('role');
  if (role) query.set('role', role);
  const search = query.toString();
  return search ? `${pathname}?${search}` : pathname;
}

function writeArchitectureAddress(role: string | null): void {
  guardedHistoryWrite('replace', buildArchitectureHref(role, window.location.pathname));
}

function readArchitectureRole(): string | null {
  if (typeof window === 'undefined') return null;
  return new URL(window.location.href).searchParams.get('role');
}

type CopyState = 'idle' | 'pending' | 'copied' | 'error';
/* Long enough to read a sentence naming the task, unlike `useCopyFeedback`'s 1.5s one-word confirmation. */
const COPY_FEEDBACK_MS = 4000;

export function ArchitectureWorkbench({
  profiles,
  profileProblems = EMPTY_PROFILE_PROBLEMS,
  handoffContexts = {},
  draftHandoffContext = null,
  draftSource = null,
  sourceModulesByProfile = {},
  sourceListingCapable = false,
  recordsByProfile = {},
  recordsLoaded = true,
  conceptsByProfile = {},
  agentRoute = 'clipboard',
  agentLabel = null,
  onAgentRequest,
  onOpenReview,
  contextDockOpen = false,
  agentActivity = null,
  copyFeedbackMs = COPY_FEEDBACK_MS,
  embedded = false,
}: {
  profiles: ArchitectureProfile[];
  /** Embedded in the Harness destination: the identity below replaces this view's own header. */
  embedded?: boolean;
  profileProblems?: ReadonlyArray<ArchitectureProfileProblem>;
  handoffContexts?: Readonly<Record<string, ArchitectureHandoffContext | undefined>>;
  draftHandoffContext?: ArchitectureHandoffContext | null;
  draftSource?: DraftPreviewSource | null;
  sourceModulesByProfile?: Readonly<Record<string, Record<string, RoleSourceModule[]>>>;
  sourceListingCapable?: boolean;
  recordsByProfile?: Readonly<Record<string, ArchitectureRecord | undefined>>;
  recordsLoaded?: boolean;
  conceptsByProfile?: Readonly<Record<string, Record<string, RoleConcept[]>>>;
  agentRoute?: ArchitectureAgentRoute;
  agentLabel?: string | null;
  onAgentRequest?: (request: ArchitectureAgentRequest) => void;
  onOpenReview?: (profileSlug: string, roleId: string | null) => void;
  contextDockOpen?: boolean;
  agentActivity?: AcpTurnActivity | null;
  copyFeedbackMs?: number;
}) {
  const vaultKey = useVaultSessionIdentityScope();
  const t = useTranslations('architecture');
  const tReview = useTranslations('analysisWorkbench');
  const reviewUsesSheet = useViewportBelow(LG_BREAKPOINT_PX);
  const stacked = useViewportBelow(WORKBENCH_MIN_PX);
  /* The locale picks which reviewed sentence shows; `summary_<role>` stays the fact briefs, prompts and CLI lines print. */
  const locale = useLocale();
  const [selectedSlug, setSelectedSlug] = useState(profiles[0]?.slug ?? null);
  const selected = useMemo(
    () => profiles.find((profile) => profile.slug === selectedSlug) ?? profiles[0] ?? null,
    [profiles, selectedSlug],
  );

  /* The chosen role is in the address: a selected role is shareable state, and a deep link is how an agent is handed a state. */
  const [chosenRole, setChosenRole] = useState<string | null>(() => readArchitectureRole());
  /* The other end of the cell last chosen; it marks a column and a row of the pane. */
  const [markedRole, setMarkedRole] = useState<string | null>(null);
  useEffect(() => {
    const syncFromHistory = () => {
      setChosenRole(readArchitectureRole());
      setMarkedRole(null);
    };
    window.addEventListener('popstate', syncFromHistory);
    return () => window.removeEventListener('popstate', syncFromHistory);
  }, []);

  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [copiedTaskLabel, setCopiedTaskLabel] = useState<string | null>(null);
  /* The last request wins, so a pending first copy cannot name the second one's task. */
  const copyRequest = useRef(0);
  useEffect(() => {
    if (copyState !== 'copied' && copyState !== 'error') return undefined;
    const timer = window.setTimeout(() => {
      setCopyState('idle');
      setCopiedTaskLabel(null);
    }, copyFeedbackMs);
    return () => window.clearTimeout(timer);
  }, [copyFeedbackMs, copyState]);

  const record = selected ? recordsByProfile[selected.slug] ?? null : null;
  const conformance = record?.brief.conformance ?? null;
  const violations = conformance?.violations ?? EMPTY_EDGES;
  const matrix = useMemo(
    () => (selected ? buildImportMatrix(selected, conformance?.observedRoleEdges ?? [], violations) : null),
    [selected, conformance, violations],
  );
  const selectedModules = selected ? sourceModulesByProfile[selected.slug] ?? null : null;
  const selectedConcepts = useMemo(
    () => (selected ? conceptsByProfile[selected.slug] ?? {} : {}),
    [conceptsByProfile, selected],
  );
  const members = useMemo(
    () => (selected ? buildRoleMembers(selected, selectedModules, selectedConcepts) : {}),
    [selected, selectedModules, selectedConcepts],
  );
  const reachOf = useMemo(() => {
    const reach = new Map<string, string[]>();
    if (!selected) return reach;
    for (const edge of buildArchitectureLayout(selected).edges) {
      reach.set(edge.from, [...(reach.get(edge.from) ?? []), edge.to]);
    }
    const rank = new Map(selected.roles.map((role, index) => [role.id, index]));
    for (const targets of reach.values()) targets.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
    return reach;
  }, [selected]);

  const chosenInProfile = chosenRole !== null && (matrix?.order.includes(chosenRole) ?? false);
  const activeRole = matrix ? (chosenInProfile ? chosenRole : arrivalRole(matrix, violations)) : null;

  const primaryAgentKind: ArchitectureAgentTaskKind = conformance?.status === 'conforms' ? 'change' : 'verify';
  const [chosenAgent, setChosenAgent] = useState<{ slug: string; kind: ArchitectureAgentTaskKind } | null>(null);
  /* Derived, not reset: a choice for one profile must not follow the person to another. */
  const chosenAgentKind = chosenAgent && chosenAgent.slug === selected?.slug ? chosenAgent.kind : null;
  const requestedAgentKind: ArchitectureAgentTaskKind = chosenAgentKind ?? primaryAgentKind;
  const [taskMenuOpen, setTaskMenuOpen] = useState(false);
  const taskMenuRef = useRef<HTMLDivElement>(null);
  const taskMenuTriggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!taskMenuOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (taskMenuRef.current && !taskMenuRef.current.contains(event.target as Node)) {
        setTaskMenuOpen(false);
      }
    };
    /* Escape closes only the menu: capture phase on the document, propagation stopped before the docks' window listeners. */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setTaskMenuOpen(false);
      taskMenuTriggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    /* Items mount one presence frame after `open`; the second frame is when the first can take focus. */
    let inner = 0;
    const frame = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => {
        taskMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
      });
    });
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(inner);
    };
  }, [taskMenuOpen]);

  /* Below `xl` the pane stacks under the table, so a choice scrolls to it. */
  const paneRef = useRef<HTMLElement>(null);
  const revealPane = useRef(false);
  useEffect(() => {
    if (!revealPane.current) return;
    revealPane.current = false;
    if (!stacked) return;
    window.requestAnimationFrame(() => paneRef.current?.scrollIntoView({ block: 'nearest' }));
  }, [activeRole, markedRole, stacked]);

  /* An unreadable document is named with the parser's sentence instead of failing every profile. */
  const profileNotices =
    profileProblems.length === 0 ? null : (
      <div className="mb-3 flex flex-col gap-1">
        {profileProblems.map((problem) => (
          <p
            key={`${problem.documentSlug}\u0000${problem.message}`}
            role="status"
            data-testid="architecture-profile-problem"
            className="m-0 border-l border-[color:var(--color-border-strong)] pl-3 text-body text-[color:var(--color-text-tertiary)]"
          >
            {t('profileUnreadable', { document: problem.documentSlug, message: problem.message })}
          </p>
        ))}
      </div>
    );

  if (!selected || !matrix) {
    return (
      <ArchitectureDraftHero
        embedded={embedded}
        notices={profileNotices ? <div className="mb-5 w-full max-w-[var(--git-setup-measure)]">{profileNotices}</div> : null}
        agentRoute={agentRoute}
        agentLabel={agentLabel}
        onAgentRequest={onAgentRequest}
        draftHandoffContext={draftHandoffContext}
        draftSource={draftSource}
        agentWorking={contextDockOpen}
      />
    );
  }

  const roleLabel = (id: string) => (t.has(`roleLabels.${id}`) ? t(`roleLabels.${id}`) : id);
  const patternLabel = (name: string) => (t.has(`patternLabels.${name}`) ? t(`patternLabels.${name}`) : name);
  const roleById = new Map(selected.roles.map((role) => [role.id, role]));
  const moduleCountOf = (id: string): number | null => {
    const roleMembers = members[id];
    return roleMembers && roleMembers.source !== 'none' ? roleMembers.members.length : selectedModules ? 0 : null;
  };
  const moduleTotal = matrix.order.some((id) => moduleCountOf(id) !== null)
    ? matrix.order.reduce((sum, id) => sum + (moduleCountOf(id) ?? 0), 0)
    : null;

  const measured = record?.brief.measured ?? null;
  const recordDate = measured ? measured.at.slice(0, 10) : '';
  const recordStamp = measured
    ? `${
        measured.source.kind === 'git'
          ? t('recordCheckedGit', { date: recordDate, sha: measured.source.revision })
          : t('recordCheckedFolder', { date: recordDate })
      }${measured.source.kind === 'git' && measured.source.dirty ? ` ${t('recordDirty')}` : ''}`
    : null;
  const ruleSentence = selected.dependencyPolicy === 'lower-only' ? t('dependencyLowerOnly') : t('dependencyExplicit');

  const cellSentence = (cell: ImportCell): string => {
    const ends = { from: roleLabel(cell.from), to: roleLabel(cell.to) };
    switch (cell.kind) {
      case 'self':
        return t('cell.self', { role: roleLabel(cell.from) });
      case 'violation':
        return t('cell.violation', { ...ends, count: cell.violations });
      case 'observed':
        return t('cell.observed', { ...ends, count: cell.count });
      case 'uncounted':
        return t('cell.uncounted', { ...ends, count: cell.count });
      case 'allowed':
        return conformance ? t('cell.allowed', ends) : t('cell.allowedUnmeasured', ends);
      case 'forbidden':
        return conformance ? t('cell.forbidden', ends) : t('cell.forbiddenUnmeasured', ends);
    }
  };

  const agentReceipt = record
    ? {
        profileContentHash: record.profile.contentHash,
        measuredAt: record.brief.measured.at,
        source: record.brief.measured.source,
        status: record.brief.conformance.status,
        violationCount: record.brief.conformance.violationCount,
        unmappedEdges: record.brief.conformance.unknown?.unmappedEdges ?? null,
        unruledEdges: record.brief.conformance.unknown?.unruledEdges ?? null,
      }
    : null;
  const promptFor = (kind: ArchitectureAgentTaskKind) =>
    buildArchitectureAgentPrompt(selected, handoffContexts[selected.slug] ?? null, {
      kind,
      stage: 'understand',
      selectedRole: chosenInProfile ? chosenRole : null,
      receipt: agentReceipt,
    });
  const agentTasks: { kind: ArchitectureAgentTaskKind; label: string; hint: string }[] = [
    {
      kind: 'verify',
      label: agentReceipt ? t('recheckSourceAction') : t('inspectSourceAction'),
      hint: agentReceipt ? t('agentTaskHints.recheck') : t('agentTaskHints.inspect'),
    },
    { kind: 'change', label: t('planChangeAction'), hint: t('agentTaskHints.change') },
    { kind: 'improve', label: t('findImprovementsAction'), hint: t('agentTaskHints.improve') },
  ];
  const requestedAgentLabel = agentTasks.find((task) => task.kind === requestedAgentKind)?.label;
  const idleAgentLabel =
    agentRoute === 'clipboard'
      ? t('copyTaskSentence', { task: requestedAgentLabel ?? '' })
      : requestedAgentLabel ?? t('inspectSourceAction');
  const agentActionText =
    agentRoute === 'checking'
      ? t('checkingAgent')
      : agentRoute === 'clipboard' && copyState === 'pending'
        ? t('copyingHandoff')
        : agentRoute === 'clipboard' && copyState === 'copied'
          ? t('copiedShort')
          : agentRoute === 'clipboard' && copyState === 'error'
            ? t('copyHandoffError')
            : idleAgentLabel;

  async function copyHandoff(text: string, taskLabel: string | null = null) {
    const token = ++copyRequest.current;
    setCopyState('pending');
    setCopiedTaskLabel(taskLabel);
    let ok = false;
    try {
      ok = await copyText(text);
    } catch {
      ok = false;
    }
    if (token !== copyRequest.current) return;
    setCopyState(ok ? 'copied' : 'error');
  }

  function runAgentTask(kind: ArchitectureAgentTaskKind, taskLabel: string | null = null) {
    if (!selected) return;
    setTaskMenuOpen(false);
    const roleId = chosenInProfile ? chosenRole : null;
    if (agentRoute === 'agent') {
      onAgentRequest?.({ kind, prompt: promptFor(kind), profileSlug: selected.slug, roleId });
      return;
    }
    void copyHandoff(promptFor(kind), taskLabel);
  }
  const runRequestedTask = () =>
    runAgentTask(requestedAgentKind, agentTasks.find((task) => task.kind === requestedAgentKind)?.label ?? null);

  function selectRole(id: string, marked: string | null) {
    if (!selected) return;
    setChosenRole(id);
    setMarkedRole(marked);
    revealPane.current = true;
    writeArchitectureAddress(id);
    if (contextDockOpen) onOpenReview?.(selected.slug, id);
  }

  const activeIndex = activeRole === null ? -1 : matrix.order.indexOf(activeRole);
  const activeMembers = activeRole ? members[activeRole] ?? { members: [], source: 'none' as const } : null;
  const sourceNote = sourceListingCapable ? null : (
    <p className="mt-1 break-keep text-label text-[color:var(--color-text-quaternary)]" data-testid="architecture-source-unavailable">
      {t('sourceListingUnbound')}
    </p>
  );

  const agentActionIcon =
    agentRoute === 'clipboard' && copyState === 'copied' ? (
      <Check size={ICON_SIZE.sm} aria-hidden />
    ) : (
      <Bot size={ICON_SIZE.sm} aria-hidden />
    );

  return (
    <main
      inert={contextDockOpen && reviewUsesSheet}
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--color-canvas)]"
    >
      <div
        data-testid="architecture-layout-scroll"
        className={cn(
          'grid min-h-0 flex-1 grid-cols-1 overflow-y-auto bg-[color:var(--color-canvas)] xl:grid-rows-1 xl:overflow-hidden',
          contextDockOpen ? 'xl:grid-cols-1' : 'xl:grid-cols-[minmax(0,1fr)_380px]',
        )}
      >
        <section
          className={cn(
            'flex min-w-0 flex-col pb-5 pr-5 pt-4 md:pr-8 xl:min-h-0 xl:pb-4',
            embedded ? HARNESS_GUTTER_LEFT : 'pl-5 md:pl-8',
          )}
          data-testid="architecture-flow-panel"
        >
          {embedded ? null : (
            <header className="mb-4 min-w-0">
              <p className="text-caption font-[var(--font-weight-signature)] uppercase tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)]">
                {t('eyebrow')}
              </p>
              <h1 className="mt-1 text-display font-[var(--font-weight-strong)] leading-display-tight text-[color:var(--color-text-primary)]">
                {t('title')}
              </h1>
              <p className="mt-1 text-body text-[color:var(--color-text-tertiary)]">{t('description')}</p>
            </header>
          )}
          {profileNotices}
          <div className="mb-4 flex min-w-0 shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex min-w-0 items-baseline gap-3">
              <h2 className="min-w-0 max-w-[20rem] truncate text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                {selected.title}
              </h2>
              {selected.patterns[0] ? (
                <span className="truncate text-body text-[color:var(--color-text-tertiary)]">
                  {selected.patterns.map((pattern) => patternLabel(pattern.name)).join(' · ')}
                </span>
              ) : null}
            </div>
            {profiles.length > 1 ? (
              <div role="group" aria-label={t('profileSwitch')} className="flex min-w-0 flex-wrap items-center gap-1">
                {profiles.map((profile) =>
                  profile.slug === selected.slug ? (
                    <span
                      key={profile.uid}
                      aria-current="true"
                      data-testid="architecture-profile-current"
                      className={controlClass({ shape: 'chip', size: 'sm', tone: 'secondary', active: true })}
                    >
                      {profile.title}
                      <ProfileScope profile={profile} />
                    </span>
                  ) : (
                    <button
                      key={profile.uid}
                      type="button"
                      data-testid="architecture-profile-option"
                      onClick={() => {
                        setSelectedSlug(profile.slug);
                        setChosenRole(null);
                        setMarkedRole(null);
                        writeArchitectureAddress(null);
                        if (contextDockOpen) onOpenReview?.(profile.slug, null);
                      }}
                      className={controlClass({ shape: 'chip', size: 'sm', tone: 'secondary', hoverSurface: 'lift' })}
                    >
                      {profile.title}
                      <ProfileScope profile={profile} />
                    </button>
                  ),
                )}
              </div>
            ) : null}
            {agentActivity ? (
              <span className="truncate text-body text-[color:var(--color-text-tertiary)]" data-testid="architecture-agent-activity">
                {t(`agentActivity.${agentActivity.state}`)}
              </span>
            ) : null}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {recordsLoaded && onOpenReview ? (
                <Button
                  variant="ghost"
                  size="md"
                  className="atlas-touch-floor text-[color:var(--color-text-secondary)]"
                  data-testid="architecture-review-open"
                  onClick={() => onOpenReview(selected.slug, chosenInProfile ? chosenRole : null)}
                >
                  {tReview('history')}
                </Button>
              ) : null}
              <div
                ref={taskMenuRef}
                className="relative flex shrink-0 items-stretch"
                data-testid="architecture-agent-task"
                onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
                  if (!taskMenuOpen) return;
                  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                  const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
                  if (items.length === 0) return;
                  const at = items.indexOf(document.activeElement as HTMLButtonElement);
                  const next =
                    at === -1
                      ? event.key === 'ArrowDown'
                        ? 0
                        : items.length - 1
                      : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
                  items[next]?.focus();
                  event.preventDefault();
                }}
              >
                <Button
                  variant="primary"
                  size="md"
                  className="atlas-touch-floor rounded-r-none"
                  disabled={agentRoute === 'checking' || copyState === 'pending'}
                  data-testid="architecture-agent-action"
                  data-architecture-copy-state={agentRoute === 'clipboard' ? copyState : undefined}
                  onClick={runRequestedTask}
                >
                  {agentActionIcon}
                  {/* A confirmation does not resize the toolbar: the invisible idle label holds the width, and the full sentence goes to the polite status region. */}
                  <span className="inline-grid">
                    <span aria-hidden className="invisible col-start-1 row-start-1">
                      {idleAgentLabel}
                    </span>
                    {/* Every transient label reserves its width; the Korean error line is wider than some idle labels. */}
                    {agentRoute === 'clipboard'
                      ? [t('copyingHandoff'), t('copiedShort'), t('copyHandoffError')].map((reserve) => (
                          <span key={reserve} aria-hidden className="invisible col-start-1 row-start-1">
                            {reserve}
                          </span>
                        ))
                      : null}
                    <span className="col-start-1 row-start-1">{agentActionText}</span>
                  </span>
                </Button>
                <Button
                  ref={taskMenuTriggerRef}
                  variant="outline"
                  size="md"
                  className="atlas-touch-floor -ml-px min-w-9 rounded-l-none px-2"
                  disabled={agentRoute === 'checking'}
                  aria-haspopup="menu"
                  aria-label={t('agentTaskMenu')}
                  data-testid="architecture-agent-task-menu"
                  onClick={() => setTaskMenuOpen((value) => !value)}
                >
                  <ChevronDown
                    size={ICON_SIZE.sm}
                    aria-hidden
                    className={cn('transition-transform motion-reduce:transition-none', taskMenuOpen && 'rotate-180')}
                  />
                </Button>
                <Surface
                  open={taskMenuOpen}
                  origin="top right"
                  role="menu"
                  aria-label={t('agentTaskMenu')}
                  {...transientSurface('menu')}
                  data-testid="architecture-agent-task-popover"
                  className="absolute right-0 top-full z-20 mt-1 flex w-80 flex-col gap-0.5 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-1 shadow-[var(--shadow-elevation-1)]"
                >
                  {agentTasks.map((task) => (
                    <button
                      key={task.kind}
                      type="button"
                      role="menuitem"
                      data-testid={`architecture-agent-task-${task.kind}`}
                      data-architecture-agent-task={task.kind}
                      aria-current={task.kind === requestedAgentKind ? 'true' : undefined}
                      onClick={() => {
                        setChosenAgent({ slug: selected.slug, kind: task.kind });
                        runAgentTask(task.kind, task.label);
                        taskMenuTriggerRef.current?.focus();
                      }}
                      className={controlClass({
                        shape: 'row',
                        size: 'md',
                        tone: 'secondary',
                        hoverSurface: 'lift',
                        active: task.kind === requestedAgentKind,
                        className:
                          'h-auto min-w-0 flex-col items-start gap-0.5 px-3 py-2 focus-visible:bg-[color:var(--color-overlay-2)] focus-visible:outline-hidden',
                      })}
                    >
                      <span className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                        {task.label}
                      </span>
                      <span className="break-keep text-caption text-[color:var(--color-text-tertiary)]">{task.hint}</span>
                    </button>
                  ))}
                  {agentRoute === 'clipboard' ? (
                    <p className="border-t border-[color:var(--color-divider)] px-3 pb-1 pt-2 text-caption text-[color:var(--color-text-quaternary)]">
                      {t('agentTaskCopyHint')}
                    </p>
                  ) : null}
                </Surface>
              </div>
              <span className="sr-only" role="status" aria-live="polite">
                {agentRoute === 'clipboard' && copyState === 'copied'
                  ? copiedTaskLabel
                    ? t('copiedTaskHandoff', { task: copiedTaskLabel })
                    : t('copiedHandoff')
                  : agentRoute === 'clipboard' && copyState === 'error'
                    ? t('copyHandoffError')
                    : ''}
              </span>
            </div>
          </div>

          <ArchitectureVerdict
            conformance={conformance}
            loading={!recordsLoaded}
            crossRoleImports={matrix.crossRoleImports}
            layers={matrix.order.length}
            modules={moduleTotal}
            stamp={recordStamp}
            rule={ruleSentence}
            roleLabel={roleLabel}
          />

          <div className="mt-5 flex min-h-0 flex-1 flex-col">
            {recordsLoaded ? (
              <ArchitectureImportMatrix
                matrix={matrix}
                measured={conformance !== null}
                heightBound={!stacked}
                selectedRole={activeRole}
                markedRole={markedRole}
                roleLabel={roleLabel}
                pathLabelOf={(id) => (roleById.get(id)?.paths ?? []).map(patternPathLabel).join(' ')}
                moduleCountOf={moduleCountOf}
                sentenceOf={cellSentence}
                onSelectRole={(id) => selectRole(id, null)}
                onSelectCell={(cell) => selectRole(cell.from, cell.from === cell.to ? null : cell.to)}
              />
            ) : (
              <p
                className="m-auto py-16 text-body text-[color:var(--color-text-tertiary)]"
                role="status"
                data-testid="architecture-record-loading"
              >
                {t('recordLoading')}
              </p>
            )}
          </div>
        </section>

        <aside
          ref={paneRef}
          id="architecture-inspector"
          data-testid="architecture-inspector"
          className={cn(
            contextDockOpen ? 'hidden' : 'block',
            'min-w-0 scroll-mt-3 border-t border-[color:var(--color-border-soft)] px-5 py-5 md:px-8',
            'xl:min-h-0 xl:overflow-y-auto xl:border-l xl:border-t-0 xl:px-5 xl:py-4',
            /* A pane that scrolls must say so: macOS hides its overlay scrollbar until something moves. */
            '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[color:var(--color-divider)]',
          )}
        >
          {chosenRole !== null && !chosenInProfile ? (
            <p className="mb-4 break-keep text-body text-[color:var(--color-text-secondary)]" data-testid="architecture-role-not-in-profile">
              {t('roleNotInProfile', { role: chosenRole })}
            </p>
          ) : null}
          {activeRole && activeMembers ? (
            <div key={`${vaultKey}:${activeRole}`} className="topology-chrome-in origin-left" data-testid="architecture-role-detail-motion">
              <ArchitectureRoleDetail
                roleId={activeRole}
                index={activeIndex + 1}
                label={roleLabel(activeRole)}
                summary={(() => {
                  const role = roleById.get(activeRole);
                  return role ? role.summaries[locale] ?? role.summary ?? null : null;
                })()}
                paths={roleById.get(activeRole)?.paths ?? []}
                mayImport={reachOf.get(activeRole) ?? []}
                imports={roleImports(matrix, activeRole, 'out')}
                importedBy={roleImports(matrix, activeRole, 'in')}
                measured={conformance !== null}
                maxCount={matrix.maxCount}
                markedRole={markedRole}
                members={activeMembers}
                concepts={selectedConcepts[activeRole] ?? []}
                roleLabel={roleLabel}
                sourceNote={sourceNote}
              />
            </div>
          ) : null}
        </aside>
      </div>
      <div
        aria-hidden
        data-testid="architecture-bottom-tab-reserve"
        className="h-[var(--topology-mobile-bottom-tab-reserve)] shrink-0 lg:hidden"
      />
    </main>
  );
}

function ProfileScope({ profile }: { profile: ArchitectureProfile }) {
  if (profile.scopePaths.length === 0) return null;
  // Tertiary, not quaternary: a pressed chip's surface composites where quaternary fails AA.
  return (
    <span className="ml-1.5 truncate font-mono text-[color:var(--color-text-tertiary)]">
      {profile.scopePaths.join(' · ')}
    </span>
  );
}
