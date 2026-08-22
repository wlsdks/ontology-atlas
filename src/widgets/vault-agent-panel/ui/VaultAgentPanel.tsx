'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import type { VaultManifest } from '@/entities/docs-vault';
import type { KnowledgeProjectInsight } from '@/entities/knowledge-graph';
import { buildFirstWords, type ScreenContextSnapshot } from '@/features/vault-agent';
import { useVaultConceptFacts } from '@/features/vault-ontology';
import {
  COMPOSER_MIN_ROWS,
  composerGrowth,
  composerTopIsHidden,
  snapScrollTop,
} from '@/shared/lib/composer-growth';
import {
  hostOfBaseUrl,
  isLocalEndpointReady,
  readLocalEndpoint,
  subscribeLocalEndpointChange,
  type LocalEndpointSettings,
} from '@/shared/lib/local-endpoint';
import { useHeldValue } from '@/shared/lib/use-presence';
import { Surface } from '@/shared/ui';
import { controlClass, fieldClass } from '@/shared/ui/control-class';
import { LLM_AUDIT_LOG_RELATIVE_PATH } from '@/shared/lib/llm-audit-log';
import { requestSettingsView } from '@/shared/lib/settings-view-intent';
import { gitHistory, isGitBridgeAvailable } from '@/shared/lib/tauri-git';
import { isLlmChatBridgeAvailable } from '@/shared/lib/tauri-llm';
import {
  SECRET_PROVIDER_HOSTS,
  LOCAL_PROVIDER,
  SECRET_PROVIDERS,
  secretStatus,
  subscribeSecretChange,
  type ConnectionProvider,
} from '@/shared/lib/tauri-secrets';

import { useVaultAgent } from '../model/use-vault-agent';
import { AgentFirstWords } from './AgentFirstWords';
import { AgentHandoffPacket } from './AgentHandoffCard';
import { AgentLockedComposer, AgentLockedState } from './AgentLockedState';
import { AgentProposalCard } from './AgentProposalCard';
import { AgentPromptText } from './AgentPromptDisclosure';
import { AgentScopeSheet } from './AgentScopeSheet';
import { AgentTranscript } from './AgentTranscript';
import { josa } from '@/shared/lib/ko-josa';

/**
 * The agent panel — a vertical dock the map yields space to on the right.
 *
 * ## Why the reflow is built this way
 *
 * The panel animates **width only**, inside `<main>`'s flex row. That one width
 * animation moves both columns (map `flex-1`, panel fixed width) in the same frame,
 * so the map's shrink and the panel's entry share **the same start and the same
 * curve** — not two animations tuned to match but physically one. That is what makes
 * it read as "it yielded space" rather than "the map was taken away".
 *
 * ## Closing = stopping
 *
 * Closing the panel cuts any in-flight call through the same path. There is no
 * continuing in the background.
 */
export function VaultAgentPanel({
  open,
  onClose,
  vaultPath,
  insight,
  manifest,
  screenContext,
  vaultIsGit,
  canWrite,
  onFocusNode,
  onOpenFolder,
  downloadHref,
  prefillRequest,
}: {
  open: boolean;
  onClose: () => void;
  vaultPath: string | null;
  insight: KnowledgeProjectInsight | null;
  manifest: VaultManifest | null;
  screenContext: ScreenContextSnapshot;
  vaultIsGit: boolean;
  canWrite: boolean;
  onFocusNode: (slug: string) => void;
  /** The route this panel can open itself when there is no folder — without it, that state has no door. */
  onOpenFolder?: () => void;
  downloadHref: string;
  /**
   * A first message handed over from outside (S7) — pressing 「에이전트에게 말로
   * 시키기」 (ask the agent) on a queue row or a node's detail brings a sentence
   * carrying that row's context here. **It is a prefill, not a send.** `nonce` is the
   * value that lets the same sentence be seated again on a repeat.
   */
  prefillRequest?: { text: string; nonce: number } | null;
}) {
  const t = useTranslations('vaultAgentPanel');
  const locale = useLocale();
  const [draft, setDraft] = useState('');
  const [scopeAccepted, setScopeAccepted] = useState(false);
  /**
   * The two side branches below the composer — 「지침 보기」 (view instructions) and
   * 「터미널에서 이어가기」 (continue in the terminal). **Only one opens at a time.**
   *
   * Why one: the old layout, with both sitting permanently as bordered strips,
   * stacked four strips at the panel's floor (instructions · composer · boundary
   * sentence · handoff card), with the protagonist (the composer) on the second row.
   * Side branches are needed **only when leaving or when in doubt**, so they have no
   * reason to sit permanently — the opening and closing folds into one row, and the
   * area that opens is limited to one (zero overlapping transient surfaces).
   */
  const [meta, setMeta] = useState<'prompt' | 'handoff' | null>(null);
  /**
   * A side branch gets **a way to collapse**. Opening is something the user pressed
   * and closing is the same event, yet it used to be `{meta ? … : null}`, so opening
   * grew through reflow while closing vanished in one frame — two directions of the
   * same input in different grammars is a defect.
   *
   * `meta` is a primitive, so `useHeldValue` needs no separate key (an object would
   * require one — a keyless object changes identity every render and produces React
   * #301).
   */
  const heldMeta = useHeldValue(meta);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /**
   * An **off-screen mirror** for measuring growth. The common pattern of resetting
   * the visible composer's height to `''` and reading `scrollHeight` collapses the box
   * to 0 and reopens it every frame, turning growth into a staircase rather than a
   * transition. The mirror has the same typography and width so it gives the same
   * value, and the visible box is never reset.
   */
  const mirrorRef = useRef<HTMLTextAreaElement>(null);
  /** Has the cap (6 rows) been hit so the top is **actually clipped**? Only then the top fade. */
  const [composerHidesTop, setComposerHidesTop] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const bridgeAvailable = isLlmChatBridgeAvailable();
  /** The basis for the blanks the first words point at — the same fact map the 「할 일」 queue reads. */
  const conceptFacts = useVaultConceptFacts();
  /**
   * Which vendor's key is on this computer. The first in registration order (=
   * `secrets.rs`'s allowlist order) is used — no model picker and no vendor picker is
   * built. The full key never arrives by any route, so all that is known here is
   * "there is one".
   */
  const [provider, setProvider] = useState<ConnectionProvider | null>(null);
  /**
   * The 「주소로 연결」 (connect by address) path's settings — the address and the
   * chosen model. It lives in localStorage rather than the keychain (it is not a
   * secret), and a signal arrives when the settings sheet changes it.
   */
  const [localEndpoint, setLocalEndpoint] = useState<LocalEndpointSettings | null>(null);
  /**
   * The **way back** after entering a key. When a key is saved in the settings sheet
   * a signal arrives at that moment and it is re-queried here — no reload is demanded
   * (demanding one would be a defect). The query itself is owned by the single effect
   * below, and this value is only the trigger that re-runs that effect.
   */
  const [secretNonce, setSecretNonce] = useState(0);
  useEffect(() => {
    if (!open || !bridgeAvailable) return undefined;
    const bump = () => setSecretNonce((value) => value + 1);
    const offSecret = subscribeSecretChange(bump);
    const offLocal = subscribeLocalEndpointChange(bump);
    return () => {
      offSecret();
      offLocal();
    };
  }, [open, bridgeAvailable]);
  useEffect(() => {
    if (!open || !bridgeAvailable) return;
    let cancelled = false;
    void (async () => {
      /**
       * **The address path comes first.** Why the order is this way: that path is
       * reached only by someone who typed an address, verified the connection and
       * chose a model from the list (one step more explicit than pasting a key), so if
       * an old key kept being used after all that, what the user just did would count
       * for nothing. Which one is live is stated continuously by the panel footer,
       * through the provider name and host.
       */
      const local = readLocalEndpoint();
      if (isLocalEndpointReady(local)) {
        if (!cancelled) {
          setLocalEndpoint(local);
          setProvider(LOCAL_PROVIDER);
        }
        return;
      }
      if (!cancelled) setLocalEndpoint(null);
      for (const candidate of SECRET_PROVIDERS) {
        const status = await secretStatus(candidate);
        if (cancelled) return;
        if (status?.stored) {
          setProvider(candidate);
          return;
        }
      }
      if (!cancelled) setProvider(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, bridgeAvailable, secretNonce]);

  /**
   * Continuity between sessions — this folder's recent commit subjects. It is the
   * basis on which a new conversation inherits past work **without storing the
   * conversation** (every write landed in frontmatter and git). It is read only when
   * the panel opens and when an apply finishes: background polling is something the
   * user did not ask for, and without git the bridge honestly returns empty.
   */
  const [recentChanges, setRecentChanges] = useState<readonly string[]>([]);

  const screenContextWithHistory = useMemo<ScreenContextSnapshot>(
    () => ({ ...screenContext, recentChanges }),
    [screenContext, recentChanges],
  );

  /**
   * Where this conversation actually goes. A named vendor is the official host
   * hard-coded here, and the address path is the host of the address the user typed —
   * **the same grammar** as the value recorded in the audit row, so the screen and the
   * record state the same thing.
   */
  const providerHost =
    provider === LOCAL_PROVIDER
      ? hostOfBaseUrl(localEndpoint?.baseUrl ?? '')
      : provider
        ? SECRET_PROVIDER_HOSTS[provider]
        : '';

  /**
   * An absolute path alone does not make it ready to send. During a desktop restore
   * the handle and absolute path can come back before the manifest. The screen in that
   * frame is the bundled sample, and using the path straight away makes the agent
   * write its audit log into a hidden local folder, splitting the vault of the screen,
   * the grounding and the record. With no manifest there is no vault to read, so it
   * honestly falls back to the existing no-folder state.
   */
  const readableVaultPath = manifest ? vaultPath : null;

  const agent = useVaultAgent({
    provider,
    localEndpoint,
    vaultPath: readableVaultPath,
    insight,
    manifest,
    screenContext: screenContextWithHistory,
    locale,
    vaultIsGit,
    projectInstructions: null,
    snapshotLabel: t('snapshotLabel'),
    notices: {
      roundCap: t('notice.roundCap'),
      noToolCall: ({ round, cap }) => t('notice.noToolCall', { round, cap }),
      aborted: t('notice.aborted'),
      networkFailed: t('notice.networkFailed'),
      timedOut: t('notice.timedOut'),
      rateLimited: t('notice.rateLimited'),
      rejected: t('notice.rejected'),
      auditBlocked: t('notice.auditBlocked'),
      providerRefused: t('notice.providerRefused'),
      failed: t('notice.failed'),
    },
    proposalLabels: {
      createFile: (path) => t('proposal.createFile', { path }),
      modifyFile: (path) => t('proposal.modifyFile', { path }),
      addRelation: ({ from, to, type }) =>
        t('proposal.addRelation', { from, to, type }),
    },
  });

  // Closing = stopping. Not open means anything in flight ends with it.
  const { stop } = agent;
  useEffect(() => {
    if (!open) stop();
  }, [open, stop]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /**
   * There are only two moments history is read: when the panel opens, and **after an
   * apply lands** (the next conversation has to know what was just done for
   * "continues" to be true). Background polling is not done, because the user did not
   * ask for it.
   */
  const appliedTally = agent.sessionSummary.concepts + agent.sessionSummary.relations;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // A state that cannot be read (closed, no folder, not git) is **empty history**,
      // not an error. That block simply drops out of the context.
      if (!open || !readableVaultPath || !isGitBridgeAvailable()) {
        if (!cancelled) setRecentChanges((current) => (current.length === 0 ? current : []));
        return;
      }
      try {
        const commits = await gitHistory(readableVaultPath, 5);
        if (cancelled) return;
        setRecentChanges(
          (commits ?? []).map((commit) => `${commit.subject} (${commit.relativeTime})`),
        );
      } catch {
    // Failing to read git history is not a failure of the conversation either — it goes on without that row.
        if (!cancelled) setRecentChanges([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, readableVaultPath, appliedTally]);

  /**
   * Seat a prefilled sentence so it **reads from the beginning** — the caret at the
   * end of the sentence (where you continue writing), the view on the first line.
   *
   * The old implementation was `input.select()`. Selecting everything means "the next
   * keystroke erases this sentence", while the user just pressed it **to choose** that
   * sentence — the opposite of the intent. And select scrolls to the end of the
   * selection (the last line), so the moment 3 lines arrived in a 2-line fixed box it
   * pushed `scrollTop` to 9px in one frame. The line height is 20px, 9 is not a
   * multiple of it, and so a row with glyphs cut in half caught on the top edge
   * (measured: frame f231 of 420, 16.7ms).
   *
   * `scrollTop` is always snapped to the line grid. This is **alignment**, not motion,
   * so it survives under reduced-motion too.
   */
  const seatDraft = useCallback((input: HTMLTextAreaElement) => {
    input.focus();
    const end = input.value.length;
    // APIs that may be missing in jsdom and older WebViews are called only when present.
    if (typeof input.setSelectionRange === 'function') input.setSelectionRange(end, end);
    const lineHeight = Number.parseFloat(window.getComputedStyle(input).lineHeight);
    input.scrollTop = snapScrollTop(0, lineHeight);
  }, []);

  /**
   * Chip → prefill. The sentence is seated **in the frame it was pressed**. Sending is
   * always [보내기].
   *
   * Seating is deferred behind `requestAnimationFrame` — immediately after `setDraft`
   * React has not written the value yet, so the caret is computed against the old
   * (empty) value.
   */
  const prefill = useCallback(
    (text: string) => {
      setDraft(text);
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      window.requestAnimationFrame(() => {
        const current = inputRef.current;
        if (current) seatDraft(current);
      });
    },
    [seatDraft],
  );

  /**
   * A first message handed over from outside (S7).
   *
   * Taken as **an adjustment during render** rather than an effect (React's "adjust
   * state when a prop changes" pattern): in an effect the screen paints once with the
   * stale value and then repaints, and that single frame looks exactly like "I pressed
   * it and it responded late". It seats only when `nonce` changes, so pressing the same
   * sentence again seats it again, and a draft the user was editing is not overwritten
   * every render.
   */
  const prefillNonce = prefillRequest?.nonce ?? null;
  const prefillText = prefillRequest?.text ?? null;
  const [seenPrefillNonce, setSeenPrefillNonce] = useState<number | null>(null);
  if (prefillNonce !== null && prefillText && prefillNonce !== seenPrefillNonce) {
    setSeenPrefillNonce(prefillNonce);
    setDraft(prefillText);
  }
  // Focus and caret are DOM operations, so they happen after render — the value is already in by then.
  useEffect(() => {
    if (seenPrefillNonce === null) return;
    const input = inputRef.current;
    if (!input) return;
    seatDraft(input);
  }, [seenPrefillNonce, seatDraft]);

  /**
   * Composer growth — it starts at 2 rows and grows **with the content** to 6.
   *
   * The old implementation was a fixed `rows={2}`, so the box stayed the same even
   * with a three-line sentence (height fixed at 58px across all 420 frames, mean
   * inter-frame pixel diff 0.013) and the user could see only a third of the sentence
   * they had just chosen.
   *
   * Height goes through **real `height`**, not `transform` — the siblings (send button,
   * side-branch row) have to yield space along with it for it to read as "this box
   * grew", and transform makes no space. The curve is the single surface-movement ramp
   * (`--motion-base`) with no spring: with no retargeting, overshooting the baseline
   * shakes the text while it is being read.
   */
  useLayoutEffect(() => {
    const input = inputRef.current;
    const mirror = mirrorRef.current;
    if (!input || !mirror) return;
    mirror.value = draft;
    const style = window.getComputedStyle(input);
    const lineHeight = Number.parseFloat(style.lineHeight);
    const growth = composerGrowth({
      lineHeight,
      paddingBlock:
        Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom),
      borderBlock:
        Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth),
      contentHeight: mirror.scrollHeight,
    });
    // Leave it alone in states that cannot be measured (SSR, jsdom, before fonts
    // load) — the default `rows` always beats collapsing to 0px.
    if (!growth) return;
    input.style.height = `${growth.height}px`;
    input.scrollTop = snapScrollTop(input.scrollTop, lineHeight);
    setComposerHidesTop(composerTopIsHidden(growth.overflowing, input.scrollTop));
    // `scopeAccepted`/`provider` are the moment the composer **mounts** — measuring
    // once then is what makes it stand at the right height from the first paint.
  }, [draft, open, scopeAccepted, provider]);

  // New content grows downward only — the scroll anchor is pinned to the bottom.
  useEffect(() => {
    const node = scrollRef.current;
  // jsdom has no scrollTo — a missing API is not called and it simply moves on.
    if (!node || typeof node.scrollTo !== 'function') return;
    node.scrollTo({ top: node.scrollHeight });
  }, [agent.turns, agent.proposal]);

  const ready = bridgeAvailable && Boolean(provider) && Boolean(readableVaultPath);
  const canSend = ready && scopeAccepted && !agent.running && draft.trim().length > 0;

  /**
   * Which state this panel is in — folded into one value. The same box is becoming a
   * different state, so the cross-fade runs once, only when this value changes.
   */
  const stage = !bridgeAvailable
    ? 'web'
    : !readableVaultPath
      ? 'no-folder'
      : !provider
        ? 'no-key'
        : !scopeAccepted
          ? 'scope'
          : 'chat';
  /**
   * The first words — **computed locally. No model is called.**
   *
   * All the ingredients are already on screen: the concept being viewed (the screen
   * context), the concepts in this folder with an empty meaning or owner (**the same
   * judgement** as the 「할 일」 queue), and the map questions that can always be asked.
   * So the suggestions are free (local) and only running them is opt-in — "nothing
   * goes out before you send" becomes the basis of the first-words design rather than
   * a constraint on it.
   */
  const firstWordsChips = useMemo(
    () =>
      buildFirstWords(
        {
          nodes: insight?.nodes ?? [],
          docFacts: conceptFacts,
          focusedRef: screenContext.focusedSlug,
        },
        {
          missingDefinition: (title) => t('firstWords.missingDefinition', { title }),
          missingDomain: (title) => t('firstWords.missingDomain', { title }),
          missingRelations: (title) => t('firstWords.missingRelations', { title }),
          mapReview: t('firstWords.mapReview'),
          emptyVault: t('firstWords.emptyVault'),
        },
      ),
    [insight, conceptFacts, screenContext.focusedSlug, t],
  );

  function submit() {
    if (!canSend) return;
    const text = draft.trim();
    // The composer empties and the bubble sits down in the frame it was pressed — it
    // does not wait for the network. `send` continues asynchronously after a
    // synchronous state transition.
    setDraft('');
    void agent.send(text);
  }

  return (
    <aside
      data-testid="vault-agent-panel"
      /*
       * What stands at the screen's right — notifications (toasts) step aside by this
       * width. Marked only while open: a closed panel is 0 wide and has nothing to
       * reserve.
       */
      data-right-dock={open ? 'key-agent' : undefined}
      data-agent-panel-state={open ? 'open' : 'closed'}
      data-agent-panel-reflow-token="--agent-panel-reflow-duration"
      aria-label={t('title')}
      aria-hidden={!open}
      // One width moves both columns together — the map's shrink and the panel's entry
      // share a curve and a start. `--agent-panel-reflow-duration` is that one value.
      style={{
        width: open ? 'var(--agent-panel-width)' : '0px',
        transitionProperty: 'width',
        transitionDuration: 'var(--agent-panel-reflow-duration)',
        transitionTimingFunction: 'var(--topology-motion-ease-out)',
      }}
      className="relative flex h-full shrink-0 flex-col overflow-hidden border-l border-[color:var(--color-divider)] bg-[color:var(--color-canvas)]"
    >
      <div
        className="flex h-full w-[var(--agent-panel-width)] flex-col"
        // Map interaction is not blocked even while opening — this is not a blocking surface.
        inert={!open ? true : undefined}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-[color:var(--color-border-soft)] px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
              {t('title')}
            </p>
            {/* There is one subtitle slot — when progress happens, only the **text** on
                that row changes. Position and size stay, so the layout does not jump,
                and no decoration such as rolling numbers is attached (progress is a
                fact, not a notification). */}
            <p
              data-testid="vault-agent-panel-subtitle"
              className="truncate text-label tracking-label text-[color:var(--color-text-quaternary)]"
            >
              {appliedTally > 0
                ? t('sessionSummary', {
                    concepts: agent.sessionSummary.concepts,
                    relations: agent.sessionSummary.relations,
                  })
                : t('subtitle')}
            </p>
          </div>
          <button
            type="button"
            data-testid="vault-agent-panel-close"
            onClick={onClose}
            aria-label={t('close')}
            className={controlClass({ shape: "icon", tone: "muted", className: "size-[var(--overlay-close-size)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]" })}
          >
            <X aria-hidden="true" size={ICON_SIZE.lg} />
          </button>
        </header>

        <div
          ref={scrollRef}
          data-agent-panel-stage={stage}
          // This scroller is itself a vertical flex — for the locked state's composer
          // position to stand in **the same place** as the real composer (the panel
          // floor), the wrapper below has to receive the remaining height, and
          // `min-h-full` is not reliable inside a scroll container.
          className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3"
        >
          {/* The same box becomes a different state — the state name is the key so a
              short cross-fade (--motion-base) runs exactly once. Looking like a new
              screen appeared reads as "I went elsewhere" rather than "this opened". */}
          <div key={stage} className="agent-panel-stage-swap flex grow flex-col">
          {!bridgeAvailable ? (
            // A browser has nowhere to keep a key and no route to send — it sends you to
            // the app, not to settings (honest degradation).
            <AgentLockedState
              title={t('degraded.webTitle')}
              body={t('degraded.webBody')}
              consent={t('locked.consentPromise')}
              examplesTitle={t('locked.examplesTitle')}
              chips={firstWordsChips}
            />
          ) : !readableVaultPath ? (
            <AgentLockedState
              title={t('degraded.noVaultTitle')}
              body={t('degraded.noVaultBody')}
              consent={t('locked.consentPromise')}
              examplesTitle={t('locked.examplesTitle')}
              chips={firstWordsChips}
            />
          ) : !provider ? (
            // Owner reversal (2026-07-26) — the old structure told the route **in
            // words**: "in the bottom-left settings (gear), under 「AI 연결」…". Making a
            // person find somewhere the screen could take them is homework, not guidance.
            <AgentLockedState
              title={t('degraded.noKeyTitle')}
              body={t('degraded.noKeyBody')}
              consent={t('locked.consentPromise')}
              examplesTitle={t('locked.examplesTitle')}
              chips={firstWordsChips}
            />
          ) : !scopeAccepted ? (
            <>
              {/* The consent card also stands at the floor — [알겠어요] (got it) is where
                  [보내기] (send) will stand. The next control opening in the same place
                  reads as "this opened"; floating above and then producing a composer
                  below reads as "something else appeared". */}
              <div aria-hidden="true" className="min-h-0 shrink grow" />
              <AgentScopeSheet
              provider={t(`provider.${provider}`)}
              host={providerHost}
              auditPath={LLM_AUDIT_LOG_RELATIVE_PATH}
              labels={{
                title: t('scope.title'),
                body: ({ provider: name, host }) => t('scope.body', { provider: name, host }),
                liveRows: t('scope.liveRows'),
                consent: t('scope.consent'),
                recorded: (path) => t('scope.recorded', { path }),
                accept: t('scope.accept'),
                cancel: t('scope.cancel'),
              }}
                onAccept={() => setScopeAccepted(true)}
                onCancel={onClose}
              />
            </>
          ) : (
            <>
              {/* The conversation **grows from the bottom** — the leftover height while it
                  is short is pushed up. The old layout pinned the first turn to the top,
                  leaving 400–640px empty down to the composer, and that whitespace only
                  separated the answer from the hand. Why a spacer rather than
                  `justify-end`: on overflow, `justify-end` eats the scroll container's top
                  (the first turn disappears above the scroll). A spacer shrinks, so it
                  quietly becomes 0 on overflow. */}
              <div aria-hidden="true" className="min-h-0 shrink grow" />
              <AgentTranscript
                turns={agent.turns}
                providerLabel={t(`provider.${provider}`)}
                elapsedSeconds={agent.elapsedSeconds}
                onFocusNode={onFocusNode}
                onPrefill={prefill}
                labels={{
                  nextStepTitle: t('nextStep.title'),
                  retryTitle: t('retry.title'),
                  regroundTitle: ({ round, cap }) => t('reground.title', { round, cap }),
                  you: t('you'),
                  lookingAt: (title) => t('screenContext.lookingAt', { title, josa: josa(title, 'object') }),
                  wholeMap: t('screenContext.wholeMap'),
                  unsupported: t('unsupported'),
                  uncited: t('uncited'),
                  charsLabel: (chars) => t('charsLabel', { chars }),
                  thinking: t('thinking'),
                  thinkingSeconds: (seconds) => t('thinkingSeconds', { seconds }),
                  footer: ({ provider: name, rounds }) => t('footer', { provider: name, rounds }),
                  footerDetail: ({ chars }) => t('footerDetail', { chars }),
                }}
                renderProposal={() => null}
              />
              {agent.proposal ? (
                <AgentProposalCard
                  proposal={agent.proposal}
                  canWrite={canWrite}
                  vaultIsGit={vaultIsGit}
                  expandedByDefault={!agent.hasAppliedOnce}
                  onApply={() => void agent.apply()}
                  onCancel={agent.cancelProposal}
                  onCopy={agent.copyProposal}
                  onToggleChange={agent.toggleChange}
                  onToggleSnapshot={agent.toggleSnapshot}
                  onFocusNode={onFocusNode}
                  labels={{
                    title: (count) => t('proposal.title', { count }),
                    readOnlyTitle: t('proposal.readOnlyTitle'),
                    volume: ({ files, added, removed }) =>
                      t('proposal.volume', { files, added, removed }),
                    apply: (count) => t('proposal.apply', { count }),
                    applying: t('proposal.applying'),
                    cancel: t('proposal.cancel'),
                    copy: t('proposal.copy'),
                    copied: t('proposal.copied'),
                    snapshot: t('proposal.snapshot'),
                    snapshotUnavailable: t('proposal.snapshotUnavailable'),
                    applied: (sha) => t('proposal.applied', { sha }),
                    appliedNoSnapshot: t('proposal.appliedNoSnapshot'),
                    cancelled: t('proposal.cancelled'),
                    conflict: t('proposal.conflict'),
                    unreadWarning: t('proposal.unreadWarning'),
                    showOnMap: t('proposal.showOnMap'),
                    expandHint: t('proposal.expandHint'),
                  }}
                />
              ) : null}
              {/* An empty conversation — a blank page is not offered. Three sentences drawn
                  from this folder's real state are already seated, and pressing one brings
                  it down to the composer. It is computed locally with no wait, so it
                  arrives in **the same frame** as the skeleton. */}
              {agent.turns.length === 0 ? (
                <AgentFirstWords
                  chips={firstWordsChips}
                  title={t('firstWords.title')}
                  hint={t('firstWords.hint')}
                  onPrefill={prefill}
                />
              ) : null}
            </>
          )}
          </div>
        </div>

        {/* The locked state's composer position — it stands on **the same strip** as the
            real composer (panel floor, same divider). Both states use the same place, so
            the moment a key arrives reads as "this opened". Only the guidance and the
            destination differ per state. */}
        {stage === 'web' ? (
          <AgentLockedComposer
            testId="vault-agent-download-link"
            hint={t('placeholderFirst')}
            actionLabel={t('degraded.download')}
            actionHref={downloadHref}
          />
        ) : stage === 'no-folder' ? (
          <AgentLockedComposer
            testId="vault-agent-open-folder"
            hint={t('placeholderFirst')}
            actionLabel={t('degraded.noVaultAction')}
            onAction={onOpenFolder}
          />
        ) : stage === 'no-key' ? (
          <AgentLockedComposer
            testId="vault-agent-open-settings"
            hint={t('placeholderFirst')}
            actionLabel={t('degraded.noKeyAction')}
            onAction={() => requestSettingsView('ai')}
          />
        ) : null}

        {ready && scopeAccepted ? (
          // One state change arrives as **one curve**. The stage (the content) and this
          // strip (the composer) are two parts of the same event, but the old
          // implementation cross-faded only the stage and hard-cut this strip — the same
          // input arriving on different curves reads as two events. Zero new durations
          // (the same class is reused), zero start offset (the same render).
          <footer
            key={stage}
            className="agent-panel-stage-swap shrink-0 border-t border-[color:var(--color-border-soft)] p-2.5"
          >
            {/* The button is `items-end` — a text input's primary action is pinned at the
                bottom (Apple HIG: the destination of direct manipulation does not move).
                As the box grows the button follows its bottom edge, so vertical alignment
                stays correct too. */}
            <div className="flex items-end gap-2">
              <div className="relative min-w-0 flex-1">
              <textarea
                ref={inputRef}
                data-testid="vault-agent-input"
                data-composer-hides-top={composerHidesTop ? 'true' : 'false'}
                value={draft}
                rows={COMPOSER_MIN_ROWS}
                disabled={agent.running}
                onScroll={(event) => {
                  const input = event.currentTarget;
                  setComposerHidesTop(
                    input.scrollHeight > input.clientHeight && input.scrollTop > 0,
                  );
                }}
                style={{
                  // Growth is **surface movement** — it rides the app's shared ramp.
                  // Zero new tokens, zero new durations.
                  transitionProperty: 'height',
                  transitionDuration: 'var(--motion-base)',
                  transitionTimingFunction: 'var(--motion-ease)',
                  // The overflow signal appears only when the cap is hit and the top is
                  // **actually clipped**. While growing, an overflow that is not there is
                  // not advertised.
                  maskImage: composerHidesTop
                    ? 'linear-gradient(to bottom, transparent 0, #000 var(--leading-body))'
                    : undefined,
                }}
                // "Continue talking" is a sentence with nothing to continue for someone
                // who has said nothing yet. The first-message placeholder uses **the same
                // key** as the locked strip's copy, so the moment a key arrives the same
                // text stays in the same place ("this opened").
                placeholder={
                  agent.turns.length === 0 ? t('placeholderFirst') : t('placeholder')
                }
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                className={`${COMPOSER_BOX_CLASS} block w-full text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]`}
              />
              {/* The mirror that measures growth. **Same class = same typography and same
                  width**, so it wraps identically. Why it is not moved off screen but kept
                  in the same place: the width (padding and border included) has to match
                  the real box for the row count to match.

                  `invisible` (visibility: hidden), not `opacity-0` — a transparent element
                  is still a painted element, so it shows up in overlap audits and can
                  still take a caret or a selection. Layout still runs, so `scrollHeight`
                  comes out the same. */}
              <textarea
                ref={mirrorRef}
                aria-hidden="true"
                tabIndex={-1}
                readOnly
                data-testid="vault-agent-input-mirror"
                className={`${COMPOSER_BOX_CLASS} pointer-events-none invisible absolute left-0 top-0 h-0 w-full overflow-hidden`}
              />
              </div>
              {agent.running ? (
                <button
                  type="button"
                  data-testid="vault-agent-stop"
                  onClick={agent.stop}
                  /* Stop and send replace each other in **one position**, so they take the
                     same step. `px-3` is `lg`'s inset on the ramp and `lg`'s pair is
                     `text-body` — the hand-written `px-3` plus `text-label` was a
                     combination straddling two steps. */
                  className={controlClass({
                    shape: 'chip',
                    size: 'lg',
                    tone: 'strong',
                    className:
                      'shrink-0 justify-center font-[var(--font-weight-emphasis)] tracking-body hover:bg-[color:var(--color-overlay-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
                  })}
                >
                  {t('stop')}
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="vault-agent-send"
                  disabled={!canSend}
                  onClick={submit}
                  className={controlClass({
                    shape: 'chip',
                    size: 'lg',
                    tone: 'onAccent',
                    className:
                      'shrink-0 justify-center tracking-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
                  })}
                >
                  {t('send')}
                </button>
              )}
            </div>

            {/* One row of side branches — only the open/close control sits permanently, and
                the content arrives only when opened. The two buttons close each other: no
                overlapping transient surface is created. */}
            <div className="mt-2 flex items-center gap-2">
              <MetaToggle
                testId="agent-meta-prompt"
                open={meta === 'prompt'}
                label={t('promptDisclosure.summary')}
                onToggle={() => setMeta((current) => (current === 'prompt' ? null : 'prompt'))}
              />
              {readableVaultPath ? (
                <>
                  <span
                    aria-hidden="true"
                    className="text-label text-[color:var(--color-text-quaternary)]"
                  >
                    ·
                  </span>
                  <MetaToggle
                    testId="agent-meta-handoff"
                    open={meta === 'handoff'}
                    label={t('handoffSummary')}
                    onToggle={() =>
                      setMeta((current) => (current === 'handoff' ? null : 'handoff'))
                    }
                  />
                </>
              ) : null}
            </div>

            {/* `origin` is the trigger's direction — the toggle that opens this box is
                directly above and to the left, and the box grows below it. Born at the
                centre, where it was pressed and where it was born would not match (the
                motion seat's rejection rationale). The content is held with `heldMeta`:
                the moment `meta` becomes null the child empties and the box would collapse
                «while empty». */}
            <Surface
              open={meta !== null}
              origin="top left"
              data-testid="agent-meta-disclosure"
              className="mt-2 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-2.5"
            >
              {heldMeta === 'prompt' ? (
                <AgentPromptText
                  systemPrompt={agent.systemPrompt}
                  note={t('promptDisclosure.note')}
                />
              ) : readableVaultPath ? (
                // The boundary sentence is worth something only **where the handover
                // happens** — the sentence that used to sit below the composer eating two
                // lines through the whole conversation came down here.
                <AgentHandoffPacket
                  vaultPath={readableVaultPath}
                  focusedSlug={screenContext.focusedSlug}
                  labels={{
                    boundary: t('boundary'),
                    note: t('handoffNote'),
                    copy: t('handoffCopy'),
                    copied: t('handoffCopied'),
                  }}
                />
              ) : null}
            </Surface>
          </footer>
        ) : null}
      </div>
    </aside>
  );
}

/**
 * The box specification the composer and the mirror use **together**. It is one
 * string, so there is nowhere for their typography to diverge — and diverging would
 * make the mirror measure a different row count and the box stand at the wrong height
 * (a value written in two places has already begun drifting).
 */
const COMPOSER_BOX_CLASS = fieldClass({ multiline: true, size: 'md' });

/**
 * The one-row control that opens a side branch. No border, no background — if this
 * row looked as heavy as the composer, the floor would become "several strips" again.
 */
function MetaToggle({
  testId,
  open,
  label,
  onToggle,
}: {
  testId: string;
  open: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-expanded={open}
      onClick={onToggle}
      className={controlClass({
        shape: 'link',
        tone: open ? 'default' : 'muted',
        className: [
          'rounded-chip tracking-label',
          open ? '' : 'hover:text-[color:var(--color-text-secondary)]',
        ].join(' '),
      })}
    >
      {label}
    </button>
  );
}
