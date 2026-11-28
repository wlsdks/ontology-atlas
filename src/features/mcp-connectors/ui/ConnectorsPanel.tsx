import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useTranslations } from 'use-intl';
import { Plus } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { DESTINATION_HREF } from '@/shared/config/destinations';
import { Chip, LiveAnnouncer, useToast } from '@/shared/ui';
import { PAGE_COLUMN_FORM } from '@/shared/ui/tokens/page-frame';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import type { ConnectorRecord } from '@/shared/lib/connectors/connector-record';
import { CONNECTORS_RELATIVE_PATH, type ConnectorWriteResult } from '@/shared/lib/connectors/connector-store';
import type { DiscoveredConnector } from '@/shared/lib/connectors/tauri-connectors';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';

import { AddConnectorDialog } from './AddConnectorDialog';
import { AttachedList } from './AttachedList';
import { ConnectorDetailDialog } from './ConnectorDetailDialog';
import { RemoveConfirmDialog } from './RemoveConfirmDialog';
import {
  newConnectorId,
  recordFromDiscovered,
  type CustomPrefill,
} from '../model/connector-draft';
import { forgetSecrets } from '../model/connector-secrets';
import { useConnectorDiscovery } from '../model/use-connector-discovery';
import { useConnectorSecretPresence } from '../model/use-connector-secret-presence';
import { useInstallLinkArrival } from '../model/use-install-link-arrival';

import type { VaultConnectorsState } from '../model/use-vault-connectors';

/**
 * External MCP servers the in-app agent may reach. Atlas runs none: the descriptor goes to the coding agent in `session/new`, so Atlas never executes third-party code.
 * Before one is switched on the screen owes what actually runs, where the traffic goes (Atlas's `.ontology-atlas/llm-audit.jsonl` does not cover it) and whether codex-acp will silently drop the name. Everything starts off.
 * The list lives in the vault folder, so it works on the web; scanning `~/.claude.json` and keychain storage do not, and the screen says so.
 */

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

  // Three named states: with only `null` for "not answered", a rejected scan left the screen reading forever and the name-collision warning never fired.
  const discovery = useConnectorDiscovery(vaultPath);
  const discovered = discovery.status === 'done' ? discovery.connectors : null;

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
  const storedRefs = useConnectorSecretPresence(store.connectors);

  const addDiscovered = useCallback(
    (server: DiscoveredConnector) => store.upsert(recordFromDiscovered(server, newConnectorId())),
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
  const { incoming, linkNotice } = useInstallLinkArrival();
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

      {!isEmpty && discovery.status !== 'done' ? (
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
