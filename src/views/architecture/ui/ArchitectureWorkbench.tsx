"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bot, Boxes, ChevronDown, PanelRight, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import {
  buildArchitectureAgentPrompt,
  buildArchitectureDraftPrompt,
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
import type {
  ArchitectureAgentRequest,
  ArchitectureAgentRoute,
} from '../model/architecture-agent';
import { cn } from '@/shared/lib/cn';
import { copyText } from '@/shared/lib/copy-text';
import { controlClass } from '@/shared/ui/control-class';
import { transientSurface } from '@/shared/ui/transient-surface';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { Link } from '@/i18n/navigation';
import { ArchitectureRoleDetail } from './ArchitectureRoleDetail';

/** The canvas owns which concepts take part in a relation; the panel does not rank by it. */
const EMPTY_EDGE_PARTICIPANTS: ReadonlySet<string> = new Set();
const EMPTY_PROFILE_PROBLEMS: ReadonlyArray<ArchitectureProfileProblem> = [];
import { Button, EmptyState, RowButton, Surface } from '@/shared/ui';
import { ArchitectureFlow } from './ArchitectureFlow';
import { ArchitectureEvidencePlane } from './ArchitectureEvidencePlane';
import { ArchitectureEvidenceRail } from './ArchitectureEvidenceRail';
import { ArchitectureRules } from './ArchitectureRules';
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

/**
 * The same document with a different role selected. Defaults stay bare, and obsolete workflow
 * stage parameters are removed when this screen next writes its state.
 */
function buildArchitectureHref(role: string | null, pathname: string): string {
  /* Preserve orthogonal route flags (`guides=off`, fixtures, future view options). */
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
/* Long enough to read a sentence that names the task: a product-manager walker saw a 1.6s
   confirmation vanish before finishing it (2026-09-03). Deliberately longer than the 1.5s the
   shared `useCopyFeedback` gives a one-word confirmation; the chosen task then stays on the button. */
const COPY_FEEDBACK_MS = 4000;

export function ArchitectureWorkbench({
  profiles,
  profileProblems = EMPTY_PROFILE_PROBLEMS,
  handoffContexts = {},
  draftHandoffContext = null,
  sourceModulesByProfile = {},
  sourceListingCapable = false,
  sourceUnavailableReason = 'browser',
  recordsByProfile = {},
  conceptsByProfile = {},
  agentRoute = 'clipboard',
  agentLabel = null,
  onAgentRequest,
  agentActivity = null,
  copyFeedbackMs = COPY_FEEDBACK_MS,
  offersInstalledApp = false,
}: {
  profiles: ArchitectureProfile[];
  /** Architecture documents this surface could not read, named rather than silently dropped. */
  profileProblems?: ReadonlyArray<ArchitectureProfileProblem>;
  handoffContexts?: Readonly<Record<string, ArchitectureHandoffContext | undefined>>;
  /** The one unambiguous project source available before any profile exists. */
  draftHandoffContext?: ArchitectureHandoffContext | null;
  /** Per profile slug, the read-only source-directory walk the page performed (installed app). */
  sourceModulesByProfile?: Readonly<Record<string, Record<string, RoleSourceModule[]>>>;
  /** Whether this surface can list a source folder at all — false in a browser, by nature. */
  sourceListingCapable?: boolean;
  /* Which absence the stage should name when it cannot list source modules. */
  sourceUnavailableReason?: 'browser' | 'unbound' | null;
  /** Per profile slug, the persisted conformance receipt read from the vault sidecar. */
  recordsByProfile?: Readonly<Record<string, ArchitectureRecord | undefined>>;
  /** Per profile slug, the reviewed concepts joined into each role (the click-open detail). */
  conceptsByProfile?: Readonly<Record<string, Record<string, RoleConcept[]>>>;
  agentRoute?: ArchitectureAgentRoute;
  agentLabel?: string | null;
  onAgentRequest?: (request: ArchitectureAgentRequest) => void;
  agentActivity?: AcpTurnActivity | null;
  /** How long a copy confirmation stays before the button returns to rest. Tests shorten it. */
  copyFeedbackMs?: number;
  /** Whether this runtime may point at the installed app. False inside the app itself. */
  offersInstalledApp?: boolean;
}) {
  const t = useTranslations('architecture');
  /*
   * The reader's own language decides which reviewed sentence is shown, and nothing else does.
   * `summary_<role>` stays the canonical fact every agent brief, prompt and CLI line prints; a
   * `summary_<role>_<locale>` line is a restatement of it for whoever is looking at the screen.
   */
  const locale = useLocale();
  const [draftCopyState, setDraftCopyState] = useState<CopyState>('idle');
  const [selectedSlug, setSelectedSlug] = useState(profiles[0]?.slug ?? null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  /*
   * ⚠️ **At workbench width the screen stops being a document.** Everything that used to sit in a
   * second grid row — the applied scopes, the pattern and its rules, the receipt, the chosen
   * role — was squeezed into whatever height the canvas left it: measured 2026-08-30 on the
   * installed app at 1512×945, that was 64px per panel, each with its own inner scroll of 66 and
   * 219px. The page scroller had 187px of travel and was already at its end, so the lower half was
   * not merely long, it was unreachable. It is a dock now: the canvas holds the height, and this
   * opens beside it when a role is clicked or the button is pressed. Below `xl` the screen stays
   * the stacked document it was, because a phone has no room for a dock beside anything.
   */
  const [inspector, setInspector] = useState<'role' | 'rules' | null>(() => {
    return readArchitectureRole() !== null ? 'role' : null;
  });
  const inspectorOpen = inspector !== null;
  const rightDockOpen = inspectorOpen || evidenceOpen;
  const evidenceTriggerRef = useRef<HTMLButtonElement>(null);
  const inspectorTriggerRef = useRef<HTMLElement | SVGElement | null>(null);


  /* Which role the canvas has chosen. It lives here because the canvas and the panel that answers
     it sit in different rows of the page grid: the drawing takes the full width, the answer is
     column content. */
  /*
   * ⚠️ **The chosen role is in the address because a selected dependency is a shareable state.** Selecting one left
   * `/ko/architecture/` unchanged and a reload dropped it (measured on the built export,
   * 2026-08-28) — and this is the half a person is likelier to send: "look at what widgets may
   * depend on" is a link, not an instruction to go and click something.
   *
   * It is also the technique the public writing on driving coding agents keeps naming: hand the
   * agent a deep link straight to the exact state instead of a sequence of clicks that reproduces
   * it. `docs/AGENT-DESIGN-METHOD.md` records where that came from.
   */
  const [selectedRole, setSelectedRole] = useState<string | null>(
    () => readArchitectureRole(),
  );

  /* Back and forward move the selected role because the address is part of the screen's state. */
  useEffect(() => {
    const syncFromHistory = () => {
      const role = readArchitectureRole();
      setSelectedRole(role);
      setInspector(role === null ? null : 'role');
    };
    window.addEventListener('popstate', syncFromHistory);
    return () => window.removeEventListener('popstate', syncFromHistory);
  }, []);
  /*
   * ⚠️ **A click on a role answers about that role, and nothing else.** The dock first carried the
   * role's answer *and* the whole profile's rules, sentences, legend and scope list underneath —
   * so every box opened the same long tail and the owner asked for the tail to be its own button
   * (2026-08-30). One dock, two contents, never both.
   */

  function openInspector(kind: 'role' | 'rules', trigger?: HTMLElement | SVGElement) {
    if (trigger) inspectorTriggerRef.current = trigger;
    setEvidenceOpen(false);
    setInspector(kind);
  }

  /**
   * ⚠️ **Closing the role's panel lets go of the role.** `inspectorOpen` initialises from
   * `?role=`, so a screen somebody deliberately closed came back open on a reload or a share
   * (judged 2026-08-30), and the address is cleared with the panel. The role used to stay chosen
   * in memory so the panel could be reopened from it, but a source-hidden walker read the result
   * as a screen that says "selected" with nothing to show for it: the pressed face, the bridge
   * and the dimmed neighbours stayed while their answer was gone (2026-09-03). Closing now
   * returns the whole chain; the rules panel closes without touching the selection.
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
  /* Which task the last copy carried, so the confirmation names it (a source-hidden walker chose
     "find improvements" and the button only said "copied", 2026-09-03). */
  const [copiedTaskLabel, setCopiedTaskLabel] = useState<string | null>(null);
  /* The last request wins: a second copy started while the first is still pending must not let
     the first one's result name the second one's task (review, 2026-09-03). */
  const copyRequest = useRef(0);
  /*
   * ⚠️ **A confirmation that never leaves is a lost button.** The copied sentence replaced the
   * button label for good; the same walker waited thirty seconds and could not tell how to copy
   * again. The feedback window is the repository's clipboard convention (`useCopyFeedback`).
   */
  useEffect(() => {
    if (copyState !== 'copied' && copyState !== 'error') return undefined;
    const timer = window.setTimeout(() => {
      setCopyState('idle');
      setCopiedTaskLabel(null);
    }, copyFeedbackMs);
    return () => window.clearTimeout(timer);
  }, [copyFeedbackMs, copyState]);
  const evidencePanelRef = useRef<HTMLElement>(null);
  const selected = useMemo(
    () => profiles.find((profile) => profile.slug === selectedSlug) ?? profiles[0] ?? null,
    [profiles, selectedSlug],
  );

  const selectedRecord = selected ? recordsByProfile[selected.slug] ?? null : null;
  const roleTraffic = selectedRecord?.brief.conformance.observedRoleEdges;
  /**
   * The crossings the receipt counted as violations, as `from>to`.
   *
   * ⚠️ Rows without a role are skipped rather than guessed at, the same refusal
   * `buildRoleLedgers` makes: a violation the receipt cannot attribute is not a violation this
   * screen may draw on someone's edge.
   */
  const violatedPairs = useMemo(() => {
    const pairs = new Set<string>();
    for (const row of selectedRecord?.brief.conformance.violations ?? []) {
      if (!row || typeof row !== 'object') continue;
      const { fromRole, toRole } = row as { fromRole?: unknown; toRole?: unknown };
      if (typeof fromRole === 'string' && typeof toRole === 'string') pairs.add(`${fromRole}>${toRole}`);
    }
    return pairs;
  }, [selectedRecord]);
  const rulesGraph = useMemo(
    () => (selected ? buildArchitectureGraph(buildArchitectureLayout(selected), roleTraffic ?? []) : null),
    [selected, roleTraffic],
  );
  useEffect(() => {
    if (!inspectorOpen) return undefined;
    /* Escape closes the dock, the way it closes every other panel in this app. */
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

  useLayoutEffect(() => {
    if (!evidenceOpen || typeof window === 'undefined') return;
    if (window.matchMedia('(min-width: 1280px)').matches) return;
    window.requestAnimationFrame(() => {
      evidencePanelRef.current?.scrollIntoView({ block: 'nearest' });
    });
  }, [evidenceOpen]);

  /*
   * ⚠️ **One button, one derived default, and a chooser for the rest.** The button used to be
   * the only door and its task was decided for the person: `conforms` meant "plan a change",
   * anything else meant "inspect". A developer whose receipt passed and whose code then changed
   * had no way to ask for a re-check, and nobody could ask where the reviewed structure itself
   * needed a decision (owner, 2026-09-03). The default stays derived; the chooser beside it
   * offers the other two tasks with one line each on what they do.
   */
  const primaryAgentKind: ArchitectureAgentTaskKind =
    selectedRecord?.brief.conformance.status === 'conforms' ? 'change' : 'verify';
  /* A task chosen from the menu stays chosen: the button carries it until the person picks another
     (walkers on 2026-09-03 could not tell afterwards which task they had copied). */
  const [chosenAgent, setChosenAgent] = useState<{ slug: string; kind: ArchitectureAgentTaskKind } | null>(null);
  /* Derived, not reset: a choice made for one profile must not follow the person to another. */
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
    /* Escape closes the menu only: this listener runs in the capture phase on the document and
       stops propagation, so the docks' window listeners never see the key. */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setTaskMenuOpen(false);
      taskMenuTriggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    /* The surface mounts its items one presence frame after `open`; the second frame is when the
       first item exists to take focus, so Arrow keys work from the moment the menu is visible. */
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

  /*
   * What the detail panel needs about the chosen role, derived from the same layout the canvas
   * draws so the two can never disagree about a role's reach or its order.
   */
  /* `selected` is null on the zero-profile screen, which is a real state: this surface renders
     an empty stage rather than refusing to mount, so the derived maps must survive it. */
  const roleLayout = useMemo(
    () => (selected ? buildArchitectureLayout(selected) : null),
    [selected],
  );
  const roleOrder = roleLayout?.rows.flat() ?? [];

  /*
   * ⚠️ **A role the profile does not have is not honoured.** The address is screen state now, so
   * it can carry a role from somebody else's vault or one the profile has since dropped — and
   * `?role=not-a-real-role` did not render an empty card, it rendered a card titled with the
   * string and asserting "depends on no role at all" (measured on the built export,
   * 2026-08-28). A screen that states a dependency rule for a role that does not exist is
   * saying something false, which is worse than saying nothing.
   *
   * Derived, not corrected. Storing the address's value and clearing it from an effect was the
   * first attempt, and the lint refused it: setting state inside an effect to fix state is a
   * cascade. The address stays as the sender wrote it; only the screen declines to honour it.
   */
  const activeRole = selectedRole && roleOrder.includes(selectedRole) ? selectedRole : null;
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
    /*
     * ⚠️ **In the screen's own order, not the file's.** These arrive in the order the profile
     * happens to list them, while the sentences under the canvas read down the chain — so one
     * role's targets appeared as "port, domain" beside the drawing and "domain · port" in its
     * card. A fresh-eyes walkthrough on 2026-08-28 caught it as "same fact, three orderings", and
     * a reader comparing the two should not have to re-sort one of them in their head.
     */
    const rank = new Map(roleOrder.map((id, index) => [id, index]));
    for (const targets of map.values()) {
      targets.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roleOrder is derived from roleLayout
  }, [roleLayout]);

  /*
   * ⚠️ **A document this surface could not read is named, not swallowed.** The parse is still
   * strict per profile — an unreadable one is not drawn — but before 2026-09-03 the whole route
   * threw, so one unknown key in one file replaced every profile in the folder with an error
   * boundary and said nothing about which file or which key. The notice carries the document and
   * the parser's own sentence, in the same amber the rail already uses for "unknown".
   */
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
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center p-5 md:p-10">
        {profileNotices ? <div className="w-full max-w-[640px]">{profileNotices}</div> : null}
        <EmptyState
          title={t('noProfiles')}
          titleAs="h1"
          description={
            agentRoute === 'clipboard'
              ? `${t('noProfilesBody')} ${t('draftNoAgentBody')}`
              : t('noProfilesBody')
          }
          icon={<Boxes aria-hidden />}
          tone="solid"
          align="center"
          /*
           * A whole-route fallback still needs the route's page-headline rung.
           * EmptyState intentionally demotes centred titles to body text, so this
           * page-owned h1 restores the existing display/strong/primary contract.
           */
          className="max-w-[640px] [&_h1]:break-keep [&_h1]:font-[var(--font-weight-strong)] [&_h1]:text-display [&_h1]:text-[color:var(--color-text-primary)]"
          /*
           * ⚠️ **The button carries the task; it used to only change the address.**
           *
           * This was a bare link to the map, defended by "the map is where an agent is already
           * connected". Measured on the installed rc.15 with the owner's own folder: pressing it
           * moved the person to the map and produced nothing, while the sentence above promised an
           * agent would read the folder and the imports and draft this. Being *where* an agent
           * lives is not the agent doing the thing the sentence promised.
           *
           * `queueAgentChatIntent` is the bridge that survives the route change — a window event
           * alone is lost, because the map's subscriber does not exist on this route. The runner is
           * left unnamed: this screen holds the task, not a runner list, and the map already reads
           * `runtimeId ?? acpRuntime?.id`.
           *
           * The app still does not call MCP itself. That is the 2026-08-24 decision behind the
           * first-run door: analysing the repository here would be a second canonical
           * implementation of `analyze_repo_structure`, which `AGENTS.md` forbids.
           */
          /*
           * ⚠️ **Two doors, because one of them was silently a dead end.**
           *
           * The agent door queues the sentence and moves to the map, where the dock opens it as
           * the first turn. But the map resolves the runner as `runtimeId ?? acpRuntime?.id`, and
           * with neither it returns early and the queued sentence is consumed and discarded — so
           * with no agent connected the person pressed a button, changed screens, and nothing
           * happened. That is the defect this button was built to fix, relocated one route right.
           *
           * The clipboard door is the one that always works, including in a browser, where
           * spawning a process is an impossibility rather than a gap. It reuses the workbench's
           * handoff vocabulary verbatim; a second set of words for the same act is how two
           * dialects start.
           *
           * The app still does not call MCP itself. That is the 2026-08-24 decision behind the
           * first-run door: analysing the repository here would be a second canonical
           * implementation of `analyze_repo_structure`, which `AGENTS.md` forbids.
           */
          action={(
            <div className="flex flex-wrap items-center justify-center gap-2">
              {agentRoute === 'agent' ? (
                <Button
                  variant="primary"
                  size="md"
                  className="atlas-touch-floor"
                  disabled={!onAgentRequest}
                  data-testid="architecture-draft-with-agent"
                  onClick={() =>
                    onAgentRequest?.({
                      kind: 'draft',
                      prompt: buildArchitectureDraftPrompt(draftHandoffContext),
                    })
                  }
                >
                  <Bot size={ICON_SIZE.sm} aria-hidden />
                  {t('draftWithAgent', { agent: agentLabel ?? t('connectedAgent') })}
                </Button>
              ) : agentRoute === 'checking' ? (
                <Button className="atlas-touch-floor" variant="primary" size="md" disabled data-testid="architecture-agent-checking">
                  <Bot size={ICON_SIZE.sm} aria-hidden />
                  {t('checkingAgent')}
                </Button>
              ) : null}
              <Button
                variant={agentRoute === 'clipboard' ? 'primary' : 'outline'}
                size="md"
                className="atlas-touch-floor"
                disabled={draftCopyState === 'pending'}
                data-testid="architecture-copy-draft-handoff"
                data-architecture-draft-copy-state={draftCopyState}
                onClick={() => {
                  setDraftCopyState('pending');
                  navigator.clipboard
                    .writeText(buildArchitectureDraftPrompt(draftHandoffContext))
                    .then(() => setDraftCopyState('copied'))
                    .catch(() => setDraftCopyState('error'));
                }}
              >
                {draftCopyState === 'pending'
                  ? t('copyingHandoff')
                  : draftCopyState === 'copied'
                    ? t('copiedHandoff')
                    : draftCopyState === 'error'
                      ? t('copyHandoffError')
                      : t('copyHandoff')}
              </Button>
              <span className="sr-only" role="status" aria-live="polite">
                {draftCopyState === 'copied'
                  ? t('copiedHandoff')
                  : draftCopyState === 'error'
                    ? t('copyHandoffError')
                    : ''}
              </span>
            </div>
          )}
        />
      </main>
    );
  }

  const selectedModules = sourceModulesByProfile[selected.slug] ?? null;
  /*
   * ⚠️ **The receipt is rendered as what it is: a dated machine measurement, not a live claim**
   * (2026-08-27 council, point 5). Three states: no record keeps the amber "Source check
   * required" — not measured on this computer, never a defect. A record renders its stamp —
   * date plus commit short sha for git sources, the fingerprint sentence (never a sha) for
   * folder sources, "with uncommitted edits" when dirty — and the verdict always carries the
   * counts beside it: violations and unknown-edge accounting, type-only edges labelled when the
   * scanner reported them. This surface cannot re-probe the source (a browser cannot, and no
   * re-verification bridge exists yet), so it says exactly that instead of claiming the stamp
   * is current.
   */
  const record = recordsByProfile[selected.slug] ?? null;
  const conformance = record?.brief.conformance ?? null;
  const measured = record?.brief.measured ?? null;
  const recordDate = measured ? measured.at.slice(0, 10) : '';
  const recordDirty = measured?.source.kind === 'git' && measured.source.dirty;
  /*
   * The same drawing the canvas builds, built again for the words beside it. Both calls are pure
   * and memoized over a seven-row profile; sharing one instance would mean lifting the canvas's
   * layout into this component, which buys nothing and costs the flow its own ownership.
   */
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
  /* An axis is free text in the contract, so a profile may declare one nobody has translated.
     Saying nothing is then the honest answer: inventing a friendly explanation for an axis we do
     not recognise would be the folder-name inference decision (2026-08-26) in another costume. */
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

  /* One path for every task: a verified agent takes it as the opening turn, anything else copies
     the same bounded sentence. The chooser and the button both end here. */
  function runAgentTask(kind: ArchitectureAgentTaskKind, taskLabel: string | null = null) {
    if (!selected) return;
    setTaskMenuOpen(false);
    if (agentRoute === 'agent') {
      setInspector(null);
      setEvidenceOpen(false);
      writeArchitectureAddress(selectedRole);
      onAgentRequest?.({ kind, prompt: promptFor(kind) });
      return;
    }
    void copyHandoff(promptFor(kind), taskLabel);
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--color-canvas)]">
      <div
        data-testid="architecture-layout-scroll"
        className={cn(
          /*
           * ⚠️ **One row at workbench width, and it does not scroll.** The second row used to hold
           * the scopes, the rules and the chosen role, and row 1 took every pixel the canvas
           * wanted first: 64px each, with their own inner scrollers, at the end of a page scroller
           * that had already run out. Docks replace it — the canvas owns the height and the rest
           * opens beside it. Below `xl` the stacked, scrolling document stays exactly as it was,
           * because a phone cannot put anything beside anything.
           */
          'architecture-workbench-grid grid min-h-0 flex-1 grid-cols-1 overflow-y-auto bg-[color:var(--color-canvas)] lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-rows-1 xl:overflow-hidden',
          evidenceOpen
            ? XL_EVIDENCE_COLUMNS
            : XL_COLUMNS[inspectorOpen ? 'inspector' : 'closed'],
        )}
      >
        {/*
          ⚠️ **The canvas takes the width; the columns sit under it.** Measured on the installed
          app 2026-08-28: inside the middle column the graph had about 806px and a seven-role
          profile needs roughly 1170px, so four boxes were on screen and three were behind a
          horizontal scroll nobody asked for. Node editors this shape borrows from do the
          opposite, giving the canvas the full width and opening the inspector over or beside it
          rather than standing a column permanently in its way.
        */}
        <div
          className="min-w-0 border-b border-[color:var(--color-border-soft)] px-5 pb-5 pt-4 md:px-8 lg:col-start-1 lg:col-end-3 xl:col-start-1 xl:col-end-2 xl:row-start-1 xl:flex xl:min-h-0 xl:flex-col xl:border-b-0 xl:pb-3 xl:pt-3"
          data-testid="architecture-flow-panel"
        >
          <header className="mb-3 shrink-0 px-1">
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
            {profileNotices ? <div className="mt-3">{profileNotices}</div> : null}
          </header>
          {/*
            The provenance explanation is available in one press, but it does not own a permanent
            150px band above the architecture. The rail keeps the three authorities visible at a
            glance; the full plane opens over the canvas below.
          */}
          <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2 md:flex-nowrap">
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
                  setEvidenceOpen(true);
                  setInspector(null);
                }}
                contractTitle={t('contractReviewed')}
                observationTitle={observationTitle}
                observationActive={agentActivity !== null && agentActivity.state !== 'blocked'}
                deltaCompactTitle={deltaCompactTitle}
                deltaStatus={deltaStatus}
                compact={rightDockOpen}
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
                  /* From the trigger (focus not on an item) ArrowDown enters at the top and
                     ArrowUp at the bottom, the way a native menu does. */
                  const next =
                    at === -1
                      ? event.key === 'ArrowDown' ? 0 : items.length - 1
                      : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
                  items[next]?.focus();
                  event.preventDefault();
                }}
              >
                <Button
                  variant="outline"
                  size="lg"
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
                  <Bot size={ICON_SIZE.sm} aria-hidden />
                  {agentRoute === 'checking'
                    ? t('checkingAgent')
                    : agentRoute === 'clipboard'
                      ? copyState === 'pending'
                        ? t('copyingHandoff')
                        : copyState === 'copied'
                          ? copiedTaskLabel
                            ? t('copiedTaskHandoff', { task: copiedTaskLabel })
                            : t('copiedHandoff')
                          : copyState === 'error'
                            ? t('copyHandoffError')
                            : t('copyTaskSentence', {
                                task: agentTasks.find((task) => task.kind === requestedAgentKind)?.label ?? '',
                              })
                      : agentTasks.find((task) => task.kind === requestedAgentKind)?.label ??
                        t('inspectSourceAction')}
                </Button>
                <Button
                  ref={taskMenuTriggerRef}
                  variant="outline"
                  size="lg"
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
                        /* The menu is leaving; focus goes back to what opened it, not to body. */
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
                size="lg"
                className="atlas-touch-floor hidden shrink-0 xl:inline-flex"
                onClick={(event) =>
                  inspector === 'rules'
                    ? closeInspector()
                    : openInspector('rules', event.currentTarget)
                }
                aria-expanded={inspector === 'rules'}
                data-testid="architecture-inspector-toggle"
              >
                <PanelRight size={ICON_SIZE.sm} aria-hidden />
                {t('inspectorTitle')}
              </Button>
          </div>
          <div className="relative flex min-h-0 flex-1">
              {/* The policy sentence is the section description above; do not print it twice. */}
              <ArchitectureFlow
                profile={selected}
                modules={selectedModules}
                concepts={conceptsByProfile[selected.slug] ?? {}}
                roleLabel={roleLabel}
                /* Measured crossings ride in from the persisted record; undefined without one.
                   Under lower-only these are the only strokes there are, so losing this prop
                   loses the entire drawing (measured on the installed app, 2026-08-28). */
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
                /* The same receipt, grouped per role. Without it a box shows no ledger at all
                   rather than a row of zeros — an unmeasured role must not read as a clean one. */
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
                contractTrackLabel={t('contractTrackLabel')}
                observationTrackLabel={t('observationTrackLabel')}
                deltaTrackLabel={t('deltaLabel')}
                observationMissingLabel={t('observationMissingShort')}
                selected={selectedRole}
                roleInspectorOpen={inspector === 'role'}
                onSelect={(id, trigger) => {
                  const shouldClear = selectedRole === id && inspector === 'role';
                  const next = shouldClear ? null : id;
                  setSelectedRole(next);
                  /* Choosing a role is the question the dock answers, so it opens with the
                     choice; clicking the same role again clears both. */
                  if (next === null) setInspector(null);
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
          ref={evidencePanelRef}
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
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--color-border-soft)] px-4 py-3">
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
            <Button
              variant="ghost"
              size="sm"
              className="atlas-touch-floor shrink-0"
              onClick={closeEvidence}
              aria-label={t('evidenceClose')}
              data-testid="architecture-evidence-close"
            >
              <span className="text-caption text-[color:var(--color-text-quaternary)]">
                {t('inspectorEscHint')}
              </span>
              <X size={ICON_SIZE.sm} aria-hidden />
            </Button>
          </div>
          <div className="min-w-0 p-3 xl:flex-1 xl:p-4">
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

        {/*
          The dock. Below `xl` these are two stacked sections in document order, exactly as
          before — `display: contents` keeps them as direct grid children there. At `xl` the
          wrapper becomes a column beside the canvas, and it is only mounted when somebody asked
          for it: by clicking a role, or by pressing the button on the canvas.
        */}
        <div
          id="architecture-inspector"
          data-testid="architecture-inspector"
          data-architecture-inspector-open={inspectorOpen ? 'true' : 'false'}
          data-architecture-inspector={inspector ?? 'none'}
          className={cn(
            'contents',
            inspectorOpen
              ? [
                  'xl:col-start-2 xl:row-start-1 xl:flex xl:min-h-0 xl:flex-col xl:overflow-y-auto',
                  'xl:border-l xl:border-[color:var(--color-border-soft)]',
                  /* ⚠️ **A panel that scrolls must say so.** macOS hides its overlay scrollbar
                     until something moves, and this file has already answered that three times —
                     the handoff packet, the canvas mask, the canvas scrollbar. A dock that cuts a
                     sentence mid-word with no visible bar is the same defect the whole change
                     exists to remove, one level down (judged 2026-08-30). */
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
              {/* The escape hatch says itself, the way the reference's breadcrumb does. */}
              <span className="text-caption text-[color:var(--color-text-quaternary)]">
                {t('inspectorEscHint')}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="atlas-touch-floor"
                onClick={closeInspector}
                aria-label={t('inspectorClose')}
                data-testid="architecture-inspector-close"
              >
                <X size={ICON_SIZE.sm} aria-hidden />
              </Button>
            </div>
          </div>

          {/*
            The answer to the canvas's selection. It is column content rather than part of the
            drawing: the graph says what the shape is, this says what is actually in the layer a
            reader chose, and the density the removed bands were good at survives here.
          */}
          <div
            className={cn(
              'mt-5 lg:col-span-2 xl:mt-0 xl:shrink-0 xl:px-4 xl:py-3',
              inspector === 'role' ? undefined : 'xl:hidden',
            )}
          >
            {activeRole === null ? (
              <div
                className="break-keep rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] text-body text-[color:var(--color-text-tertiary)]"
                data-testid="architecture-role-detail-empty"
              >
                {/*
                  ⚠️ **Declining a link silently looks exactly like not having clicked yet.** The
                  address can name a role this profile does not have — a link from another
                  profile, or one kept after the profile changed — and the screen used to render
                  the invitation below and nothing else. A fresh-eyes walker arriving on
                  `?role=widgets` measured the page as pixel-identical to an untouched one, and
                  so could not tell "the link pointed somewhere I do not have" from "I have not
                  picked anything". The refusal was already correct; it was simply not stated.

                  The address is still left as the sender wrote it. That is coherent now rather
                  than silent: the URL says what was asked for, and the screen says why it cannot
                  serve it.
                */}
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

          {/*
            ⚠️ **The absence is explained where the explanations live, not on the canvas.** It sat
            above the drawing as a bordered notice, and at 1512 that notice plus its gap was 56px —
            the exact amount by which the seven-role chain was then cut. It is the same class of
            fact as the rules beside it: why a number on the drawing is missing.
          */}
          {sourceListingCapable || !sourceUnavailableReason ? null : (
            <div
              className={cn(
                'border-b border-[color:var(--color-border-soft)] px-4 py-3 lg:col-span-2 xl:shrink-0',
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
              {/*
                ⚠️ **The one surface that can lift this absence is named where the absence is
                stated.** A browser cannot read a source folder at all, so the note ends in a fact
                with nothing to do about it; the installed app is what turns the missing module
                counts into real ones. The installed app never offers its own download, so the page
                passes this only while the runtime is a browser.
              */}
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

        {/* ⚠️ One inset down the dock. Measured 2026-08-30: the role card sat flush, the rules at
            16px and this section at 32px with a `max-w-5xl` that means nothing in a 380px column —
            three left edges in one panel, which is the repeated-set regularity this design system
            asks for and the first thing a glance down the dock failed. */}
        {/* ⚠️ `shrink-0`, not `min-h-0`: in a scrolling flex column a shrinkable child is pushed
            below its own content, and the prose then paints straight through the list beneath it
            (measured 2026-08-30 at 1512 — "Source organization says which folder…" ran across the
            edge sentences). The dock scrolls; its sections keep their natural height. */}
        <section className={cn(
          'min-w-0 p-5 md:p-8 lg:col-span-2 xl:shrink-0 xl:px-4 xl:py-3',
          inspector === 'rules' ? undefined : 'xl:hidden',
        )} aria-labelledby="architecture-blueprint-title" data-testid="architecture-blueprint" tabIndex={0}>
          <div className="mx-auto flex w-full max-w-5xl flex-col xl:max-w-none">
            {/*
              ⚠️ **`ml-auto` on the status block, because `justify-between` stops applying the
              moment the row wraps.** Measured on the built export at 1512 (2026-08-28): the
              block reported `x=336`, the heading's own x — it had dropped to its own line, and a
              `text-right` box 400px wide then sat in the left half of an 804px column as
              right-aligned prose with a ragged left edge. `ml-auto` holds it at the right edge on
              both the shared row and its own.
            */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              {/*
                ⚠️ **The kind of drawing is the subject, not a tag.** The pattern rode in a 9.5px
                chip below the heading while the heading said "roles and dependency direction" —
                a sentence true of every architecture diagram ever drawn. So the screen never told
                a first reader which of the two questions it was answering, and the owner asked
                the honest one back: *is this really architecture?* The data always knew: the axis
                is literally `source-organization` on this profile and `dependency` on the
                storefront sample. It now leads, with the axis naming the question and the pattern
                naming the answer. C4's review checklist calls this "clarify the diagram type and
                scope" — the first thing it asks of any architecture drawing.
              */}
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
                {/* The axis name is not repeated here: the sentence below already opens with it,
                    and naming it twice in two lines reads as a stutter rather than an emphasis. */}
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
                  {/*
                    The scanner's first rule is `if (fromRole === toRole) return { allowed: true,
                    rule: 'same-role' }` — unconditional, under both policies. The screen never
                    said it, and the 2026-08-28 walkthrough asked exactly this and found nothing:
                    "whether a file may import from another module in its own role" was the one
                    question left open on both samples. It is not an open question in the
                    contract, only on the screen, so the screen says it.

                    ⚠️ Both sides of the merge added a sentence here and neither replaced the
                    other: main said which import usages the rules govern, the branch said that a
                    role may always reference itself. A reader needs both, and main's one-span-per
                    -sentence shape is what keeps them from running together — which the branch had
                    been fixing by rewriting the clauses instead.
                  */}
                  <span className="mt-1 block">{t('dependencySameRole')}</span>
                </p>
              </div>
            </div>

            {/* The chips are gone: the pattern is the heading now, and repeating it beneath
                would be the same name twice with nothing added. What the chips carried that the
                heading cannot — what the axis actually means — is one sentence instead. */}
            {selected.patterns.length > 0 ? (
              <p
                className="mt-2 break-keep text-body leading-prose text-[color:var(--color-text-quaternary)]"
                data-testid="architecture-axis-explainer"
              >
                {selected.patterns.map((pattern) => axisBody(pattern.axis)).join(' ')}
              </p>
            ) : null}

            {/*
              ⚠️ **One artifact, not a picture and then a list of the same thing.** This was two
              blocks -- a diagram of four boxes, then four cards repeating the same roles -- and the
              owner's reaction to the installed build was that it neither looked good nor read as a
              flow. Saying everything twice is why: neither half could use the width, so the screen
              was simultaneously redundant and empty. One band per role carries the name, the globs
              and the allowances, and the arrows run down the gutter beside them.
            */}
          </div>
        </section>
          {rulesGraph === null ? null : (
          <ArchitectureRules
            graph={rulesGraph}
            violatedPairs={violatedPairs}
            legendPermitted={t('legendPermitted')}
            legendTraffic={t('legendTraffic')}
            legendSkipHint={t('legendSkipHint')}
            legendViolated={t('legendViolated')}
            directionLabel={t('ladderDirection')}
            hiddenAtWorkbench={inspector !== 'rules'}
          />
          )}

        <aside className={cn(
          'border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-4 lg:border-b-0 lg:border-r xl:shrink-0 xl:border-b-0 xl:border-r-0',
          inspector === 'rules' ? undefined : 'xl:hidden',
        )}>
          <h2 className="text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)]">
            {t('profileList')}
          </h2>
          <div className="mt-3 flex flex-col gap-1.5">
            {profiles.map((profile) => {
              const current = profile.slug === selected.slug;
              const content = (
                <span className="min-w-0">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="block min-w-0 truncate text-body-lg font-[var(--font-weight-signature)]">
                      {profile.title}
                    </span>
                    {current ? (
                      <span className="shrink-0 text-caption text-[color:var(--color-text-quaternary)]">
                        {t('profileCurrent')}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-caption text-[color:var(--color-text-tertiary)]">
                    {profile.scopePaths.join(' · ')}
                  </span>
                  {/* Tertiary, not quaternary: this row is clickable, so its selected state
                      composites overlay-2 where quaternary measures 4.36:1 — below AA. The
                      design system's surface license already prescribes tertiary from rows
                      that can be clicked (`docs/DESIGN-SYSTEM.md`, quaternary ink). */}
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
                  onClick={() => setSelectedSlug(profile.slug)}
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
