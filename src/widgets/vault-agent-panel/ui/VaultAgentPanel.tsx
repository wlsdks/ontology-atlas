import { useEffect, useMemo, useRef, useState } from 'react';
import { useLatestRef } from '@/shared/lib/use-latest-ref';
import { useLocale, useTranslations } from 'use-intl';

import type { VaultManifest } from '@/entities/docs-vault';
import type { KnowledgeProjectInsight } from '@/entities/knowledge-graph';
import { buildFirstWords, type ScreenContextSnapshot } from '@/features/vault-agent';
import { useVaultConceptFacts } from '@/features/vault-ontology';
import { useHeldValue } from '@/shared/lib/render-timing/use-presence';
import { cn } from '@/shared/lib/cn';
import { AGENT_DOCK_INSET_SURFACE_CLASS, CloseButton } from '@/shared/ui';
import { VAULT_AGENT_PANEL_ID } from '@/shared/config/agent/agent-panel';

import { connectionHost } from '../model/connection-host';
import { agentPanelStage, canSendDraft } from '../model/panel-stage';
import { useComposerGrowth } from '../model/use-composer-growth';
import { useConnectionProvider } from '../model/use-connection-provider';
import { useConstructionSource } from '../model/use-construction-source';
import { useDraftSeating } from '../model/use-draft-seating';
import { usePanelDismissal } from '../model/use-panel-dismissal';
import { useRecentChanges } from '../model/use-recent-changes';
import { useVaultAgent } from '../model/use-vault-agent';
import { AgentStageBody } from './AgentStageBody';
import { AgentStageFloor } from './AgentStageFloor';
import { AgentComposer } from './composer/AgentComposer';
import { AgentMetaDisclosure, type AgentMetaBranch } from './composer/AgentMetaDisclosure';
import { AgentConstructionEvidence } from './construction/AgentConstructionEvidence';
import { AgentConstructionSource } from './construction/AgentConstructionSource';

/**
 * The agent panel: a dock the map yields space to on the right. It animates width only inside
 * `<main>`'s flex row, so the map's shrink and the panel's entry share one start and one curve.
 * Closing the panel cuts any in-flight call, unless it is only put away to make room for another
 * surface: then the answer keeps being written and is there when the panel opens again.
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
  prefillRequest,
  takesFocusOnOpen = true,
  putAway = false,
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
  /**
   * A first message handed over from outside, such as "Ask the agent" on a queue row: a prefill, not
   * a send. `nonce` lets the same sentence be seated again.
   */
  prefillRequest?: { text: string; nonce: number } | null;
  /** False when the panel comes back on its own, so focus stays where the person is. */
  takesFocusOnOpen?: boolean;
  /** Closed only to make room for another surface; the answer being written keeps running. */
  putAway?: boolean;
}) {
  const t = useTranslations('vaultAgentPanel');
  const locale = useLocale();
  const [draft, setDraft] = useState('');
  const [scopeAccepted, setScopeAccepted] = useState(false);
  /**
   * The two side branches below the composer open one at a time. A side branch collapses through
   * `useHeldValue` instead of vanishing. `meta` is a primitive, so no key is needed (a keyless object
   * changes identity every render and produces React #301).
   */
  const [meta, setMeta] = useState<AgentMetaBranch | null>(null);
  const heldMeta = useHeldValue(meta);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const conceptFacts = useVaultConceptFacts();

  const panelRef = usePanelDismissal({ open, onClose });
  const { provider, localEndpoint } = useConnectionProvider({ open });

  const [recentChanges, setRecentChanges] = useState<readonly string[]>([]);

  const screenContextWithHistory = useMemo<ScreenContextSnapshot>(
    () => ({ ...screenContext, recentChanges }),
    [screenContext, recentChanges],
  );

  const providerHost = connectionHost(provider, localEndpoint);

  /**
   * An absolute path alone is not ready to send: a desktop restore can return the handle and path
   * before the manifest, and the audit log would land in a
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

  const construction = useConstructionSource({
    open,
    vaultPath: readableVaultPath,
    provider,
    localEndpoint,
    agent,
    draft,
    onRun: () => setScopeAccepted(true),
  });

  const { stop } = agent;
  const putAwayRef = useLatestRef(putAway);
  useEffect(() => {
    if (!open && !putAwayRef.current) stop();
  }, [open, stop, putAwayRef]);

  const takesFocusOnOpenRef = useLatestRef(takesFocusOnOpen);
  useEffect(() => {
    if (open && takesFocusOnOpenRef.current) inputRef.current?.focus();
  }, [open, takesFocusOnOpenRef]);

  const appliedTally = agent.sessionSummary.concepts + agent.sessionSummary.relations;
  useRecentChanges({ open, vaultPath: readableVaultPath, appliedTally, setRecentChanges });

  const prefill = useDraftSeating({ inputRef, setDraft, prefillRequest });

  const { composerHidesTop, setComposerHidesTop } = useComposerGrowth({
    inputRef,
    mirrorRef,
    draft,
    open,
    scopeAccepted,
    provider,
  });

  // New content grows downward only — the scroll anchor is pinned to the bottom.
  useEffect(() => {
    const node = scrollRef.current;
  // jsdom has no scrollTo — a missing API is not called and it simply moves on.
    if (!node || typeof node.scrollTo !== 'function') return;
    node.scrollTo({ top: node.scrollHeight });
  }, [agent.turns, agent.proposal]);

  const applying = agent.proposal?.status === 'applying';
  /**
   * The same box is becoming a different state, so the cross-fade runs once, only when the stage
   * changes.
   */
  const stage = agentPanelStage({
    vaultPath: readableVaultPath,
    provider,
    scopeAccepted,
  });
  const canSend = canSendDraft({
    stage,
    running: agent.running,
    choosingSource: construction.selection !== null,
    applying,
    draft,
  });
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
            {/*
              One subtitle slot as tall as the longer of its two sentences: both share one cell and
              the one not shown stays invisible, so progress replacing the subtitle never moves the
              conversation below. At the panel's 320px floor a sentence wraps rather than being cut.
            */}
            <p
              data-testid="vault-agent-panel-subtitle"
              className="grid text-balance text-label tracking-label text-[color:var(--color-text-quaternary)]"
            >
              <span
                aria-hidden={appliedTally > 0 || undefined}
                className={cn('col-start-1 row-start-1', appliedTally > 0 && 'invisible')}
              >
                {t('subtitle')}
              </span>
              <span
                aria-hidden={appliedTally === 0 || undefined}
                className={cn('col-start-1 row-start-1', appliedTally === 0 && 'invisible')}
              >
                {t('sessionSummary', {
                  concepts: agent.sessionSummary.concepts,
                  relations: agent.sessionSummary.relations,
                })}
              </span>
            </p>
          </div>
          <CloseButton data-testid="vault-agent-panel-close" onClick={onClose} label={t('close')} />
        </header>

        <div
          ref={scrollRef}
          data-agent-panel-stage={stage.kind}
          // This scroller is itself a vertical flex — for the locked state's composer
          // position to stand in **the same place** as the real composer (the panel
          // floor), the wrapper below has to receive the remaining height, and
          // `min-h-full` is not reliable inside a scroll container.
          className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3"
        >
          {/* The state name is the key, so one short cross-fade runs exactly once per state change. */}
          <div key={stage.kind} className="agent-panel-stage-swap flex grow flex-col">
          <div className="mb-3 space-y-2">
            <AgentConstructionSource
              hasVault={Boolean(readableVaultPath)}
              busy={agent.running || applying}
              running={agent.running}
              selection={construction.selection}
              held={construction.heldSelection}
              localEndpoint={localEndpoint}
              providerHost={providerHost}
              onChoose={() => void construction.choose()}
              onCancel={construction.cancel}
              onRun={construction.run}
            />
            {agent.construction ? (
              <AgentConstructionEvidence
                construction={agent.construction}
                onRunAgain={() => void construction.choose()}
              />
            ) : null}
          </div>
          <AgentStageBody
            stage={stage}
            agent={agent}
            canWrite={canWrite}
            vaultIsGit={vaultIsGit}
            providerHost={providerHost}
            firstWordsChips={firstWordsChips}
            onFocusNode={onFocusNode}
            onPrefill={prefill}
            onAcceptScope={() => setScopeAccepted(true)}
            onClose={onClose}
          />
          </div>
        </div>

        {/* The locked state's composer position stands on the same strip as the real composer. */}
        <AgentStageFloor stage={stage} onOpenFolder={onOpenFolder} />

        {stage.kind === 'chat' ? (
          // The stage and this strip arrive on one curve, with no new duration, or the same input would read
          // as two events.
          <footer
            key={stage.kind}
            className="agent-panel-stage-swap shrink-0 border-t border-[color:var(--color-border-soft)] p-2.5"
          >
            <AgentComposer
              inputRef={inputRef}
              mirrorRef={mirrorRef}
              draft={draft}
              onDraftChange={setDraft}
              hidesTop={composerHidesTop}
              onHidesTopChange={setComposerHidesTop}
              hasTurns={agent.turns.length > 0}
              running={agent.running}
              canSend={canSend}
              onSubmit={submit}
              onStop={agent.stop}
            />
            <AgentMetaDisclosure
              meta={meta}
              heldMeta={heldMeta}
              onToggle={(branch) => setMeta((current) => (current === branch ? null : branch))}
              vaultPath={readableVaultPath}
              focusedSlug={screenContext.focusedSlug}
              systemPrompt={agent.systemPrompt}
              constructionBoundary={Boolean(agent.construction || construction.selection)}
            />
          </footer>
        ) : null}
      </div>
    </aside>
  );
}
