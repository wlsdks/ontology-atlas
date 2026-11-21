'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { MoreHorizontal, Plus, ShieldCheck } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { DESTINATION_HREF } from '@/shared/config/destinations';
import {
  Button,
  Checkbox,
  Chip,
  CloseButton,
  Dialog,
  IconButton,
  LiveAnnouncer,
  ServiceMark,
  resolveServiceMark,
  useToast,
} from '@/shared/ui';
import { Input } from '@/shared/ui/fields/input';
import { PAGE_COLUMN_FORM } from '@/shared/ui/tokens/page-frame';
import { badgeClass } from '@/shared/ui/badge-class';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import {
  connectorProblems,
  looksLikeSecretKey,
  ownsSecretRef,
  type ConnectorProblem,
  type ConnectorRecord,
  type ConnectorValueEntry,
} from '@/shared/lib/connectors/connector-record';
import { CONNECTORS_RELATIVE_PATH, type ConnectorWriteResult } from '@/shared/lib/connectors/connector-store';
import {
  discoverMcpConnectors,
  isConnectorDiscoveryAvailable,
  type ConnectorDiscoveryState,
  type DiscoveredConnector,
} from '@/shared/lib/connectors/tauri-connectors';
import {
  connectorSecretDelete,
  connectorSecretRef,
  connectorSecretSet,
  connectorSecretStatus,
  isConnectorSecretBridgeAvailable,
  subscribeConnectorSecretChange,
} from '@/shared/lib/connectors/tauri-connector-secrets';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/tauri-vault-fs';

import {
  parseMcpInstallLink,
  type McpInstallLinkProblem,
} from '@/shared/lib/connectors/mcp-install-link';

import { AddConnectorDialog } from './AddConnectorDialog';
import { newConnectorId, prefillFromRecord, type CustomPrefill } from '../model/connector-draft';

import type { VaultConnectorsState } from '../model/use-vault-connectors';

/**
 * External MCP servers the in-app agent may reach. Atlas runs none: the descriptor goes to the coding agent in `session/new`, so Atlas never executes third-party code.
 * Before one is switched on the screen owes what actually runs, where the traffic goes (Atlas's `.ontology-atlas/llm-audit.jsonl` does not cover it) and whether codex-acp will silently drop the name. Everything starts off.
 * The list lives in the vault folder, so it works on the web; scanning `~/.claude.json` and keychain storage do not, and the screen says so.
 */

function ownRefs(connectorId: string, entries: readonly ConnectorValueEntry[]): string[] {
  return entries
    .filter((entry) => ownsSecretRef(connectorId, entry))
    .map((entry) => entry.secretRef!);
}

/**
 * Forgets the keychain tokens a connector's variables pointed at, or an orphaned token stays on the machine. Best effort and before the file is written: a refusing keychain must not stop the removal, and the file never claims a reference the keychain still answers to.
 * Only its own entries: a shared row naming another connector's reference must not delete that token.
 */
async function forgetSecrets(connectorId: string, entries: readonly ConnectorValueEntry[]): Promise<void> {
  await Promise.all(
    ownRefs(connectorId, entries).map((reference) => connectorSecretDelete(reference).catch(() => null)),
  );
}

/** `command arg arg` or the URL: what will actually run, in one line. */
export function whatRuns(connector: ConnectorRecord): string {
  if (connector.transport === 'http') return (connector.url ?? '').trim();
  return [connector.command ?? '', ...connector.args].join(' ').trim();
}

export function connectorDestination(connector: ConnectorRecord): string {
  if (connector.transport !== 'http') return whatRuns(connector);
  try {
    return new URL(connector.url ?? '').host;
  } catch {
    return (connector.url ?? '').trim();
  }
}

type InstallLinkNotice =
  | { kind: 'dropped'; keys: string[] }
  | { kind: 'refused'; problem: McpInstallLinkProblem };

export function ConnectorsPanel({
  handle,
  store,
  openFolderAction,
  testIdPrefix = 'connectors',
  addOpenRequest = 0,
  externalAddOpener,
  countInHeading = false,
}: {
  handle: FileSystemDirectoryHandle | null;
  /** Owned by the caller: the tab strip's count and this list must come from one read, and a second `useVaultConnectors` would be a store that never hears the first one's writes. */
  store: VaultConnectorsState;
  /** A slot, not an import: `OpenVaultCta` lives in `features/docs-vault-local`, and a same-layer import would raise `same-layer-cross-import-ratchet`. */
  openFolderAction?: ReactNode;
  testIdPrefix?: string;
  /** The parent may open the dialog (`addOpenRequest`) and lend its chip's ref so focus returns after a removal; with `externalAddOpener` the listed state draws no opener, while the empty state keeps its indigo ask. */
  addOpenRequest?: number;
  externalAddOpener?: RefObject<HTMLButtonElement | null>;
  /** The caller's heading already states the count, so the list does not repeat it. */
  countInHeading?: boolean;
}) {
  const t = useTranslations('connectors');
  const vaultPath = handle ? (getTauriVaultRootPath(handle) ?? null) : null;
  const canDiscover = isConnectorDiscoveryAvailable();
  const canStoreSecrets = isConnectorSecretBridgeAvailable();

  // Three named states: with only `null` for "not answered", a rejected scan left the screen reading forever and the name-collision warning never fired.
  const [discovery, setDiscovery] = useState<ConnectorDiscoveryState>({ status: 'scanning' });
  const discovered = discovery.status === 'done' ? discovery.connectors : null;
  useEffect(() => {
    let cancelled = false;
    // No synchronous reset to `scanning` (`react-hooks/set-state-in-effect`); the values describe this machine, not the folder.
    void discoverMcpConnectors(vaultPath)
      .then((result) => {
        if (cancelled) return;
        // `null` is the web path (no bridge); a settled call without a list must not paint "nothing is registered".
        setDiscovery(
          Array.isArray(result?.connectors)
            ? { status: 'done', connectors: result.connectors }
            : { status: 'failed' },
        );
      })
      .catch(() => {
        if (!cancelled) setDiscovery({ status: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [vaultPath]);

  /** Names already held by a config layer this machine reads: codex-acp silently drops an ACP-supplied server under such a name, so the person is told first. */
  const registeredNames = useMemo(
    () => new Set((discovered ?? []).map((server) => server.name)),
    [discovered],
  );

  const attachedNames = useMemo(
    () => new Set(store.connectors.map((connector) => connector.name.trim())),
    [store.connectors],
  );

  // Read once here: a connector whose token is absent must not be switchable on.
  const storedRefs = useConnectorSecretPresence(store.connectors, canStoreSecrets);

  const addDiscovered = useCallback(
    (server: DiscoveredConnector) => {
      const id = newConnectorId();
      const toEntries = (names: string[]): ConnectorValueEntry[] =>
        names.map((name) =>
          looksLikeSecretKey(name)
            ? { name, secretRef: connectorSecretRef(id, name) }
            : { name },
        );
      return store.upsert({
        id,
        name: server.name,
        transport: server.transport === 'http' ? 'http' : 'stdio',
        ...(server.command ? { command: server.command } : {}),
        args: [...server.args],
        ...(server.url ? { url: server.url } : {}),
        env: toEntries(server.envKeys),
        headers: toEntries(server.headerKeys),
        // Copied, not switched on; the person still decides.
        enabled: false,
        origin: server.source,
      });
    },
    [store],
  );

  // The toast says both halves, attached and still off, so a closing dialog does not read as connected.
  const toast = useToast();
  const announceAttached = useCallback(
    async (name: string, write: Promise<ConnectorWriteResult | null>) => {
      const result = await write;
      if (result?.status === 'saved') toast.show(t('attachedToast', { name }), 'info');
      return result;
    },
    [t, toast],
  );

  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = store.connectors.find((connector) => connector.id === detailId) ?? null;
  // Held, not looked up: the confirmation outlives the row, and a title derived from `store.connectors` would blank mid-sentence.
  const [pending, setPending] = useState<ConnectorRecord | null>(null);
  const [removalAnnouncement, setRemovalAnnouncement] = useState('');
  const addOpenRef = useRef<HTMLButtonElement | null>(null);
  /** No folder, so there is no file to write into; not an empty list. */
  const noFolder = store.status === 'unavailable';
  // `loading` is not emptiness: the empty card waits for a real answer.
  const isEmpty = store.status !== 'loading' && !noFolder && store.connectors.length === 0;
  /*
   * `?install=<base64 json>` is the "Add to …" shape Cursor and VS Code publish; `parseMcpInstallLink` refuses any unknown field because a confirmation showing less than the truth is the CVE this surface avoids. The link only opens the dialog: nothing is written and the switch stays off.
   * `useSearchParams`, not `window.location`: an effect would paint the dialog closed first, and static export has no `window`. The installed app's `ontology-atlas://mcp?install=` arrives via `src-tauri/src/app_shell/deep_link.rs`.
   */
  const searchParams = useSearchParams() as ReturnType<typeof useSearchParams> | null;
  // `useSearchParams` returns null outside a router, the ordinary case for a component test.
  const installParam = searchParams?.get('install') ?? null;
  const arrival = useMemo(() => {
    if (!installParam) return null;
    return parseMcpInstallLink(`?config=${encodeURIComponent(installParam)}`, {
      id: 'draft',
      secretRef: connectorSecretRef,
    });
  }, [installParam]);
  const incoming = useMemo(
    () => (arrival?.ok && arrival.draft ? prefillFromRecord(arrival.draft) : null),
    [arrival],
  );
  const linkNotice: InstallLinkNotice | null = !arrival
    ? null
    : !arrival.ok
      ? { kind: 'refused', problem: arrival.problem ?? 'config-unreadable' }
      : arrival.droppedValues.length > 0
        ? { kind: 'dropped', keys: arrival.droppedValues }
        : null;
  // Bumped when a removal completes so an effect places focus after `useDialogFocusTrap`'s cleanup; focusing in the click handler would be undone by its restore.
  const [removedTick, setRemovedTick] = useState(0);
  useEffect(() => {
    if (removedTick === 0) return;
    (externalAddOpener?.current ?? addOpenRef.current)?.focus();
    // `connectors.length` is a dependency on purpose: when the last row goes the header chip unmounts and focus must move again to the empty card's door.
  }, [removedTick, store.connectors.length, externalAddOpener]);

  // The parent's opener, adjusted during render like an arriving install link.
  const [seenAddRequest, setSeenAddRequest] = useState(addOpenRequest);
  if (addOpenRequest !== seenAddRequest) {
    setSeenAddRequest(addOpenRequest);
    setAddOpen(true);
  }

  // A link opens the dialog once: comparing with the last render opens it on the first frame, and a person who closes it can leave it closed while the query stays in the address bar.
  const [seenArrival, setSeenArrival] = useState<CustomPrefill | null>(null);
  if (incoming && incoming !== seenArrival) {
    setSeenArrival(incoming);
    setAddOpen(true);
  }

  return (
    <section
      data-testid={`${testIdPrefix}-panel`}
      className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]"
    >
      <div className={PAGE_COLUMN_FORM}>
      {noFolder || isEmpty || externalAddOpener ? null : (
        <div className="flex flex-wrap items-start justify-end gap-x-4 gap-y-2">
          <Chip
            ref={addOpenRef}
            data-testid={`${testIdPrefix}-add-open`}
            hoverSurface="lift"
            onClick={() => setAddOpen(true)}
          >
            <Plus size={ICON_SIZE.sm} aria-hidden />
            {t('addOpen')}
          </Chip>
        </div>
      )}
      {noFolder ? (
        <div data-testid={`${testIdPrefix}-no-folder`}>
          <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
            {t('noFolderTitle')}
          </p>
          <p className="mt-1 break-keep text-label leading-label text-[color:var(--color-text-tertiary)]">
            {t('noFolderBody')}
          </p>
          {openFolderAction ? <div className="mt-3">{openFolderAction}</div> : null}
        </div>
      ) : (
        <>
      {store.status === 'malformed' ? (
        <p
          role="status"
          data-testid={`${testIdPrefix}-malformed`}
          className="break-keep text-label leading-prose text-[color:var(--color-status-warning)]"
        >
          {t('malformed', { path: CONNECTORS_RELATIVE_PATH })}
        </p>
      ) : null}

      {store.secretLiteralKeys.length > 0 ? (
        <p
          role="status"
          data-testid={`${testIdPrefix}-plaintext`}
          className="mt-3 break-keep text-label leading-prose text-[color:var(--color-status-warning)]"
        >
          {t('plaintext', {
            keys: store.secretLiteralKeys.join(', '),
            path: CONNECTORS_RELATIVE_PATH,
          })}
        </p>
      ) : null}

      {isEmpty ? (
        /* Empty state: whatever you attach talks to that service itself and Atlas's transfer log does not cover it; the full disclosure appears under the list once there is one. */
        <div data-testid={`${testIdPrefix}-empty`}>
          <p className="break-keep text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
            {t('emptyTitle')}
          </p>
          <p className="mt-1 max-w-prose break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
            {t('emptyBody')}
          </p>
          <Chip
            ref={addOpenRef}
            size="lg"
            tone="accent"
            data-testid={`${testIdPrefix}-add-open`}
            className="mt-3 border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] hover:bg-[color:var(--color-indigo-a24)]"
            onClick={() => setAddOpen(true)}
          >
            <Plus size={ICON_SIZE.sm} aria-hidden />
            {t('addOpen')}
          </Chip>
          <p
            data-testid={`${testIdPrefix}-transfer`}
            className="mt-4 max-w-prose break-keep border-l border-[color:var(--color-border-strong)] pl-2.5 text-label leading-prose text-[color:var(--color-text-quaternary)]"
          >
            {t('transfer')}
          </p>
        </div>
      ) : null}

      {linkNotice ? (
        <p
          role="status"
          data-testid={`${testIdPrefix}-link-notice`}
          data-link-notice={linkNotice.kind}
          className="mt-3 break-keep text-label leading-prose text-[color:var(--color-status-warning)]"
        >
          {linkNotice.kind === 'dropped'
            ? t('linkDroppedValues', { keys: linkNotice.keys.join(', ') })
            : t('linkRefused', { reason: linkNotice.problem })}
        </p>
      ) : null}

      {canDiscover && !isEmpty && discovery.status !== 'done' ? (
        <p
          role="status"
          data-testid={
            discovery.status === 'failed'
              ? `${testIdPrefix}-discovery-failed`
              : `${testIdPrefix}-scanning`
          }
          className={`mt-3 break-keep text-label leading-prose ${
            discovery.status === 'failed'
              ? 'text-[color:var(--color-status-warning)]'
              : 'text-[color:var(--color-text-quaternary)]'
          }`}
        >
          {discovery.status === 'failed' ? t('discoveryFailed') : t('scanning')}
        </p>
      ) : null}

      <AttachedList
        connectors={store.connectors}
        status={store.status}
        countStatedAbove={countInHeading}
        registeredNames={registeredNames}
        storedRefs={storedRefs}
        isOnHere={store.isOnHere}
        waitingHere={store.waitingHere}
        changedSinceAllowed={store.changedSinceAllowed}
        onToggle={(id, enabled) => void store.setEnabled(id, enabled)}
        onAllow={(id) => void store.allowHere(id)}
        onOpenDetail={setDetailId}
        testIdPrefix={testIdPrefix}
      />

      {/* The standing disclosure, once, below the rows it is about: where traffic goes and who is not recording it, what a token can do, and which sessions carry connectors; below, so it is not a toll gate before the first row. */}
      {isEmpty ? null : (
        <div
          data-testid={`${testIdPrefix}-transfer`}
          className="mt-4 max-w-prose break-keep border-l border-[color:var(--color-border-strong)] pl-2.5 text-label leading-prose text-[color:var(--color-text-quaternary)]"
        >
          <p>{t('transfer')}</p>
          <p className="mt-1">{t('authority')}</p>
          <p className="mt-1">
            {t('runtimeNarrowing')}{' '}
            <Link
              href={DESTINATION_HREF.agents}
              data-testid={`${testIdPrefix}-runtime-agents`}
              className={controlClass({ shape: 'link', tone: 'accent', className: 'text-label' })}
            >
              {t('runtimeAgentsLink')}
            </Link>
          </p>
        </div>
      )}

      <AddConnectorDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        discovery={discovery}
        canDiscover={canDiscover}
        canStoreSecrets={canStoreSecrets}
        attachedNames={attachedNames}
        /* The write result decides whether the dialog closes, so a failed write does not look like a saved one. */
        onAddDiscovered={(server) => announceAttached(server.name, addDiscovered(server))}
        onAddCustom={(draft) => announceAttached(draft.name, store.upsert(draft))}
        incoming={incoming}
        testIdPrefix={testIdPrefix}
      />

      <ConnectorDetailDialog
        connector={detail}
        on={detail ? store.isOnHere(detail) : false}
        canStoreSecrets={canStoreSecrets}
        storedRefs={storedRefs}
        onClose={() => setDetailId(null)}
        onUpsert={(connector) => void store.upsert(connector)}
        /* Remove asks first, naming the irreversible half (`forgetSecrets` cannot be undone); the detail dialog closes as the confirmation opens, since stacked modals are forbidden. */
        onRemove={(connector) => {
          setDetailId(null);
          setPending(connector);
        }}
        testIdPrefix={testIdPrefix}
      />

      <RemoveConfirmDialog
        connector={pending}
        onCancel={() => setPending(null)}
        onConfirm={(connector) => {
          setPending(null);
          /* The opener's dialog closed and its row is leaving, so `removedTick` puts focus on "Add a connector" instead of `main#main`. */
          setRemovedTick((tick) => tick + 1);
          setRemovalAnnouncement(t('removedAnnouncement', { name: connector.name }));
          void forgetSecrets(connector.id, [...connector.env, ...connector.headers]).then(() =>
            store.remove(connector.id),
          );
        }}
        testIdPrefix={testIdPrefix}
      />

      {/* Removal is silent otherwise: the row simply disappears. */}
      <LiveAnnouncer message={removalAnnouncement} />
        </>
      )}
      </div>
    </section>
  );
}

/** Problem and collision lines stay in the row because they explain a disabled switch. */
function AttachedList({
  connectors,
  /* Destructure it: left out, `status` resolves to the global `window.status` and the static export throws on the server. */
  status,
  registeredNames,
  storedRefs,
  isOnHere,
  waitingHere,
  changedSinceAllowed,
  onToggle,
  onAllow,
  onOpenDetail,
  testIdPrefix,
  countStatedAbove,
}: {
  connectors: ConnectorRecord[];
  status: VaultConnectorsState['status'];
  registeredNames: Set<string>;
  /** `null` where no keychain could be read: "not asked", not "none". */
  storedRefs: ReadonlySet<string> | null;
  isOnHere: (connector: ConnectorRecord) => boolean;
  waitingHere: ReadonlySet<string>;
  changedSinceAllowed: ReadonlySet<string>;
  onToggle: (id: string, enabled: boolean) => void;
  onAllow: (id: string) => void;
  onOpenDetail: (id: string) => void;
  testIdPrefix: string;
  countStatedAbove?: boolean;
}) {
  const t = useTranslations('connectors');
  /* "Nothing attached yet" cannot be claimed before the first read. */
  if (status === 'loading') {
    return (
      <p
        role="status"
        data-testid={`${testIdPrefix}-loading`}
        className="mt-3 break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
      >
        {t('loading')}
      </p>
    );
  }
  if (connectors.length === 0) return null;
  const enabled = connectors.filter(isOnHere).length;
  return (
    <>
      {countStatedAbove ? null : (
        <p
          data-testid={`${testIdPrefix}-on-of-total`}
          className="mt-3 text-label leading-label text-[color:var(--color-text-quaternary)]"
        >
          {t('onOfTotal', { on: enabled, total: connectors.length })}
        </p>
      )}
    <ul
      data-testid={`${testIdPrefix}-list`}
      aria-label={t('title')}
      className="mt-2 flex flex-col gap-2"
    >
      {connectors.map((connector) => {
        const problems = connectorProblems(connector, connectors, storedRefs ?? undefined);
        const collides = registeredNames.has(connector.name.trim());
        const runs = whatRuns(connector);
        const on = isOnHere(connector);
        const waiting = waitingHere.has(connector.id);
        return (
          <li
            key={connector.id}
            data-testid={`${testIdPrefix}-item`}
            data-connector-name={connector.name}
            data-connector-enabled={on ? 'true' : 'false'}
            data-connector-waiting={waiting ? 'true' : undefined}
            className="rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2.5"
          >
            <div className="flex items-center gap-3">
              {/* The service mark matches the name and what runs: a renamed row still runs the same service. */}
              <ServiceMark
                mark={resolveServiceMark(connector.name, runs)}
                className="text-[color:var(--color-text-tertiary)]"
              />
              <div className="flex min-w-0 flex-1 items-baseline gap-2">
                <p className="shrink-0 truncate text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                  {connector.name}
                </p>
                {/* What will actually run, before the switch; the only monospace on the row. */}
                <code
                  data-testid={`${testIdPrefix}-item-runs`}
                  className="min-w-0 flex-1 break-all font-mono text-label leading-label text-[color:var(--color-text-quaternary)]"
                >
                  {runs}
                </code>
              </div>
              {/* `gap-3`: the more-actions button's 44px `touch-hit-expand` area overhangs 8px each side, and a narrower gap puts the switch label under it. */}
              <div className="flex shrink-0 items-center gap-3">
                <Checkbox
                  data-testid={`${testIdPrefix}-item-toggle`}
                  label={on ? t('on') : t('off')}
                  checked={on}
                  disabled={problems.length > 0}
                  onChange={(event) => onToggle(connector.id, event.target.checked)}
                  /* `atlas-touch-floor-wide`: "On"/"Off" is too short for the 44px floor (`app/globals.css`, coarse-pointer block). */
                  className="atlas-touch-floor-wide justify-center text-label text-[color:var(--color-text-secondary)]"
                />
                <IconButton
                  data-testid={`${testIdPrefix}-item-menu`}
                  label={t('detailOpen', { name: connector.name })}
                  hoverSurface="lift"
                  hoverBorder="strong"
                  onClick={() => onOpenDetail(connector.id)}
                >
                  <MoreHorizontal size={ICON_SIZE.md} aria-hidden />
                </IconButton>
              </div>
            </div>

            {problems.length > 0 ? (
              <p
                role="status"
                data-testid={`${testIdPrefix}-item-problem`}
                className="mt-2 break-keep text-label leading-prose text-[color:var(--color-status-warning)]"
              >
                {problems.map((problem) => t(`problem.${problem}` as ProblemKey)).join(' ')}
              </p>
            ) : null}

            {collides ? (
              <p
                role="status"
                data-testid={`${testIdPrefix}-item-collision`}
                className="mt-2 break-keep text-label leading-prose text-[color:var(--color-status-warning)]"
              >
                {t('collision', { name: connector.name })}
              </p>
            ) : null}

            {waiting ? (
              <WaitingHere
                connector={connector}
                changed={changedSinceAllowed.has(connector.id)}
                onAllow={() => onAllow(connector.id)}
                testIdPrefix={testIdPrefix}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
    </>
  );
}

/** The row shows what runs, whole; this adds what it would pass, the rest of what the press allows. */
function WaitingHere({
  connector,
  changed,
  onAllow,
  testIdPrefix,
}: {
  connector: ConnectorRecord;
  changed: boolean;
  onAllow: () => void;
  testIdPrefix: string;
}) {
  const t = useTranslations('connectors');
  const passes = [...connector.env, ...connector.headers].map((entry) =>
    typeof entry.secretRef === 'string'
      ? t('waitingFromKeychain', { name: entry.name })
      : typeof entry.value === 'string'
        ? `${entry.name}=${entry.value}`
        : entry.name,
  );
  return (
    <div
      data-testid={`${testIdPrefix}-item-waiting`}
      data-waiting-changed={changed ? 'true' : 'false'}
      className="mt-2 border-t border-[color:var(--color-border-soft)] pt-2"
    >
      <p role="status" className="text-label leading-prose text-[color:var(--color-status-warning)]">
        {changed ? t('waitingChanged') : t('waitingHere')}
      </p>
      {passes.length > 0 ? (
        <p
          data-testid={`${testIdPrefix}-item-waiting-passes`}
          className="mt-1 break-all text-label leading-label text-[color:var(--color-text-tertiary)]"
        >
          {t('waitingPasses')}{' '}
          <code className="font-mono text-[color:var(--color-text-secondary)]">{passes.join(', ')}</code>
        </p>
      ) : null}
      <Chip
        data-testid={`${testIdPrefix}-item-allow`}
        hoverSurface="lift"
        className="mt-2"
        onClick={onAllow}
      >
        <ShieldCheck size={ICON_SIZE.sm} aria-hidden />
        {t('allowHere')}
      </Chip>
    </div>
  );
}

/** A blocking `Dialog` because it holds credential fields and only it owns focus trap, Escape and restoration (`.claude/rules/design.md`). */
function ConnectorDetailDialog({
  connector,
  on,
  canStoreSecrets,
  storedRefs,
  onClose,
  onUpsert,
  onRemove,
  testIdPrefix,
}: {
  connector: ConnectorRecord | null;
  on: boolean;
  canStoreSecrets: boolean;
  storedRefs: ReadonlySet<string> | null;
  onClose: () => void;
  onUpsert: (connector: ConnectorRecord) => void;
  /** The whole record, not an id: what must be forgotten is written on it. */
  onRemove: (connector: ConnectorRecord) => void;
  testIdPrefix: string;
}) {
  const t = useTranslations('connectors');
  return (
    <Dialog
      open={connector !== null}
      onClose={onClose}
      size="md"
      labelledBy={`${testIdPrefix}-detail-title`}
      testId={`${testIdPrefix}-item-dialog`}
      /* Focus lands on the container, not in a keychain password field nobody chose to fill. */
      initialFocus="container"
    >
      {connector ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <ServiceMark
                mark={resolveServiceMark(connector.name, whatRuns(connector))}
                className="shrink-0 text-[color:var(--color-text-tertiary)]"
              />
              <h2
                id={`${testIdPrefix}-detail-title`}
                className="min-w-0 truncate text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
              >
                {connector.name}
              </h2>
              <span
                data-testid={`${testIdPrefix}-detail-state`}
                data-enabled={on ? 'true' : 'false'}
                className={badgeClass({
                  shape: 'micro',
                  className: on
                    ? 'border border-[color:var(--color-indigo-a46)] text-[color:var(--color-text-secondary)]'
                    : 'border border-[color:var(--color-border-soft)] text-[color:var(--color-text-quaternary)]',
                })}
              >
                {on ? t('on') : t('off')}
              </span>
            </div>
            <CloseButton
              label={t('close')}
              data-testid={`${testIdPrefix}-item-close`}
              className="-mr-2 -mt-1 shrink-0"
              onClick={onClose}
            />
          </div>

          <div className="mt-4 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2.5">
            <p className="text-label leading-label text-[color:var(--color-text-quaternary)]">
              {t('whatRunsLabel')}
            </p>
            <code className="mt-1 block break-all font-mono text-label leading-label text-[color:var(--color-text-primary)]">
              {whatRuns(connector)}
            </code>
            <p className="mt-2 break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
              {connector.transport === 'http'
                ? t('rowTransfer', { destination: connectorDestination(connector) })
                : t('rowTransferStdio')}
            </p>
          </div>

          <VariableFields
            connector={connector}
            canStoreSecrets={canStoreSecrets}
            storedRefs={storedRefs}
            onUpsert={onUpsert}
            testIdPrefix={testIdPrefix}
          />

          <p
            data-testid={`${testIdPrefix}-runtime`}
            className="mt-4 break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
          >
            {t('runtimeNarrowing')}{' '}
            <Link
              href={DESTINATION_HREF.agents}
              data-testid={`${testIdPrefix}-runtime-agents`}
              className={controlClass({ shape: 'link', tone: 'accent', className: 'text-label' })}
            >
              {t('runtimeAgentsLink')}
            </Link>
          </p>

          <div className="mt-4 flex items-center justify-start gap-2 border-t border-[color:var(--color-border-soft)] pt-3">
            <button
              type="button"
              data-testid={`${testIdPrefix}-item-remove`}
              onClick={() => onRemove(connector)}
              /* No hand-written hover: `hoverInk` has no danger option and inventing one is reserved to the design-systems seat (`.claude/rules/design.md`). */
              className={controlClass({
                shape: 'link',
                tone: 'secondary',
                hoverInk: 'strong',
                className: 'text-label',
              })}
            >
              {t('remove')}
            </button>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}

/** Confirms removal because forgetting tokens (`connector_secret_delete`) cannot be undone, unlike the retypeable row. `role="alertdialog"` so the body is read on open; `initialFocus="container"` keeps the caret off the destructive button. */
function RemoveConfirmDialog({
  connector,
  onCancel,
  onConfirm,
  testIdPrefix,
}: {
  connector: ConnectorRecord | null;
  onCancel: () => void;
  onConfirm: (connector: ConnectorRecord) => void;
  testIdPrefix: string;
}) {
  const t = useTranslations('connectors');
  const keys = connector
    ? [...connector.env, ...connector.headers]
        .filter((entry) => ownsSecretRef(connector.id, entry))
        .map((entry) => entry.name)
    : [];
  return (
    <Dialog
      open={connector !== null}
      onClose={onCancel}
      role="alertdialog"
      labelledBy={`${testIdPrefix}-remove-title`}
      testId={`${testIdPrefix}-item-remove-confirm`}
      initialFocus="container"
    >
      {connector ? (
        <>
          <h2
            id={`${testIdPrefix}-remove-title`}
            className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
          >
            {t('removeConfirmTitle', { name: connector.name })}
          </h2>
          <p className="mt-2 break-keep text-label leading-prose text-[color:var(--color-text-secondary)]">
            {/* With keys, the irreversible half is named with them; without, "and its tokens" would invent a loss. */}
            {keys.length > 0
              ? t('removeConfirmBodyKeys', { keys: keys.join(', ') })
              : t('removeConfirmBody')}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" data-testid={`${testIdPrefix}-remove-cancel`} onClick={onCancel}>
              {t('removeCancel')}
            </Button>
            <Button
              variant="primary"
              data-testid={`${testIdPrefix}-remove-confirm`}
              onClick={() => onConfirm(connector)}
            >
              {t('remove')}
            </Button>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}

type ProblemKey = `problem.${ConnectorProblem}`;

/** Read at the panel because the row decides whether the switch may turn on. `null` means the keychain was never asked (a browser); treating that as none would call every web connector broken. */
function useConnectorSecretPresence(
  connectors: readonly ConnectorRecord[],
  canStoreSecrets: boolean,
): ReadonlySet<string> | null {
  const refs = useMemo(
    () => connectors.flatMap((connector) => ownRefs(connector.id, [...connector.env, ...connector.headers])),
    [connectors],
  );
  const key = refs.join('\u0000');
  const [stored, setStored] = useState<ReadonlySet<string> | null>(null);

  const read = useCallback(async () => {
    const present = await Promise.all(
      key
        .split('\u0000')
        .filter(Boolean)
        .map(async (reference) => {
          const status = await connectorSecretStatus(reference);
          return status?.stored ? reference : null;
        }),
    );
    return new Set(present.filter((reference): reference is string => reference !== null));
  }, [key]);

  useEffect(() => {
    if (!canStoreSecrets) {
      return;
    }
    let cancelled = false;
    const refresh = () => {
      void read().then((next) => {
        if (!cancelled) setStored(next);
      });
    };
    refresh();
    // A token saved from another panel changes what this one says; only the re-ask moment is
    // shared, the keychain stays the source of truth.
    const stop = subscribeConnectorSecretChange(refresh);
    return () => {
      cancelled = true;
      stop();
    };
  }, [canStoreSecrets, read]);

  return canStoreSecrets ? stored : null;
}

/** The person chooses per variable, because a name does not reveal a credential (`OPENAPI_MCP_HEADERS` carries a bearer token). A credential-shaped name is still never written to the file: with the keychain off it gets no field, and the row says why. */
function VariableFields({
  connector,
  canStoreSecrets,
  storedRefs,
  onUpsert,
  testIdPrefix,
}: {
  connector: ConnectorRecord;
  canStoreSecrets: boolean;
  storedRefs: ReadonlySet<string> | null;
  onUpsert: (connector: ConnectorRecord) => void;
  testIdPrefix: string;
}) {
  const t = useTranslations('connectors');
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const slots = [
    { slot: 'env' as const, entries: connector.env },
    { slot: 'headers' as const, entries: connector.headers },
  ].filter(({ entries }) => entries.length > 0);
  if (slots.length === 0) return null;

  const rewriteVariable = (
    slot: 'env' | 'headers',
    name: string,
    next: (entry: ConnectorValueEntry) => ConnectorValueEntry,
  ) => {
    onUpsert({
      ...connector,
      [slot]: connector[slot].map((entry) => (entry.name === name ? next(entry) : entry)),
    });
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      {slots.flatMap(({ slot, entries }) =>
        entries.map((entry) => {
          const inKeychain = typeof entry.secretRef === 'string';
          const stored = inKeychain && storedRefs !== null && storedRefs.has(entry.secretRef!);
          const draftKey = `${slot}:${entry.name}`;
          return (
            <div
              key={draftKey}
              data-testid={`${testIdPrefix}-item-variable`}
              data-variable-name={entry.name}
              data-variable-keychain={inKeychain ? 'true' : 'false'}
              className="flex flex-col gap-1"
            >
              <Checkbox
                data-testid={`${testIdPrefix}-item-variable-keychain`}
                label={t('keepInKeychain', { name: entry.name })}
                checked={inKeychain}
                disabled={!canStoreSecrets}
                onChange={(event) => {
                  if (event.target.checked) {
                    rewriteVariable(slot, entry.name, (current) => ({
                      name: current.name,
                      secretRef: connectorSecretRef(connector.id, current.name),
                    }));
                    return;
                  }
                  // Turning the choice off means the value should not be on this machine; dropping only the
                  // reference would orphan it.
                  void forgetSecrets(connector.id, [entry]).then(() =>
                    rewriteVariable(slot, entry.name, (current) => ({ name: current.name })),
                  );
                }}
                className="text-label text-[color:var(--color-text-secondary)]"
              />
              {!canStoreSecrets && inKeychain ? (
                <p
                  data-testid={`${testIdPrefix}-item-secrets-unavailable`}
                  className="break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]"
                >
                  {t('secretsWeb', { keys: entry.name })}
                </p>
              ) : null}
              {canStoreSecrets && inKeychain ? (
                <>
                  {stored ? (
                    <p
                      data-testid={`${testIdPrefix}-item-secret-stored`}
                      className="text-label leading-label text-[color:var(--color-text-tertiary)]"
                    >
                      {t('secretStoredPlain')}
                    </p>
                  ) : (
                    <p
                      data-testid={`${testIdPrefix}-item-secret-missing`}
                      className="text-label leading-label text-[color:var(--color-status-warning)]"
                    >
                      {t('secretMissing')}
                    </p>
                  )}
                  <div className="flex items-end gap-2">
                    <Input
                      label={entry.name}
                      size="md"
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={drafts[draftKey] ?? ''}
                      onChange={(event) =>
                        setDrafts((previous) => ({ ...previous, [draftKey]: event.target.value }))
                      }
                      data-testid={`${testIdPrefix}-item-secret-input`}
                      className="w-full"
                    />
                    <Chip
                      data-testid={`${testIdPrefix}-item-secret-save`}
                      disabled={!(drafts[draftKey] ?? '').trim()}
                      onClick={() => {
                        const value = (drafts[draftKey] ?? '').trim();
                        if (!value || !entry.secretRef) return;
                        void connectorSecretSet(entry.secretRef, value).then(() => {
                          // Cleared once stored; the keychain has no read path back.
                          setDrafts((previous) => ({ ...previous, [draftKey]: '' }));
                        });
                      }}
                    >
                      {t('secretSave')}
                    </Chip>
                  </div>
                </>
              ) : null}
              {!inKeychain && looksLikeSecretKey(entry.name) ? (
                /* No box: the writer refuses a literal under this name. */
                <p
                  data-testid={`${testIdPrefix}-item-variable-refused`}
                  className="break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]"
                >
                  {t('valueNotInFile')}
                </p>
              ) : null}
              {!inKeychain && !looksLikeSecretKey(entry.name) ? (
                <Input
                  label={entry.name}
                  size="md"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={entry.value ?? ''}
                  placeholder={t('valuePlaceholder')}
                  data-testid={`${testIdPrefix}-item-variable-value`}
                  onChange={(event) => {
                    const next = event.target.value;
                    rewriteVariable(slot, entry.name, (current) =>
                      next ? { name: current.name, value: next } : { name: current.name },
                    );
                  }}
                  className="w-full"
                />
              ) : null}
            </div>
          );
        }),
      )}
    </div>
  );
}
