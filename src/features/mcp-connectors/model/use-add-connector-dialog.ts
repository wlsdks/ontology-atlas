import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import type { ConnectorRecord } from '@/shared/lib/connectors/connector-record';
import type { ConnectorWriteResult } from '@/shared/lib/connectors/connector-store';
import type {
  ConnectorDiscoveryState,
  DiscoveredConnector,
} from '@/shared/lib/connectors/tauri-connectors';
import { connectorSecretRef, connectorSecretSet } from '@/shared/lib/connectors/tauri-connector-secrets';
import {
  MCP_CATALOGUE,
  MCP_CATALOGUE_CAPTURED_AT,
  catalogueDraft,
  searchCatalogue,
  type CatalogueEntry,
  type CatalogueVariant,
} from '@/shared/config/mcp/mcp-catalogue';
import {
  resolveConnectorRuntimes,
  runtimePath,
  type ResolvedRuntime,
} from '@/shared/lib/connectors/tauri-connector-runtimes';

import { groupDiscovered } from './discovered-groups';
import { addFailureReason, type AddFailureReason } from './add-failure-reason';
import { pressOutcome, secretsFromAnswers, variantKey } from './catalogue-variant';
import {
  EMPTY_PREFILL,
  newConnectorId,
  prefillFromCatalogue,
  type CustomPrefill,
  type SecretToStore,
} from './connector-draft';

/** jsdom has no `scrollIntoView`; the form is still unfolded, which is the contract. */
function scrollFormIntoView(node: HTMLElement | null, reducedMotion: boolean): void {
  if (node && typeof node.scrollIntoView === 'function') {
    node.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
  }
}

export interface AddConnectorDialogInput {
  open: boolean;
  onClose: () => void;
  discovery: ConnectorDiscoveryState;
  canDiscover: boolean;
  attachedNames: Set<string>;
  onAddDiscovered: (server: DiscoveredConnector) => Promise<ConnectorWriteResult | null>;
  onAddCustom: (connector: ConnectorRecord) => Promise<ConnectorWriteResult | null>;
  incoming?: CustomPrefill | null;
  testIdPrefix: string;
}

export function useAddConnectorDialog({
  open,
  onClose,
  discovery,
  canDiscover,
  attachedNames,
  onAddDiscovered,
  onAddCustom,
  incoming,
  testIdPrefix,
}: AddConnectorDialogInput) {
  const reducedMotion = usePrefersReducedMotion();
  const [query, setQuery] = useState('');
  const [failure, setFailure] = useState<AddFailureReason | null>(null);
  const [prefill, setPrefill] = useState<CustomPrefill>(EMPTY_PREFILL);
  const [prefillTick, setPrefillTick] = useState(0);
  const [customOpen, setCustomOpen] = useState(false);
  const [asking, setAsking] = useState<{ entryId: string; variant: string } | null>(null);

  /** Read once on open: asking per keystroke would walk directories while somebody types. */
  const [runtimes, setRuntimes] = useState<ResolvedRuntime[] | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void resolveConnectorRuntimes().then((result) => {
      if (!cancelled) setRuntimes(result);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  /*
   * Two resets adjusted during render, not in an effect (`react-hooks/set-state-in-effect`), so the dialog never paints a frame in the wrong state:
   * opening folds everything back, and a draft from outside unfolds the form filled but unsaved, because a link is an invitation and the press stays the person's.
   */
  const [seenOpen, setSeenOpen] = useState(open);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) {
      setQuery('');
      setFailure(null);
      setAsking(null);
      setCustomOpen(false);
    }
  }
  // Seeded null, not `incoming`, so the first arrival is always a change; otherwise a link opened the dialog with the filled form folded away.
  const [seenIncoming, setSeenIncoming] = useState<CustomPrefill | null>(null);
  if (open && incoming && incoming !== seenIncoming) {
    setSeenIncoming(incoming);
    setPrefill(incoming);
    setPrefillTick((tick) => tick + 1);
    setCustomOpen(true);
  }

  // Focuses the search after the dialog records its opener: with `autoFocus` the trap recorded the search box as opener and Escape dropped focus to `<body>`.
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (open) searchRef.current?.focus({ preventScroll: true });
  }, [open]);

  /** So a pre-fill can bring the unfolded form into view. */
  const customRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (prefillTick === 0 || !customOpen) return;
    scrollFormIntoView(customRef.current, reducedMotion);
  }, [customOpen, prefillTick, reducedMotion]);

  /*
   * The empty search's door unfolds the form, scrolls to it and focuses its first field; the
   * card's button and the fold's toggle are never both on screen.
   */
  const focusCustomNameRef = useRef(false);
  useEffect(() => {
    if (!focusCustomNameRef.current || !customOpen) return;
    focusCustomNameRef.current = false;
    scrollFormIntoView(customRef.current, reducedMotion);
    document.getElementById(`${testIdPrefix}-custom-name`)?.focus({ preventScroll: true });
  }, [customOpen, reducedMotion, testIdPrefix]);

  const attempt = useCallback(
    async (write: () => Promise<ConnectorWriteResult | null>) => {
      const result = await write();
      const reason = addFailureReason(result);
      if (reason === null) {
        setFailure(null);
        onClose();
        return true;
      }
      setFailure(reason);
      return false;
    },
    [onClose],
  );

  /**
   * Writes the row, then stores tokens in the keychain only after the row is on disk, or a
   * failed write leaves an orphaned value on this machine (see `forgetSecrets`).
   */
  const addWithSecrets = useCallback(
    (connector: ConnectorRecord, secrets: SecretToStore[]) =>
      attempt(async () => {
        const result = await onAddCustom(connector);
        if (result?.status === 'saved') {
          await Promise.all(
            secrets.map(({ ref, value }) => connectorSecretSet(ref, value).catch(() => null)),
          );
        }
        return result;
      }),
    [attempt, onAddCustom],
  );

  const discovered = discovery.status === 'done' ? discovery.connectors : null;
  const groups = useMemo(
    () => groupDiscovered((discovered ?? []).filter((server) => !attachedNames.has(server.name))),
    [attachedNames, discovered],
  );
  const needle = query.trim().toLowerCase();
  const foundMatches = needle
    ? groups.filter((group) =>
        `${group.server.name} ${
          group.server.url ?? [group.server.command, ...group.server.args].join(' ')
        }`
          .toLowerCase()
          .includes(needle),
      )
    : groups;
  const catalogueMatches = useMemo(() => searchCatalogue(MCP_CATALOGUE, query), [query]);
  const nothingMatches =
    needle.length > 0 && catalogueMatches.length === 0 && (!canDiscover || foundMatches.length === 0);

  const catalogueRecord = (entry: CatalogueEntry, variant: CatalogueVariant) => {
    const id = newConnectorId();
    return catalogueDraft(entry, variant, {
      id,
      capturedAt: MCP_CATALOGUE_CAPTURED_AT,
      runtimePath: variant.kind === 'local' ? runtimePath(runtimes, variant.runtime) : null,
      secretRef: connectorSecretRef,
    });
  };

  /** Attaches what its row shows and asks nothing; unfolds the rest. */
  const pressCatalogue = (entry: CatalogueEntry, variant: CatalogueVariant) => {
    setFailure(null);
    if (pressOutcome(entry, variant) === 'attaches') {
      setAsking(null);
      void addWithSecrets(catalogueRecord(entry, variant), []);
      return;
    }
    setAsking({ entryId: entry.id, variant: variantKey(variant) });
  };

  const editCatalogue = (entry: CatalogueEntry, variant: CatalogueVariant) => {
    setPrefill(prefillFromCatalogue(entry, variant, runtimes));
    setPrefillTick((tick) => tick + 1);
    setAsking(null);
    setCustomOpen(true);
    setFailure(null);
  };

  const attachCatalogue = (
    entry: CatalogueEntry,
    variant: CatalogueVariant,
    values: Record<string, string>,
  ) => {
    const record = catalogueRecord(entry, variant);
    void addWithSecrets(record, secretsFromAnswers(record, values));
  };

  const openCustomAndFocusName = () => {
    focusCustomNameRef.current = true;
    setCustomOpen(true);
  };

  const addFound = (server: DiscoveredConnector) => void attempt(() => onAddDiscovered(server));

  return {
    query,
    setQuery,
    failure,
    prefill,
    prefillTick,
    customOpen,
    setCustomOpen,
    openCustomAndFocusName,
    asking,
    dismissAsking: () => setAsking(null),
    runtimes,
    searchRef,
    customRef,
    foundMatches,
    catalogueMatches,
    nothingMatches,
    pressCatalogue,
    editCatalogue,
    attachCatalogue,
    addFound,
    addWithSecrets,
  };
}
