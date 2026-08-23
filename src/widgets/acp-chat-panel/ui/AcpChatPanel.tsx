'use client';

import { ArrowUp, ChevronRight, History, LoaderCircle, Square, SquarePen, X } from 'lucide-react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslations } from 'next-intl';

import { Chip, IconButton, RowButton, Select, Surface, Textarea } from '@/shared/ui';
import { Tooltip, TooltipProvider } from '@/shared/ui/tooltip';
import { formatDate } from '@/shared/lib/format-date';
import { badgeClass } from '@/shared/ui/badge-class';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useHeldValue } from '@/shared/lib/use-presence';
import {
  COMPOSER_MIN_ROWS,
  composerGrowth,
  composerMaxRows,
  snapScrollTop,
} from '@/shared/lib/composer-growth';
import { cn } from '@/shared/lib/cn';
import { MOTION } from '@/shared/motion';
import { usePrefersReducedMotion } from '@/shared/lib/use-prefers-reduced-motion';
import {
  buildOntologyChangeSet,
  type OntologyChangeSet,
} from '@/entities/knowledge-graph';
import { useRowDisclosure } from '@/shared/lib/use-row-disclosure';
import { useAcpSession, type AcpEvent } from '@/features/acp-session/model/use-acp-session';
import { readAcpTrouble } from '@/features/acp-session/model/acp-trouble';
import { isAgentDoctorAvailable } from '@/features/acp-doctor/model/acp-doctor';
import { useAgentDoctor } from '@/features/acp-doctor/ui/AgentDoctor';
import {
  matchSlashCommands,
  slashQuery,
  type AcpSlashCommand,
} from '@/features/acp-session/model/slash-commands';
import { claudeLoginRepairCommand } from '@/features/acp-session/model/claude-login-repair';
import { modeCopyKey } from '@/features/acp-session/model/mode-copy';
import { withoutErrorEcho } from '@/features/acp-session/model/error-echo';
import type { ChatSuggestion } from '@/features/acp-session/model/chat-suggestions';
import { linkSlugs } from '@/features/acp-session/model/link-slugs';
import { readToolTargets } from '@/features/acp-session/model/tool-targets';
import {
  deriveAcpTurnActivity,
  type AcpTurnActivity,
} from '@/features/acp-session/model/acp-turn-activity';
import type { AcpWorkReceipt } from '@/shared/lib/acp-work-receipt';

import { VAULT_MCP_SERVER_NAME } from '@/features/acp-session/model/vault-mcp-server';
import {
  deriveAcpMapIntent,
  type AcpMapIntent,
} from '@/features/acp-session/model/map-intent';

import { AcpPermissionCard } from './AcpPermissionCard';
import { groupEvents } from './group-events';
import { toolLabel } from './tool-label';

/**
 * Markdown inside the conversation — one set of values tuned to **chat density**.
 *
 * The document screen (`ProjectDetailPage`) has a string of the same nature, but it
 * is for a body page: one step larger with three times the heading margin. If a
 * third consumer appears we promote a shared one — today these two are **genuinely
 * different densities**, and merging them breaks one.
 */
const CHAT_MARKDOWN = [
  'break-keep text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_p]:mb-2',
  '[&_ul]:my-2 [&_ul]:pl-[18px] [&_ol]:my-2 [&_ol]:pl-[18px]',
  '[&_li]:mb-1 [&_li]:list-disc [&_li]:pl-0.5 [&_li::marker]:text-[color:var(--color-text-quaternary)]',
  '[&_code]:rounded-micro [&_code]:border [&_code]:border-[color:var(--color-border-soft)]',
  '[&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-label [&_code]:text-[color:var(--color-text-tertiary)]',
  '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-card [&_pre]:border',
  '[&_pre]:border-[color:var(--color-border-soft)] [&_pre]:bg-[color:var(--color-overlay-1)] [&_pre]:p-2.5',
  '[&_pre_code]:border-0 [&_pre_code]:p-0',
  '[&_strong]:font-[var(--font-weight-strong)] [&_strong]:text-[color:var(--color-text-primary)]',
  '[&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-body-lg [&_h1]:font-[var(--font-weight-strong)] [&_h1]:text-[color:var(--color-text-primary)]',
  '[&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-body-lg [&_h2]:font-[var(--font-weight-strong)] [&_h2]:text-[color:var(--color-text-primary)]',
  '[&_h3]:mt-2.5 [&_h3]:mb-1 [&_h3]:text-body [&_h3]:font-[var(--font-weight-strong)] [&_h3]:text-[color:var(--color-text-primary)]',
  '[&_a]:text-[color:var(--color-indigo-accent)] [&_a]:underline-offset-2',
].join(' ');

/** The supporting density when the work trace is expanded. It must be one step quieter than the answer. */
const WORK_MARKDOWN = [
  'break-keep text-label leading-label text-[color:var(--color-text-quaternary)]',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_p]:mb-1.5',
  '[&_ul]:my-1.5 [&_ul]:pl-[18px] [&_ol]:my-1.5 [&_ol]:pl-[18px]',
  '[&_li]:mb-1 [&_li]:list-disc',
  '[&_code]:rounded-micro [&_code]:border [&_code]:border-[color:var(--color-border-soft)]',
  '[&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-caption',
  '[&_strong]:font-[var(--font-weight-emphasis)] [&_strong]:text-[color:var(--color-text-tertiary)]',
].join(' ');

/**
 * The conversation with the user's own coding agent, inside the app.
 *
 * ## The one job of this screen
 *
 * **Ask, right here, about the vault currently open, using the agent you already
 * run.** So there is nothing new to set up — no key, no config file, no terminal
 * round trip.
 *
 * ## Attention order
 *
 * Permission card > conversation > composer. While the permission card is up the
 * agent is stopped, so it is the most urgent thing on screen. That is why it sits
 * **directly above the composer** rather than above the list — where the eyes and
 * hands already are.
 *
 * ## Thinking is distinguished from speech
 *
 * The agent's "thought" (thinking) is not an answer. Drawn at the same weight, the user
 * reads an intermediate step as the conclusion. So it is dim and small — but not
 * hidden (seeing what is happening is what makes the wait bearable).
 */
/**
 * How many entries the menu shows at once. Measured, 47 arrive, and listing them all
 * turns a list you choose from into a wall of scroll. Keep typing to narrow further.
 */
const SLASH_MENU_LIMIT = 8;
const EMPTY_KNOWN_SLUGS: ReadonlySet<string> = new Set();

/** A single ACP relation proposal that can be drawn on the map. Home resolves the vault slug into a real node id. */
export interface AcpOntologyRelationPreview {
  sourceSlug: string;
  targetSlug: string;
  relationType: string;
  phase: 'draft' | 'committing';
}

export type { AcpMapIntent };

function relationPreviewForChangeSet(
  changeSet: OntologyChangeSet | null,
  phase: AcpOntologyRelationPreview['phase'],
  itemIndex = 0,
): AcpOntologyRelationPreview | null {
  const item = changeSet?.items[itemIndex];
  const relation = item?.relation;
  // A batch previews only **the row the person selected** in the card. Drawing them
  // all overlaid makes it ambiguous again which line is being judged, and pinning
  // the first row would be approval with the rest hidden.
  if (
    !changeSet ||
    changeSet.operation !== 'relate' ||
    !item?.exact ||
    !relation
  ) {
    return null;
  }
  return {
    sourceSlug: relation.from,
    targetSlug: relation.to,
    relationType: relation.type,
    phase,
  };
}

export function AcpChatPanel({
  runtimeId,
  runtimeLabel,
  vaultRoot,
  mcpServers,
  sessionEnabled = true,
  runtimes = [],
  onRuntimeChange,
  prefillRequest,
  suggestions = [],
  onSuggestionAction,
  knownSlugs,
  onHoverSlug,
  onTurnActivityChange,
  onMapIntent,
  onOntologyRelationPreviewChange,
  onWorkReceipt,
  onClose,
}: {
  runtimeId: string;
  runtimeLabel: string;
  vaultRoot: string | null;
  mcpServers?: unknown[];
  /**
   * Separate the panel scaffold from starting the ACP process. Even if false, render
   * a completed empty conversation but do not start a session — it becomes true after
   * the dock reflow finishes.
   */
  sessionEnabled?: boolean;
  /**
   * The runtimes currently selectable — only those **with a guard** are included
   * (`isGuardedRuntime`). If there is only one, there is nothing to choose, so only
   * the name is rendered.
   */
  runtimes?: ReadonlyArray<{ id: string; label: string }>;
  onRuntimeChange?: (runtimeId: string) => void;
  /**
   * **One sentence** handed over from outside (a node or an address on the map). It
   * only sits down; it is not sent — the user has to be able to edit, send or clear it.
   */
  prefillRequest?: { text: string; nonce: number } | null;
  /**
   * The answer to 「What should I ask?」 (what should I ask) — drawn from **this folder's
   * current state** (`useChatSuggestions`). Only shown on an empty conversation: once
   * a conversation has started the user already knows what to ask, and from then on
   * this area only takes up space.
   *
   * The vault is **received** rather than read here — reading it directly would stop
   * this panel standing without a `LocalVaultProvider`, which is not a property this
   * widget has kept until now (`vaultRoot` and `runtimes` are all passed in too).
   */
  suggestions?: readonly ChatSuggestion[];
  /** App-owned prerequisites such as opening source connection instead of drafting a prompt. */
  onSuggestionAction?: (suggestion: ChatSuggestion) => boolean;
  /**
   * The node names that **actually exist** in this vault. Only these names are picked
   * out of the agent's answer and wired to the map — turning any `a/b` into a link
   * would also link file paths and URLs, and someone who meets one link that goes
   * nowhere stops pressing the rest (`link-slugs.ts`).
   */
  knownSlugs?: ReadonlySet<string>;
  /**
   * The mouse is over that name (`null` on leave). The map highlights that node
   * **exactly as it would on hover**. The caller holds it in a ref to avoid a render —
   * rendering on every hover in a large graph turns sticky.
   */
  onHoverSlug?: (slug: string | null) => void;
  /** One turn's observable step, goal and target. `null` when it ends or closes. */
  onTurnActivityChange?: (activity: AcpTurnActivity | null) => void;
  /**
   * The map movement pointed to by the exact input of the actual Atlas read tool. Does not interpret
   * agent response sentences (`model/map-intent.ts`).
   */
  onMapIntent?: (intent: AcpMapIntent) => void;
  /** A single relationship change proposal: dashed line before approval, solid line until the corresponding ACP tool finishes after approval. */
  onOntologyRelationPreviewChange?: (preview: AcpOntologyRelationPreview | null) => void;
  /** Durable local summary of each ontology-write allow/reject and terminal result. */
  onWorkReceipt?: (receipt: AcpWorkReceipt) => void;
  onClose?: () => void;
}) {
  const t = useTranslations('acpChat');
  const reducedMotion = usePrefersReducedMotion();
  const {
    status,
    events,
    slashCommands,
    error,
    diagnostics,
    download,
    pending,
    approvedOntologyWrite,
    sessions,
    choices,
    chooseModel,
    chooseMode,
    start,
    send,
    cancel,
    switchSession,
  } = useAcpSession({
    runtimeId,
    vaultRoot,
    mcpServers,
    approvalSettleMs: reducedMotion ? 0 : MOTION.settle.duration * 1000,
    onWorkReceipt,
  });
  const pendingChangeSet = useMemo(
    () =>
      pending?.request.reviewKind === 'ontology-write' && pending.request.toolName
        ? buildOntologyChangeSet(pending.request.toolName, pending.request.rawInput)
        : null,
    [pending],
  );
  const approvedChangeSet = useMemo(
    () =>
      approvedOntologyWrite?.toolName
        ? buildOntologyChangeSet(approvedOntologyWrite.toolName, approvedOntologyWrite.rawInput)
        : null,
    [approvedOntologyWrite],
  );
  const [previewSelection, setPreviewSelection] = useState<{
    requestKey: string;
    itemIndex: number;
  } | null>(null);
  const previewRequest = approvedOntologyWrite ?? pending?.request ?? null;
  const previewRequestKey = previewRequest?.toolCallId ?? previewRequest?.toolName ?? null;
  const previewChangeSet = approvedOntologyWrite ? approvedChangeSet : pendingChangeSet;
  const requestedPreviewIndex =
    previewRequestKey && previewSelection?.requestKey === previewRequestKey
      ? previewSelection.itemIndex
      : 0;
  const activePreviewIndex = Math.min(
    Math.max(requestedPreviewIndex, 0),
    Math.max(0, (previewChangeSet?.items.length ?? 1) - 1),
  );
  const relationPreview = useMemo(
    () =>
      approvedOntologyWrite
        ? relationPreviewForChangeSet(approvedChangeSet, 'committing', activePreviewIndex)
        : relationPreviewForChangeSet(pendingChangeSet, 'draft', activePreviewIndex),
    [activePreviewIndex, approvedChangeSet, approvedOntologyWrite, pendingChangeSet],
  );
  const previewSourceSlug = relationPreview?.sourceSlug ?? null;
  const previewTargetSlug = relationPreview?.targetSlug ?? null;
  const previewRelationType = relationPreview?.relationType ?? null;
  const previewPhase = relationPreview?.phase ?? null;
  useEffect(() => {
    onOntologyRelationPreviewChange?.(
      previewSourceSlug && previewTargetSlug && previewRelationType && previewPhase
        ? {
            sourceSlug: previewSourceSlug,
            targetSlug: previewTargetSlug,
            relationType: previewRelationType,
            phase: previewPhase,
          }
        : null,
    );
  }, [
    onOntologyRelationPreviewChange,
    previewPhase,
    previewRelationType,
    previewSourceSlug,
    previewTargetSlug,
  ]);
  useEffect(
    () => () => onOntologyRelationPreviewChange?.(null),
    [onOntologyRelationPreviewChange],
  );
  const turnActivity = useMemo(
    () => deriveAcpTurnActivity(status, events, pending, knownSlugs ?? EMPTY_KNOWN_SLUGS),
    [status, events, pending, knownSlugs],
  );
  const turnState = turnActivity?.state ?? null;
  const turnSummary = turnActivity?.summary ?? null;
  const turnOntologySlug = turnActivity?.ontologySlug ?? null;
  const turnToolName = turnActivity?.toolName ?? null;
  useEffect(() => {
    onTurnActivityChange?.(
      turnState
        ? {
            state: turnState,
            summary: turnSummary,
            ontologySlug: turnOntologySlug,
            toolName: turnToolName,
          }
        : null,
    );
  }, [turnState, turnSummary, turnOntologySlug, turnToolName, onTurnActivityChange]);
  useEffect(
    () => () => {
      onTurnActivityChange?.(null);
    },
    [onTurnActivityChange],
  );
  const mapIntent = useMemo(
    () => deriveAcpMapIntent(events, knownSlugs ?? EMPTY_KNOWN_SLUGS),
    [events, knownSlugs],
  );
  const emittedMapIntentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mapIntent || !onMapIntent) return;
    const key = `${mapIntent.kind}:${mapIntent.toolCallId}`;
    if (emittedMapIntentRef.current === key) return;
    emittedMapIntentRef.current = key;
    onMapIntent(mapIntent);
  }, [mapIntent, onMapIntent]);

  /**
   * Translate what the adapter gave into a kind a person reads — `unknown` when
   * unrecognised. stderr (diagnostics) comes along too: on a corrupt-npx-cache
   * failure the error string was only `acp session closed` and every clue was in
   * stderr (measured 2026-08-19).
   */
  const trouble = error ? readAcpTrouble(error, diagnostics) : null;
  const doctor = useAgentDoctor(runtimeId);
  const showDoctor = Boolean(runtimeId) && isAgentDoctorAvailable();
  const [draft, setDraft] = useState('');
  /*
   * Is a `/` selection in progress? Only while the first character is `/` and there
   * is still no space — once arguments are being typed, the choosing step has passed
   * (`slash-commands.ts`).
   */
  /**
   * **Was the list dismissed by hand?** After clicking outside to close it, the
   * composer's text is unchanged, so without this memory the next render reopens it
   * immediately (owner report 2026-08-17: *"It should close when clicking the background but doesn't."* —
   * clicking the background should close it but doesn't). Reopening on a text change
   * is correct, so the memory is cleared then.
   */
  const [slashDismissed, setSlashDismissed] = useState(false);
  /** The row the keyboard is on. It returns to the first row when the list changes. */
  const [slashActive, setSlashActive] = useState(0);
  const slashMatches = useMemo(() => {
    if (slashDismissed) return [];
    const query = slashQuery(draft);
    return query === null ? [] : matchSlashCommands(slashCommands, query).slice(0, SLASH_MENU_LIMIT);
  }, [draft, slashCommands, slashDismissed]);
  const slashOpen = slashMatches.length > 0;
  /*
   * The pointed row is a **derived value** — clamped so a shrinking list never points
   * at a row that is gone. Correcting it in an effect costs another render (the
   * ratchet catches that warning) and leaves a frame on screen pointing at a
   * nonexistent row.
   */
  const slashActiveIndex = slashOpen
    ? Math.min(Math.max(slashActive, 0), slashMatches.length - 1)
    : 0;
  /**
   * Clicking outside closes it (owner report 2026-08-17: *"It should close when clicking the background
   * but doesn't."* — clicking the background should close it but doesn't).
   *
   * Why `mousedown` rather than `click`: a click arrives after press and release, and
   * in between the composer loses focus and the screen jolts once. A press on the
   * list itself does not count — that is a selection, and `chooseSlashCommand` closes it.
   */
  const slashMenuRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    if (!slashOpen) return;
    const onDown = (event: MouseEvent) => {
      /*
       * The composer is identified by **a marker, not a ref**. Reading the ref inside
       * this effect trips lint on the other effect that mutates the same ref (the
       * composer's height adjustment) — measured, it added one warning. A marker has
       * no such entanglement.
       */
      const target = event.target as HTMLElement | null;
      if (slashMenuRef.current?.contains(target ?? null)) return;
      if (target?.closest?.('[data-acp-composer]')) return;
      setSlashDismissed(true);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [slashOpen]);

  /*
   * A plain function — wrapping it in `useCallback` makes that hook hold the composer
   * ref, and the other effect mutating the same ref then trips lint (measured). This
   * function is passed nowhere, so recreating it each render costs nothing.
   */
  const chooseSlashCommand = (name: string) => {
    setDraft(`/${name} `);
    setSlashDismissed(true);
    inputRef.current?.focus();
  };
  const [historyOpen, setHistoryOpen] = useState(false);
  /** Is the hand in the composer? The shortcut hint appears only then. */
  const [composerFocused, setComposerFocused] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  /**
   * An **off-screen mirror** for measuring growth. The common trick of resetting the
   * visible box's height to `''` and reading `scrollHeight` collapses and reopens the
   * box every frame, turning growth into a staircase rather than a transition. The
   * mirror has the same typography and width, so it wraps identically, and the
   * visible box is never reset.
   */
  const mirrorRef = useRef<HTMLTextAreaElement | null>(null);
  /** The panel itself — measured to derive the composer's upper bound from **this pane's height**. */
  const panelRef = useRef<HTMLElement | null>(null);

  /**
   * **Seat** a sentence handed over from outside into the composer.
   *
   * Taken as an adjustment during render rather than in an effect (React's "adjust
   * state when a prop changes" pattern) — in an effect, one frame draws an empty box,
   * and that single frame looks exactly like 「I pressed it and it responded late」.
   * The same grammar the neighbouring panel uses.
   */
  const prefillNonce = prefillRequest?.nonce ?? null;
  const prefillText = prefillRequest?.text ?? null;
  const [seenPrefillNonce, setSeenPrefillNonce] = useState<number | null>(null);
  if (prefillNonce !== null && prefillText && prefillNonce !== seenPrefillNonce) {
    setSeenPrefillNonce(prefillNonce);
    setDraft(prefillText);
  }
  /*
   * There has to be something to draw while the exit animation runs — if the content
   * disappeared the moment `pending` went null, an **empty box** would be the thing
   * animating away. The key prefers the ACP `toolCallId`; only ordinary requests
   * without one fall back to the file path, since two ontology writes with no path
   * must not be pinned to the same card.
   */
  const pendingHeld = useHeldValue(
    pending,
    pending?.request.toolCallId ?? pending?.request.filePath ?? null,
  );
  const pendingHeldChangeSet = useMemo(
    () =>
      pendingHeld?.request.reviewKind === 'ontology-write' && pendingHeld.request.toolName
        ? buildOntologyChangeSet(pendingHeld.request.toolName, pendingHeld.request.rawInput)
        : null,
    [pendingHeld],
  );

  useEffect(() => {
    if (!sessionEnabled) return;
    void start();
  }, [sessionEnabled, start]);

  /*
   * A floating list **closes on Esc.** On the real thing, pressing Esc left the list
   * up (review 2026-08-16) — every other surface in this app closes on that key, so
   * only this one not closing makes what the user learned wrong. The route of
   * clicking the scrim behind is still there; this is a second route that does not
   * move the hand.
   */
  useEffect(() => {
    if (!historyOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // It ends with this surface closing — the panel behind is not closed with it.
      event.stopPropagation();
      setHistoryOpen(false);
    };
    // Handled in the capture phase. If the "close one level" handler above caught it
    // first, the panel would close instead of this list.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [historyOpen]);

  // Follow new messages down. It does not interrupt a user who has scrolled up to
  // read — it only follows while near the bottom.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
    if (nearBottom) list.scrollTop = list.scrollHeight;
  }, [events, pending]);

  /**
   * The composer **grows with the text** (owner instruction 2026-08-16: *"It should also lengthen like this after
   * typing."* — it should also lengthen like this after
   * typing).
   *
   * With a fixed row count, someone writing a three-line request presses send without
   * seeing two thirds of what they wrote. The arithmetic reuses what the neighbouring
   * panel already solved (`shared/lib/composer-growth` — the height is **whole
   * rows**, so no character is cut in half at the top edge). Growth goes through real
   * height rather than `transform`: the picker and send button below have to be
   * pushed along for it to read as 「the box grew」.
   */
  useLayoutEffect(() => {
    const input = inputRef.current;
    const mirror = mirrorRef.current;
    if (!input || !mirror) return;
    mirror.value = draft;
    const style = window.getComputedStyle(input);
    const lineHeight = Number.parseFloat(style.lineHeight);
    const growth = composerGrowth(
      {
        lineHeight,
        paddingBlock: Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom),
        borderBlock:
          Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth),
        contentHeight: mirror.scrollHeight,
      },
      /*
       * The upper bound is derived **from this panel's height**. The default of 6 rows
       * was chosen against a narrow strip and was stingy for this tall pane (owner:
       * *"I'd like it to grow at least somewhat."* — I'd like it to grow at least somewhat).
       * But baking in a large number lets the composer push the whole conversation out
       * when the window shrinks — a ratio is the answer.
       */
      composerMaxRows(panelRef.current?.clientHeight ?? 0, lineHeight),
    );
    // Leave it alone in states that cannot be measured (SSR, jsdom, before fonts
    // load) — the default `rows` always beats collapsing to 0px.
    if (!growth) return;
    input.style.height = `${growth.height}px`;
    input.scrollTop = snapScrollTop(input.scrollTop, lineHeight);
  }, [draft]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || status === 'thinking') return;
    setDraft('');
    void send(text);
  }, [draft, send, status]);

      {/*
        Pickers — **only what actually arrived is drawn.** Measured: codex offers 33
        models and claude offers none at all (`session/set_model` answers "no such
        method"). So no space is reserved from a guessed count: leaving an empty
        dropdown for a tool that has none is the same lie as "coming soon".

        ⚠️ The mode list **omits anything that skips the permission checkpoint**, and
        anything not yet measured is marked 「Not Verified」 (not verified). This screen
        promises 「Asks Before Going Outside the Folder」 (it asks before going outside the folder),
        and a promise that one dropdown can revoke, or that makes the unknown look
        safe, is not a promise.
      */}
  const choicesRow =
    choices.models.length > 0 || choices.modes.length > 0 ? (
        /*
         * The pickers sit **evenly on one row** (owner report from the real thing,
         * 2026-08-16: *"It doesn't display properly and the position is odd"* — it doesn't display
         * properly and the position is odd).
         *
         * It used to be `flex-wrap`, so each widened only to its content, and a
         * narrowed trigger narrowed the list too and clipped the options. On a grid
         * the width is decided by the slot, and the row does not shift whether there
         * is one picker or two — exactly this repository's discipline that dimensions
         * are decided by us, not by the content.
         */
        <div
          data-testid="acp-chat-choices"
          className={cn(
            'grid shrink-0 gap-2',
            choices.models.length > 0 && choices.modes.length > 0
              ? 'grid-cols-2'
              : 'grid-cols-1',
          )}
        >
          {choices.models.length > 0 ? (
            <Select
              ariaLabel={t('model')}
              size="md"
              value={choices.currentModelId ?? ''}
              onChange={(value) => void chooseModel(value)}
              options={choices.models.map((model) => ({ value: model.id, label: model.name }))}
              data-testid="acp-chat-model"
              className="min-w-0"
            />
          ) : null}
          {choices.modes.length > 0 ? (
            <Select
              ariaLabel={t('mode')}
              size="md"
              value={choices.currentModeId ?? ''}
              onChange={(value) => void chooseMode(value)}
              options={choices.modes.map((mode) => {
                const unverified = choices.unverifiedModeIds.includes(mode.id);
                /*
                 * Names and descriptions are put into human words **only where we
                 * know them** (owner report 2026-08-17: the names were all English,
                 * and the two worth choosing had no description at all). An unknown
                 * mode keeps the adapter's name and gets no description — an invented
                 * line is a promise we never verified. The decisions and the evidence
                 * table: `mode-copy.ts`.
                 *
                 * 「Not Verified」 is a **separate axis**. Knowing the name and having
                 * measured whether it asks before working outside the folder are
                 * different things, so both are shown.
                 */
                const copyKey = modeCopyKey(mode.id);
                const name = copyKey ? t(`modeName.${copyKey}`) : mode.name;
                const hint = copyKey ? t(`modeHint.${copyKey}`) : undefined;
                return {
                  value: mode.id,
                  label: unverified ? t('modeUnverified', { name }) : name,
                  description: unverified
                    ? [hint, t('modeUnverifiedHint')].filter(Boolean).join(' ')
                    : hint,
                };
              })}
              data-testid="acp-chat-mode"
              className="min-w-0"
            />
          ) : null}
        </div>
      ) : null;

  const busy = status === 'thinking';
  const canType = status === 'ready' || status === 'thinking';
  // When the dock's first frame loads and immediately after session replacement,
  // the process effect has not yet started,
  // so the actual state is idle. While this panel is open, the user sees 「Waiting for Connection」 — we project only the screen state as starting without touching the protocol state. As long as sessionEnabled=true, 「Off」 does not flash during render cycles.
  const displayStatus = status === 'idle' ? 'starting' : status;
  const transcriptItems = groupEvents(withoutErrorEcho(events, error));
  const lastWorkGroupId = [...transcriptItems]
    .reverse()
    .find((item) => item.kind === 'workGroup')?.id;

  return (
    <section
      ref={panelRef}
      data-testid="acp-chat-panel"
      data-acp-status={displayStatus}
      /*
       * ⚠️ The whole screen was bunched at the top because `flex-1` was missing (owner
       * report from the real thing, 2026-08-16: *"It's odd that the input area is stuck to the top"* — it's odd that the input area is stuck to the top).
       *
       * The structure was a chat from the start — header / growing transcript /
       * composer at the bottom. But this `<section>`, a child of a parent flex, never
       * claimed its share and grew **only to its content**; with an empty transcript
       * that height was 0, so the composer sat straight under the header. The blank
       * space below was the panel's remaining height.
       *
       * A composer at the bottom of a chat is not taste but **where the hand goes**,
       * and the space above it has to be empty for the conversation's home to be visible.
       */
      className="relative flex h-full min-h-0 flex-1 flex-col gap-3"
      aria-label={t('ariaLabel', { runtime: runtimeLabel })}
    >
      <header className="flex items-center justify-between gap-2">
        {/*
          With two or more usable tools, **the name slot becomes the picker** — it is
          already there to show the name, so no new chrome appears. With just one there
          is nothing to choose, so it stays text (a one-option dropdown only pretends
          to be a choice).
        */}
        {runtimes.length > 1 && onRuntimeChange ? (
          <Select
            ariaLabel={t('runtimePicker')}
            size="md"
            value={runtimeId}
            onChange={onRuntimeChange}
            options={runtimes.map((r) => ({ value: r.id, label: r.label }))}
            data-testid="acp-chat-runtime"
            className="min-w-0"
          />
        ) : (
          <p className="min-w-0 truncate text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
            {runtimeLabel}
          </p>
        )}
        <span className="flex shrink-0 items-center gap-2">
          <span
            data-acp-status-badge={displayStatus}
            aria-live="polite"
            className={badgeClass({
              shape: 'micro',
              className:
                'gap-1 bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-tertiary)]',
            })}
          >
            {displayStatus === 'starting' ? (
              <LoaderCircle
                data-testid="acp-connection-spinner"
                size={ICON_SIZE.sm}
                className="motion-safe:animate-spin"
                aria-hidden
              />
            ) : null}
            {t(`status.${displayStatus}`)}
          </span>
          {/*
            The door appears **only when past conversations exist** — no reason to show
            a first-time user a list button that is always empty.
          */}
          {/*
            An icon-only button has **no visible name.** A `title` is attached, but the
            macOS webview's default tooltip takes a long wait, and until then the user
            does not know what the button does (owner: *"A tooltip on hover is what makes it understandable"* — a tooltip on hover is what makes it understandable). It uses the tooltip already in the repository.

            The size also goes up one step — these three are this panel's primary
            chrome, and at `md` (32px) they do not read as things to press.
          */}
          <TooltipProvider delayDuration={200}>
            {sessions.length > 0 ? (
              <Tooltip content={t('history')} withProvider={false} side="bottom">
                <IconButton
                  size="lg"
                  label={t('history')}
                  data-testid="acp-chat-history"
                  aria-expanded={historyOpen}
                  onClick={() => setHistoryOpen((open) => !open)}
                >
                  <History size={ICON_SIZE.md} aria-hidden />
                </IconButton>
              </Tooltip>
            ) : null}
            <Tooltip content={t('newChat')} withProvider={false} side="bottom">
              <IconButton
                size="lg"
                label={t('newChat')}
                data-testid="acp-chat-new"
                disabled={displayStatus === 'starting'}
                onClick={() => {
                  setHistoryOpen(false);
                  void switchSession(null);
                }}
              >
                <SquarePen size={ICON_SIZE.md} aria-hidden />
              </IconButton>
            </Tooltip>
            {onClose ? (
              <Tooltip content={t('close')} withProvider={false} side="bottom">
                <IconButton
                  size="lg"
                  label={t('close')}
                  data-testid="acp-chat-close"
                  onClick={onClose}
                >
                  <X size={ICON_SIZE.md} aria-hidden />
                </IconButton>
              </Tooltip>
            ) : null}
          </TooltipProvider>
        </span>
      </header>

      <div
        ref={listRef}
        data-testid="acp-chat-transcript"
        /*
         * The transcript's spacing is **one step larger** (whitespace audit,
         * 2026-08-16). The reading text went from 12.5 to 14px while the gap stayed at
         * 8px, so messages clumped together. When the text grows the space between has
         * to grow with it — spacing reads as **a ratio to the text**, not an absolute.
         */
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
      >
        {/*
          A 「Starting」 (starting) chip alone is not enough for the first download (owner's
          real machine, 2026-08-19). During the several minutes npx spends fetching tens
          of MB the screen said nothing, so the user assumed it had hung and quit the
          app — and that interruption left a half-built cache that stopped it launching
          ever after. It states that a download is happening and **the measured**
          progress (how many MB so far); the total size is unknown, so no percentage is
          invented.
        */}
        {status === 'starting' && download ? (
          <div
            data-testid="acp-first-run-download"
            className="m-auto grid max-w-[38ch] gap-1.5 text-center"
          >
            <p className="break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
              {t('firstRun.title')}
            </p>
            <p className="break-keep text-caption leading-caption text-[color:var(--color-text-quaternary)]">
              {t('firstRun.body')}
            </p>
            {download.mb !== null ? (
              <p
                data-testid="acp-first-run-progress"
                className="text-caption leading-caption text-[color:var(--color-text-quaternary)]"
              >
                {t('firstRun.progress', { mb: download.mb })}
              </p>
            ) : null}
          </div>
        ) : null}
        {events.length === 0 && !download ? (
          // Place the empty conversation guide **in the center of where records will accumulate**. If placed at the top, it reads like the first speech bubble, and the actual place where the conversation starts appears empty.
          <div className="m-auto grid max-w-[34ch] gap-3">
            <p
              data-testid="acp-chat-empty"
              className="break-keep text-center text-label leading-prose text-[color:var(--color-text-quaternary)]"
            >
              {t('emptyHint')}
            </p>
            {/*
              The answer to 「What Should I Ask」 (what should I ask) comes from **this
              folder's current state** (2026-08-17). The common approach of baking in
              example sentences is decoration, not a suggestion — it would fit any app,
              and pressing one returns an answer unrelated to my folder, so the
              suggestions are never trusted again. Which fact suggests what is owned by
              `chat-suggestions.ts`.
            */}
            {suggestions.length > 0 ? (
              <div className="grid gap-1.5" data-testid="acp-chat-suggestions">
                <p className="text-center text-caption leading-caption text-[color:var(--color-text-quaternary)]">
                  {t('suggest.heading')}
                </p>
                {suggestions.map((s) => (
                  /*
                    A whole row being pressable is `RowButton` (2026-08-17, fixed after
                    opening the installed app). At first `Chip` got
                    `w-full justify-start text-left` by hand, which copies values the
                    `row` shape already has — exactly where `design-build` warns that
                    «passing shape through className makes the primitive pointless».

                    It showed on screen too: it became a bordered full-width box and
                    read as the same shape as the composer right below — like another
                    input field rather than something to press.
                  */
                  <RowButton
                    key={s.kind}
                    size="md"
                    tone="secondary"
                    hoverInk="strong"
                    hoverSurface="lift"
                    /* It gets a surface at rest too. A border makes it the same shape as
                       the composer right below (measured), and nothing at all makes it
                       read as plain text — both confirmed on the real thing. It reuses
                       the `overlay-1` that list rows use: zero new values. */
                    className="rounded-chip bg-[color:var(--color-overlay-1)] px-2.5 py-1.5"
                    data-testid={`acp-chat-suggestion-${s.kind}`}
                    onClick={() => {
                      if (onSuggestionAction?.(s)) return;
                      setDraft(t(`suggest.${s.kind}.prompt`, s.params));
                    }}
                  >
                    <span className="min-w-0 break-keep">
                      {t(`suggest.${s.kind}.label`, s.params)}
                    </span>
                  </RowButton>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {/*
          The adapter reports a failure **as a message too** and also rejects the RPC.
          Left alone, the same failure appears twice and the English original is read
          **before** the plain-language card below (measured in the installed app,
          2026-08-17). The removal condition is owned by `error-echo.ts`, and it is only
          「the last line contained verbatim inside an error already on screen」 — the
          screen is erasing the agent's words, so it is not widened.
        */}
        {transcriptItems.map((item, index) => {
          if (item.kind === 'workGroup')
            return (
              <WorkGroup
                key={item.id}
                events={item.events}
                active={busy && item.id === lastWorkGroupId}
                knownSlugs={knownSlugs}
                onHoverSlug={onHoverSlug}
              />
            );
          /*
           * A solid line before the user's message — **where the turn changed**. It is
           * not drawn above the first turn (a boundary with nothing above it is not a
           * boundary but decoration).
           */
          const turnStart = item.event.kind === 'user' && index > 0;
          return (
            <div
              key={item.event.id}
              data-turn-start={turnStart ? 'true' : undefined}
              className={cn(
                'flex flex-col',
                turnStart &&
                  'mt-2 border-t border-[color:var(--color-divider)] pt-3',
              )}
            >
              <TranscriptEntry
                event={item.event}
                knownSlugs={knownSlugs}
                onHoverSlug={onHoverSlug}
              />
            </div>
          );
        })}
      </div>

      {/*
        An error is **one sentence of human speech plus what to do next**.

        ⚠️ It used to paste what the adapter gave, verbatim (owner's screen,
        2026-08-16): `An error occurred: {"code":-32603,"message":"Internal error: Failed
        to authenticate: OAuth session expired…"}`. Owner: *"If you show it like this, how
        would the user know."* (how is a user supposed to understand this?). That line says
        neither what went wrong nor what to do, in human words.

        The original is not discarded but **folded away** — something has to report
        when the same thing recurs, and the adapter's own output (stderr) comes out
        there too.
      */}
      {error ? (
        <div
          data-testid="acp-chat-error"
          data-trouble={trouble?.kind}
          role="alert"
          className="break-keep rounded-card border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] p-[var(--card-pad)]"
        >
          <p className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-status-danger)]">
            {t(`trouble.${trouble?.kind ?? 'unknown'}.title`)}
          </p>
          <p className="mt-1 text-label leading-prose text-[color:var(--color-text-tertiary)]">
            {t(`trouble.${trouble?.kind ?? 'unknown'}.hint`)}
          </p>
          {/*
            **The doctor sits where the blocked person is already looking.** Placed
            somewhere in settings, a blocked person has to go find it, and mostly does
            not. On the web it is impossible in principle (processes, keychain), so it
            is not drawn at all — not "coming soon" but absent from the start.
          */}
          {showDoctor ? (
            <div className="mt-2 min-w-0">
              {doctor.scanButton}
              {doctor.result}
            </div>
          ) : null}
          <details className="mt-2">
            <summary
              data-testid="acp-chat-error-details"
              className={controlClass({
                shape: 'link',
                size: 'sm',
                tone: 'muted',
                hoverInk: 'strong',
                className: 'list-none',
              })}
            >
              {t('trouble.details')}
            </summary>
            {/*
              The stale-login branch gets **the line that fixes it** first. The old
              guidance (「Log in again in the terminal」 — log in again in the terminal)
              was a dead end in this case: the app launches Claude with a dedicated
              config folder, and login is per folder. Rationale and measurements:
              `claude-login-repair.ts`.
            */}
            {trouble?.kind === 'auth' ? (
              <p
                data-testid="acp-chat-auth-repair"
                className="mt-1.5 whitespace-pre-wrap break-all rounded-chip bg-[color:var(--color-overlay-1)] px-2 py-1.5 font-mono text-caption leading-caption text-[color:var(--color-text-tertiary)]"
              >
                {claudeLoginRepairCommand()}
              </p>
            ) : null}
            <p className="mt-1.5 whitespace-pre-wrap break-all font-mono text-caption leading-caption text-[color:var(--color-text-quaternary)]">
              {error}
            </p>
            {diagnostics.length > 0 ? (
              <>
                <p className="mt-2 text-caption leading-caption text-[color:var(--color-text-quaternary)]">
                  {t('trouble.diagnosticsLabel')}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-all font-mono text-caption leading-caption text-[color:var(--color-text-quaternary)]">
                  {diagnostics.join('\n')}
                </p>
              </>
            ) : null}
          </details>
        </div>
      ) : null}

      {/*
        Drawn as just `{pending ? … : null}`, the card appears in one frame and vanishes
        in one (the appearance ratchet caught this). This card is **what stops the
        agent**, so it is the most urgent surface on screen — appearing without warning,
        the user cannot follow what changed.

        Why `origin` is at the bottom: this card grows directly above the composer — it
        has to be born where the eyes and hands already are.
      */}
      <Surface open={Boolean(pending)} origin="bottom center" motion="overlay">
        {pendingHeld ? (
          <AcpPermissionCard
            pending={pendingHeld}
            changeSet={pendingHeldChangeSet}
            activeItemIndex={
              (pendingHeld.request.toolCallId ?? pendingHeld.request.toolName) === previewRequestKey
                ? activePreviewIndex
                : 0
            }
            onActiveItemChange={(itemIndex) => {
              const requestKey =
                pendingHeld.request.toolCallId ?? pendingHeld.request.toolName ?? 'ontology-write';
              setPreviewSelection({ requestKey, itemIndex });
            }}
          />
        ) : null}
      </Surface>

      {/*
        The composer — **everything fits inside one box** (owner report from the real
        thing, 2026-08-16: *"Isn't this design more common, isn't this the usual shape?"* — isn't this design more common, isn't this the usual shape?).

        There used to be an input box with a wide 「Send」 (send) pill **outside** it.
        That made send take up space like the protagonist of a chat screen, when the
        protagonist is the conversation. In the current shape one box says 「this is where you write」, and inside it the bottom row holds **the pickers (left) and send (right)**.

        Send is a **round icon**. The word 「Send」 was removed because the arrow already means it and it takes less width inside the box. The name is carried by the tooltip and the accessible name — the standard rule for an icon-only control.

        The composer is `frame="bare"` so a box is not created inside a box.
      */}
      <div
        data-testid="acp-chat-composer"
        className="relative shrink-0 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)] transition-colors focus-within:border-[color:var(--color-indigo-a46)]"
      >
        {/*
          The shortcut hint appears **only while empty** — it disappears once text
          arrives (avoiding overlap).
        */}
        {composerFocused && draft.length === 0 ? (
          <span
            data-testid="acp-chat-hint"
            className={badgeClass({
              shape: 'micro',
              className:
                'pointer-events-none absolute right-3 top-3 bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-quaternary)]',
            })}
          >
            {t('composerHint')}
          </span>
        ) : null}
        {/*
          The mirror has to be **the same width** as the real box for the wrapping to
          match, so both go in the same `relative` box — attached to the outer box, the
          mirror would be wider by the inner padding and grow one line late.
        */}
        {/*
          Typing `/` shows **the commands the agent found in this folder** (owner
          question, 2026-08-17). The adapter was already sending the list mid-session (`available_commands_update`) and we were discarding that line entirely — 47 of them, measured.

          The list is never invented: if nothing arrives, typing `/` does nothing. The vault folder is the working folder, so a skill placed in the vault appears here directly — that is how 「Atlas-Specific」 (Atlas-specific) ones arrive.
        */}
        {slashOpen ? (
          <ul
            ref={slashMenuRef}
            data-testid="acp-chat-slash-menu"
            role="listbox"
            aria-label={t('composerLabel')}
            className="max-h-56 shrink-0 overflow-y-auto rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-elevated)] p-1"
          >
            {slashMatches.map((command: AcpSlashCommand, index: number) => {
              const active = index === slashActiveIndex;
              return (
                <li key={command.name} role="option" aria-selected={active}>
                  {/*
                    ⚠️ The hover axis is **opt-in** (`design-build`). Left off, the
                    mouse does nothing and there is no telling which row is which —
                    exactly what the owner reported (2026-08-17). The `active` axis is
                    passed along so the keyboard-pointed row and the moused-over row
                    use **the same indication**.
                  */}
                  <RowButton
                    active={active}
                    hoverSurface="lift"
                    hoverInk="strong"
                    onMouseEnter={() => setSlashActive(index)}
                    onClick={() => chooseSlashCommand(command.name)}
                    className="w-full gap-2"
                  >
                    <span className="shrink-0 font-mono text-label">/{command.name}</span>
                    {command.description ? (
                      <span className="min-w-0 flex-1 truncate text-left text-label text-[color:var(--color-text-quaternary)]">
                        {command.description}
                      </span>
                    ) : null}
                  </RowButton>
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className="relative" data-acp-composer>
          <Textarea
            ref={inputRef}
            aria-label={t('composerLabel')}
            placeholder={t('composerPlaceholder')}
            frame="bare"
            className="w-full"
            rows={COMPOSER_MIN_ROWS}
            value={draft}
            disabled={!canType}
            style={{
              // Growth is **surface movement** — it rides the app's shared ramp.
              transitionProperty: 'height',
              transitionDuration: 'var(--motion-base)',
              transitionTimingFunction: 'var(--motion-ease)',
            }}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => setComposerFocused(false)}
            onChange={(e) => {
              setDraft(e.target.value);
              // Typing again clears the hand-dismissed memory — otherwise the list
              // never opens for the rest of the session.
              setSlashDismissed(false);
            }}
            onKeyDown={(e) => {
              /*
               * While the list is open **the list takes the keys first** (owner report
               * 2026-08-17: *"Keyboard movement doesn't work"* — keyboard movement doesn't work).
               * Enter's behaviour without a list (send) is unchanged below.
               */
              if (slashOpen) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  const step = e.key === 'ArrowDown' ? 1 : -1;
                  setSlashActive(
                    (prev) => (prev + step + slashMatches.length) % slashMatches.length,
                  );
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  chooseSlashCommand(slashMatches[slashActiveIndex]?.name ?? slashMatches[0].name);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setSlashDismissed(true);
                  return;
                }
              }
              if (e.key !== 'Enter') return;
              /*
               * Enter sends and ⇧Enter breaks the line — the chat convention, and what
               * people already have in their hands. ⌘/Ctrl+Enter keeps working too.
               */
              if (e.shiftKey) return;
              e.preventDefault();
              submit();
            }}
          />
          {/*
            `invisible` (visibility: hidden), not `opacity-0` — a transparent element is
            still a painted element, so it shows up in overlap audits and can still take
            a caret. Layout still runs, so `scrollHeight` is the same.
          */}
          <Textarea
            ref={mirrorRef}
            aria-hidden
            tabIndex={-1}
            readOnly
            aria-label={t('composerLabel')}
            frame="bare"
            rows={1}
            data-testid="acp-chat-composer-mirror"
            className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden"
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-2">{choicesRow}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {busy ? (
              <Chip size="md" tone="secondary" data-testid="acp-chat-stop" onClick={cancel}>
                <Square size={ICON_SIZE.sm} aria-hidden />
                {t('stop')}
              </Chip>
            ) : null}
            <Tooltip content={t('send')} side="top">
              <button
                type="button"
                aria-label={t('send')}
                data-testid="acp-chat-send"
                disabled={!canType || busy || draft.trim().length === 0}
                onClick={submit}
                className={controlClass({
                  /*
                   * The round shape comes from the value layer's `pill`
                   * (`rounded-full`) — never written by hand. Fill, ink and hover all
                   * come from the single `onAccent` tone: `accent` ink over a filled
                   * indigo is below AA in composite contrast, and lint blocks that pair
                   * (it actually did). What remains here is **only what is right for
                   * this one place** — the width that squares it into a circle, and
                   * centring.
                   */
                  shape: 'pill',
                  size: 'md',
                  tone: 'onAccent',
                  className: 'w-8 justify-center px-0',
                })}
              >
                <ArrowUp size={ICON_SIZE.md} aria-hidden />
              </button>
            </Tooltip>
          </span>
        </div>
      </div>

      {/*
        The past-conversations list — **it floats.**

        ⚠️ **No z-index is used.** `--z-map-popover` was tried first, and that token **does not exist** — referencing a missing variable makes CSS discard the whole declaration, so the layering vanishes with no error at all (the trap this repository records as 「a token nobody uses is not a specification but wrong information」). Instead this block sits at **the very end** of the panel — at the same level, what is painted later comes on top. No new token, no ladder change.

        ⚠️ It used to be a flex child, so opening it **pushed** the conversation down and the list looked like part of the conversation (owner: *"It comes out together like this and can't be told apart"* — it comes out together like this and can't be told apart). Putting something that should float into the flow makes it not a popover but just another row.

        So it is **absolutely positioned** against the panel with a scrim behind, which says visually 「this is on top and clicking anywhere closes it」.

        ⚠️ Only **this folder's conversations** go in here (`keepSessionsInFolder`).
      */}
      {historyOpen && sessions.length > 0 ? (
        <button
          type="button"
          /*
           * ⚠️ This scrim's name is **closing the list** (caught in the 2026-08-16
           * review). It used to use the same key as closing the panel (`close`), telling
           * a user who cannot see the screen 「this ends the conversation」 while only
           * closing the list.
           */
          aria-label={t('closeHistory')}
          data-testid="acp-chat-history-scrim"
          onClick={() => setHistoryOpen(false)}
          className="absolute inset-0 cursor-default bg-[color:var(--color-overlay-1)]"
        />
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 top-11 flex justify-end">
        <Surface
          open={historyOpen && sessions.length > 0}
          origin="top right"
          motion="overlay"
          className="pointer-events-auto w-[min(320px,100%)]"
        >
          <div className="overflow-hidden rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] shadow-[var(--shadow-elevation-2)]">
            {/*
              A name is what tells you what the list is of.

              ⚠️ It used to be the uppercase eyebrow specification (`font-mono` plus `uppercase` plus wide tracking). That specification assumes Latin script — Hangul has no uppercase, so `uppercase` does nothing and only the wide tracking remains, making **「Past」 and 「Conversation」 look like two separate words** (owner's screen, 2026-08-16). It is a plain label now.

              Why the count sits beside it: once the list scrolls, how many there are is no longer visible.
            */}
            <div className="flex items-center justify-between gap-2 border-b border-[color:var(--color-divider)] px-3 py-2">
              <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">
                {t('history')}
              </p>
              <span
                className={badgeClass({
                  shape: 'micro',
                  className:
                    'bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-quaternary)]',
                })}
              >
                {sessions.length}
              </span>
            </div>
            <ul data-testid="acp-chat-history-list" className="grid max-h-64 gap-0.5 overflow-y-auto p-1">
              {sessions.map((session) => (
                <li key={session.sessionId}>
                  <RowButton
                    data-testid="acp-chat-history-item"
                    data-session-id={session.sessionId}
                    onClick={() => {
                      setHistoryOpen(false);
                      void switchSession(session.sessionId);
                    }}
                    /*
                     * The row under the mouse has to **respond** for you to know what
                     * you are pressing (owner: *"A hover effect on each area would be good"* — a hover effect on each area would be good). Surface and text lift together — lifting only the surface tells you which row it is while its title stays receded.
                     */
                    hoverSurface="lift"
                    hoverInk="strong"
                    className="w-full"
                  >
                    <span className="grid min-w-0 flex-1 gap-0.5 text-left">
                      <span className="truncate text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
                        {session.title ?? t('untitled')}
                      </span>
                      {/*
                        When a conversation happened is **a value we already receive**.
                        Without it there is no basis for choosing among conversations
                        with similar titles.
                      */}
                      {/*
                        ⚠️ This line used to be drawn **only when a date existed**, which
                        splits row heights in the same list between 56px and 38px — this
                        repository's discipline that dimensions are decided by us, not by
                        the content, forbids exactly that (review 2026-08-16). The line
                        holds its place with no date.
                      */}
                      <span className="truncate text-label leading-label text-[color:var(--color-text-quaternary)]">
                        {session.updatedAt ? formatDate(session.updatedAt) : '\u00A0'}
                      </span>
                    </span>
                  </RowButton>
                </li>
              ))}
            </ul>
          </div>
        </Surface>
      </div>
    </section>
  );
}

/**
 * One turn's thinking and tool calls, separated from the answer as a work trace.
 *
 * It is one line by default. While running, only the dots and the step count update
 * to say "still alive", and the raw text expands only on request. This is in-flow
 * collapsing, so it uses the existing `.ai-row-disclosure` plus `useRowDisclosure`
 * rather than `Surface`, letting the answer below yield its place continuously. No
 * new tokens, no new keyframes.
 */
function WorkGroup({
  events,
  active,
  knownSlugs,
  onHoverSlug,
}: {
  events: Extract<AcpEvent, { kind: 'thought' | 'tool' }>[];
  active: boolean;
  knownSlugs?: ReadonlySet<string>;
  onHoverSlug?: (slug: string | null) => void;
}) {
  const t = useTranslations('acpChat');
  const [open, setOpen] = useState(false);
  const bodyId = `acp-work-${events[0].id}`;
  const { mounted, boxRef, contentRef } = useRowDisclosure(open);
  return (
    <div
      data-acp-entry="work-group"
      data-work-count={events.length}
      data-work-active={active ? 'true' : 'false'}
    >
      <button
        type="button"
        data-testid="acp-chat-work-group"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
        className={controlClass({
          shape: 'link',
          size: 'md',
          tone: 'muted',
          hoverInk: 'secondary',
        })}
      >
        <ChevronRight
          size={ICON_SIZE.sm}
          aria-hidden
          className="transition-transform"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />
        <span
          aria-hidden
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            active
              ? 'bg-[color:var(--color-indigo-accent)]'
              : 'bg-[color:var(--color-text-quaternary)]',
          )}
        />
        {t(active ? 'workGroupActive' : 'workGroup', { count: events.length })}
      </button>
      <div
        ref={boxRef}
        id={bodyId}
        data-state={open ? 'open' : 'closed'}
        className="ai-row-disclosure"
        inert={!open}
      >
        {mounted ? (
          <div ref={contentRef} className="ai-row-disclosure-body mt-1 grid gap-2 pl-4">
            {events.map((event) => (
              <TranscriptEntry
                key={event.id}
                event={event}
                knownSlugs={knownSlugs}
                onHoverSlug={onHoverSlug}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Mark **node names that actually exist** in the agent's answer, and make the map
 * highlight that node on hover (owner instruction, 2026-08-17).
 *
 * ## It attaches to markdown's **output** (measured 2026-08-17)
 *
 * The first attempt wrapped it as
 * `<SlugMarks><ReactMarkdown>{text}</ReactMarkdown></SlugMarks>`. The worker then
 * split `ReactMarkdown`'s children — **the raw, not-yet-parsed markdown string** —
 * and passed the pieces through, and that component dies on non-string children. The
 * whole transcript disappeared from the screen.
 *
 * So it attaches through `components`: the elements that hold text receive **already
 * parsed** children and the names are picked from there. Markdown syntax is untouched.
 *
 * The appearance is **one dotted underline**. No new colour is introduced because
 * this map already has enough colour to learn (indigo = selected, amber = centre),
 * and it is dotted because it means something different from a 「pressable link」 —
 * 「this exists on the map」.
 */
function markChildren(
  children: ReactNode,
  known: ReadonlySet<string>,
  onHoverSlug: ((slug: string | null) => void) | undefined,
  key: string,
): ReactNode {
  if (typeof children === 'string') {
    const segments = linkSlugs(children, known);
    if (!segments.some((seg) => 'slug' in seg)) return children;
    return segments.map((seg, i) =>
      'slug' in seg ? (
        <span
          key={`${key}-${i}`}
          data-testid="acp-chat-slug"
          data-slug={seg.slug}
          className="cursor-default underline decoration-dotted decoration-[color:var(--color-border-strong)] underline-offset-2 hover:decoration-[color:var(--color-indigo-a46)]"
          onPointerEnter={() => onHoverSlug?.(seg.slug)}
          onPointerLeave={() => onHoverSlug?.(null)}
        >
          {seg.text}
        </span>
      ) : (
        seg.text
      ),
    );
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => markChildren(child, known, onHoverSlug, `${key}-${i}`));
  }
  return children;
}

/** The markdown elements that hold text — names are picked only inside these. */
const SLUG_MARKED_TAGS = ['p', 'li', 'td', 'th', 'code', 'strong', 'em'] as const;

function slugMarkComponents(
  known: ReadonlySet<string> | undefined,
  onHoverSlug: ((slug: string | null) => void) | undefined,
): Record<string, (props: { children?: ReactNode }) => ReactNode> | undefined {
  if (!known || known.size === 0) return undefined;
  const out: Record<string, (props: { children?: ReactNode }) => ReactNode> = {};
  for (const tag of SLUG_MARKED_TAGS) {
    out[tag] = ({ children, ...rest }) =>
      createElement(tag, rest, markChildren(children, known, onHoverSlug, tag));
  }
  return out;
}

/** The GFM table in the conversation has its own scroll to prevent columns from squishing in the narrow dock. */
function chatMarkdownComponents(
  known: ReadonlySet<string> | undefined,
  onHoverSlug: ((slug: string | null) => void) | undefined,
): Components {
  const marked = slugMarkComponents(known, onHoverSlug) ?? {};
  return {
    ...marked,
    table: ({ node: _node, ...props }) => (
      <div
        data-testid="acp-chat-markdown-table"
        className="my-2 max-w-full overflow-x-auto rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]"
      >
        <table
          {...props}
          className="w-max min-w-full border-collapse text-left text-label leading-label [&_thead]:bg-[color:var(--color-overlay-2)] [&_tr]:border-b [&_tr]:border-[color:var(--color-divider)] [&_tbody_tr:last-child]:border-b-0 [&_th]:px-2.5 [&_th]:py-2 [&_th]:font-[var(--font-weight-emphasis)] [&_th]:text-[color:var(--color-text-primary)] [&_td]:px-2.5 [&_td]:py-2 [&_td]:align-top [&_td]:text-[color:var(--color-text-secondary)]"
        />
      </div>
    ),
  };
}

function TranscriptEntry({
  event,
  knownSlugs,
  onHoverSlug,
}: {
  event: AcpEvent;
  knownSlugs?: ReadonlySet<string>;
  onHoverSlug?: (slug: string | null) => void;
}) {
  const t = useTranslations('acpChat');

  if (event.kind === 'user') {
    /*
     * **A turn starts here** (2026-08-16 owner: *"My question and the answer also need to be clearly separated"* — my question and the answer also need to be clearly separated).
     *
     * They were already separated by right alignment plus an indigo tint. But with a long answer, scrolling blurs 「where does the answer to this question begin」 — what has to be separated is not one bubble but **the turn's boundary**.
     *
     * So it gets three things: top margin (separating it from the next turn), a border (so it reads as an object rather than a surface), and a solid line above it unless it is the first turn. The colour was not deepened because indigo means 「Selected」 in this app.
     */
    return (
      <p
        data-acp-entry="user"
        className="mt-1 max-w-[85%] self-end break-keep rounded-card border border-[color:var(--color-indigo-a22)] bg-[color:var(--color-indigo-a12)] px-3 py-2 text-body-lg leading-body-lg text-[color:var(--color-text-primary)]"
      >
        {event.text}
      </p>
    );
  }
  if (event.kind === 'agent') {
    /*
     * The agent **answers in markdown** — on the real thing, backticks and lists were
     * coming out literally (`` `connect_project_source` `` backticks and all). This
     * repository already has a renderer (docs vault, project detail) and only this
     * screen was not using it.
     *
     * The document screen's values are not copied over — that is a body page at
     * `text-body-lg` with large heading margins, and in a 420px panel one paragraph
     * eats the whole screen. This is **chat density**.
     */
    return (
      <div data-acp-entry="agent" className={CHAT_MARKDOWN}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={chatMarkdownComponents(knownSlugs, onHoverSlug)}
        >
          {event.text}
        </ReactMarkdown>
      </div>
    );
  }
  if (event.kind === 'thought') {
    return (
      <div data-acp-entry="thought" className={WORK_MARKDOWN}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={chatMarkdownComponents(knownSlugs, onHoverSlug)}
        >
          {event.text}
        </ReactMarkdown>
      </div>
    );
  }
  if (event.kind === 'tool') {
    /*
     * It records **what happened**, not a function name. Tools we wired in have known
     * meanings (`toolLabel`); someone else's tools show only the name — inventing
     * something plausible for the unknown makes the screen lie on the day it diverges
     * from what was actually done.
     */
    const label = toolLabel(event.title, VAULT_MCP_SERVER_NAME);
    const done = event.status === 'completed';
    const toolTargets = knownSlugs ? readToolTargets(event.rawInput, knownSlugs) : [];
    return (
      <p
        data-acp-entry="tool"
        data-tool-kind={event.toolKind}
        data-tool-status={event.status}
        data-tool-label={label.kind}
        className="flex items-center gap-1.5 break-all text-label leading-label text-[color:var(--color-text-quaternary)]"
      >
        {/* Finished and running are separated by **one dot** — another badge would make
            the tool lines noisier than the conversation. */}
        <span
          aria-hidden
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            done
              ? 'bg-[color:var(--color-text-quaternary)]'
              : 'bg-[color:var(--color-indigo-accent)]',
          )}
        />
        {label.kind === 'known' ? t(`tool.${label.text}`) : label.text}
        {/*
          **Which node was touched** (2026-08-17). If this line only says 「Read a concept」 (read a concept) without naming the target, reading the transcript later tells you nothing about what happened and there is nothing to wire to the map. The value was already arriving in `rawInput`.

          It uses the same dotted underline — it means the same thing as a name in the answer (something that exists on the map), so there is no reason to give it a different shape.
        */}
        {toolTargets.length > 0 ? (
          <span className="min-w-0 truncate text-[color:var(--color-text-tertiary)]">
            {toolTargets.map((slug, i) => (
              <span key={slug}>
                {i === 0 ? ' · ' : ', '}
                <span
                  data-testid="acp-chat-slug"
                  data-slug={slug}
                  className="cursor-default underline decoration-dotted decoration-[color:var(--color-border-strong)] underline-offset-2 hover:decoration-[color:var(--color-indigo-a46)]"
                  onPointerEnter={() => onHoverSlug?.(slug)}
                  onPointerLeave={() => onHoverSlug?.(null)}
                >
                  {slug}
                </span>
              </span>
            ))}
          </span>
        ) : null}
      </p>
    );
  }
  /*
   * All that remains on the notice line is **one thing said to the user** (review
   * 2026-08-16).
   *
   * Diagnostics used to flow in here, printing things like
   * `UNPARSABLE:{"JSONRPC":"2.0","ID":7,…` and `SEND-FAILED: …` in uppercase monospace
   * in the middle of the conversation. Those are not for a person to read, and reading
   * them leaves nothing to do — they now go to the error block's 「Details」 (details).
   *
   * The one that remains (`gate-off`) is not a diagnostic but **a fact about a
   * promise**: in this conversation we cannot ask on your behalf before touching
   * anything outside the folder. Folded away quietly, the screen would keep making a
   * promise it cannot keep.
   */
  return (
    <p
      data-acp-entry="notice"
      data-notice={event.text}
      className="break-keep rounded-chip border border-[color:var(--color-amber-source-a30)] bg-[color:var(--color-amber-source-a08)] px-2.5 py-1.5 text-label leading-prose text-[color:var(--color-text-secondary)]"
    >
      {t(event.text === 'died-mid-turn' ? 'notice.diedMidTurn' : 'notice.gateOff')}
    </p>
  );
}
