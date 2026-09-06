/**
 * **Bringing documents in from a service you already write in** — the model behind the door.
 *
 * ## Why this exists beside the MCP screen
 *
 * The owner, 2026-09-07: *"it has to be really easy to use, or nobody will. Connecting a service
 * is mostly for the Library anyway — people want the things they already wrote somewhere else."*
 *
 * That is a different errand from the one `/mcp` serves. `/mcp` answers *"what may my agent
 * reach"*, in the vocabulary of transports and environment variables, and it is right for someone
 * who came to configure. This answers *"my notes are in Notion, put them in here"*, and a person
 * asking that must never meet the words MCP, stdio, npx or environment variable. The technical
 * dialog stays exactly where it is; it is reachable from here as the last tile, for the service
 * this list does not know.
 *
 * ## Three steps, and what each one honestly is
 *
 * 1. **Connect.** Atlas writes the connector descriptor into the folder and switches it on. For a
 *    hosted service that is all: the sign-in window belongs to the **coding agent**, not to Atlas,
 *    which is why the copy says a window will open and that Atlas neither opens it nor keeps what
 *    comes back. For a service that issues a token, one field and a link to the page that issues
 *    it.
 * 2. **Say what to bring.** A phrase and a scope, which become a bounded brief.
 * 3. **Bring them in.** The brief goes to the Library's existing agent turn. The agent lists what
 *    it found, the person picks inside that turn, and every file lands under `sources/<service>/`
 *    through the **permission card that already exists**. Atlas writes nothing itself.
 *
 * ⚠️ **What step two is not, and why.** The owner asked for a search box and a ticked list drawn
 * by Atlas. Atlas cannot draw that: it is not the MCP client — the coding agent is — so it has no
 * way to call Notion's tools or to receive their result as data. Building a list here would mean
 * either Atlas talking to the service directly (a second provider boundary the trust charter does
 * not have) or inventing rows. So the picking happens one surface over, inside the agent turn,
 * where the results actually are. The brief says how many to expect and what to do with them, and
 * the screen says where the choosing will happen rather than implying it happens here.
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

/** The tiles, in the order they are drawn. `other` is always last and always present. */
export const IMPORT_SERVICE_IDS = ['notion', 'confluence', 'jira', 'github', 'other'] as const;
export type ImportServiceId = (typeof IMPORT_SERVICE_IDS)[number];

export interface ImportService {
  id: ImportServiceId;
  /** The catalogue entry this tile connects through. `null` for the escape hatch. */
  catalogueId: string | null;
  /**
   * How the person will be asked to connect.
   *
   * `browser` — a window opens and they press Allow there. Nothing to type.
   * `token` — one value, with a link to where it is issued.
   * `manual` — the technical dialog; this tile does not know the service.
   */
  connect: 'browser' | 'token' | 'manual';
  /** Where the agent will be asked to put what it brings, under the folder. */
  folder: string;
}

/**
 * The tiles.
 *
 * Confluence and Jira are two tiles over one Atlassian connector on purpose: nobody thinks *"I
 * want my Atlassian documents"*, they think *"that Confluence page"*. One connector, two doors,
 * and the folder each lands in says which they meant.
 *
 * ⚠️ **Google Drive is deliberately absent.** The owner named it, and there is no entry in the
 * committed catalogue whose facts a person has verified — an unverified tile would be a door that
 * opens onto a guess. It goes in when somebody reads a vendor page and adds it to
 * `scripts/build-mcp-catalogue.mjs`, which is the whole reason that file states its sources.
 */
export const IMPORT_SERVICES: readonly ImportService[] = [
  { id: 'notion', catalogueId: 'notion', connect: 'browser', folder: 'sources/notion' },
  { id: 'confluence', catalogueId: 'atlassian', connect: 'browser', folder: 'sources/confluence' },
  { id: 'jira', catalogueId: 'atlassian', connect: 'browser', folder: 'sources/jira' },
  { id: 'github', catalogueId: 'github', connect: 'browser', folder: 'sources/github' },
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
 * The variant this door uses.
 *
 * **The hosted address wins whenever the service has one**, because it is the shape with nothing
 * to type — which is the entire promise this door makes. A service with only a local program falls
 * back to that, and the step then asks for its one credential. A hosted address with a *second*
 * hosted address (GitHub's read-only endpoint) takes the first: a person bringing documents in is
 * reading, but choosing between two URLs is the technical question this door exists to avoid, and
 * the MCP screen is where somebody who wants the narrower one goes.
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
 * The connector this door writes, **switched on**.
 *
 * ⚠️ **On, unlike every other path into `connectors.json`.** Everywhere else a connector arrives
 * off, because writing one down is not the same as deciding to use it — somebody copying rows out
 * of `~/.claude.json` is filing, not choosing. Here the person pressed a tile named after the
 * service and a button that says bring my documents in, and leaving it off would mean the next
 * step silently finds nothing. The row is still visible and still switchable on the MCP screen,
 * and the step says out loud that it has been turned on.
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
 * The brief handed to the Library's agent turn.
 *
 * **Bounded on purpose, in the same shape Compile's brief already uses.** It names the connector
 * by the name the descriptor was written under, caps how many documents may be brought, fixes the
 * folder they land in, and forbids everything else — because an unbounded "import my Notion" is a
 * turn that reads a workspace and writes a thousand files, each through a permission card nobody
 * will read by the fiftieth.
 *
 * It also states the two things a person is owed afterwards: where each file came from, and that
 * nothing outside the named folder is touched.
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

/**
 * Where the flow goes next, given what has happened.
 *
 * A pure function so the dialog has no branch of its own to get wrong, and so the whole path is
 * testable without a service, a keychain or an agent — none of which exist in a test, and one of
 * which does not exist on the web.
 */
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
