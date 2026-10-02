"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bot, Check, ChevronDown, PanelRight } from 'lucide-react';
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
import type { RoleConcept } from '../model/role-concepts';
import type { RoleSourceModule } from '../model/source-modules';
import type { DraftPreviewSource } from '../model/draft-preview';
import type {
  ArchitectureAgentRequest,
  ArchitectureAgentRoute,
} from '../model/architecture-agent';
import { cn } from '@/shared/lib/cn';
import { LG_BREAKPOINT_PX, useViewportBelow } from '@/shared/lib/use-viewport-below';
import { copyText } from '@/shared/lib/copy-text';
import { controlClass } from '@/shared/ui/control-class';
import { transientSurface } from '@/shared/ui/transient-surface';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { Link } from '@/i18n/navigation';
import { ArchitectureRoleDetail } from './ArchitectureRoleDetail';
import { useVaultSessionIdentityScope } from '@/entities/vault-session';

/** The canvas owns which concepts take part in a relation; the panel does not rank by it. */
const EMPTY_EDGE_PARTICIPANTS: ReadonlySet<string> = new Set();
const EMPTY_PROFILE_PROBLEMS: ReadonlyArray<ArchitectureProfileProblem> = [];
import { Button, Chip, CloseButton, RowButton, Surface } from '@/shared/ui';
import { ArchitectureFlow } from './ArchitectureFlow';
import { ArchitectureEvidencePlane } from './ArchitectureEvidencePlane';
import { ArchitectureEvidenceRail } from './ArchitectureEvidenceRail';
import { ArchitectureRules } from './ArchitectureRules';
import { ArchitectureDraftHero } from './ArchitectureDraftHero';
import { HARNESS_GUTTER_LEFT, HARNESS_GUTTER_X } from './harness-frame';
import { buildArchitectureGraph } from '../model/graph-layout';

/**
 * The workbench columns, written out because runtime-assembled class names are invisible to the
 * CSS compiler. The canvas owns the screen until a concrete answer opens beside it.
 */
const XL_COLUMNS = {
  closed: 'xl:grid-cols-[minmax(0,1fr)_0px]',
  inspector: 'xl:grid-cols-[minmax(0,1fr)_380px]',
} as const;

const XL_EVIDENCE_COLUMNS = 'xl:grid-cols-[minmax(0,1fr)_360px]';

/** The same document with another role selected; defaults stay bare and obsolete stage parameters are dropped. */
function buildArchitectureHref(role: string | null, pathname: string): string {
  /* Preserve orthogonal route flags (`guides=off`, fixtures, view options). */
  const query = new URLSearchParams(
    typeof window === 'undefined' ? undefined : window.location.search,
  );
  query.delete('stage');
  query.delete('role');
  if (role) query.set('role', role);
  const search = query.toString();
  return search ? `${pathname}?${search}` : pathname;
}

function writeArchitectureAddress(role: string | null): void {
  window.history.replaceState(
    window.history.state,
    '',
    buildArchitectureHref(role, window.location.pathname),
  );
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
  sourceUnavailableReason = 'browser',
  recordsByProfile = {},
  conceptsByProfile = {},
  agentRoute = 'clipboard',
  agentLabel = null,
  onAgentRequest,
  onOpenReview,
  contextDockOpen = false,
  agentActivity = null,
  copyFeedbackMs = COPY_FEEDBACK_MS,
  offersInstalledApp = false,
  embedded = false,
}: {
  profiles: ArchitectureProfile[];
  /** Embedded in the Harness destination: the identity below replaces this view's own header. */
  embedded?: boolean;

  /** Architecture documents this surface could not read, named rather than silently dropped. */
  profileProblems?: ReadonlyArray<ArchitectureProfileProblem>;
  handoffContexts?: Readonly<Record<string, ArchitectureHandoffContext | undefined>>;
  /** The one unambiguous project source available before any profile exists. */
  draftHandoffContext?: ArchitectureHandoffContext | null;
  draftSource?: DraftPreviewSource | null;
  /** Per profile slug, the read-only source-directory walk the page performed (installed app). */
  sourceModulesByProfile?: Readonly<Record<string, Record<string, RoleSourceModule[]>>>;
  /** Whether this surface can list a source folder at all — false in a browser, by nature. */
  sourceListingCapable?: boolean;
  /** Which absence the stage names when it cannot list source modules. */
  sourceUnavailableReason?: 'browser' | 'unbound' | null;
  /** Per profile slug, the persisted conformance receipt read from the vault sidecar. */
  recordsByProfile?: Readonly<Record<string, ArchitectureRecord | undefined>>;
  /** Per profile slug, the reviewed concepts joined into each role (the click-open detail). */
  conceptsByProfile?: Readonly<Record<string, Record<string, RoleConcept[]>>>;
  agentRoute?: ArchitectureAgentRoute;
  agentLabel?: string | null;
  onAgentRequest?: (request: ArchitectureAgentRequest) => void;
  onOpenReview?: (profileSlug: string, roleId: string | null) => void;
  contextDockOpen?: boolean;
  agentActivity?: AcpTurnActivity | null;
  /** How long a copy confirmation stays before the button returns to rest. Tests shorten it. */
  copyFeedbackMs?: number;
  /** Whether this runtime may point at the installed app. False inside the app itself. */
  offersInstalledApp?: boolean;
}) {
  const vaultKey = useVaultSessionIdentityScope();
  const t = useTranslations('architecture');
  const tReview = useTranslations('analysisWorkbench');
  const reviewUsesSheet = useViewportBelow(LG_BREAKPOINT_PX);
  /* The locale picks which reviewed sentence shows; `summary_<role>` stays the fact briefs, prompts and CLI lines print. */
  const locale = useLocale();
  const [selectedSlug, setSelectedSlug] = useState(profiles[0]?.slug ?? null);
  const selected = useMemo(
    () => profiles.find((profile) => profile.slug === selectedSlug) ?? profiles[0] ?? null,
    [profiles, selectedSlug],
  );

  const [evidenceOpen, setEvidenceOpen] = useState(false);
  /*
   * At `xl` the scopes, rules, receipt and chosen role open in a dock beside the canvas, which keeps
   * the height; stacked under it they were squeezed out of reach. Below `xl` the page stays a
   * stacked document.
   */
  const [inspector, setInspector] = useState<'role' | 'rules' | null>(() => {
    return readArchitectureRole() !== null ? 'role' : null;
  });
  const inspectorOpen = inspector !== null && !contextDockOpen;
  const rightDockOpen = inspectorOpen || evidenceOpen;
  const railCompact = rightDockOpen || contextDockOpen;
  const stackedGutter = embedded ? HARNESS_GUTTER_X : 'px-5 md:px-8';
  const columnLayout = contextDockOpen ? 'context' : evidenceOpen ? 'evidence' : inspectorOpen ? 'inspector' : 'closed';
  const flowHostRef = useRef<HTMLDivElement | null>(null);
  const previousColumnLayout = useRef(columnLayout);
  useLayoutEffect(() => {
    const from = previousColumnLayout.current;
    previousColumnLayout.current = columnLayout;
    const host = flowHostRef.current;
    if (from === columnLayout || !host || typeof host.animate !== 'function') return;
    if (typeof window.matchMedia !== 'function' || !window.matchMedia('(min-width: 1280px)').matches) return;
    const style = getComputedStyle(host);
    const raw = style.getPropertyValue('--motion-fast').trim();
    const duration = (Number.parseFloat(raw) || 0) * (raw.endsWith('ms') ? 1 : 1000);
    if (duration <= 0) return;
    host.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration,
      easing: style.getPropertyValue('--motion-ease').trim() || undefined,
    });
  }, [columnLayout]);
  const evidenceTriggerRef = useRef<HTMLButtonElement>(null);
  const inspectorTriggerRef = useRef<HTMLElement | SVGElement | null>(null);

  /* Owned here because the canvas and the panel answering it sit in different grid rows. */
  /* The chosen role is in the address: a selected dependency is shareable state, and a deep link is how an agent is handed a state. */
  const [selectedRole, setSelectedRole] = useState<string | null>(
    () => readArchitectureRole(),
  );

  /* Back and forward move the selected role, since the address is screen state. */
  useEffect(() => {
    const syncFromHistory = () => {
      const role = readArchitectureRole();
      setSelectedRole(role);
      setInspector(role === null ? null : 'role');
    };
    window.addEventListener('popstate', syncFromHistory);
    return () => window.removeEventListener('popstate', syncFromHistory);
  }, []);
  /* A role click answers about that role only; the profile's rules have their own button. One dock, two contents, never both. */

  function openInspector(kind: 'role' | 'rules', trigger?: HTMLElement | SVGElement) {
    if (contextDockOpen && selected) { onOpenReview?.(selected.slug, selectedRole); return; }
    if (trigger) inspectorTriggerRef.current = trigger;
    setEvidenceOpen(false);
    setInspector(kind);
  }

  /**
   * Closing the role panel lets go of the role and clears `?role=`, or a reload would reopen a
   * closed panel and a pressed face would stand without its answer. Closing the rules panel keeps
   * the selection.
   */
  const closeInspector = useCallback(() => {
    if (inspector === 'role') setSelectedRole(null);
    setInspector(null);
    writeArchitectureAddress(null);
    window.requestAnimationFrame(() => inspectorTriggerRef.current?.focus());
  }, [inspector]);

  const closeEvidence = useCallback(() => {
    setEvidenceOpen(false);
    window.requestAnimationFrame(() => evidenceTriggerRef.current?.focus());
  }, [setEvidenceOpen]);

  const [copyState, setCopyState] = useState<CopyState>('idle');
  /* Which task the last copy carried, so the confirmation names it. */
  const [copiedTaskLabel, setCopiedTaskLabel] = useState<string | null>(null);
  /* The last request wins, so a pending first copy cannot name the second one's task. */
  const copyRequest = useRef(0);
  /* The confirmation leaves after the feedback window, so the button stays usable (`useCopyFeedback` convention). */
  useEffect(() => {
    if (copyState !== 'copied' && copyState !== 'error') return undefined;
    const timer = window.setTimeout(() => {
      setCopyState('idle');
      setCopiedTaskLabel(null);
    }, copyFeedbackMs);
    return () => window.clearTimeout(timer);
  }, [copyFeedbackMs, copyState]);
  const evidencePanelRef = useRef<HTMLElement>(null);

  const selectedRecord = selected ? recordsByProfile[selected.slug] ?? null : null;
  const roleTraffic = selectedRecord?.brief.conformance.observedRoleEdges;
  /** Violated crossings as `from>to`; rows without a role are skipped, as in `buildRoleLedgers`. */
  const violatedPairs = useMemo(() => {
    const pairs = new Set<string>();
    for (const row of selectedRecord?.brief.conformance.violations ?? []) {
      if (!row || typeof row !== 'object') continue;
      const { fromRole, toRole } = row as { fromRole?: unknown; toRole?: unknown };
      if (typeof fromRole === 'string' && typeof toRole === 'string') pairs.add(`${fromRole}>${toRole}`);
    }
    return pairs;
  }, [selectedRecord]);
  /* The canvas's pure, memoized drawing built again for the words; lifting it would cost the flow its ownership. */
  const rulesGraph = useMemo(
    () => (selected ? buildArchitectureGraph(buildArchitectureLayout(selected), roleTraffic ?? []) : null),
    [selected, roleTraffic],
  );
  useEffect(() => {
    if (!inspectorOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeInspector();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeInspector, inspectorOpen]);

  useEffect(() => {
    if (!evidenceOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeEvidence();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeEvidence, evidenceOpen]);

  /* Reveal when the panel exists: `Surface` mounts one commit after the flag, so the press arms it and the panel's ref fires it. */
  const revealEvidence = useRef(false);
  const attachEvidencePanel = useCallback((node: HTMLElement | null) => {
    evidencePanelRef.current = node;
    if (!node || !revealEvidence.current) return;
    revealEvidence.current = false;
    if (window.matchMedia('(min-width: 1280px)').matches) return;
    window.requestAnimationFrame(() => {
      const scroller = node.closest<HTMLElement>('.architecture-workbench-grid');
      const tall = scroller ? node.offsetHeight > scroller.clientHeight : false;
      node.scrollIntoView?.({ block: tall ? 'start' : 'nearest' });
    });
  }, []);

  /* One button with a derived default task, and a chooser offering the other two with a line each. */
  const primaryAgentKind: ArchitectureAgentTaskKind =
    selectedRecord?.brief.conformance.status === 'conforms' ? 'change' : 'verify';
  /* A task chosen from the menu stays on the button until another is picked. */
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
        taskMenuRef.current
          ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
          ?.focus();
      });
    });
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(inner);
    };
  }, [taskMenuOpen]);
  const agentReceipt = selectedRecord
    ? {
        profileContentHash: selectedRecord.profile.contentHash,
        measuredAt: selectedRecord.brief.measured.at,
        source: selectedRecord.brief.measured.source,
        status: selectedRecord.brief.conformance.status,
        violationCount: selectedRecord.brief.conformance.violationCount,
        unmappedEdges: selectedRecord.brief.conformance.unknown?.unmappedEdges ?? null,
        unruledEdges: selectedRecord.brief.conformance.unknown?.unruledEdges ?? null,
      }
    : null;
  const promptFor = (kind: ArchitectureAgentTaskKind) =>
    selected
      ? buildArchitectureAgentPrompt(
          selected,
          handoffContexts[selected.slug] ?? null,
          {
            kind,
            stage: 'understand',
            selectedRole,
            receipt: agentReceipt,
          },
        )
      : '';
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
  /* The resting label, whose width the button keeps through every copy state. */
  const idleAgentLabel =
    agentRoute === 'clipboard'
      ? t('copyTaskSentence', { task: requestedAgentLabel ?? '' })
      : requestedAgentLabel ?? t('inspectSourceAction');

  /* The detail panel's facts come from the same layout the canvas draws, so they never disagree. */
  /* `selected` is null on the zero-profile screen, which renders an empty stage, so derived maps must survive it. */
  const roleLayout = useMemo(
    () => (selected ? buildArchitectureLayout(selected) : null),
    [selected],
  );
  const roleOrder = roleLayout?.rows.flat() ?? [];

  /* A role the profile does not have is not honoured, or the card would state a false dependency rule. Derived, not corrected by an effect; the address stays as sent. */
  const activeRole = selectedRole && roleOrder.includes(selectedRole) ? selectedRole : null;

  /* Below `xl` the detail stacks after the canvas, so a press scrolls to it; a `?role=` link does not jump. */
  const roleDetailRef = useRef<HTMLDivElement>(null);
  const rulesSectionRef = useRef<HTMLElement>(null);
  const revealRoleDetail = useRef(false);
  useEffect(() => {
    if (!revealRoleDetail.current || activeRole === null) return;
    revealRoleDetail.current = false;
    if (window.matchMedia('(min-width: 1280px)').matches) return;
    window.requestAnimationFrame(() => roleDetailRef.current?.scrollIntoView({ block: 'nearest' }));
  }, [activeRole]);
  const roleIndexOf = new Map(roleOrder.map((id, index) => [id, index + 1]));
  const rolePathsOf = new Map((selected?.roles ?? []).map((role) => [role.id, role.paths]));
  const roleSummaryOf = new Map(
    (selected?.roles ?? [])
      .map((role) => [role.id, role.summaries[locale] ?? role.summary] as const)
      .filter((entry): entry is readonly [string, string] => typeof entry[1] === 'string'),
  );
  const roleReachOf = useMemo(() => {
    const map = new Map<string, string[]>(roleOrder.map((id) => [id, []]));
    for (const edge of roleLayout?.edges ?? []) map.get(edge.from)?.push(edge.to);
    /* In the screen's chain order, not the profile's listing order, so the drawing and the card agree. */
    const rank = new Map(roleOrder.map((id, index) => [id, index]));
    for (const targets of map.values()) {
      targets.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roleOrder is derived from roleLayout
  }, [roleLayout]);

  /* An unreadable document is named with the parser's sentence instead of failing every profile. */
  const profileNotices = profileProblems.length === 0 ? null : (
    <div className="mb-3 flex flex-col gap-1">
      {profileProblems.map((problem) => (
        <p
          key={`${problem.documentSlug}\u0000${problem.message}`}
          role="status"
          data-testid="architecture-profile-problem"
          className="m-0 border-l border-[color:var(--color-amber-source-a50)] pl-3 text-body text-[color:var(--color-text-tertiary)]"
        >
          {t('profileUnreadable', { document: problem.documentSlug, message: problem.message })}
        </p>
      ))}
    </div>
  );

  if (!selected) {
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

  const selectedModules = sourceModulesByProfile[selected.slug] ?? null;
  /*
   * A receipt is a dated measurement, not a live claim (`docs/DECISIONS.md`): no record keeps the amber
   * "Source check required"; a record shows its stamp (git short sha, folder fingerprint, dirty suffix)
   * with counts beside the verdict, and says this surface cannot re-probe the source.
   */
  const record = recordsByProfile[selected.slug] ?? null;
  const conformance = record?.brief.conformance ?? null;
  const measured = record?.brief.measured ?? null;
  const recordDate = measured ? measured.at.slice(0, 10) : '';
  const recordDirty = measured?.source.kind === 'git' && measured.source.dirty;
  const recordCounts = conformance
    ? [
        t('recordCounts', {
          violations: conformance.violationCount,
          unmapped: (conformance.unknown?.unmappedEdges ?? 0) + (conformance.unknown?.unruledEdges ?? 0),
        }),
        ...(conformance.excludedByUsage !== undefined
          ? [t('recordTypeOnly', { count: conformance.excludedByUsage })]
          : []),
      ].join(' · ')
    : null;
  const observationTitle = agentActivity
    ? t(`agentActivity.${agentActivity.state}`)
    : record && measured
      ? t('observationRecorded')
      : t('sourceCheckRequired');
  const observationBody = agentActivity
    ? agentActivity.toolName ?? agentActivity.summary ?? t('agentActivity.waiting')
    : record && measured
      ? `${
          measured.source.kind === 'git'
            ? t('recordCheckedGit', { date: recordDate, sha: measured.source.revision })
            : t('recordCheckedFolder', { date: recordDate })
        }${recordDirty ? ` ${t('recordDirty')}` : ''}`
      : t('sourceCheckNext');
  const observationNote = agentActivity
    ? t('agentActivity.volatile')
    : record && measured
      ? t('recordCannotConfirm')
      : undefined;
  const deltaTitle =
    conformance && recordCounts
      ? `${t(`recordStatus.${conformance.status}`)} · ${recordCounts}`
      : t('deltaUnknown');
  const deltaStatus = conformance?.status ?? 'missing';
  const deltaCompactTitle =
    deltaStatus === 'missing' ? t('recordStatus.unknown') : t(`recordStatus.${deltaStatus}`);
  const patternLabel = (name: string) =>
    t.has(`patternLabels.${name}`) ? t(`patternLabels.${name}`) : name;
  /* An untranslated free-text axis gets no explanation: inventing one would infer from a name (`docs/DECISIONS.md`). */
  const axisBody = (axis: string) =>
    t.has(`patternAxes.${axis}.body`) ? t(`patternAxes.${axis}.body`) : '';
  const roleLabel = (id: string) =>
    t.has(`roleLabels.${id}`) ? t(`roleLabels.${id}`) : id;

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

  /* One path for every task: a verified agent takes it as the opening turn, anything else copies the same sentence. */
  function runAgentTask(kind: ArchitectureAgentTaskKind, taskLabel: string | null = null) {
    if (!selected) return;
    setTaskMenuOpen(false);
    if (agentRoute === 'agent') {
      setInspector(null);
      setEvidenceOpen(false);
      writeArchitectureAddress(selectedRole);
      onAgentRequest?.({ kind, prompt: promptFor(kind), profileSlug: selected.slug, roleId: selectedRole });
      return;
    }
    void copyHandoff(promptFor(kind), taskLabel);
  }

  return (
    <main inert={contextDockOpen && reviewUsesSheet} className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--color-canvas)]">
      <div
        data-testid="architecture-layout-scroll"
        className={cn(
          /* One non-scrolling row at workbench width: the canvas owns the height and docks open beside it. */
          'architecture-workbench-grid grid min-h-0 flex-1 grid-cols-1 overflow-y-auto bg-[color:var(--color-canvas)] xl:grid-rows-1 xl:overflow-hidden',
          contextDockOpen ? 'grid-rows-1 overflow-hidden' : 'lg:grid-cols-[220px_minmax(0,1fr)]',
          contextDockOpen ? 'xl:grid-cols-1' : evidenceOpen
            ? XL_EVIDENCE_COLUMNS
            : XL_COLUMNS[inspectorOpen ? 'inspector' : 'closed'],
        )}
      >
        {/* The canvas takes the full width with the columns under it; inside a column a seven-role graph was cut. */}
        {/* Embedded, the gutter is the Harness shell's (`harness-frame.ts`); with a dock open only the start line pays the cap. */}
        <div
          className={cn(
            'min-w-0 border-b border-[color:var(--color-border-soft)] px-5 pb-5 pt-4 lg:col-start-1 lg:col-end-3 xl:col-start-1 xl:col-end-2 xl:row-start-1 xl:flex xl:min-h-0 xl:flex-col xl:border-b-0 xl:pb-3 xl:pt-3',
            !embedded
              ? 'md:px-8'
              : inspectorOpen || evidenceOpen
                ? cn(HARNESS_GUTTER_LEFT, 'pr-5 md:pr-10')
                : HARNESS_GUTTER_X,
          )}
          data-testid="architecture-flow-panel"
        >
          {/* Embedded, this header holds only a problem report, collapsing to zero otherwise: the ladder has no canvas height to spare at 1280x800. */}
          <header className={cn('shrink-0 px-1', !embedded && 'mb-3')}>
            {embedded ? null : (
              <div className="min-w-0">
                <p className="text-caption font-[var(--font-weight-signature)] uppercase tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)]">
                  {t('eyebrow')}
                </p>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h1 className="text-display font-[var(--font-weight-strong)] leading-display-tight text-[color:var(--color-text-primary)]">
                    {t('title')}
                  </h1>
                  <span className="text-body-lg text-[color:var(--color-text-tertiary)]">
                    {selected.title}
                  </span>
                </div>
                <p className="mt-1 text-body text-[color:var(--color-text-tertiary)]">
                  {t('description')}
                </p>
              </div>
            )}
            {profileNotices ? <div className={embedded ? 'mb-3' : 'mt-3'}>{profileNotices}</div> : null}
            {!embedded && onOpenReview ? <div className="mt-3"><Chip data-testid="architecture-review-open" onClick={() => { setInspector(null); setEvidenceOpen(false); onOpenReview(selected.slug, selectedRole); }}>{tReview('history')}</Chip></div> : null}
          </header>
          <div className={cn('mb-3 flex min-w-0 flex-wrap items-center gap-2', !railCompact && 'md:flex-nowrap')}>
              {embedded ? (
                /* The profile's name and the door to its history are one group, the name a label, not a control. */
                <div className="flex min-w-0 shrink-0 items-center gap-2">
                  <h2 className="max-w-[16rem] truncate text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                    {selected.title}
                  </h2>
                  {/* The same `Button` md as every other control in this row. */}
                  {onOpenReview ? (
                    <Button
                      variant="outline"
                      size="md"
                      className="atlas-touch-floor shrink-0"
                      data-testid="architecture-review-open"
                      onClick={() => {
                        setInspector(null);
                        setEvidenceOpen(false);
                        onOpenReview(selected.slug, selectedRole);
                      }}
                    >
                      {tReview('history')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <ArchitectureEvidenceRail
                ariaLabel={evidenceOpen ? t('evidenceClose') : t('evidenceOpen')}
                buttonRef={evidenceTriggerRef}
                expanded={evidenceOpen}
                onToggle={() => {
                  const next = !evidenceOpen;
                  if (!next) {
                    closeEvidence();
                    return;
                  }
                  revealEvidence.current = true;
                  setEvidenceOpen(true);
                  setInspector(null);
                }}
                contractTitle={t('contractReviewed')}
                observationTitle={observationTitle}
                observationActive={agentActivity !== null && agentActivity.state !== 'blocked'}
                deltaCompactTitle={deltaCompactTitle}
                deltaStatus={deltaStatus}
                compact={railCompact}
              />
              <div
                ref={taskMenuRef}
                className="relative ml-auto flex shrink-0 items-stretch"
                data-testid="architecture-agent-task"
                onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
                  if (!taskMenuOpen) return;
                  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                  const items = [
                    ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
                  ];
                  if (items.length === 0) return;
                  const at = items.indexOf(document.activeElement as HTMLButtonElement);
                  /* From the trigger, ArrowDown enters at the top and ArrowUp at the bottom, like a native menu. */
                  const next =
                    at === -1
                      ? event.key === 'ArrowDown' ? 0 : items.length - 1
                      : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
                  items[next]?.focus();
                  event.preventDefault();
                }}
              >
                {/* The row's one primary: until a source is inspected the Delta and Observation columns are empty, and only this changes what the drawing can say. Its caret keeps the outline, so the pair reads as one split control. */}
                <Button
                  variant="primary"
                  size="md"
                  className="atlas-touch-floor rounded-r-none"
                  disabled={agentRoute === 'checking' || copyState === 'pending'}
                  data-testid="architecture-agent-action"
                  data-architecture-copy-state={agentRoute === 'clipboard' ? copyState : undefined}
                  onClick={() =>
                    runAgentTask(
                      requestedAgentKind,
                      agentTasks.find((task) => task.kind === requestedAgentKind)?.label ?? null,
                    )
                  }
                >
                  {agentRoute === 'clipboard' && copyState === 'copied' ? (
                    <Check size={ICON_SIZE.sm} aria-hidden />
                  ) : (
                    <Bot size={ICON_SIZE.sm} aria-hidden />
                  )}
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
                    <span className="col-start-1 row-start-1">
                      {agentRoute === 'checking'
                        ? t('checkingAgent')
                        : agentRoute === 'clipboard' && copyState === 'pending'
                          ? t('copyingHandoff')
                          : agentRoute === 'clipboard' && copyState === 'copied'
                            ? t('copiedShort')
                            : agentRoute === 'clipboard' && copyState === 'error'
                              ? t('copyHandoffError')
                              : idleAgentLabel}
                    </span>
                  </span>
                </Button>
                <Button
                  ref={taskMenuTriggerRef}
                  variant="outline"
                  size="md"
                  className="atlas-touch-floor -ml-px min-w-9 rounded-l-none px-2"
                  disabled={agentRoute === 'checking'}
                  aria-haspopup="menu"
                  aria-expanded={taskMenuOpen}
                  aria-label={t('agentTaskMenu')}
                  data-testid="architecture-agent-task-menu"
                  onClick={() => setTaskMenuOpen((value) => !value)}
                >
                  <ChevronDown
                    size={ICON_SIZE.sm}
                    aria-hidden
                    className={cn(
                      'transition-transform motion-reduce:transition-none',
                      taskMenuOpen && 'rotate-180',
                    )}
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
                        if (selected) setChosenAgent({ slug: selected.slug, kind: task.kind });
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
                          'h-auto min-w-0 flex-col items-start gap-0.5 px-3 py-2 focus-visible:bg-[color:var(--color-overlay-2)] focus-visible:outline-none',
                      })}
                    >
                      <span className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                        {task.label}
                      </span>
                      <span className="break-keep text-caption text-[color:var(--color-text-tertiary)]">
                        {task.hint}
                      </span>
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
              <Button
                variant="outline"
                size="md"
                className={cn('atlas-touch-floor shrink-0 max-xl:w-10 max-xl:px-0', railCompact && 'w-10 px-0')}
                onClick={(event) => {
                  if (!window.matchMedia('(min-width: 1280px)').matches) {
                    rulesSectionRef.current?.scrollIntoView({ block: 'start' });
                    rulesSectionRef.current?.focus({ preventScroll: true });
                    return;
                  }
                  if (inspector === 'rules') closeInspector();
                  else openInspector('rules', event.currentTarget);
                }}
                aria-expanded={inspector === 'rules'}
                aria-controls="architecture-blueprint"
                data-testid="architecture-inspector-toggle"
              >
                <PanelRight size={ICON_SIZE.sm} aria-hidden />
                <span className={cn('max-xl:sr-only', railCompact && 'sr-only')}>{t('inspectorTitle')}</span>
              </Button>
          </div>
          <div ref={flowHostRef} className="relative flex min-h-0 flex-1">
              <ArchitectureFlow
                profile={selected}
                modules={selectedModules}
                concepts={conceptsByProfile[selected.slug] ?? {}}
                roleLabel={roleLabel}
                /* Undefined without a record; under lower-only these are the only strokes, so losing the prop loses the drawing. */
                roleTraffic={roleTraffic}
                violatedPairs={violatedPairs}
                roleSummary={(id) => roleSummaryOf.get(id) ?? null}
                edgeSentence={(edge) =>
                  `${edge.violated ? '⊘ ' : ''}${
                    edge.kind === 'permitted'
                      ? t('permittedEdge', { from: roleLabel(edge.from), to: roleLabel(edge.to) })
                      : t('trafficEdge', {
                          from: roleLabel(edge.from),
                          to: roleLabel(edge.to),
                          count: edge.count ?? 0,
                        })
                  }`
                }
                /* Without a receipt a box shows no ledger, never zeros: an unmeasured role must not read as clean. */
                record={record}
                ledgerStatusLabel={(ledger) =>
                  ledger.state === 'no-source'
                    ? t('roleLedgerNoSource')
                    : ledger.state === 'clean'
                      ? t('roleLedgerClean', { count: ledger.outgoing })
                      : ledger.sampleLimited
                        ? t('roleLedgerViolatedAtLeast', { count: ledger.violated })
                        : t('roleLedgerViolated', {
                            count: ledger.violated,
                            total: ledger.outgoing,
                          })
                }
                ledgerImportsLabel={(count) => t('roleLedgerImports', { count })}
                deltaUnknownLabel={t('deltaUnknown')}
                contractTrackLabel={t('contractTrackLabel')}
                observationTrackLabel={t('observationTrackLabel')}
                deltaTrackLabel={t('deltaLabel')}
                deltaColumnHint={t('deltaColumnHint')}
                observationMissingLabel={t('observationMissingShort')}
                observationEmptyTitle={t('observationEmptyTitle')}
                observationEmptyBody={t('observationEmptyBody')}
                selected={selectedRole}
                roleInspectorOpen={inspector === 'role'}
                onSelect={(id, trigger) => {
                  const shouldClear = selectedRole === id && inspector === 'role';
                  const next = shouldClear ? null : id;
                  setSelectedRole(next);
                  if (next !== null) revealRoleDetail.current = true;
                  /* Choosing a role opens the dock; choosing it again clears both. */
                  if (next === null) setInspector(null);
                  else if (contextDockOpen) onOpenReview?.(selected.slug, next);
                  else openInspector('role', trigger);
                  writeArchitectureAddress(next);
                }}
                reachLabel={(role, targets) => t('reachAria', { role, targets })}
                sinkLabel={t('reachNone')}
                moduleCountLabel={(count) => t('moduleCount', { count })}
                conceptCountLabel={(count) => t('conceptCount', { count })}
                hiddenRightLabel={(count) => t('hiddenRight', { count })}
                hiddenLeftLabel={(count) => t('hiddenLeft', { count })}
                hiddenAboveLabel={(count) => t('hiddenAbove', { count })}
                hiddenBelowLabel={(count) => t('hiddenBelow', { count })}
              />
          </div>
        </div>

        <Surface
          ref={attachEvidencePanel}
          open={evidenceOpen}
          as="aside"
          motion="overlay"
          origin="right center"
          id="architecture-evidence-dock"
          aria-label={t('evidenceOverlayTitle')}
          data-testid="architecture-evidence-dock"
          data-architecture-presentation="dock"
          className="min-w-0 border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] lg:col-span-2 xl:col-span-1 xl:col-start-2 xl:row-start-1 xl:flex xl:min-h-0 xl:flex-col xl:overflow-y-auto xl:border-b-0 xl:border-l"
        >
          <div className={cn('flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--color-border-soft)] py-3', stackedGutter, 'xl:px-4')}>
            <div className="min-w-0">
              <p className="text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)]">
                {t('evidenceOverlayTitle')}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-caption text-[color:var(--color-text-tertiary)]">
                <span>{t('contractLabel')}</span>
                <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
                <span>{t('observationLabel')}</span>
                <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
                <span>{t('deltaLabel')}</span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span className="text-caption text-[color:var(--color-text-quaternary)]">
                {t('inspectorEscHint')}
              </span>
              <CloseButton
                onClick={closeEvidence}
                label={t('evidenceClose')}
                data-testid="architecture-evidence-close"
              />
            </div>
          </div>
          <div className={cn('min-w-0 py-3 xl:flex-1', stackedGutter, 'xl:p-4')}>
            <ArchitectureEvidencePlane
              ariaLabel={t('evidencePlaneAria')}
              contractLabel={t('contractLabel')}
              contractTitle={t('contractReviewed')}
              contractBody={t('contractBody', {
                pattern: selected.patterns.map((pattern) => patternLabel(pattern.name)).join(' · '),
                roles: selected.roles.length,
                evidence: selected.evidence.length,
              })}
              observationLabel={t('observationLabel')}
              observationTitle={observationTitle}
              observationBody={observationBody}
              observationNote={observationNote}
              observationActive={agentActivity !== null && agentActivity.state !== 'blocked'}
              deltaLabel={t('deltaLabel')}
              deltaTitle={deltaTitle}
              deltaBody={conformance ? t('deltaMeasuredBody') : t('deltaUnknownBody')}
              deltaStatus={deltaStatus}
            />
          </div>
        </Surface>

        {/* Below `xl` two stacked sections via `display: contents`; at `xl` a column mounted only when asked for. */}
        <div
          id="architecture-inspector"
          data-testid="architecture-inspector"
          data-architecture-inspector-open={inspectorOpen ? 'true' : 'false'}
          data-architecture-inspector={inspector ?? 'none'}
          className={cn(
            contextDockOpen ? 'hidden' : 'contents',
            inspectorOpen
              ? [
                  'xl:col-start-2 xl:row-start-1 xl:flex xl:min-h-0 xl:flex-col xl:overflow-y-auto',
                  'xl:border-l xl:border-[color:var(--color-border-soft)]',
                  /* A panel that scrolls must say so: macOS hides its overlay scrollbar until something moves. */
                  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[color:var(--color-divider)]',
                ].join(' ')
              : 'xl:hidden',
          )}
        >
          <div className="hidden shrink-0 items-center justify-between gap-2 border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3 xl:flex">
            <h2 className="min-w-0 truncate text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)]">
              {inspector === 'role' && activeRole !== null ? roleLabel(activeRole) : t('inspectorTitle')}
            </h2>
            <div className="flex shrink-0 items-center gap-1">
              <span className="text-caption text-[color:var(--color-text-quaternary)]">
                {t('inspectorEscHint')}
              </span>
              <CloseButton
                onClick={closeInspector}
                label={t('inspectorClose')}
                data-testid="architecture-inspector-close"
              />
            </div>
          </div>

          {/* The answer to the canvas's selection: what is actually in the chosen layer. */}
          <div
            ref={roleDetailRef}
            data-testid="architecture-role-detail-slot"
            className={cn(
              'mt-5 scroll-mt-3 lg:col-span-2 xl:mt-0 xl:shrink-0',
              stackedGutter,
              'xl:px-4 xl:py-3',
              inspector === 'role' ? undefined : 'xl:hidden',
            )}
          >
            {activeRole === null ? (
              <div
                className="break-keep rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] text-body text-[color:var(--color-text-tertiary)]"
                data-testid="architecture-role-detail-empty"
              >
                {/* A declined `?role=` must be stated, or it looks identical to not having picked yet; the address stays as the sender wrote it. */}
                {selectedRole === null ? null : (
                  <p
                    className="mb-2 text-[color:var(--color-text-secondary)]"
                    data-testid="architecture-role-not-in-profile"
                  >
                    {t('roleNotInProfile', { role: selectedRole })}
                  </p>
                )}
                <p className="m-0">{t('selectRoleHint')}</p>
              </div>
            ) : (
              <div
                key={activeRole}
                className="topology-chrome-in origin-left"
                data-testid="architecture-role-detail-motion"
              >
                <ArchitectureRoleDetail
                  roleId={activeRole}
                  vaultKey={vaultKey}
                  index={roleIndexOf.get(activeRole) ?? 1}
                  label={roleLabel(activeRole)}
                  summary={roleSummaryOf.get(activeRole) ?? null}
                  paths={rolePathsOf.get(activeRole) ?? []}
                  reach={roleReachOf.get(activeRole) ?? []}
                  modules={selectedModules === null ? null : selectedModules[activeRole] ?? []}
                  concepts={(conceptsByProfile[selected.slug] ?? {})[activeRole] ?? []}
                  edgeParticipants={EMPTY_EDGE_PARTICIPANTS}
                  roleLabel={roleLabel}
                  sinkLabel={t('reachNone')}
                  reachInlineLabel={(targets) => t('reachInline', { targets })}
                  moduleCountLabel={(count) => t('moduleCount', { count })}
                  moreLabel={(count) => t('moreOccupants', { count })}
                  showFewerLabel={t('fewerOccupants')}
                  layerConceptsLabel={(count) => t('layerConcepts', { count })}
                />
              </div>
            )}
          </div>

          {/* The absence is explained in the dock, not over the canvas, where it cost the chain its height. */}
          {sourceListingCapable || !sourceUnavailableReason ? null : (
            <div
              className={cn(
                'border-b border-[color:var(--color-border-soft)] py-3 lg:col-span-2 xl:shrink-0',
                stackedGutter,
                'xl:px-4',
                /* Why a module count is missing belongs with the role whose modules are missing. */
                inspector === 'role' ? undefined : 'xl:hidden',
              )}
            >
              <p
                className="break-keep text-caption text-[color:var(--color-text-quaternary)]"
                data-testid="architecture-source-unavailable"
              >
                {t(
                  sourceUnavailableReason === 'unbound'
                    ? 'sourceListingUnbound'
                    : 'sourceListingUnavailable',
                )}
              </p>
              {/* A browser can never read a source folder, so the note names the installed app; the app never offers its own download. */}
              {offersInstalledApp ? (
                <Link
                  href="/download"
                  className={controlClass({
                    shape: 'chip',
                    size: 'sm',
                    tone: 'secondary',
                    className: 'mt-2 w-fit',
                  })}
                  data-testid="architecture-get-installed-app"
                >
                  {t('getInstalledApp')}
                </Link>
              ) : null}
            </div>
          )}

        {/* One inset down the dock, so its sections share a left edge. */}
        {/* `shrink-0`, not `min-h-0`: a shrinkable child in a scrolling flex column paints over the list beneath it. */}
        <section ref={rulesSectionRef} id="architecture-blueprint" className={cn(
          'min-w-0 scroll-mt-3 py-5 md:py-8 lg:col-span-2 xl:shrink-0',
          stackedGutter,
          'xl:px-4 xl:py-3',
          inspector === 'rules' ? undefined : 'xl:hidden',
        )} aria-labelledby="architecture-blueprint-title" data-testid="architecture-blueprint" tabIndex={0}>
          <div className="flex w-full max-w-5xl flex-col xl:max-w-none">
            <div className="flex flex-wrap items-start justify-between gap-3">
              {/* The kind of drawing leads: the axis names the question and the pattern the answer (C4: clarify the diagram type and scope). */}
              <div className="min-w-0">
                <p className="text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)]">
                  {t('roles')}
                </p>
                <h2
                  id="architecture-blueprint-title"
                  className="mt-1 text-title font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]"
                  data-testid="architecture-pattern-heading"
                >
                  {selected.patterns.length > 0
                    ? selected.patterns.map((pattern) => patternLabel(pattern.name)).join(' · ')
                    : t('patternsUndeclared')}
                </h2>
                {/* The sentence below opens with the axis name, so it is not repeated here. */}
                <p className="mt-1 break-keep text-body text-[color:var(--color-text-tertiary)]">
                  <span className="block">
                    {selected.dependencyPolicy === 'lower-only'
                      ? t('dependencyLowerOnly')
                      : t('dependencyExplicit')}
                  </span>
                  <span className="mt-1 block">
                    {selected.dependencyUsages.length === 1 &&
                    selected.dependencyUsages[0] === 'value'
                      ? t('dependencyUsagesValue')
                      : t('dependencyUsagesAll')}
                  </span>
                  {/* The scanner always allows same-role imports (`rule: 'same-role'`), so the screen says so; one span per sentence keeps it apart from the governed-usages sentence. */}
                  <span className="mt-1 block">{t('dependencySameRole')}</span>
                </p>
              </div>
            </div>

            {/* The pattern is the heading, so one sentence says what the axis means instead of repeating chips. */}
            {selected.patterns.length > 0 ? (
              <p
                className="mt-2 break-keep text-body leading-prose text-[color:var(--color-text-quaternary)]"
                data-testid="architecture-axis-explainer"
              >
                {selected.patterns.map((pattern) => axisBody(pattern.axis)).join(' ')}
              </p>
            ) : null}

          </div>
        </section>
          {rulesGraph === null ? null : (
          /* One band per role carries name, globs and allowances, with arrows down the gutter; a diagram plus a list said everything twice. */
          <ArchitectureRules
            graph={rulesGraph}
            violatedPairs={violatedPairs}
            legendPermitted={t('legendPermitted')}
            legendTraffic={t('legendTraffic')}
            legendSkipHint={t('legendSkipHint')}
            legendViolated={t('legendViolated')}
            directionLabel={t('ladderDirection')}
            hiddenAtWorkbench={inspector !== 'rules'}
            className={cn(stackedGutter, 'xl:px-4')}
          />
          )}

        <aside className={cn(
          'border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] py-4 lg:col-span-2 xl:shrink-0 xl:border-b-0',
          stackedGutter,
          'xl:px-4',
          inspector === 'rules' ? undefined : 'xl:hidden',
        )}>
          <h2 className="text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)]">
            {t('profileList')}
          </h2>
          <div className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:flex xl:flex-col">
            {profiles.map((profile) => {
              const current = profile.slug === selected.slug;
              const content = (
                <span className="min-w-0">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="block min-w-0 truncate text-body-lg font-[var(--font-weight-signature)]">
                      {profile.title}
                    </span>
                    {current ? (
                      <span className="shrink-0 text-caption text-[color:var(--color-text-tertiary)]">
                        {t('profileCurrent')}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-caption text-[color:var(--color-text-tertiary)]">
                    {profile.scopePaths.join(' · ')}
                  </span>
                  {/* Tertiary, not quaternary: a clickable row's selected state composites where quaternary fails AA (`docs/DESIGN-SYSTEM.md`, quaternary ink). */}
                  <span className="mt-0.5 block truncate text-caption text-[color:var(--color-text-tertiary)]">
                    {t('railRoles', { count: profile.roles.length })}
                    {profile.patterns[0] ? ` · ${patternLabel(profile.patterns[0].name)}` : ''}
                  </span>
                </span>
              );
              if (current) {
                return (
                  <div
                    key={profile.uid}
                    aria-current="true"
                    data-testid="architecture-profile-current"
                    className="flex w-full items-center rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-2)] px-3 py-2 text-left"
                  >
                    {content}
                  </div>
                );
              }
              return (
                <RowButton
                  key={profile.uid}
                  data-testid="architecture-profile-option"
                  hoverInk="strong"
                  hoverSurface="lift"
                  onClick={() => { setSelectedSlug(profile.slug); if (contextDockOpen) onOpenReview?.(profile.slug, null); }}
                  className="w-full justify-start px-3 py-2 text-left"
                >
                  {content}
                </RowButton>
              );
            })}
          </div>
        </aside>

        </div>

        <div
          aria-hidden
          data-testid="architecture-bottom-tab-reserve"
          className="h-[var(--topology-mobile-bottom-tab-reserve)] lg:hidden"
        />
      </div>
    </main>
  );
}
