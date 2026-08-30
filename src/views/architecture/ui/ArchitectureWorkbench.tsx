"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileCode2,
  Footprints,
  PanelRight,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { listboxBottomIsHidden, listboxTopIsHidden } from '@/shared/ui/select-growth';
import { queueAgentChatIntent } from '@/shared/lib/agent-chat-intent';
import {
  buildArchitectureAgentPrompt,
  buildArchitectureDraftPrompt,
  buildArchitectureLayout,
  type ArchitectureHandoffContext,
  type ArchitectureProfile,
} from '@/entities/architecture-profile';
import type { ArchitectureRecord, ArchitectureRecordStatus } from '@/entities/architecture-record';
import type { RoleConcept } from '../model/role-concepts';
import type { RoleSourceModule } from '../model/source-modules';
import { cn } from '@/shared/lib/cn';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { badgeClass } from '@/shared/ui/badge-class';
import { ArchitectureRoleDetail } from './ArchitectureRoleDetail';

/** The canvas owns which concepts take part in a relation; the panel does not rank by it. */
const EMPTY_EDGE_PARTICIPANTS: ReadonlySet<string> = new Set();
import { Button, EmptyState, RowButton, Surface, buttonVariants } from '@/shared/ui';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { useDraftHandoffRoute } from '../model/use-draft-handoff-route';
import { ArchitectureFlow } from './ArchitectureFlow';
import { ArchitectureRules } from './ArchitectureRules';
import { buildArchitectureGraph } from '../model/graph-layout';

type Mode = 'understand' | 'plan' | 'verify';

const MODES: readonly Mode[] = ['understand', 'plan', 'verify'];

/**
 * The workbench columns, written out rather than composed, because a class name assembled at
 * runtime is a class name the CSS compiler never sees. `i` is the inspector dock, `s` the stage
 * dock; the canvas always takes what is left.
 */
const XL_COLUMNS = {
  '--': 'xl:grid-cols-[minmax(0,1fr)]',
  'i-': 'xl:grid-cols-[minmax(0,1fr)_380px]',
  '-s': 'xl:grid-cols-[minmax(0,1fr)_340px]',
  is: 'xl:grid-cols-[minmax(0,1fr)_380px_340px]',
} as const;

/**
 * ⚠️ **The stage lives in the URL, so a link carries it.** A fresh-eyes walkthrough on 2026-08-28
 * found that switching to the plan or verify stage left the address at `/ko/architecture/`: a
 * colleague opening a shared link always landed on understand, and a refresh discarded the stage.
 * An unknown or absent value reads as understand rather than as an error, because a URL a person
 * typed or a stale link should still open the screen.
 */
function parseArchitectureStage(raw: string | null): Mode {
  return MODES.find((mode) => mode === raw) ?? 'understand';
}

/**
 * The same document with a different query view. Defaults stay bare, so a plain address still
 * means "this screen, nothing chosen" and a link carries only what somebody actually picked.
 */
function buildArchitectureHref(
  view: { stage: Mode; role: string | null; stageOpen: boolean },
  pathname: string,
): string {
  const query = new URLSearchParams();
  /*
   * ⚠️ The stage parameter says the panel is open, not merely which stage is selected. A bare
   * address means the drawing has the frame to itself, which is the state this screen opens in.
   */
  if (view.stageOpen) query.set('stage', view.stage);
  if (view.role) query.set('role', view.role);
  const search = query.toString();
  return search ? `${pathname}?${search}` : pathname;
}

/** Whichever of the two the address carries, trusting neither. */
/** Writes the view into the address without a router navigation, the way `changeMode` does. */
function writeArchitectureAddress(view: {
  stage: Mode;
  role: string | null;
  stageOpen: boolean;
}): void {
  window.history.replaceState(
    window.history.state,
    '',
    buildArchitectureHref(view, window.location.pathname),
  );
}

function readArchitectureAddress(): { stage: Mode; role: string | null; stageOpen: boolean } {
  if (typeof window === 'undefined') return { stage: 'understand', role: null, stageOpen: false };
  const params = new URL(window.location.href).searchParams;
  return {
    stage: parseArchitectureStage(params.get('stage')),
    role: params.get('role'),
    stageOpen: params.get('stage') !== null,
  };
}
type CopyState = 'idle' | 'pending' | 'copied' | 'error';

/*
 * Receipt-status ink (2026-08-27 council, point 5): the three verdicts wear the existing signal
 * families — success emerald, error red, amber for unknown — and nothing else. The counts always
 * ride beside the verdict; a bare status word is a lie by omission.
 */
const RECORD_TONE_CLASS: Record<ArchitectureRecordStatus, string> = {
  conforms:
    'border border-[color:var(--color-success-a35)] bg-[color:var(--color-success-a12)] text-[color:var(--color-success-text-a90)]',
  violated:
    'border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a12)] text-[color:var(--color-danger-text)]',
  unknown:
    'border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] text-[color:var(--color-amber-source-a90)]',
};

const RECORD_STATUS_ICON: Record<ArchitectureRecordStatus, typeof ShieldCheck> = {
  conforms: ShieldCheck,
  violated: ShieldAlert,
  unknown: CircleHelp,
};

export function ArchitectureWorkbench({
  profiles,
  handoffContexts = {},
  sourceModulesByProfile = {},
  sourceListingCapable = false,
  sourceUnavailableReason = 'browser',
  recordsByProfile = {},
  conceptsByProfile = {},
}: {
  profiles: ArchitectureProfile[];
  handoffContexts?: Readonly<Record<string, ArchitectureHandoffContext | undefined>>;
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
}) {
  const t = useTranslations('architecture');
  const draftHandoff = useDraftHandoffRoute();
  const draftRoute = draftHandoff.route;
  const [draftCopyState, setDraftCopyState] = useState<CopyState>('idle');
  const [selectedSlug, setSelectedSlug] = useState(profiles[0]?.slug ?? null);
  /*
   * Read through native history, not `useSearchParams`. The write side already goes through
   * `history.replaceState` — a Next navigation would move focus to the document root inside the
   * WebView — and one component should not read its address one way and write it another.
   * `useSearchParams` would also pull this page under a Suspense boundary it does not otherwise
   * need under static export.
   */
  const [mode, setMode] = useState<Mode>(() => readArchitectureAddress().stage);
  /*
   * ⚠️ **The stage panel is a dock, not a column.** It owned a third of the width and, because its
   * row was sized by its own content, most of the height too: the drawing got 174px of a 1000px
   * window while a 444px agent packet sat below it. The map already answers this — its agent panel
   * opens on demand and reserves width only while open, and nothing else permanently owns the
   * space beside the canvas. Choosing a stage opens it; choosing the open one again closes it.
   */
  const [stageOpen, setStageOpen] = useState(() => readArchitectureAddress().stageOpen);
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
    /*
     * A link that names a role is a link to that role's answer, so it arrives open — unless the
     * same link also names a stage, because the two docks are exclusive (a 380px panel beside a
     * 340px one leaves a 1512 canvas too narrow for the drawing). A link that asks for both is
     * answered with the stage, which is the step somebody was in the middle of.
     */
    const address = readArchitectureAddress();
    return address.role !== null && !address.stageOpen ? 'role' : null;
  });
  const inspectorOpen = inspector !== null;


  /* Which role the canvas has chosen. It lives here because the canvas and the panel that answers
     it sit in different rows of the page grid: the drawing takes the full width, the answer is
     column content. */
  /*
   * ⚠️ **The chosen role is in the address, for the same reason the stage is.** Selecting one left
   * `/ko/architecture/` unchanged and a reload dropped it (measured on the built export,
   * 2026-08-28) — and this is the half a person is likelier to send: "look at what widgets may
   * depend on" is a link, not an instruction to go and click something.
   *
   * It is also the technique the public writing on driving coding agents keeps naming: hand the
   * agent a deep link straight to the exact state instead of a sequence of clicks that reproduces
   * it. `docs/AGENT-DESIGN-METHOD.md` records where that came from.
   */
  const [selectedRole, setSelectedRole] = useState<string | null>(
    () => readArchitectureAddress().role,
  );

  /* Back and forward move both, because the address is part of the screen's state now. */
  useEffect(() => {
    const syncFromHistory = () => {
      const address = readArchitectureAddress();
      setMode(address.stage);
      setSelectedRole(address.role);
      setStageOpen(address.stageOpen);
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

  function openInspector(kind: 'role' | 'rules') {
    setInspector(kind);
    if (!stageOpen) return;
    /*
     * ⚠️ **One dock at a time.** Measured 2026-08-30 at 1512: the inspector is 380px and the stage
     * 340px, so both open leave the canvas 628px for an 804px drawing — the chain then sits behind
     * a horizontal scroll, which is the exact defect the canvas took the full width to fix. The
     * two answer different questions (what is this role · what do I do next), so the one being
     * asked wins and the other steps aside rather than splitting the screen three ways.
     */
    setStageOpen(false);
    writeArchitectureAddress({ stage: mode, role: selectedRole, stageOpen: false });
  }

  /**
   * ⚠️ **Closing the panel closes the address with it.** `inspectorOpen` initialises from
   * `?role=`, so a screen somebody deliberately closed came back open on a reload or a share
   * (judged 2026-08-30). The chosen role stays in memory — the canvas still shows what was picked
   * and the button reopens its answer — but the link stops promising a panel nobody wants.
   */
  function closeInspector() {
    setInspector(null);
    setWalking(false);
    writeArchitectureAddress({ stage: mode, role: null, stageOpen });
  }

  const [copyState, setCopyState] = useState<CopyState>('idle');
  const layoutScrollRef = useRef<HTMLDivElement>(null);
  const stagePanelRef = useRef<HTMLElement>(null);
  const reanchorScrollEndRef = useRef(false);
  const modeChangedRef = useRef(false);
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
  /**
   * Reading the chain one role at a time.
   *
   * ⚠️ **A walk, not a camera** (2026-08-30). The reference the owner pointed at drives a guided
   * tour by flying the viewport to each step, and this canvas cannot: its scale is a contract, and
   * scaling the drawing scales the text off the ramp. So the walk moves the *selection* instead —
   * the dock already answers whichever role is chosen — and only brings the box into view where
   * the canvas is too short to hold the whole chain. The order is the drawing's own column order;
   * nothing is authored and nothing new is stored.
   */
  const walkOrder = useMemo(
    () => (rulesGraph ? [...rulesGraph.boxes].sort((a, b) => a.column - b.column).map((box) => box.id) : []),
    [rulesGraph],
  );
  const [walking, setWalking] = useState(false);
  const walkAt = selectedRole === null ? -1 : walkOrder.indexOf(selectedRole);

  /**
   * `delta` steps from wherever the walk is; `to` jumps to an absolute place in the chain.
   *
   * ⚠️ **Starting a walk starts it at the top.** Continuing from whatever was last clicked reads
   * as a random entry point — "walk the chain" promises the chain, from its first role.
   */
  const stepWalk = useCallback((delta: number, to?: number) => {
    if (walkOrder.length === 0) return;
    const target = to ?? walkAt + delta;
    const next = walkOrder[Math.min(walkOrder.length - 1, Math.max(0, target))];
    if (next === undefined) return;
    setWalking(true);
    setSelectedRole(next);
    setInspector('role');
    writeArchitectureAddress({ stage: mode, role: next, stageOpen: false });
    if (stageOpen) setStageOpen(false);
    /* Only where the canvas cannot hold the whole chain does anything move. */
    window.requestAnimationFrame(() => {
      const box = document.querySelector(`[data-testid="architecture-graph-box-${next}"]`);
      const scroller = box?.closest('[data-testid="architecture-graph"]')?.parentElement;
      if (!box || !scroller) return;
      if (scroller.scrollHeight <= scroller.clientHeight + 1) return;
      box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [mode, stageOpen, walkAt, walkOrder]);

  /**
   * ⚠️ **Closing the panel closes the address with it.** `inspectorOpen` initialises from
   * `?role=`, so a screen somebody deliberately closed came back open on a reload or a share
   * (judged 2026-08-30). The chosen role stays in memory — the canvas still shows what was picked
   * and the button reopens its answer — but the link stops promising a panel nobody wants.
   */


  useEffect(() => {
    if (!inspectorOpen) return undefined;
    /* Escape closes the dock, the way it closes every other panel in this app. It never clears the
       chosen role: the canvas keeps showing what was picked, and the button reopens the answer. */
    const onKey = (event: KeyboardEvent) => {
      if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && walking) {
        event.preventDefault();
        stepWalk(event.key === 'ArrowRight' ? 1 : -1);
        return;
      }
      if (event.key !== 'Escape') return;
      setInspector(null);
      setWalking(false);
      writeArchitectureAddress({ stage: mode, role: null, stageOpen });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inspectorOpen, mode, stageOpen, stepWalk, walking]);





  useLayoutEffect(() => {
    /*
     * Below xl the stage panel stacks under the blueprint, so a mode press up in the header can
     * change content the person cannot see (measured 2026-08-27: at 1040 and 390 the panel top
     * sat at 701/902 in shorter viewports and nothing visibly happened). When the press was not
     * the scroll-end case below, bring the newly entered stage into view. `modeChangedRef` keeps
     * the initial mount from scrolling a fresh page.
     */
    if (!reanchorScrollEndRef.current) {
      if (
        modeChangedRef.current &&
        typeof window !== 'undefined' &&
        !window.matchMedia('(min-width: 1280px)').matches
      ) {
        const active = stagePanelRef.current?.querySelector<HTMLElement>(
          `[data-architecture-stage="${mode}"]`,
        );
        if (typeof active?.scrollIntoView === 'function') {
          active.scrollIntoView({ block: 'nearest' });
        }
      }
      return;
    }
    const scroller = layoutScrollRef.current;
    if (!scroller) {
      reanchorScrollEndRef.current = false;
      return;
    }
    /* The stage panel is a dock, so at the moment a stage is chosen it does not exist yet. This
       effect exists to wait for something unmounted, so it waits for the dock too. */
    const root = stagePanelRef.current ?? scroller;

    const alignWhenActiveStageMounts = () => {
      const active = root.querySelector(
        `[data-architecture-stage="${mode}"][data-surface-state="entered"]`,
      );
      if (!active) return false;
      scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      reanchorScrollEndRef.current = false;
      return true;
    };

    if (alignWhenActiveStageMounts()) return;
    const observer = new MutationObserver(() => {
      if (alignWhenActiveStageMounts()) observer.disconnect();
    });
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-surface-state'],
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [mode]);

  const handoff = selected
    ? buildArchitectureAgentPrompt(selected, handoffContexts[selected.slug] ?? null)
    : '';
  /*
   * Which edge of the packet preview is covered. `listboxTopIsHidden`/`listboxBottomIsHidden` are
   * the repository's one answer to "is something hidden past this edge"; reusing them keeps the
   * judgment identical to the select listbox and the composer.
   */
  const handoffRef = useRef<HTMLPreElement | null>(null);
  const [handoffEdges, setHandoffEdges] = useState<{ top: boolean; bottom: boolean }>({
    top: false,
    bottom: false,
  });
  const readHandoffEdges = useCallback(() => {
    const element = handoffRef.current;
    if (!element) return;
    const overflowing = element.scrollHeight > element.clientHeight + 1;
    setHandoffEdges({
      top: listboxTopIsHidden(overflowing, element.scrollTop),
      bottom: listboxBottomIsHidden(
        overflowing,
        element.scrollTop,
        element.clientHeight,
        element.scrollHeight,
      ),
    });
  }, []);

  /*
   * ⚠️ **A callback ref, because an effect fires before this element exists.** Measured on the
   * built export (2026-08-28): entering plan mode gave `clientHeight 190, scrollHeight 444` and
   * `mask-image: none` — 254px hidden with nothing on screen saying so, which a fresh-eyes walker
   * read as a sentence truncated mid-word. Any scroll fixed it, and that is the tell: the reading
   * ran once, when the block was not yet mounted, and nothing re-measured. Adding a
   * `ResizeObserver` inside an effect did not help, because that effect saw the same null ref.
   *
   * Attaching to the node itself removes the timing question: it runs when the element arrives,
   * however late that is. The observer then covers the box settling afterwards, and `fonts.ready`
   * covers text growing inside a box that never changes — the late-web-font case `select.tsx`
   * already names in the comment beside the very helpers this reuses.
   */
  const observerRef = useRef<ResizeObserver | null>(null);
  const attachHandoff = useCallback(
    (element: HTMLPreElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      handoffRef.current = element;
      if (!element) return;
      readHandoffEdges();
      void document.fonts?.ready.then(readHandoffEdges);
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(readHandoffEdges);
      observer.observe(element);
      observerRef.current = observer;
    },
    [readHandoffEdges],
  );
  /* The text itself can change while the element stays put, so the content is a trigger too. */
  useLayoutEffect(readHandoffEdges, [readHandoffEdges, handoff, mode]);

  const handoffMask = (() => {
    const fade = 'var(--leading-body)';
    if (handoffEdges.top && handoffEdges.bottom) {
      return `linear-gradient(to bottom, transparent 0, #000 ${fade}, #000 calc(100% - ${fade}), transparent 100%)`;
    }
    if (handoffEdges.top) return `linear-gradient(to bottom, transparent 0, #000 ${fade})`;
    if (handoffEdges.bottom) return `linear-gradient(to top, transparent 0, #000 ${fade})`;
    return undefined;
  })();

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
      .filter((role) => role.summary)
      .map((role) => [role.id, role.summary as string]),
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

  if (!selected) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center p-5 md:p-10">
        <EmptyState
          title={t('noProfiles')}
          titleAs="h1"
          description={
            draftRoute === 'clipboard'
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
           * spawning a process is an impossibility rather than a gap. It reuses Plan mode's
           * clipboard vocabulary verbatim; a second set of words for the same act is how two
           * dialects start.
           *
           * The app still does not call MCP itself. That is the 2026-08-24 decision behind the
           * first-run door: analysing the repository here would be a second canonical
           * implementation of `analyze_repo_structure`, which `AGENTS.md` forbids.
           */
          action={(
            <div className="flex flex-wrap items-center justify-center gap-2">
              {draftRoute === 'clipboard' ? null : (
                <Link
                  href="/topology/"
                  className={cn(buttonVariants({ variant: 'primary', size: 'md' }))}
                  data-testid="architecture-draft-from-code"
                  /*
                   * Written synchronously before the navigation, so the sentence is already in
                   * session storage by the time the map mounts and consumes it. It stays an anchor
                   * because the act really is a navigation — the agent dock lives on the map.
                   */
                  onClick={() => queueAgentChatIntent(draftHandoff.runtimeId, buildArchitectureDraftPrompt(null))}
                >
                  {t('draftFromCode')}
                </Link>
              )}
              <Button
                variant={draftRoute === 'clipboard' ? 'primary' : 'outline'}
                size="md"
                disabled={draftCopyState === 'pending'}
                data-testid="architecture-copy-draft-handoff"
                data-architecture-draft-copy-state={draftCopyState}
                onClick={() => {
                  setDraftCopyState('pending');
                  navigator.clipboard
                    .writeText(buildArchitectureDraftPrompt(null))
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
  const RecordStatusIcon = conformance ? RECORD_STATUS_ICON[conformance.status] : CircleHelp;
  /* Unique placements: one module two globs both reach is one module, not two. */
  const moduleTotal = selectedModules
    ? new Set(Object.values(selectedModules).flat().map((module) => module.path)).size
    : null;
  const patternLabel = (name: string) =>
    t.has(`patternLabels.${name}`) ? t(`patternLabels.${name}`) : name;
  /* An axis is free text in the contract, so a profile may declare one nobody has translated.
     Saying nothing is then the honest answer: inventing a friendly explanation for an axis we do
     not recognise would be the folder-name inference decision (2026-08-26) in another costume. */
  const axisBody = (axis: string) =>
    t.has(`patternAxes.${axis}.body`) ? t(`patternAxes.${axis}.body`) : '';
  /* Every number is derived from the reviewed profile or the source walk. The module
     tile drops out where no source folder can be read, which is what makes the count
     odd — the grid below handles that rather than the list pretending otherwise. */
  const statTiles: readonly (readonly [number, string])[] = [
    [selected.roles.length, t('statRoles')],
    ...(moduleTotal !== null ? ([[moduleTotal, t('statModules')]] as const) : []),
    [selected.patterns.length, t('patterns')],
    [selected.evidence.length, t('statEvidence')],
  ];
  const roleLabel = (id: string) =>
    t.has(`roleLabels.${id}`) ? t(`roleLabels.${id}`) : id;

  async function copyHandoff() {
    setCopyState('pending');
    try {
      await navigator.clipboard.writeText(handoff);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }

  function changeMode(nextMode: Mode) {
    const scroller = layoutScrollRef.current;
    const maxScrollTop = scroller
      ? Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      : 0;
    reanchorScrollEndRef.current = Boolean(
      scroller && maxScrollTop > 0 && maxScrollTop - scroller.scrollTop <= 1,
    );
    if (nextMode !== mode) setCopyState('idle');
    modeChangedRef.current = true;
    const nextOpen = !(stageOpen && nextMode === mode);
    setMode(nextMode);
    setStageOpen(nextOpen);
    /*
     * ⚠️ **One dock at a time.** Measured 2026-08-30 at 1512: the inspector is 380px and the stage
     * 340px, so both open leave the canvas 628px for an 804px drawing — the chain then sits behind
     * a horizontal scroll, which is the exact defect the canvas took the full width to fix. The
     * two answer different questions (what is this role · what do I do next), so the one being
     * asked wins and the other steps aside rather than splitting the screen three ways.
     */
    if (nextOpen) setInspector(null);
    /*
     * The same document, a different query view. A Next router navigation would move focus to the
     * document root inside the WebView, so the address is updated through native history the way
     * `OntologyInsightsPage` already does — screen state and URL change in one event, which keeps
     * the segmented control's roving focus intact.
     */
    window.history.replaceState(
      window.history.state,
      '',
      buildArchitectureHref(
        { stage: nextMode, role: selectedRole, stageOpen: nextOpen },
        window.location.pathname,
      ),
    );
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--color-canvas)]">
      <header className="shrink-0 border-b border-[color:var(--color-border-soft)] px-5 py-4 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
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
              {/*
                ⚠️ **The drawing says what kind of drawing it is, at rest.** The pattern heading is
                the answer to the owner's own question — *is this really architecture?* — and the
                2026-08-28 record put it first for that reason. The dock moved it below a fold that
                is closed by default, so the name comes back up here, where it costs one phrase
                (judged 2026-08-30).
              */}
              {selected.patterns.length === 0 ? null : (
                <span
                  className="text-body text-[color:var(--color-text-quaternary)]"
                  data-testid="architecture-header-pattern"
                >
                  {selected.patterns.map((pattern) => patternLabel(pattern.name)).join(' · ')}
                </span>
              )}
            </div>
            <p className="mt-1 text-body text-[color:var(--color-text-tertiary)]">
              {t('description')}
            </p>
          </div>
          <SegmentedControl
            ariaLabel={t('modesAria')}
            value={mode}
            onChange={changeMode}
            options={([
              ['understand', t('modes.understand')],
              ['plan', t('modes.plan')],
              ['verify', t('modes.verify')],
            ] as const).map(([value, label]) => ({
              value,
              label,
              testId: `architecture-mode-${value}`,
            }))}
            size="lg"
          />
        </div>
      </header>

      <div
        ref={layoutScrollRef}
        data-testid="architecture-layout-scroll"
        data-architecture-scroll-reanchor="mode-end"
        className={cn(
          /*
           * ⚠️ **One row at workbench width, and it does not scroll.** The second row used to hold
           * the scopes, the rules and the chosen role, and row 1 took every pixel the canvas
           * wanted first: 64px each, with their own inner scrollers, at the end of a page scroller
           * that had already run out. Docks replace it — the canvas owns the height and the rest
           * opens beside it. Below `xl` the stacked, scrolling document stays exactly as it was,
           * because a phone cannot put anything beside anything.
           */
          'grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-rows-1 xl:overflow-hidden',
          XL_COLUMNS[`${inspectorOpen ? 'i' : '-'}${stageOpen ? 's' : '-'}`],
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
          data-architecture-mode={mode}
        >
          {/*
            ⚠️ **What the receipt says stays on the canvas; why it says it moved into the dock.**
            The status used to live in the second row with the rules, and that row is a dock now —
            a verdict nobody has opened is a verdict nobody reads, and "unknown is not compliant"
            is exactly the sentence this screen may not hide. So the stamp sits beside the drawing
            at every width, and the button beside it opens the rules that explain it.
          */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 xl:mb-2">
          {record && conformance && measured ? (
            <div
              /* One row, not a stacked block: on the canvas this is a caption strip beside the
                 drawing, and three stacked lines cost the chain 46px of the height it needs. */
              className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1"
              data-testid="architecture-record-status"
              data-architecture-record-status={conformance.status}
            >
              <span
                className={badgeClass({
                  shape: 'pill',
                  className: RECORD_TONE_CLASS[conformance.status],
                })}
                data-testid="architecture-record-pill"
              >
                <RecordStatusIcon size={ICON_SIZE.sm} aria-hidden />
                {t(`recordStatus.${conformance.status}`)} · {recordCounts}
              </span>
              <p
                className="text-caption text-[color:var(--color-text-tertiary)]"
                data-testid="architecture-record-stamp"
              >
                {measured.source.kind === 'git'
                  ? t('recordCheckedGit', { date: recordDate, sha: measured.source.revision })
                  : t('recordCheckedFolder', { date: recordDate })}
                {recordDirty ? ` ${t('recordDirty')}` : ''}
              </p>
              <p
                className="text-caption text-[color:var(--color-text-quaternary)]"
                data-testid="architecture-record-cannot-confirm"
              >
                {t('recordCannotConfirm')}
              </p>
            </div>
          ) : (
            /*
             * ⚠️ **A warning with no next step is a dead end** (fresh-eyes walkthrough,
             * 2026-08-28: *"`Source check required` is a dead-end warning. Non-interactive
             * span, no tooltip, no next step."*). The pill named an absence and stopped
             * there, while the only sentence explaining it sat far below in the Understand
             * stage. The line beneath the pill now names the one command that writes the
             * missing record and the stage that hands the same job to an agent.
             *
             * Deliberately not a button: this screen never measures anything — conformance
             * comes only from `inspect_architecture` or `atlas architecture` — and a control
             * that looked like it could scan would be a worse lie than the silence it
             * replaced.
             */
            <div
              className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1"
              data-testid="architecture-source-check"
            >
              <span className={badgeClass({
                shape: 'pill',
                className: 'border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] text-[color:var(--color-amber-source-a90)]',
              })}>
                <CircleHelp size={ICON_SIZE.sm} aria-hidden />
                {t('sourceCheckRequired')}
              </span>
              <p
                className="break-keep text-caption text-[color:var(--color-text-tertiary)]"
                data-testid="architecture-source-check-next"
              >
                {t('sourceCheckNext')}
              </p>
            </div>
            )}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {/*
                ⚠️ **A walk, not a tour with a camera.** The reference flies its viewport from step
                to step; this canvas holds one scale by contract, so the walk moves the selection
                and lets the panel do the talking — and only scrolls where the chain does not fit.
              */}
              <Button
                variant="outline"
                size="sm"
                className="hidden shrink-0 xl:inline-flex"
                onClick={() => (walking ? closeInspector() : stepWalk(0, 0))}
                data-testid="architecture-walk"
              >
                <Footprints size={ICON_SIZE.sm} aria-hidden />
                {walking ? t('walkStop') : t('walkChain')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="hidden shrink-0 xl:inline-flex"
                onClick={() => (inspector === 'rules' ? closeInspector() : openInspector('rules'))}
                aria-expanded={inspector === 'rules'}
                data-testid="architecture-inspector-toggle"
              >
                <PanelRight size={ICON_SIZE.sm} aria-hidden />
                {t('inspectorTitle')}
              </Button>
            </div>
          </div>
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
                selected={selectedRole}
                onSelect={(id) => {
                  const next = selectedRole === id ? null : id;
                  setSelectedRole(next);
                  /* Choosing a role is the question the dock answers, so it opens with the
                     choice; clicking the same role again clears both. */
                  if (next === null) setInspector(null);
                  else openInspector('role');
                  window.history.replaceState(
                    window.history.state,
                    '',
                    buildArchitectureHref(
                      { stage: mode, role: next, stageOpen },
                      window.location.pathname,
                    ),
                  );
                }}
                reachLabel={(role, targets) => t('reachAria', { role, targets })}
                sinkLabel={t('reachNone')}
                moduleCountLabel={(count) => t('moduleCount', { count })}
                conceptCountLabel={(count) => t('conceptCount', { count })}
                hiddenRightLabel={(count) => t('hiddenRight', { count })}
                hiddenLeftLabel={(count) => t('hiddenLeft', { count })}
                hiddenAboveLabel={(count) => t('hiddenAbove', { count })}
                hiddenBelowLabel={(count) => t('hiddenBelow', { count })}
                runLabel={t('runFlow')}
              />
        </div>

        {/*
          The dock. Below `xl` these are two stacked sections in document order, exactly as
          before — `display: contents` keeps them as direct grid children there. At `xl` the
          wrapper becomes a column beside the canvas, and it is only mounted when somebody asked
          for it: by clicking a role, or by pressing the button on the canvas.
        */}
        <div
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
              {walking && walkAt >= 0 ? (
                <>
                  <span
                    className="mr-1 text-caption tabular-nums text-[color:var(--color-text-quaternary)]"
                    data-testid="architecture-walk-step"
                  >
                    {t('walkStep', { index: walkAt + 1, total: walkOrder.length })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => stepWalk(-1)}
                    disabled={walkAt <= 0}
                    aria-label={t('walkPrev')}
                    data-testid="architecture-walk-prev"
                  >
                    <ChevronLeft size={ICON_SIZE.sm} aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => stepWalk(1)}
                    disabled={walkAt >= walkOrder.length - 1}
                    aria-label={t('walkNext')}
                    data-testid="architecture-walk-next"
                  >
                    <ChevronRight size={ICON_SIZE.sm} aria-hidden />
                  </Button>
                </>
              ) : null}
              {/* The escape hatch says itself, the way the reference's breadcrumb does. */}
              <span className="text-caption text-[color:var(--color-text-quaternary)]">
                {t('inspectorEscHint')}
              </span>
              <Button
                variant="ghost"
                size="sm"
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
            )}
          </div>

          {/*
            ⚠️ **The absence is explained where the explanations live, not on the canvas.** It sat
            above the drawing as a bordered notice, and at 1512 that notice plus its gap was 56px —
            the exact amount by which the seven-role chain was then cut. It is the same class of
            fact as the rules beside it: why a number on the drawing is missing.
          */}
          {sourceListingCapable || !sourceUnavailableReason ? null : (
            <p
              className={cn(
                'break-keep border-b border-[color:var(--color-border-soft)] px-4 py-3 text-caption text-[color:var(--color-text-quaternary)] lg:col-span-2 xl:shrink-0',
                /* Why a module count is missing belongs with the role whose modules are missing. */
                inspector === 'role' ? undefined : 'xl:hidden',
              )}
              data-testid="architecture-source-unavailable"
            >
              {t(
                sourceUnavailableReason === 'unbound'
                  ? 'sourceListingUnbound'
                  : 'sourceListingUnavailable',
              )}
            </p>
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

              `data-architecture-mode` stays here because the scroll-reanchor test uses it to tell
              which stage is mounted; it moved with the block it was attached to.
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
            legendShapeEnd={t('legendShapeEnd')}
            legendShapeWork={t('legendShapeWork')}
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
            {profiles.map((profile) => (
              <RowButton
                key={profile.uid}
                active={profile.slug === selected.slug}
                hoverInk="strong"
                hoverSurface="lift"
                onClick={() => setSelectedSlug(profile.slug)}
                className="w-full justify-start px-3 py-2 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-body-lg font-[var(--font-weight-signature)]">
                    {profile.title}
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
              </RowButton>
            ))}
          </div>
        </aside>

        </div>

        {!stageOpen ? null : (
        <aside ref={stagePanelRef} className={cn(
          /*
           * ⚠️ **Longhand placement, because a span shorthand cannot be overridden by one.**
           * `lg:col-span-2` emits `grid-column: span 2 / span 2`, and an `xl:col-end-*` longhand
           * lost to it in the cascade: the stage went on spanning two tracks at `xl`, the grid
           * invented a third for it, and the canvas was squeezed to a 218px strip with the stage
           * sprawling beside it (measured on the installed app and reproduced at 1512,
           * 2026-08-30). Both ends are stated at both breakpoints now.
           */
          'border-t border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-5 lg:col-start-1 lg:col-end-3 xl:row-start-1 xl:min-h-0 xl:border-l xl:border-t-0 xl:overflow-y-auto',
          /*
           * The stage sits outside the inspector, so which column it lands in depends on whether
           * the inspector is there to sit beside.
           *
           * ⚠️ **Both ends, always.** `lg:col-span-2` still applies at `xl`, so a start with no end
           * made this aside span two tracks — and where only two exist the grid invented a third,
           * squeezing the canvas to a 220px strip with the stage sprawling beside it (measured on
           * the installed app, 2026-08-30). An explicit end is what the old placement had, and
           * removing it was the regression.
           */
          inspectorOpen ? 'xl:col-start-3 xl:col-end-4' : 'xl:col-start-2 xl:col-end-3',
        )}>
          <div className="grid">
          <Surface open={mode === 'understand'} as="section" data-architecture-stage="understand" className="col-start-1 row-start-1 min-w-0">
            <FileCode2 size={ICON_SIZE.lg} className="text-[color:var(--color-indigo-text-soft)]" aria-hidden />
            <h2 className="mt-3 text-title font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
              {t('understandTitle')}
            </h2>
            {/* Numbers before prose: the derived facts win the first glance, the explanation
                follows for whoever wants it. Every number here comes from the reviewed profile
                and the source walk — the reference mockup's stat cards carried an uptime nobody
                measures, and that is the part that did not survive translation.

                Position carries that priority, not size: the numeral sits at the title step,
                because the display step is the page title's own size and nothing outside an h1
                may match it. `text-title` is also where the app's other derived numerals live
                (DomainCapacityBar, the insights overview).

                An odd tile count would otherwise leave a half-width hole in the second column —
                visible whenever no source folder can be read and the module tile drops out,
                which is every browser. The last tile takes the whole row instead. */}
            <dl className="mt-4 grid grid-cols-2 gap-2" data-testid="architecture-stats">
              {statTiles.map(([value, label], index) => (
                <div
                  key={label}
                  className={`rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] ${
                    statTiles.length % 2 === 1 && index === statTiles.length - 1 ? 'col-span-2' : ''
                  }`}
                >
                  <dd className="m-0 text-title font-[var(--font-weight-strong)] leading-display-tight tabular-nums text-[color:var(--color-text-primary)]">
                    {value}
                  </dd>
                  <dt className="mt-1 text-caption text-[color:var(--color-text-quaternary)]">
                    {label}
                  </dt>
                </div>
              ))}
            </dl>
            <p className="mt-4 break-keep text-body leading-prose text-[color:var(--color-text-tertiary)]">
              {t('understandBody')}
            </p>
            <h3 className="mt-6 text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)]">
              {t('evidenceTitle')}
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
              {selected.evidence.map((entry) => (
                <li key={entry} className="rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-3 py-2 font-mono text-caption text-[color:var(--color-text-tertiary)]">
                  {entry}
                </li>
              ))}
            </ul>
            <p className="mt-5 break-keep text-body text-[color:var(--color-text-tertiary)]">
              {t('sourceCheckBody')}
            </p>
          </Surface>

          <Surface open={mode === 'plan'} as="section" data-architecture-stage="plan" className="col-start-1 row-start-1 min-w-0">
            <Bot size={ICON_SIZE.lg} className="text-[color:var(--color-indigo-text-soft)]" aria-hidden />
            <h2 className="mt-3 text-title font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
              {t('planTitle')}
            </h2>
            <p className="mt-2 break-keep text-body-lg leading-prose text-[color:var(--color-text-tertiary)]">
              {t('planBody')}
            </p>
            {/*
              The box scrolls, but macOS hides its overlay scrollbar until something moves — so a
              packet longer than 12rem simply stopped mid-sentence and read as truncated text
              (2026-08-28 inspection, installed app: "…does not embed a current conformance").
              The covered edge gets the same fade the select listbox uses, on the same helpers, so
              two surfaces solving one problem do not answer it differently.

              ⚠️ **On the wide layout the cap is lifted, because the panel around it is already a
              scroller.** A second walkthrough measured 254px hidden inside a 190px box while 237px
              of that panel sat unused below it — and raising the viewport 200px gave the packet
              none of it, because 12rem is a constant and the panel is not. Two nested scrollers
              was the defect; one is the fix, and it needs no new number. Below `xl` the panel does
              not scroll, so the cap and its fade stay exactly as they were.
            */}
            <pre
              ref={attachHandoff}
              onScroll={readHandoffEdges}
              className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] p-3 font-mono text-caption leading-prose text-[color:var(--color-text-tertiary)] xl:max-h-none xl:overflow-visible"
              style={handoffMask ? { maskImage: handoffMask, WebkitMaskImage: handoffMask } : undefined}
              aria-label={t('handoffPreview')}
              tabIndex={0}
            >
              {handoff}
            </pre>
            <Button
              className="mt-4"
              variant="primary"
              size="sm"
              disabled={copyState === 'pending'}
              data-architecture-copy-state={copyState}
              onClick={() => void copyHandoff()}
            >
              {copyState === 'pending'
                ? t('copyingHandoff')
                : copyState === 'copied'
                  ? t('copiedHandoff')
                  : copyState === 'error'
                    ? t('copyHandoffError')
                    : t('copyHandoff')}
            </Button>
            <p className="sr-only" role="status" aria-live="polite">
              {copyState === 'copied'
                ? t('copiedHandoff')
                : copyState === 'error'
                  ? t('copyHandoffError')
                  : ''}
            </p>
          </Surface>

          <Surface open={mode === 'verify'} as="section" data-architecture-stage="verify" className="col-start-1 row-start-1 min-w-0">
            <ShieldCheck size={ICON_SIZE.lg} className="text-[color:var(--color-indigo-text-soft)]" aria-hidden />
            <h2 className="mt-3 text-title font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
              {t('verifyTitle')}
            </h2>
            <p className="mt-2 break-keep text-body-lg leading-prose text-[color:var(--color-text-tertiary)]">
              {t('verifyBody')}
            </p>
            <p className="mt-4 rounded-card border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] px-3 py-3 text-body text-[color:var(--color-amber-source-a90)]">
              {t('unknownIsNotCompliant')}
            </p>
            <p className="mt-4 font-mono text-caption leading-prose text-[color:var(--color-text-tertiary)]">
              {t('verifyCommands')}
            </p>
          </Surface>
          </div>
        </aside>
        )}
        <div
          aria-hidden
          data-testid="architecture-bottom-tab-reserve"
          className="h-[var(--topology-mobile-bottom-tab-reserve)] lg:hidden"
        />
      </div>
    </main>
  );
}
