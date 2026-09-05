'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Info } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { Checkbox, Chip } from '@/shared/ui';
import { Input } from '@/shared/ui/input';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import {
  connectorProblems,
  looksLikeSecretKey,
  type ConnectorProblem,
  type ConnectorRecord,
  type ConnectorTransport,
  type ConnectorValueEntry,
} from '@/shared/lib/connector-record';
import { CONNECTORS_RELATIVE_PATH } from '@/shared/lib/connector-store';
import {
  discoverMcpConnectors,
  isAttachableTransport,
  isConnectorDiscoveryAvailable,
  type DiscoveredConnector,
} from '@/shared/lib/tauri-connectors';
import {
  connectorSecretRef,
  connectorSecretSet,
  connectorSecretStatus,
  isConnectorSecretBridgeAvailable,
  subscribeConnectorSecretChange,
} from '@/shared/lib/tauri-connector-secrets';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';

import { useVaultConnectors } from '../model/use-vault-connectors';

/**
 * **Connectors — the external MCP servers a person lets their in-app agent reach.**
 *
 * Atlas runs none of them. The descriptor is handed to the coding agent in `session/new` and that
 * agent starts the process or opens the connection, which is why this can exist beside the rule
 * that Atlas never executes third-party code.
 *
 * ## The three things this screen owes a person before they switch one on
 *
 * 1. **What actually runs**, written out — the command and its arguments, or the address. Not the
 *    connector's friendly name, which says nothing about what will execute.
 * 2. **Where the traffic goes and who is not watching it.** The agent talks to that service
 *    directly. Atlas's own transfer ledger (`.ontology-atlas/llm-audit.jsonl`) records Atlas's LLM
 *    calls and **does not cover this**, so claiming it did would be the exact kind of reassurance
 *    the trust charter forbids.
 * 3. **Whether the name will survive.** codex-acp silently drops a server whose name any of its
 *    config layers already holds. A person whose `~/.codex/config.toml` already has `notion` would
 *    otherwise switch this on and meet nothing at all.
 *
 * Everything starts **off**. Writing a connector down is not turning it on.
 *
 * ## What the browser can and cannot do here
 *
 * The list itself lives in the vault folder, and a browser holds that folder, so reading, adding
 * and removing all work on the web. What a browser has no way to do is read `~/.claude.json` to
 * find what is already registered, or put a token in an OS keychain. Those two are stated where
 * they are missing rather than hidden — and the list is still usable without them.
 */

const EMPTY_STDIO: ConnectorRecord = {
  id: '',
  name: '',
  transport: 'stdio',
  command: '',
  args: [],
  env: [],
  headers: [],
  enabled: false,
};

/** A short, stable id. `crypto.randomUUID` exists in every surface this ships to. */
function newConnectorId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `c${Date.now().toString(36)}`;
}

/** `command arg arg` or the URL — **the thing that will actually run**, in one line. */
export function whatRuns(connector: ConnectorRecord): string {
  if (connector.transport === 'http') return (connector.url ?? '').trim();
  return [connector.command ?? '', ...connector.args].join(' ').trim();
}

/** The host an HTTP connector talks to, for the sentence that names the destination. */
export function connectorDestination(connector: ConnectorRecord): string {
  if (connector.transport !== 'http') return whatRuns(connector);
  try {
    return new URL(connector.url ?? '').host;
  } catch {
    return (connector.url ?? '').trim();
  }
}

export function ConnectorsPanel({
  handle,
  testIdPrefix = 'connectors',
}: {
  handle: FileSystemDirectoryHandle | null;
  testIdPrefix?: string;
}) {
  const t = useTranslations('connectors');
  const store = useVaultConnectors(handle);
  const vaultPath = handle ? (getTauriVaultRootPath(handle) ?? null) : null;
  const canDiscover = isConnectorDiscoveryAvailable();
  const canStoreSecrets = isConnectorSecretBridgeAvailable();

  const [discovered, setDiscovered] = useState<DiscoveredConnector[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void discoverMcpConnectors(vaultPath).then((result) => {
      if (!cancelled) setDiscovered(result?.connectors ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [vaultPath]);

  /**
   * Names already spoken for in a config layer this machine reads. codex-acp drops an
   * ACP-supplied server under such a name **without a word**, so the person is told before they
   * turn it on rather than after nothing happens.
   */
  const registeredNames = useMemo(
    () => new Set((discovered ?? []).map((server) => server.name)),
    [discovered],
  );

  const attachedNames = useMemo(
    () => new Set(store.connectors.map((connector) => connector.name.trim())),
    [store.connectors],
  );

  /*
   * Which keychain-backed variables this machine actually holds a value for. Read once here
   * rather than per field, because the **row** needs the answer: a connector whose token is
   * absent must not be switchable on, and that judgement belongs beside the switch.
   */
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
        // Copied, not switched on. The person still decides.
        enabled: false,
        origin: server.source,
      });
    },
    [store],
  );

  return (
    <section
      data-testid={`${testIdPrefix}-panel`}
      className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]"
    >
      <h3 className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
        {t('title')}
      </h3>
      <p className="mt-1 break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
        {t('intro')}
      </p>
      {/*
        **The transfer sentence.** It is not a footnote: it names who talks to whom, and it says
        out loud that Atlas's own transfer ledger does not cover it. A reader who has met that
        ledger elsewhere in this app would otherwise reasonably assume it did.
      */}
      <p
        data-testid={`${testIdPrefix}-transfer`}
        className="mt-2 break-keep border-l border-[color:var(--color-divider)] pl-2 text-label leading-prose text-[color:var(--color-text-secondary)]"
      >
        {t('transfer')}
      </p>

      {store.status === 'malformed' ? (
        <p
          role="status"
          data-testid={`${testIdPrefix}-malformed`}
          className="mt-3 break-keep text-label leading-prose text-[color:var(--color-status-warning)]"
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

      <AttachedList
        connectors={store.connectors}
        canStoreSecrets={canStoreSecrets}
        registeredNames={registeredNames}
        storedRefs={storedRefs}
        onToggle={(id, enabled) => void store.setEnabled(id, enabled)}
        onRemove={(id) => void store.remove(id)}
        onUpsert={(connector) => void store.upsert(connector)}
        testIdPrefix={testIdPrefix}
      />

      {canDiscover ? (
        <DiscoveredList
          servers={(discovered ?? []).filter((server) => !attachedNames.has(server.name))}
          loaded={discovered !== null}
          onAdd={(server) => void addDiscovered(server)}
          testIdPrefix={testIdPrefix}
        />
      ) : (
        /*
         * Why it is missing and what still works — the degradation contract, not "coming soon".
         * The list above is fully usable here; only the *finding* of already-registered servers
         * needs a program that can read the person's home folder.
         */
        <div
          role="status"
          data-testid="connectors-discovery-unavailable"
          className="mt-4 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2.5"
        >
          <div className="flex items-start gap-2">
            <Info
              size={ICON_SIZE.md}
              aria-hidden
              className="mt-0.5 shrink-0 text-[color:var(--color-text-quaternary)]"
            />
            <div className="min-w-0">
              <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {t('webTitle')}
              </p>
              <p className="mt-1 break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
                {t('webBody')}
              </p>
              <Link
                href="/download/"
                data-testid="connectors-web-get-app"
                className={controlClass({
                  shape: 'link',
                  tone: 'accent',
                  className: 'mt-2 text-label font-[var(--font-weight-signature)]',
                })}
              >
                {t('webGetApp')}
              </Link>
            </div>
          </div>
        </div>
      )}

      <CustomConnectorForm
        onAdd={(draft) => void store.upsert(draft)}
        canStoreSecrets={canStoreSecrets}
        testIdPrefix={testIdPrefix}
      />
    </section>
  );
}

function AttachedList({
  connectors,
  canStoreSecrets,
  registeredNames,
  storedRefs,
  onToggle,
  onRemove,
  onUpsert,
  testIdPrefix,
}: {
  connectors: ConnectorRecord[];
  canStoreSecrets: boolean;
  registeredNames: Set<string>;
  /** `null` where no keychain could be read - "not asked", which is not "none". */
  storedRefs: ReadonlySet<string> | null;
  onToggle: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
  onUpsert: (connector: ConnectorRecord) => void;
  testIdPrefix: string;
}) {
  const t = useTranslations('connectors');
  if (connectors.length === 0) {
    return (
      <p
        data-testid={`${testIdPrefix}-empty`}
        className="mt-3 break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
      >
        {t('none')}
      </p>
    );
  }
  return (
    <ul data-testid={`${testIdPrefix}-list`} className="mt-3 flex flex-col gap-2">
      {connectors.map((connector) => {
        const problems = connectorProblems(connector, connectors, storedRefs ?? undefined);
        const collides = registeredNames.has(connector.name.trim());
        return (
          <li
            key={connector.id}
            data-testid={`${testIdPrefix}-item`}
            data-connector-name={connector.name}
            data-connector-enabled={connector.enabled ? 'true' : 'false'}
            className="rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                  {connector.name}
                </p>
                {/*
                  **What will actually run**, before the switch is touched. A friendly name says
                  nothing about what executes, and this is the line a person can refuse on.
                */}
                <p
                  data-testid={`${testIdPrefix}-item-runs`}
                  className="mt-1 break-all font-mono text-label leading-label text-[color:var(--color-text-secondary)]"
                >
                  {whatRuns(connector)}
                </p>
                {/*
                  ⚠️ **Two sentences, because there are two destinations** (measured on the
                  rendered screen, 2026-09-05). One sentence naming a `{destination}` read
                  「the agent talks to /opt/homebrew/bin/npx -y @notionhq/notion-mcp-server
                  directly」 for a program — it repeated the line directly above it, and it
                  named a command where a service belongs. Atlas cannot know what host a
                  local program will reach, and inventing one would be worse than saying so.
                */}
                <p className="mt-1 break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
                  {connector.transport === 'http'
                    ? t('rowTransfer', { destination: connectorDestination(connector) })
                    : t('rowTransferStdio')}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Checkbox
                  data-testid={`${testIdPrefix}-item-toggle`}
                  label={connector.enabled ? t('on') : t('off')}
                  checked={connector.enabled}
                  disabled={problems.length > 0}
                  onChange={(event) => onToggle(connector.id, event.target.checked)}
                  className="text-label text-[color:var(--color-text-secondary)]"
                />
                <button
                  type="button"
                  data-testid={`${testIdPrefix}-item-remove`}
                  onClick={() => onRemove(connector.id)}
                  className={controlClass({ shape: 'link', tone: 'secondary', className: 'text-label' })}
                >
                  {t('remove')}
                </button>
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

            <VariableFields
              connector={connector}
              canStoreSecrets={canStoreSecrets}
              storedRefs={storedRefs}
              onUpsert={onUpsert}
              testIdPrefix={testIdPrefix}
            />
          </li>
        );
      })}
    </ul>
  );
}

type ProblemKey = `problem.${ConnectorProblem}`;

/**
 * Which keychain references this machine holds a value for.
 *
 * Read at the panel rather than per field. The **row** is what needs the answer: a connector
 * whose token is absent must not be switchable on, and a switch that says "on" over a credential
 * that is not there is the exact failure this screen exists to prevent.
 *
 * `null` means the keychain was never asked - a browser has none. That is not the same as "none
 * stored", and collapsing the two would call every healthy connector broken on the web.
 */
function useConnectorSecretPresence(
  connectors: readonly ConnectorRecord[],
  canStoreSecrets: boolean,
): ReadonlySet<string> | null {
  const refs = useMemo(
    () =>
      connectors
        .flatMap((connector) => [...connector.env, ...connector.headers])
        .map((entry) => entry.secretRef)
        .filter((reference): reference is string => typeof reference === 'string'),
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
    // A token saved from another panel changes what this one must say; the keychain stays the
    // source of truth and only the moment to re-ask is shared.
    const stop = subscribeConnectorSecretChange(refresh);
    return () => {
      cancelled = true;
      stop();
    };
  }, [canStoreSecrets, read]);

  return canStoreSecrets ? stored : null;
}

/**
 * Every variable this connector declares, and where its value lives.
 *
 * **The choice is per variable and the person makes it.** A name that reads like a credential
 * suggests the keychain, but it does not decide: `OPENAPI_MCP_HEADERS` is the variable Notion's
 * own server documents and it carries a bearer token, while `NOTION_VERSION` is a date. A rule
 * that read only the name offered no field at all for the first one, so the connector attached
 * with its credential absent and looked healthy (measured 2026-09-05).
 *
 * What the name still decides, absolutely, is that **a credential-shaped one is never written to
 * the file**. With the keychain off for such a variable there is no field here at all, and the
 * row says why rather than offering a box whose contents the writer would refuse.
 */
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

  /** Rewrite one variable in place and hand the whole record back to the store. */
  const change = (
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
                onChange={(event) =>
                  change(slot, entry.name, (current) =>
                    event.target.checked
                      ? {
                          name: current.name,
                          secretRef: connectorSecretRef(connector.id, current.name),
                        }
                      : { name: current.name },
                  )
                }
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
                          // Cleared the moment it is stored: this component has no reason to
                          // keep it, and the keychain has no read path back into here.
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
                /*
                 * No box here on purpose. The writer refuses a literal under this name, so a
                 * field would be somewhere to type something that is then thrown away.
                 */
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
                    change(slot, entry.name, (current) =>
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

function DiscoveredList({
  servers,
  loaded,
  onAdd,
  testIdPrefix,
}: {
  servers: DiscoveredConnector[];
  loaded: boolean;
  onAdd: (server: DiscoveredConnector) => void;
  testIdPrefix: string;
}) {
  const t = useTranslations('connectors');
  if (!loaded) return null;
  return (
    <div className="mt-4 border-t border-[color:var(--color-divider)] pt-3">
      <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
        {t('foundTitle')}
      </p>
      {servers.length === 0 ? (
        <p
          data-testid={`${testIdPrefix}-found-empty`}
          className="mt-1 break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
        >
          {t('foundNone')}
        </p>
      ) : (
        <ul data-testid={`${testIdPrefix}-found`} className="mt-2 flex flex-col gap-2">
          {servers.map((server) => {
            const usable = isAttachableTransport(server.transport);
            return (
              <li
                key={`${server.source}:${server.name}`}
                data-testid={`${testIdPrefix}-found-item`}
                data-connector-transport={server.transport}
                className="flex items-start justify-between gap-3 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
                    {server.name}
                  </p>
                  <p className="mt-0.5 break-all font-mono text-label leading-label text-[color:var(--color-text-tertiary)]">
                    {server.url ?? [server.command, ...server.args].join(' ')}
                  </p>
                  <p className="mt-0.5 text-label leading-label text-[color:var(--color-text-quaternary)]">
                    {t('foundFrom', { source: server.source })}
                  </p>
                  {!usable ? (
                    <p className="mt-0.5 break-keep text-label leading-prose text-[color:var(--color-status-warning)]">
                      {t('foundUnsupported', { transport: server.transport })}
                    </p>
                  ) : null}
                </div>
                {usable ? (
                  <Chip data-testid={`${testIdPrefix}-found-add`} onClick={() => onAdd(server)}>
                    {t('add')}
                  </Chip>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Adding one by hand — the path for a server that is not registered anywhere yet. */
function CustomConnectorForm({
  onAdd,
  canStoreSecrets,
  testIdPrefix,
}: {
  onAdd: (connector: ConnectorRecord) => void;
  canStoreSecrets: boolean;
  testIdPrefix: string;
}) {
  const t = useTranslations('connectors');
  const [transport, setTransport] = useState<ConnectorTransport>('stdio');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [keys, setKeys] = useState('');

  const draft = useMemo<ConnectorRecord>(() => {
    const id = 'draft';
    const names = keys
      .split(/[\s,]+/)
      .map((key) => key.trim())
      .filter(Boolean);
    const entries: ConnectorValueEntry[] = names.map((key) =>
      looksLikeSecretKey(key) ? { name: key, secretRef: connectorSecretRef(id, key) } : { name: key },
    );
    return {
      ...EMPTY_STDIO,
      id,
      name: name.trim(),
      transport,
      ...(transport === 'stdio'
        ? { command: command.trim(), args: args.split(/\s+/).filter(Boolean) }
        : { url: url.trim() }),
      env: transport === 'stdio' ? entries : [],
      headers: transport === 'http' ? entries : [],
    };
  }, [args, command, keys, name, transport, url]);

  const problems = connectorProblems(draft);

  return (
    <div className="mt-4 border-t border-[color:var(--color-divider)] pt-3">
      <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
        {t('customTitle')}
      </p>
      <p className="mt-1 break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
        {t('customBody')}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {(['stdio', 'http'] as const).map((option) => (
          <Chip
            key={option}
            data-testid={`${testIdPrefix}-custom-transport-${option}`}
            aria-pressed={transport === option}
            onClick={() => setTransport(option)}
            className={
              transport === option
                ? 'border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)]'
                : undefined
            }
          >
            {t(`transport.${option}` as 'transport.stdio' | 'transport.http')}
          </Chip>
        ))}
      </div>
      <div className="mt-2 flex flex-col gap-2">
        <Field
          id={`${testIdPrefix}-custom-name`}
          label={t('fieldName')}
          value={name}
          onChange={setName}
          placeholder="notion"
        />
        {transport === 'stdio' ? (
          <>
            <Field
              id={`${testIdPrefix}-custom-command`}
              label={t('fieldCommand')}
              hint={t('fieldCommandHint')}
              value={command}
              onChange={setCommand}
              placeholder="/opt/homebrew/bin/npx"
            />
            <Field
              id={`${testIdPrefix}-custom-args`}
              label={t('fieldArgs')}
              value={args}
              onChange={setArgs}
              placeholder="-y @notionhq/notion-mcp-server"
            />
          </>
        ) : (
          <Field
            id={`${testIdPrefix}-custom-url`}
            label={t('fieldUrl')}
            value={url}
            onChange={setUrl}
            placeholder="https://mcp.example.com/mcp"
          />
        )}
        <Field
          id={`${testIdPrefix}-custom-keys`}
          label={transport === 'stdio' ? t('fieldEnvKeys') : t('fieldHeaderKeys')}
          hint={canStoreSecrets ? t('fieldKeysHint') : t('fieldKeysHintWeb')}
          value={keys}
          onChange={setKeys}
          placeholder="NOTION_TOKEN"
        />
      </div>
      {name.trim() && problems.length > 0 ? (
        <p
          role="status"
          data-testid={`${testIdPrefix}-custom-problem`}
          className="mt-2 break-keep text-label leading-prose text-[color:var(--color-status-warning)]"
        >
          {problems.map((problem) => t(`problem.${problem}` as ProblemKey)).join(' ')}
        </p>
      ) : null}
      <Chip
        data-testid={`${testIdPrefix}-custom-add`}
        disabled={problems.length > 0}
        className="mt-2"
        onClick={() => {
          const id = newConnectorId();
          const rekey = (entries: ConnectorValueEntry[]) =>
            entries.map((entry) =>
              entry.secretRef ? { ...entry, secretRef: connectorSecretRef(id, entry.name) } : entry,
            );
          onAdd({
            ...draft,
            id,
            env: rekey(draft.env),
            headers: rekey(draft.headers),
          });
          setName('');
          setCommand('');
          setArgs('');
          setUrl('');
          setKeys('');
        }}
      >
        {t('customAdd')}
      </Chip>
    </div>
  );
}

/**
 * One field of the by-hand form. `Input` owns the accessible name and the hint wiring, so a
 * nameless field here does not compile — which is exactly the guarantee this form needs, since
 * every one of its values is a path or a variable name somebody has to read back.
 */
function Field({
  id,
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
}) {
  return (
    <Input
      id={id}
      label={label}
      hint={hint}
      size="md"
      type="text"
      spellCheck={false}
      autoComplete="off"
      value={value}
      placeholder={placeholder}
      data-testid={id}
      onChange={(event) => onChange(event.target.value)}
      className="w-full"
    />
  );
}
