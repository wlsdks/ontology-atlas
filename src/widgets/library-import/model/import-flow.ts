/**
 * Model for bringing documents in from a service: connect (write the connector descriptor and
 * switch it on, asking for one token if needed), say what to bring, then hand a bounded brief to
 * the Library's agent turn. Atlas is not the MCP client, so the agent lists and picks results
 * inside its turn and every file lands under `sources/<service>/` through the permission card;
 * Atlas writes nothing itself.
 */
import {
  MCP_CATALOGUE,
  MCP_CATALOGUE_CAPTURED_AT,
  catalogueDraft,
  variantSecrets,
  type CatalogueEntry,
  type CatalogueVariant,
} from '@/shared/config/mcp-catalogue';
import type { ConnectorRecord } from '@/shared/lib/connector-record';

/**
 * The tiles in draw order; `other` is always last. `IMPORT_SERVICES` is the list and its `id` is
 * checked against this union.
 */
export type ImportServiceId = 'notion' | 'github' | 'other';

export interface ImportService {
  id: ImportServiceId;
  /** The catalogue entry this tile connects through. `null` for the escape hatch. */
  catalogueId: string | null;
  /**
   * How the person connects: `browser` (press Allow in a window), `token` (one value with a link to
   * its issuer), `manual` (the technical dialog).
   */
  connect: 'browser' | 'token' | 'manual';
  /** Where the agent will be asked to put what it brings, under the folder. */
  folder: string;
}

/**
 * The tiles. Google Drive is absent: every Drive server needs a self-made OAuth client; add it
 * to `scripts/build-mcp-catalogue.mjs` with sources when a sign-in-only endpoint exists.
 */
/*
 * Confluence and Jira wait for an adapter that can sign in: a hosted OAuth address given to the
 * in-app session only reports "requires authentication".
 */
export const IMPORT_SERVICES: readonly ImportService[] = [
  { id: 'notion', catalogueId: 'notion', connect: 'token', folder: 'sources/notion' },
  { id: 'github', catalogueId: 'github', connect: 'token', folder: 'sources/github' },
  { id: 'other', catalogueId: null, connect: 'manual', folder: 'sources' },
];

export function importService(id: ImportServiceId): ImportService {
  const service = IMPORT_SERVICES.find((candidate) => candidate.id === id);
  if (!service) throw new Error(`unknown import service: ${id}`);
  return service;
}

/** The catalogue entry a tile connects through, or `null` for the escape hatch. */
export function serviceEntry(service: ImportService): CatalogueEntry | null {
  if (!service.catalogueId) return null;
  return MCP_CATALOGUE.find((entry) => entry.id === service.catalogueId) ?? null;
}

/**
 * The hosted address wins whenever a service has one, since nothing needs typing; otherwise the
 * local program with its credential. With two hosted addresses the first is taken.
 */
export function serviceVariant(entry: CatalogueEntry): CatalogueVariant {
  return (
    entry.variants.find((variant) => variant.kind === 'remote' && variant.auth === 'oauth') ??
    entry.variants.find((variant) => variant.kind === 'remote') ??
    entry.variants[0]
  );
}

/** What this door will ask of a person before it can bring anything. `null` means nothing. */
export function serviceAsk(
  service: ImportService,
): { kind: 'browser' } | { kind: 'token'; name: string; issueUrl?: string } | { kind: 'manual' } {
  const entry = serviceEntry(service);
  if (!entry) return { kind: 'manual' };
  const variant = serviceVariant(entry);
  const secrets = variantSecrets(variant);
  if (variant.kind === 'remote' && variant.auth === 'oauth') return { kind: 'browser' };
  const first = secrets[0];
  if (!first) return { kind: 'browser' };
  return {
    kind: 'token',
    name: first.name,
    ...(first.issueUrl ? { issueUrl: first.issueUrl } : {}),
  };
}

/**
 * The connector, switched on unlike every other path into `connectors.json`: the person asked to
 * bring documents in, so off would find nothing. It stays visible and switchable on the MCP screen.
 */
export function importConnector(
  service: ImportService,
  options: { id: string; runtimePath?: string | null; secretRef: (id: string, name: string) => string },
): ConnectorRecord | null {
  const entry = serviceEntry(service);
  if (!entry) return null;
  const draft = catalogueDraft(entry, serviceVariant(entry), {
    id: options.id,
    capturedAt: MCP_CATALOGUE_CAPTURED_AT,
    runtimePath: options.runtimePath ?? null,
    secretRef: options.secretRef,
  });
  return { ...draft, enabled: true, origin: `library-import:${service.id}` };
}

export type ImportStep = 'pick' | 'connect' | 'choose' | 'bring';

/** What a person typed in step two. */
export interface ImportRequest {
  /** Free text: "the API design pages", "everything in the Handbook space". */
  what: string;
  /** How many to bring at most. A bound the brief carries so a turn cannot run away. */
  limit: number;
}

export const DEFAULT_IMPORT_LIMIT = 20;

/**
 * The bounded brief for the Library's agent turn: names the connector, caps the count, fixes the
 * destination folder and forbids everything else, so a turn cannot write a thousand files through
 * unread permission cards.
 */
export function buildImportBrief(input: {
  serviceLabel: string;
  connectorName: string;
  folder: string;
  request: ImportRequest;
}): string {
  const { serviceLabel, connectorName, folder, request } = input;
  const what = request.what.trim() || 'the documents most worth keeping';
  return [
    `Bring documents in from ${serviceLabel} using the MCP server attached as "${connectorName}".`,
    '',
    `1. Search ${serviceLabel} for: ${what}`,
    `2. List what you found, at most ${request.limit} items, with a title and a one-line summary each, and ask me which to bring. Do not write anything before I answer.`,
    `3. For each one I pick, write a Markdown file under ${folder}/ in this folder. Keep the original title as the heading, keep the body as it reads, and put the source URL and the date you fetched it in the frontmatter as source_url and fetched_at.`,
    '',
    `Do not create, edit or delete anything outside ${folder}/. Do not modify the ontology. If a document cannot be fetched or converted, say so and move on rather than writing a placeholder.`,
  ].join('\n');
}

/** The next step as a pure function, testable without a service, keychain or agent. */
export function nextStep(state: {
  step: ImportStep;
  service: ImportService | null;
  connected: boolean;
  request: ImportRequest | null;
}): ImportStep {
  if (!state.service) return 'pick';
  if (!state.connected) return 'connect';
  if (!state.request) return 'choose';
  return 'bring';
}
