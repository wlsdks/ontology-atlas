import {
  looksLikeSecretKey,
  type ConnectorRecord,
  type ConnectorTransport,
  type ConnectorValueEntry,
} from '@/shared/lib/connectors/connector-record';
import { connectorSecretRef } from '@/shared/lib/connectors/tauri-connector-secrets';
import {
  MCP_CATALOGUE_CAPTURED_AT,
  catalogueDraft,
  variantVariables,
  type CatalogueEntry,
  type CatalogueVariant,
} from '@/shared/config/mcp-catalogue';
import {
  runtimePath,
  type ResolvedRuntime,
} from '@/shared/lib/connectors/tauri-connector-runtimes';

export function newConnectorId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `c${Date.now().toString(36)}`;
}

export interface DraftVariable {
  name: string;
  value: string;
  /** A credential-shaped name starts checked and cannot be unchecked. */
  secret: boolean;
}

export interface CustomPrefill {
  name: string;
  transport: ConnectorTransport;
  command: string;
  args: string;
  url: string;
  variables: DraftVariable[];
  provenance?: { title: string; detail: string; docsUrl?: string };
}

export const EMPTY_PREFILL: CustomPrefill = {
  name: '',
  transport: 'stdio',
  command: '',
  args: '',
  url: '',
  variables: [],
};

export function prefillFromCatalogue(
  entry: CatalogueEntry,
  variant: CatalogueVariant,
  runtimes: readonly ResolvedRuntime[] | null,
): CustomPrefill {
  const record = catalogueDraft(entry, variant, {
    id: 'draft',
    capturedAt: MCP_CATALOGUE_CAPTURED_AT,
    runtimePath: variant.kind === 'local' ? runtimePath(runtimes, variant.runtime) : null,
    secretRef: () => '',
  });
  return {
    name: record.name,
    transport: record.transport,
    command: record.command ?? '',
    args: record.args.join(' '),
    url: record.url ?? '',
    variables: variantVariables(variant).map((variable) => ({
      name: variable.name,
      value: '',
      // The publisher's own `isSecret`, not only a guess from the name: `OPENAPI_MCP_HEADERS` would
      // otherwise attach with no credential.
      secret: variable.secret || looksLikeSecretKey(variable.name),
    })),
    provenance: {
      title: entry.title,
      detail: variant.source,
      docsUrl: entry.docsUrl,
    },
  };
}

export function prefillFromRecord(record: ConnectorRecord): CustomPrefill {
  const entries: ConnectorValueEntry[] =
    record.transport === 'http' ? record.headers : record.env;
  return {
    name: record.name,
    transport: record.transport,
    command: record.command ?? '',
    args: record.args.join(' '),
    url: record.url ?? '',
    variables: entries.map((entry) => ({
      name: entry.name,
      value: '',
      secret: typeof entry.secretRef === 'string' || looksLikeSecretKey(entry.name),
    })),
  };
}

export interface SecretToStore {
  ref: string;
  value: string;
}

export interface DraftFields {
  name: string;
  transport: ConnectorTransport;
  command: string;
  args: string;
  url: string;
  variables: DraftVariable[];
}

export function buildDraftRecord({
  name,
  transport,
  command,
  args,
  url,
  variables,
}: DraftFields): ConnectorRecord {
  const id = 'draft';
  const entries: ConnectorValueEntry[] = variables
    .filter((variable) => variable.name.trim())
    .map((variable) => {
      const name = variable.name.trim();
      /*
       * The name decides too: `serializeConnectorState` refuses a literal under a credential
       * name, so the record agrees with the row's locked checkbox instead of failing the write.
       */
      const secret = variable.secret || looksLikeSecretKey(name);
      return secret
        ? { name, secretRef: connectorSecretRef(id, name) }
        : { name, ...(variable.value.trim() ? { value: variable.value.trim() } : {}) };
    });
  return {
    id,
    name: name.trim(),
    transport,
    ...(transport === 'stdio'
      ? { command: command.trim() }
      : { url: url.trim() }),
    args: transport === 'stdio' ? args.split(/\s+/).filter(Boolean) : [],
    env: transport === 'stdio' ? entries : [],
    headers: transport === 'http' ? entries : [],
    enabled: false,
  };
}

export function draftRuns(draft: ConnectorRecord): string {
  return draft.transport === 'http'
    ? (draft.url ?? '').trim()
    : [draft.command ?? '', ...draft.args].join(' ').trim();
}

/** Re-keys every secret reference to the real id and pairs each typed value with its reference. */
export function draftForWrite(
  draft: ConnectorRecord,
  variables: DraftVariable[],
  id: string,
): { connector: ConnectorRecord; secrets: SecretToStore[] } {
  const secrets: SecretToStore[] = [];
  const rekey = (entries: ConnectorValueEntry[]) =>
    entries.map((entry) => {
      if (!entry.secretRef) return entry;
      const reference = connectorSecretRef(id, entry.name);
      const typed = variables.find((variable) => variable.name.trim() === entry.name);
      if (typed?.value.trim()) secrets.push({ ref: reference, value: typed.value.trim() });
      return { ...entry, secretRef: reference };
    });
  return {
    connector: { ...draft, id, env: rekey(draft.env), headers: rekey(draft.headers) },
    secrets,
  };
}
