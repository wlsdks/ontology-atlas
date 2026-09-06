'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { MoreHorizontal, Plus } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { DESTINATION_HREF } from '@/shared/config/destinations';
import {
  Button,
  Checkbox,
  Chip,
  Dialog,
  IconButton,
  LiveAnnouncer,
  ServiceMark,
  resolveServiceMark,
} from '@/shared/ui';
import { Input } from '@/shared/ui/input';
import { PAGE_COLUMN_FORM } from '@/shared/ui/page-frame';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import {
  connectorProblems,
  looksLikeSecretKey,
  type ConnectorProblem,
  type ConnectorRecord,
  type ConnectorValueEntry,
} from '@/shared/lib/connector-record';
import { CONNECTORS_RELATIVE_PATH } from '@/shared/lib/connector-store';
import {
  discoverMcpConnectors,
  isConnectorDiscoveryAvailable,
  type DiscoveredConnector,
} from '@/shared/lib/tauri-connectors';
import {
  connectorSecretDelete,
  connectorSecretRef,
  connectorSecretSet,
  connectorSecretStatus,
  isConnectorSecretBridgeAvailable,
  subscribeConnectorSecretChange,
} from '@/shared/lib/tauri-connector-secrets';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';

import {
  parseMcpInstallLink,
  type McpInstallLinkProblem,
} from '@/shared/lib/mcp-install-link';

import {
  AddConnectorDialog,
  newConnectorId,
  prefillFromRecord,
  type CustomPrefill,
} from './AddConnectorDialog';

import type { VaultConnectorsState } from '../model/use-vault-connectors';

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

/**
 * Forget the tokens a connector's variables pointed at.
 *
 * ⚠️ **Measured in the installed app, 2026-09-05.** Removing a connector took its row out of
 * `connectors.json` and left the keychain item behind, so `security find-generic-password -s
 * "Ontology Atlas Connectors"` still listed it. The row's own promise is that the value lives on
 * this machine because the person put it there; leaving it after they took the connector away
 * makes that promise a one-way door, and an orphaned token nobody can see is worse than one they
 * can.
 *
 * **Best effort, and before the file is written.** A keychain that refuses (locked, or the entry
 * already gone) must not stop the removal the person asked for, and deleting first means the file
 * never claims a reference the keychain still answers to. Absence already counts as success in
 * `connector_secret_delete`, so the ordinary "there was nothing" path is not an error here either.
 */
async function forgetSecrets(entries: readonly ConnectorValueEntry[]): Promise<void> {
  await Promise.all(
    entries
      .map((entry) => entry.secretRef)
      .filter((reference): reference is string => typeof reference === 'string')
      .map((reference) => connectorSecretDelete(reference).catch(() => null)),
  );
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

/** What an arriving install link did, when it is worth telling somebody about. */
type InstallLinkNotice =
  | { kind: 'dropped'; keys: string[] }
  | { kind: 'refused'; problem: McpInstallLinkProblem };

export function ConnectorsPanel({
  handle,
  store,
  openFolderAction,
  testIdPrefix = 'connectors',
}: {
  handle: FileSystemDirectoryHandle | null;
  /**
   * The connector list as screen state — **owned by the caller**, because the tab strip above
   * this panel states how many are switched on and the two numbers have to come from the same
   * read. A second `useVaultConnectors` inside here would be a second reader of one file that
   * never hears about the first one's writes, which is the two-canonical-stores defect
   * `.claude/rules/forbidden.md` forbids by name.
   */
  store: VaultConnectorsState;
  /**
   * The control that opens a folder, rendered by the caller.
   *
   * ⚠️ **A slot, not an import.** `OpenVaultCta` lives in `features/docs-vault-local`, and this
   * panel is `features/mcp-connectors` — importing it would add a same-layer edge to a ledger
   * that only falls (`same-layer-cross-import-ratchet`). The view owns both features and can hand
   * one to the other, which is the direction FSD allows.
   */
  openFolderAction?: ReactNode;
  testIdPrefix?: string;
}) {
  const t = useTranslations('connectors');
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

  const [addOpen, setAddOpen] = useState(false);
  /** Which attached connector has its own dialog open. `null` is none. */
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = store.connectors.find((connector) => connector.id === detailId) ?? null;
  /**
   * Which connector is being confirmed for removal. `null` is none.
   *
   * ⚠️ **The record is held here, not looked up**, because the confirmation outlives the row: the
   * moment removal succeeds the connector is gone from `store.connectors`, and a dialog that
   * derived its title from that list would blank out mid-sentence.
   */
  const [pending, setPending] = useState<ConnectorRecord | null>(null);
  /** What a screen reader is told after the row leaves. Empty until something has happened. */
  const [announcement, setAnnouncement] = useState('');
  const addOpenRef = useRef<HTMLButtonElement | null>(null);
  /**
   * Bumped when a removal completes, so focus is placed **after** the dialog has let go of it.
   *
   * ⚠️ Focusing inside the click handler does not survive: `useDialogFocusTrap` restores focus in
   * its cleanup, which runs after the handler and after this render — it would find the opening
   * control gone (it was inside the detail dialog, on a row that no longer exists) and fall back
   * to `main#main`, undoing the placement. Doing it from an effect puts it after that cleanup.
   */
  /** No folder is open, so there is no file to write into — not "an empty list". */
  const noFolder = store.status === 'unavailable';
  /**
   * **Nothing attached, and the folder has actually said so.**
   *
   * `loading` is not emptiness (design council, 2026-09-05): painting the empty state before the
   * first read tells somebody with five connectors that they have none. So the empty card waits
   * for a real answer, and `AttachedList` keeps its own "reading this folder" line for the window
   * in between.
   */
  const isEmpty = store.status !== 'loading' && !noFolder && store.connectors.length === 0;
  /*
   * ── An install link, read from the address rather than from `window` ──────────────────────
   *
   * `?install=<base64 json>` on this destination is the shape Cursor and VS Code already publish
   * as an "Add to …" button, and `parseMcpInstallLink` is deliberately strict about it: an
   * unknown field refuses the whole payload and no value survives, because a confirmation that
   * showed less than the truth is the exact CVE this surface has to avoid
   * (`src/shared/lib/mcp-install-link.ts`).
   *
   * **The link opens the dialog and stops.** Nothing is written, the switch stays off, and the
   * last thing on screen before the press is the command or the address, written out. The custom
   * `ontology-atlas://` scheme is not registered with macOS in this change — that needs a Tauri
   * plugin dependency — so today the only caller is a URL somebody pasted, which is the safest
   * possible first caller for a parser like this one.
   *
   * ⚠️ **`useSearchParams`, not `window.location`.** Reading the address in an effect would set
   * state a frame after the dialog had already painted closed, and this component renders on the
   * server during the static export where `window` does not exist at all. The hook is
   * locale-independent and SSR-safe, which is why `.claude/rules/architecture.md` keeps it from
   * `next/navigation` while everything else navigates through `@/i18n/navigation`.
   */
  const searchParams = useSearchParams() as ReturnType<typeof useSearchParams> | null;
  // `useSearchParams` is typed non-null but returns null outside a router — a component test
  // rendering this panel on its own is the ordinary case, not a defect, and a panel that throws
  // there would be a panel nobody can test in isolation.
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
  const [removedTick, setRemovedTick] = useState(0);
  useEffect(() => {
    if (removedTick === 0) return;
    addOpenRef.current?.focus();
    /*
     * ⚠️ **`connectors.length` is in the list on purpose** (2026-09-07). Removal is asynchronous:
     * the tick is bumped when the confirmation closes, but the row leaves only when the folder
     * has written. So the first pass focuses the small chip in the header — and then the last
     * row goes, the panel swaps to the empty card, that chip unmounts, and focus falls back to
     * the body. Re-running when the list actually changes puts it on the card's own door, which
     * is the only control left on screen.
     */
  }, [removedTick, store.connectors.length]);

  /*
   * **A link opens the dialog once.** The comparison is against what was seen last render rather
   * than an effect, so the dialog is already open on the frame the address is first read; and it
   * is a comparison rather than a plain `Boolean(incoming)`, because somebody who closes the
   * dialog must be able to leave it closed while the query is still in the address bar.
   */
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
      {/*
        ⚠️ **The column holds the whole card, not only the rows** (2026-09-05). Measured at 2560,
        a row box was 2,380px wide while its ink stopped near 1,680 — roughly 700px of dead span
        between the name on the left and the switch on the right. Narrowing only the list fixed
        that and created a worse thing: the rows sat 187px inset from the sentences above them, so
        nothing on the card shared a left edge. One column, and everything lines up.
      */}
      <div className={PAGE_COLUMN_FORM}>
      {/*
        **The title and the way in stand on one row.** Adding a connector is the only thing this
        panel asks of anybody, so it sits where the eye lands rather than under the list, where it
        moved down the screen every time a row appeared.
      */}
      {/*
        **No title inside the card.** The tab the person pressed to get here is already called
        Connectors, and a card repeating the word under it spends a line saying where you are to
        somebody who just chose to be there (design council, 2026-09-05). The one thing this panel
        asks of anybody stays where the eye lands.
      */}
      {/*
        ⚠️ **With no folder open there is nowhere to save, so nothing here offers to**
        (cold walkthrough, 2026-09-05). `useVaultConnectors` has no store without a folder, so
        `upsert()` resolved to `null`, the add dialog closed anyway, and the list said "Nothing
        attached yet" — which is what it says after a successful save of nothing, and after a
        discarded one. A person could not tell the two apart. The Share tab already answers this
        state by asking for the folder; this is the same answer on the same screen.
      */}
      {noFolder || isEmpty ? null : (
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
        /*
         * The gate. Same shape and same ask as the Share tab's "No folder open" card, because it
         * is the same missing thing — and the ask is the region's one emphasis, so the folder
         * control is the indigo one.
         */
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
        /*
         * ── The empty state, cut to a sentence, a line and a door (owner, 2026-09-07) ─────────
         *
         * What stood here was a warning about traffic and tokens, a second warning about what a
         * token can do, a "still reading this computer" line, and then, in the quietest ink on
         * the card, "Nothing attached yet" — four claims about a list that did not exist, above
         * the one control that could make it exist, which sat off to the right in a chip.
         *
         * A person with no connectors cannot use any of that. **What is true before the first
         * connector is one thing: nothing here reaches anything yet.** The transfer sentence is
         * about traffic that is not happening. It is not deleted — the same disclosure stands
         * under the list the moment there is a list, and the add dialog repeats it where a
         * runtime is actually being chosen — but a warning read before there is anything to warn
         * about is a warning read less carefully, which is the measurement the 2026-09-05 council
         * already made about this exact block.
         *
         * One quiet line survives, because it is the one fact that changes what a person does
         * next rather than how they feel: whatever you attach here talks to that service itself,
         * and Atlas's transfer log does not cover it.
         */
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
            tone="accentOnTint"
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

      {/*
        **While this computer is being read, say so.** Discovery answers after the list does, and
        an empty "Found on this computer" is a different claim from "still looking" (design
        council, 2026-09-05). It belongs beside the list, not above an empty state that is not
        waiting on it.
      */}
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

      {canDiscover && discovered === null && !isEmpty ? (
        <p
          role="status"
          data-testid={`${testIdPrefix}-scanning`}
          className="mt-3 break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
        >
          {t('scanning')}
        </p>
      ) : null}

      <AttachedList
        connectors={store.connectors}
        status={store.status}
        registeredNames={registeredNames}
        storedRefs={storedRefs}
        onToggle={(id, enabled) => void store.setEnabled(id, enabled)}
        onOpenDetail={setDetailId}
        testIdPrefix={testIdPrefix}
      />

      {/*
        **The standing disclosure, once, under the rows it is about.** Three facts a person cannot
        act safely without: where the traffic goes and who is not recording it, what a token can
        do, and which sessions carry any of this at all. It stands **below** the list because the
        2026-09-05 measurement of the same block above the list was 296px — 35% of the first
        screen — of warning between the tab and the first row; the same words after the rows cost
        the same pixels and stop being a toll gate.
      */}
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

      {/*
        **Everything that is not an attached row is behind a blocking dialog** (2026-09-05). The
        owner reported that this panel was hard to look at, and the measurement agreed: the list,
        the machine's registered servers and a five-field form all stood open at once, so the one
        thing a person came to read - what is attached and whether it is on - was the shortest part
        of the tallest screen. Adding is an errand with a beginning and an end, which is what
        `Dialog` is for: scrim, focus trap, Escape, and focus returned to the control that opened
        it.
      */}
      <AddConnectorDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        discovered={discovered}
        canDiscover={canDiscover}
        canStoreSecrets={canStoreSecrets}
        attachedNames={attachedNames}
        /*
         * ⚠️ **The result decides whether the dialog closes** (cold walkthrough, 2026-09-05).
         * Both of these used to be fire-and-forget: the dialog closed on the click, so a write
         * that never happened looked exactly like one that did. `ConnectorWriteResult` already
         * says which it was; nothing was reading it.
         */
        onAddDiscovered={(server) => addDiscovered(server)}
        onAddCustom={(draft) => store.upsert(draft)}
        incoming={incoming}
        testIdPrefix={testIdPrefix}
      />

      {/*
        The per-connector dialog holds what matters **once you are deciding about that one
        connector**: where its traffic goes, which of its variables live in the keychain, and
        removal. Keeping those in the row turned a four-line list into a forty-line one.
      */}
      <ConnectorDetailDialog
        connector={detail}
        canStoreSecrets={canStoreSecrets}
        storedRefs={storedRefs}
        onClose={() => setDetailId(null)}
        onUpsert={(connector) => void store.upsert(connector)}
        /*
         * **Remove asks first** (design council, 2026-09-05). One press used to delete this
         * connector's keychain items and then its row, and nothing on the way said either would
         * happen: `forgetSecrets` is not undoable — the value is gone from the OS store and Atlas
         * has no read path back — while the row itself is only a line in a file the person could
         * retype. So the destructive half is what the confirmation names.
         *
         * The detail dialog closes as the confirmation opens: two blocking surfaces at once is the
         * stacked-modal shape `.claude/rules/design.md` forbids.
         */
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
          /*
           * Focus has to be put somewhere deliberately. The control that opened this is inside a
           * dialog that has closed, and the row it belonged to is about to stop existing, so
           * `Dialog`'s own restoration would fall through to `main#main`. "Add a connector" is
           * the nearest thing that is still on screen and is the next thing anybody does here, so
           * `removedTick` places focus there once the dialog has let go of it.
           */
          setRemovedTick((tick) => tick + 1);
          setAnnouncement(t('removedAnnouncement', { name: connector.name }));
          void forgetSecrets([...connector.env, ...connector.headers]).then(() =>
            store.remove(connector.id),
          );
        }}
        testIdPrefix={testIdPrefix}
      />

      {/* Removal is silent otherwise: the row simply is not there any more. */}
      <LiveAnnouncer message={announcement} />
        </>
      )}
      </div>
    </section>
  );
}

/**
 * The attached list - **one line per connector**.
 *
 * A row carries what a person scans for: which service, what will actually run, and whether it is
 * on. Everything else about that connector is one press away, because measured on the rendered
 * screen a row carrying its variables, its keychain fields and its transfer sentence was fourteen
 * lines tall, and five of those made a list nobody could read down.
 *
 * The problem and collision lines stay in the row. They are the reason the switch will not move,
 * and a disabled control whose reason is behind a menu is a control with no reason at all.
 */
function AttachedList({
  connectors,
  /*
   * ⚠️ **Destructure it.** Left out of this list while used in the body, `status` silently
   * resolved to the DOM's deprecated `window.status` global — so TypeScript was satisfied and the
   * static export threw `ReferenceError: status is not defined` on the server, where no `window`
   * exists (caught in the render loop, 2026-09-05).
   */
  status,
  registeredNames,
  storedRefs,
  onToggle,
  onOpenDetail,
  testIdPrefix,
}: {
  connectors: ConnectorRecord[];
  /** The store's own state - `loading` is not "none", and this list must not say it is. */
  status: VaultConnectorsState['status'];
  registeredNames: Set<string>;
  /** `null` where no keychain could be read - "not asked", which is not "none". */
  storedRefs: ReadonlySet<string> | null;
  onToggle: (id: string, enabled: boolean) => void;
  onOpenDetail: (id: string) => void;
  testIdPrefix: string;
}) {
  const t = useTranslations('connectors');
  /*
   * ⚠️ **"Nothing attached yet" is a claim, and before the first read it is not one this screen
   * can make** (design council, 2026-09-05). `useVaultConnectors` reports `loading` until the
   * folder answers, and painting the empty sentence in that window tells somebody with five
   * connectors that they have none.
   */
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
  /*
   * Emptiness is the panel's, not this list's (2026-09-07). It used to end here in the quietest
   * ink on the card — "Nothing attached yet" — under two warnings about traffic that was not
   * happening. The panel now draws a card that says what a connector is and offers the one door,
   * so a second sentence here would be the same claim twice.
   */
  if (connectors.length === 0) return null;
  const enabled = connectors.filter((connector) => connector.enabled).length;
  return (
    <>
      {/*
        **How many are on, in words.** The tab strip shows the same number as a bare badge, and a
        number with no unit beside a word is a number somebody has to guess the meaning of
        (design council, 2026-09-05). This says it once, where the rows it counts are.
      */}
      <p
        data-testid={`${testIdPrefix}-on-of-total`}
        className="mt-3 text-label leading-label text-[color:var(--color-text-quaternary)]"
      >
        {t('onOfTotal', { on: enabled, total: connectors.length })}
      </p>
    <ul
      data-testid={`${testIdPrefix}-list`}
      /* The card no longer carries a heading, so the list names itself for assistive tech. */
      aria-label={t('title')}
      className="mt-2 flex flex-col gap-2"
    >
      {connectors.map((connector) => {
        const problems = connectorProblems(connector, connectors, storedRefs ?? undefined);
        const collides = registeredNames.has(connector.name.trim());
        const runs = whatRuns(connector);
        return (
          <li
            key={connector.id}
            data-testid={`${testIdPrefix}-item`}
            data-connector-name={connector.name}
            data-connector-enabled={connector.enabled ? 'true' : 'false'}
            className="rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2.5"
          >
            <div className="flex items-center gap-3">
              {/*
                The service's own mark, matched on the name **and** on what actually runs - a row
                renamed `work-notes` still points at Notion, and the command is the part that
                cannot lie about which service is on the other end.
              */}
              <ServiceMark
                mark={resolveServiceMark(connector.name, runs)}
                className="text-[color:var(--color-text-tertiary)]"
              />
              <div className="flex min-w-0 flex-1 items-baseline gap-2">
                <p className="shrink-0 truncate text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                  {connector.name}
                </p>
                {/*
                  **What will actually run**, before the switch is touched. A friendly name says
                  nothing about what executes, and this is the line a person can refuse on. It is
                  also the only monospace on the row: monospace is for a command or an address,
                  never for prose (2026-09-05).
                */}
                <code
                  data-testid={`${testIdPrefix}-item-runs`}
                  className="min-w-0 flex-1 truncate font-mono text-label leading-label text-[color:var(--color-text-quaternary)]"
                >
                  {runs}
                </code>
              </div>
              {/*
                ⚠️ **`gap-3`, not `gap-1`** (measured 2026-09-05 at 390 under a coarse pointer).
                The more-actions button is 28px of box carrying a 44px hit area through
                `touch-hit-expand`, so it overhung 8px each side into a 4px gap and the switch's
                label sat under the button's phantom area. Widening the gap past the overhang is
                the fix the touch contract already prescribes for this exact shape.
              */}
              <div className="flex shrink-0 items-center gap-3">
                <Checkbox
                  data-testid={`${testIdPrefix}-item-toggle`}
                  label={connector.enabled ? t('on') : t('off')}
                  checked={connector.enabled}
                  disabled={problems.length > 0}
                  onChange={(event) => onToggle(connector.id, event.target.checked)}
                  /*
                   * `atlas-touch-floor-wide` — the label is the target for a `Checkbox`, and
                   * "On"/"Off" is short enough that the target measured 34–36px wide against the
                   * 44 floor. Height already met it; width is the half the marker exists for
                   * (`app/globals.css`, coarse-pointer block).
                   */
                  className="atlas-touch-floor-wide justify-center text-label text-[color:var(--color-text-secondary)]"
                />
                <IconButton
                  data-testid={`${testIdPrefix}-item-menu`}
                  label={t('detailOpen', { name: connector.name })}
                  /* Rest and hover were the same pixels; the axes say the difference. */
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
          </li>
        );
      })}
    </ul>
    </>
  );
}

/**
 * One connector's own dialog - where its traffic goes, its variables, and removal.
 *
 * It is a `Dialog` rather than a floating menu because what is inside it includes **fields
 * somebody types a credential into**, and the blocking primitive is the only surface in this
 * repository that owns a focus trap, Escape and focus restoration. `.claude/rules/design.md`
 * forbids both a non-blocking modal and stacked floating panels.
 */
function ConnectorDetailDialog({
  connector,
  canStoreSecrets,
  storedRefs,
  onClose,
  onUpsert,
  onRemove,
  testIdPrefix,
}: {
  connector: ConnectorRecord | null;
  canStoreSecrets: boolean;
  storedRefs: ReadonlySet<string> | null;
  onClose: () => void;
  onUpsert: (connector: ConnectorRecord) => void;
  /** Takes the whole record, not an id: what has to be forgotten is written on it. */
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
      /*
       * Focus lands on the container. The first focusable control here is a keychain field, and
       * opening a dialog with the caret already inside a password box is the browser asking for a
       * secret nobody offered to give.
       */
      initialFocus="container"
    >
      {connector ? (
        <>
          <h2
            id={`${testIdPrefix}-detail-title`}
            className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
          >
            {connector.name}
          </h2>
          <p className="mt-2 text-label text-[color:var(--color-text-quaternary)]">
            {t('whatRunsLabel')}
          </p>
          <code className="mt-0.5 block break-all font-mono text-label leading-label text-[color:var(--color-text-secondary)]">
            {whatRuns(connector)}
          </code>
          {/*
            **Two sentences, because there are two destinations** (measured on the rendered screen,
            2026-09-05). One sentence naming a `{destination}` read "the agent talks to
            /opt/homebrew/bin/npx -y @notionhq/notion-mcp-server directly" for a program - it
            repeated the line directly above it, and it named a command where a service belongs.
            Atlas cannot know what host a local program will reach, and inventing one would be
            worse than saying so.
          */}
          <p className="mt-2 break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
            {connector.transport === 'http'
              ? t('rowTransfer', { destination: connectorDestination(connector) })
              : t('rowTransferStdio')}
          </p>
          {/*
            **Which sessions carry this at all** (moved here 2026-09-05). It stood in the panel's
            preamble, where it was the third sentence somebody read before reaching any connector;
            it belongs where a person is deciding about one, next to where that one's traffic goes.
            The `/agents` link is beside it because "a Codex session gets the folder's own server
            and nothing else" is only actionable if you can go and see which runtimes you have.
          */}
          <p
            data-testid={`${testIdPrefix}-runtime`}
            className="mt-1 break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]"
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

          <VariableFields
            connector={connector}
            canStoreSecrets={canStoreSecrets}
            storedRefs={storedRefs}
            onUpsert={onUpsert}
            testIdPrefix={testIdPrefix}
          />

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              data-testid={`${testIdPrefix}-item-remove`}
              onClick={() => onRemove(connector)}
              /*
               * No hand-written hover. `controlClass`'s `hoverInk` axis has no danger option, and
               * inventing one here would be a value chosen by one author — the exact drift
               * `.claude/rules/design.md` reserves for the design-systems seat. The weight of
               * this action is carried by the word and by its position opposite the primary
               * control, not by a colour that only appears under the cursor.
               */
              className={controlClass({
                shape: 'link',
                tone: 'secondary',
                hoverInk: 'strong',
                className: 'text-label',
              })}
            >
              {t('remove')}
            </button>
            <Button variant="ghost" onClick={onClose}>
              {t('close')}
            </Button>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}

/**
 * **The confirmation, because one half of Remove cannot be undone.**
 *
 * Taking the row out of `connectors.json` is reversible by hand — it is a line in a file the
 * person can read and retype. Forgetting its tokens is not: `connector_secret_delete` removes them
 * from the OS keychain, Atlas never had a read path back, and nothing on screen carried the value
 * to restore. A press that does both while naming neither is the unknown-reversibility pattern.
 *
 * So this names the connector, lists **the keys it is about to forget by name**, and offers the
 * two answers. `role="alertdialog"` rather than `dialog` because the body is the warning, and
 * assistive tech reads an alert dialog's body on open instead of waiting to be walked into it.
 * `initialFocus="container"` keeps the caret off the destructive button (`Dialog`'s own note for
 * exactly this case).
 */
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
        .filter((entry) => typeof entry.secretRef === 'string')
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
            {/*
              Two different sentences, because there are two different facts. With keys, the
              irreversible half is real and is named with the keys themselves; with none, saying
              "and its tokens" would invent a loss that is not happening.
            */}
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
                onChange={(event) => {
                  if (event.target.checked) {
                    change(slot, entry.name, (current) => ({
                      name: current.name,
                      secretRef: connectorSecretRef(connector.id, current.name),
                    }));
                    return;
                  }
                  // Turning the choice off is the person saying this value should not be on
                  // this machine. Dropping only the reference would leave the value behind
                  // with nothing on screen pointing at it.
                  void forgetSecrets([entry]).then(() =>
                    change(slot, entry.name, (current) => ({ name: current.name })),
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
