'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import type { VaultManifest } from '@/entities/docs-vault';
import type { KnowledgeProjectInsight } from '@/entities/knowledge-graph';
import { buildFirstWords, type ScreenContextSnapshot } from '@/features/vault-agent';
import { useVaultConceptFacts } from '@/features/vault-ontology';
import {
  COMPOSER_MIN_ROWS,
  composerGrowth,
  composerTopIsHidden,
  snapScrollTop,
} from '@/shared/lib/agent-chat/composer-growth';
import {
  hostOfBaseUrl,
  isLocalEndpointReady,
  readLocalEndpoint,
  subscribeLocalEndpointChange,
  type LocalEndpointSettings,
} from '@/shared/lib/llm-connection/local-endpoint';
import { useHeldValue } from '@/shared/lib/render-timing/use-presence';
import { AGENT_DOCK_INSET_SURFACE_CLASS, Chip, CloseButton, Surface } from '@/shared/ui';
import { controlClass, fieldClass } from '@/shared/ui/control-class';
import { LLM_AUDIT_LOG_RELATIVE_PATH } from '@/shared/lib/llm-connection/llm-audit-log';
import { useRouter } from '@/i18n/navigation';
import { AGENTS_MODELS_HREF } from '@/shared/config/destinations';
import { gitHistory, isGitBridgeAvailable } from '@/shared/lib/git/tauri-git';
import { isLlmChatBridgeAvailable } from '@/shared/lib/llm-connection/tauri-llm';
import { pickTauriSourceDirectory } from '@/shared/lib/vault-folder/tauri-vault-fs';
import { previewConstructionSource, type ConstructionSourcePreview } from '@/shared/lib/llm-connection/tauri-local-construction';
import {
  SECRET_PROVIDER_HOSTS,
  LOCAL_PROVIDER,
  SECRET_PROVIDERS,
  secretStatus,
  subscribeSecretChange,
  type ConnectionProvider,
} from '@/shared/lib/llm-connection/tauri-secrets';

import { isLocalConstructionEndpoint, useVaultAgent } from '../model/use-vault-agent';
import { AgentFirstWords } from './AgentFirstWords';
import { AgentHandoffPacket } from './AgentHandoffCard';
import { AgentLockedComposer, AgentLockedState } from './AgentLockedState';
import { AgentProposalCard } from './AgentProposalCard';
import { AgentPromptText } from './AgentPromptDisclosure';
import { AgentScopeSheet } from './AgentScopeSheet';
import { AgentTranscript } from './AgentTranscript';
import { josa } from '@/shared/lib/locale-text/ko-josa';
import { isImeComposing } from '@/shared/lib/keyboard/ime-composition';
import { VAULT_AGENT_PANEL_ID } from '@/shared/config/agent-panel';

/**
 * The agent panel: a dock the map yields space to on the right. It animates width only inside
 * `<main>`'s flex row, so the map's shrink and the panel's entry share one start and one curve.
 * Closing the panel cuts any in-flight call; nothing continues in the background.
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
  onOpenFolder?: () => void;
  downloadHref: string;
  /**
   * A first message handed over from outside, such as "Ask the agent" on a queue row: a prefill, not
   * a send. `nonce` lets the same sentence be seated again.
   */
  prefillRequest?: { text: string; nonce: number } | null;
}) {
  const t = useTranslations('vaultAgentPanel');
  const router = useRouter();
  const locale = useLocale();
  const [draft, setDraft] = useState('');
  const [scopeAccepted, setScopeAccepted] = useState(false);
  const [sourceSelection, setSourceSelection] = useState<{
    nonce: number;
    status: 'preparing' | 'preview' | 'localRequired' | 'sourceChanged';
    preview?: ConstructionSourcePreview;
  } | null>(null);
  const sourceSelectionNonce = useRef(0);
  const heldSourceSelection = useHeldValue(sourceSelection, sourceSelection ? `${sourceSelection.nonce}:${sourceSelection.status}` : null);
  /**
   * The two side branches below the composer, "View instructions" and "Continue in the terminal",
   * open one at a time: they are needed only when leaving or in doubt, so they do not sit permanently.
   */
  const [meta, setMeta] = useState<'prompt' | 'handoff' | null>(null);
  /**
   * A side branch collapses through `useHeldValue` instead of vanishing. `meta` is a primitive, so no
   * key is needed (a keyless object changes identity every render and produces React #301).
   */
  const heldMeta = useHeldValue(meta);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /**
   * An off-screen mirror measures growth: resetting the visible composer's height to `''` to read
   * `scrollHeight` collapses the box every frame and turns growth into a staircase. The mirror has
   * the same typography and width, and the visible box is never reset.
   */
  const mirrorRef = useRef<HTMLTextAreaElement>(null);
  const [composerHidesTop, setComposerHidesTop] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const bridgeAvailable = isLlmChatBridgeAvailable();
  const conceptFacts = useVaultConceptFacts();
  /**
   * Which vendor's key is on this computer: the first in registration order (`secrets.rs`'s allowlist
   * order). No picker exists, and the full key never arrives here, so only "there is one" is known.
   */
  const [provider, setProvider] = useState<ConnectionProvider | null>(null);
  /**
   * The connect-by-address settings: the address and the chosen model. They live in localStorage, not
   * the keychain (not a secret), and a signal arrives when the settings sheet changes them.
   */
  const [localEndpoint, setLocalEndpoint] = useState<LocalEndpointSettings | null>(null);
  /**
   * The signal that a key was saved in the settings sheet. It only re-runs the effect below that owns
   * the query, so no reload is demanded.
   */
  const [secretNonce, setSecretNonce] = useState(0);

  /*
   * Escape counts only from inside the panel and not while an IME is composing; a nested surface that
   * used the key marks it with `preventDefault`. Every close returns focus to the opener.
   */
  const panelRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return undefined;
    // The aside is always rendered (a closed panel is 0 wide), so this node is the one
    // the cleanup below will see.
    const panel = panelRef.current;
    const active = document.activeElement;
    openerRef.current =
      active instanceof HTMLElement && active !== document.body && !panel?.contains(active) ? active : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
      if (!panel || !(event.target instanceof Node) || !panel.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const focused = document.activeElement;
      // Only when focus was in the panel (or already lost): a close pressed on the
      // toolbar toggle leaves focus on that toggle, where it belongs.
      if (focused && focused !== document.body && !panel?.contains(focused)) return;
      // The control that opened it; WebKit does not focus a pressed button, so the
      // toggle that names this panel in `aria-controls` stands in for it.
      const opener =
        openerRef.current?.isConnected
          ? openerRef.current
          : document.querySelector<HTMLElement>(`[aria-controls="${VAULT_AGENT_PANEL_ID}"]`);
      opener?.focus({ preventScroll: true });
    };
  }, [open]);

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
       * The address path comes first: it is reached only by someone who typed an address, verified the
       * connection and chose a model, so an old key must not override that. The panel footer states which
       * one is live, by provider name and host.
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
   * Continuity between sessions: this folder's recent commit subjects, so a new conversation inherits
   * past work without storing the conversation. Read only when the panel opens and when an apply
   * finishes; no background polling, and without git the bridge returns empty.
   */
  const [recentChanges, setRecentChanges] = useState<readonly string[]>([]);

  const screenContextWithHistory = useMemo<ScreenContextSnapshot>(
    () => ({ ...screenContext, recentChanges }),
    [screenContext, recentChanges],
  );

  /**
   * Where this conversation actually goes: the official host for a named vendor, the typed address's
   * host for the address path, in the same form as the audit row, so screen and record agree.
   */
  const providerHost =
    provider === LOCAL_PROVIDER
      ? hostOfBaseUrl(localEndpoint?.baseUrl ?? '')
      : provider
        ? SECRET_PROVIDER_HOSTS[provider]
        : '';

  /**
   * An absolute path alone is not ready to send: a desktop restore can return the handle and path
   * before the manifest, while the screen shows the bundled sample, and the audit log would land in a
   * hidden folder. With no manifest it falls back to the no-folder state.
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
    constructionNotices: { incomplete: t('construction.incomplete') },
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

  const constructionResource = JSON.stringify([readableVaultPath, provider, localEndpoint?.model, localEndpoint?.baseUrl, open]);
  const constructionResourceRef = useRef(constructionResource);
  useLayoutEffect(() => { constructionResourceRef.current = constructionResource; }, [constructionResource]);
  useEffect(() => () => { sourceSelectionNonce.current += 1; setSourceSelection(null); }, [constructionResource]);

  const cancelSourceSelection = () => { sourceSelectionNonce.current += 1; setSourceSelection(null); };
  const chooseConstructionSource = async () => {
    if (!bridgeAvailable || !readableVaultPath || agent.running || agent.proposal?.status === 'applying') return;
    agent.stop();
    const nonce = ++sourceSelectionNonce.current;
    const resource = constructionResource;
    if (provider !== LOCAL_PROVIDER || !localEndpoint?.model || !isLocalConstructionEndpoint(localEndpoint.baseUrl)) {
      setSourceSelection({ nonce, status: 'localRequired' });
      return;
    }
    setSourceSelection({ nonce, status: 'preparing' });
    const active = () => sourceSelectionNonce.current === nonce && constructionResourceRef.current === resource;
    try {
      const sourcePath = await pickTauriSourceDirectory(t('construction.pickerTitle'));
      if (!active()) return;
      if (!sourcePath) { setSourceSelection(null); return; }
      const preview = await previewConstructionSource(sourcePath, readableVaultPath);
      if (!active()) return;
      if (preview.destinationPath !== readableVaultPath || preview.sourcePath !== sourcePath) throw new Error('source_changed');
      setSourceSelection({ nonce, status: 'preview', preview });
    } catch {
      if (active()) setSourceSelection({ nonce, status: 'sourceChanged' });
    }
  };
  const runConstruction = () => {
    if (sourceSelection?.status !== 'preview' || !sourceSelection.preview?.files.length || agent.running) return;
    const preview = sourceSelection.preview;
    cancelSourceSelection();
    setScopeAccepted(true);
    void agent.sendConstruction(preview, draft.trim() || t('construction.action'));
  };

  const { stop } = agent;
  useEffect(() => {
    if (!open) stop();
  }, [open, stop]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /**
   * History is read at two moments: when the panel opens and after an apply lands, so the next
   * conversation knows what was just done. No background polling.
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
   * Seat a prefilled sentence so it reads from the beginning: caret at the end, view on the first line.
   * `input.select()` would make the next keystroke erase the chosen sentence and scroll to the last
   * line, so `scrollTop` is snapped to the 20px line grid (alignment, so it holds under reduced motion).
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
   * Chip to prefill: seated in the frame it was pressed; sending is always [Send]. Seating waits for
   * `requestAnimationFrame`, as right after `setDraft` React has not written the value yet.
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
   * A first message handed over from outside is taken as an adjustment during render, not an effect:
   * an effect paints the stale value once first, which reads as a late response. It seats only when
   * `nonce` changes, so a draft being edited is not overwritten every render.
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
   * Composer growth: from 2 rows with the content up to 6, through real `height` (not `transform`) so
   * the send button and side-branch row yield space with it. The curve is the single surface-movement
   * ramp with no spring: overshoot would shake text being read.
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
  const canSend = ready && scopeAccepted && !agent.running && sourceSelection === null && agent.proposal?.status !== 'applying' && draft.trim().length > 0;

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
   * The first words are computed locally; no model is called. They use the same judgement as the To-do
   * queue, so only running them is opt-in.
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
      ref={panelRef}
      id={VAULT_AGENT_PANEL_ID}
      data-testid="vault-agent-panel"
      // What stands at the screen's right, so toasts step aside by this width; set only while open.
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
      className="relative flex h-full shrink-0 flex-col overflow-hidden bg-[color:var(--color-canvas)]"
    >
      <div
        data-agent-dock-surface="inset"
        style={{ width: 'calc(var(--agent-panel-width) - var(--chrome-inset))' }}
        className={`${AGENT_DOCK_INSET_SURFACE_CLASS} flex flex-col`}
        // Map manipulation is not blocked while open — it is not a blocking surface.
        inert={!open ? true : undefined}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-[color:var(--color-border-soft)] px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
              {t('title')}
            </p>
            {/* One subtitle slot: when progress happens only the text changes, so the layout does not jump. */}
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
          <CloseButton data-testid="vault-agent-panel-close" onClick={onClose} label={t('close')} />
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
          {/* The state name is the key, so one short cross-fade runs exactly once per state change. */}
          <div key={stage} className="agent-panel-stage-swap flex grow flex-col">
          <div className="mb-3 space-y-2">
            {!bridgeAvailable ? <p className="text-label text-[color:var(--color-text-secondary)]">{t('construction.webUnavailable')}</p> : readableVaultPath ? (
              <>
                <Chip data-testid="construction-action" disabled={agent.running || agent.proposal?.status === 'applying'}
                  title={agent.running ? t('stop') : t('construction.action')} onClick={() => void chooseConstructionSource()}>
                  {t('construction.action')}
                </Chip>
                <p className="text-label text-[color:var(--color-text-secondary)]">{t('construction.boundary')}</p>
              </>
            ) : null}
            <Surface open={sourceSelection !== null} origin="top left" className={`${AGENT_DOCK_INSET_SURFACE_CLASS} space-y-3`} data-testid="construction-preview">
              {heldSourceSelection?.status === 'preparing' ? <p role="status" className="text-label">{t('construction.preparing')}</p> : null}
              {heldSourceSelection?.status === 'localRequired' ? <>
                <p role="status" className="text-label">{t('construction.localRequired')}</p>
                <Chip onClick={() => router.push(AGENTS_MODELS_HREF)}>{t('construction.modelsAction')}</Chip>
              </> : null}
              {heldSourceSelection?.status === 'sourceChanged' ? <p role="alert" className="text-label">{t('construction.sourceChanged')}</p> : null}
              {heldSourceSelection?.status === 'preview' && heldSourceSelection.preview ? <>
                <h3 className="text-label font-[var(--font-weight-strong)]">{t('construction.previewTitle')}</h3>
                <p className="whitespace-pre-wrap break-all text-label">{t('construction.previewBody', {
                  sourcePath: heldSourceSelection.preview.sourcePath, destinationPath: heldSourceSelection.preview.destinationPath,
                  model: localEndpoint?.model ?? '', endpoint: localEndpoint?.baseUrl ?? '', count: heldSourceSelection.preview.files.length,
                })}</p>
                <p className="text-label">{t('construction.scope')}</p>
                <p className="text-label">{t('scope.body', { provider: t('provider.local'), host: providerHost })}</p>
                <p className="text-label">{t('scope.consent')}</p>
                {heldSourceSelection.preview.limited ? <p className="text-label">{t('construction.inventoryLimited')}</p> : null}
                {heldSourceSelection.preview.excluded.length ? <ul className="space-y-1 text-label">{heldSourceSelection.preview.excluded.map((reason, index) => <li key={`${index}:${reason}`} className="break-all">{reason}</li>)}</ul> : null}
                {!heldSourceSelection.preview.files.length ? <p id="construction-empty" className="text-label">{t('construction.empty')}</p> : null}
                <Chip data-testid="construction-run" tone="onAccent" disabled={!heldSourceSelection.preview.files.length}
                  aria-describedby={!heldSourceSelection.preview.files.length ? 'construction-empty' : undefined}
                  title={!heldSourceSelection.preview.files.length ? t('construction.empty') : t('construction.run')} onClick={runConstruction}>{t('construction.run')}</Chip>
              </> : null}
              <div className="flex flex-wrap gap-2">
                {heldSourceSelection?.status !== 'preparing' && heldSourceSelection?.status !== 'localRequired' ? <Chip data-testid="construction-choose-again" onClick={() => void chooseConstructionSource()}>{t('construction.chooseAgain')}</Chip> : null}
                <Chip data-testid="construction-cancel" onClick={cancelSourceSelection}>{t('proposal.cancel')}</Chip>
              </div>
            </Surface>
            {agent.construction ? <div data-testid="construction-evidence" className={`${AGENT_DOCK_INSET_SURFACE_CLASS} space-y-2`}>
              <p className="text-label">{agent.construction.status === 'running' ? t('thinking') : agent.construction.status === 'stopped' ? t('notice.aborted') : t(`construction.${agent.construction.status}`)}</p>
              <p className="break-all text-label">{agent.construction.preview.sourcePath} · {agent.construction.sourceBytes} B</p>
              {agent.construction.reads.map((read, index) => <p key={`${index}:${read.path}:${read.startLine}`} className="break-all text-caption">{read.path}:{read.startLine}-{read.endLine} · {read.bytes} B · {read.fullFileSha256}{!read.fileComplete ? ' …' : ''}</p>)}
              {agent.construction.issues.map((issue, index) => <p key={`${index}:${issue.code}:${issue.target}`} className="break-all text-caption">{issue.target} · {issue.code}</p>)}
              {agent.construction.preview.excluded.map((reason, index) => <p key={`${index}:${reason}`} className="break-all text-caption">{reason}</p>)}
              {agent.construction.status === 'sourceChanged' || agent.construction.status === 'failed' || agent.construction.status === 'incomplete' ? <Chip onClick={() => void chooseConstructionSource()}>{t('construction.runAgain')}</Chip> : null}
            </div> : null}
          </div>
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
            <AgentLockedState
              title={t('degraded.noKeyTitle')}
              body={t('degraded.noKeyBody')}
              consent={t('locked.consentPromise')}
              examplesTitle={t('locked.examplesTitle')}
              chips={firstWordsChips}
            />
          ) : !scopeAccepted ? (
            <>
              {/* The consent card stands at the floor where [Send] will stand, so the next control reads as "this opened". */}
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
              {/* The conversation grows from the bottom. A spacer, not `justify-end`, which on overflow eats the
                  scroll container's top (the first turn disappears above the scroll). */}
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
                    copying: t('proposal.copying'),
                    copyFailed: t('proposal.copyFailed'),
                    selectionConflict: (path) => t('proposal.selectionConflict', { path }),
                    snapshot: t('proposal.snapshot'),
                    snapshotUnavailable: t('proposal.snapshotUnavailable'),
                    applied: (sha) => t('proposal.applied', { sha }),
                    appliedNoSnapshot: t('proposal.appliedNoSnapshot'),
                    cancelled: t('proposal.cancelled'),
                    conflict: t(agent.construction?.status === 'sourceChanged' ? 'construction.sourceChanged' : 'proposal.conflict'),
                    failed: (message) => t('proposal.failed', { message }),
                    partialWrites: (paths) => t('proposal.partialWrites', { paths }),
                    refreshFailed: (message) => t('proposal.refreshFailed', { message }),
                    unreadWarning: t('proposal.unreadWarning'),
                    showOnMap: t('proposal.showOnMap'),
                    expandHint: t('proposal.expandHint'),
                  }}
                />
              ) : null}
              {/* An empty conversation seats three sentences from this folder's real state, computed locally, so
                  they arrive in the same frame as the skeleton. */}
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

        {/* The locked state's composer position stands on the same strip as the real composer. */}
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
            onAction={() => router.push(AGENTS_MODELS_HREF)}
          />
        ) : null}

        {ready && scopeAccepted ? (
          // The stage and this strip arrive on one curve, with no new duration, or the same input would read
          // as two events.
          <footer
            key={stage}
            className="agent-panel-stage-swap shrink-0 border-t border-[color:var(--color-border-soft)] p-2.5"
          >
            {/* `items-end`: the primary action stays at the bottom edge as the box grows. */}
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
                // The first-message placeholder uses the same key as the locked strip's copy, so the text stays in
                // place when a key arrives.
                placeholder={
                  agent.turns.length === 0 ? t('placeholderFirst') : t('placeholder')
                }
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !isImeComposing(event)) {
                    event.preventDefault();
                    submit();
                  }
                }}
                className={`${COMPOSER_BOX_CLASS} block w-full text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]`}
              />
              {/* The mirror that measures growth: same class, so same typography and width, and kept in place so
                  the padded width matches. `invisible`, not `opacity-0`, which would still paint, join overlap
                  audits and take a caret; layout still runs, so `scrollHeight` matches. */}
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
                  /* Stop and send replace each other in one position, so they take the same step: `px-3` is `lg`'s
                  inset and its pair is `text-body`. */
                  className={controlClass({
                    shape: 'chip',
                    size: 'lg',
                    tone: 'strong',
                    className:
                      'shrink-0 justify-center font-[var(--font-weight-emphasis)] tracking-body hover:bg-[color:var(--color-overlay-2)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
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
                      'shrink-0 justify-center tracking-body',
                  })}
                >
                  {t('send')}
                </button>
              )}
            </div>

            {/* One row of side branches: only the toggle sits permanently, and the two buttons close each other. */}
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

            {/* `origin` is the trigger's direction, up and to the left of the box. The content is held with
                `heldMeta`: once `meta` is null the child empties and the box would collapse while empty. */}
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
                <AgentHandoffPacket
                  vaultPath={readableVaultPath}
                  focusedSlug={screenContext.focusedSlug}
                  labels={{
                    boundary: t(agent.construction || sourceSelection ? 'construction.boundary' : 'boundary'),
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
 * The box class the composer and the mirror share: one string, so their typography cannot diverge
 * and make the mirror measure a different row count.
 */
const COMPOSER_BOX_CLASS = fieldClass({ multiline: true, size: 'md' });

/** The one-row control that opens a side branch: unbordered, or the floor reads as several strips. */
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
