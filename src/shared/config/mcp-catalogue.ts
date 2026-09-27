/**
 * The connector catalogue: the shortcut past typing a package name. The data lives
 * in `mcp-catalogue.generated.ts` (from `scripts/build-mcp-catalogue.mjs`); this file owns the
 * shape, the search, and turning a chosen entry into a connector draft.
 *
 * The type keeps two shapes apart, and so does the screen:
 * - `remote`, a hosted address: nothing to install; the coding agent connects and does any
 *   OAuth sign-in in its own browser. Atlas writes the address down and stops.
 * - `local`, a program on this computer: the person's runtime fetches the package, and its one
 *   credential goes into this machine's keychain, never into the folder's file.
 *
 * No popularity, counts, ratings, "recommended" or sort other than curation order: that makes
 * a marketplace, which `.claude/rules/forbidden.md` refuses. The generator carries the same rule.
 */
import type { ConnectorRecord, ConnectorValueEntry } from '@/shared/lib/connector-record';

/** Where one variant's facts came from. Drawn differently, because the authority differs. */
type CatalogueSource = 'registry' | 'curated';

/** One environment variable or header the entry declares. */
export interface CatalogueVariable {
  name: string;
  /**
   * The publisher saying this is a credential — not `looksLikeSecretKey()` guessing from the
   * name. A `registry` variant carries the publisher's own `isSecret`; a `curated` one carries
   * what a person read on the vendor's page.
   */
  secret: boolean;
  required: boolean;
  description?: string;
  /** Where this credential is issued. The one link that turns "paste a token" into an errand. */
  issueUrl?: string;
}

interface CatalogueRemoteVariant {
  kind: 'remote';
  transport: 'http';
  url: string;
  /** A second address for the same service, e.g. GitHub's read-only endpoint. */
  label?: string;
  /**
   * `oauth` — the agent opens a browser and the provider asks. Atlas holds nothing.
   * `token` — a value goes in a header, and therefore into this machine's keychain.
   * `none` — open.
   */
  auth: 'oauth' | 'token' | 'none';
  headers: CatalogueVariable[];
  source: CatalogueSource;
}

interface CatalogueLocalVariant {
  kind: 'local';
  transport: 'stdio';
  /** Which runtime starts it. Resolved to a full path on this machine before it is written down. */
  runtime: 'npx' | 'uvx' | 'docker' | 'node' | 'python3';
  packageId: string;
  args: string[];
  env: CatalogueVariable[];
  source: CatalogueSource;
}

export type CatalogueVariant = CatalogueRemoteVariant | CatalogueLocalVariant;

export interface CatalogueEntry {
  id: string;
  /** The default connector name. The person may change it; the id is what provenance records. */
  name: string;
  title: string;
  summary: string;
  docsUrl: string;
  /** The day a person read the vendor's page. Curated facts age, and the screen says when. */
  verifiedAt: string;
  registryName: string | null;
  /** Whether the generator actually reached the registry for this entry on its last run. */
  registryChecked: boolean;
  variants: readonly CatalogueVariant[];
}

/** One line naming what will actually run or be reached — the same claim `whatRuns()` makes. */
export function variantRuns(variant: CatalogueVariant, runtimePath?: string | null): string {
  if (variant.kind === 'remote') return variant.url;
  return [runtimePath ?? variant.runtime, ...variant.args].join(' ');
}

/** Every variable a variant declares, in the order it declares them. */
export function variantVariables(variant: CatalogueVariant): readonly CatalogueVariable[] {
  return variant.kind === 'remote' ? variant.headers : variant.env;
}

/** The variables a person still has to supply; an OAuth remote needs none. */
export function variantSecrets(variant: CatalogueVariant): readonly CatalogueVariable[] {
  return variantVariables(variant).filter((variable) => variable.required);
}

/**
 * Matches an entry the way a person remembers it: the service's name, its purpose, and the
 * package or address itself.
 */
function catalogueHaystack(entry: CatalogueEntry): string {
  return [
    entry.title,
    entry.name,
    entry.summary,
    ...entry.variants.map((variant) => variantRuns(variant)),
    ...entry.variants.flatMap((variant) =>
      variantVariables(variant).map((variable) => variable.name),
    ),
  ]
    .join(' ')
    .toLowerCase();
}

export function searchCatalogue(
  entries: readonly CatalogueEntry[],
  query: string,
): CatalogueEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...entries];
  return entries.filter((entry) => catalogueHaystack(entry).includes(needle));
}

/**
 * A chosen entry, as a connector draft the by-hand form can hold.
 *
 * No value is ever carried: a required credential becomes an empty keychain `secretRef`, so the
 * form asks for it and `serializeConnectorState` is never handed a literal to refuse. `origin`
 * records which catalogue entry and capture produced the row, or `connectors.json` cannot tell a
 * curated suggestion from something the person typed.
 */
export function catalogueDraft(
  entry: CatalogueEntry,
  variant: CatalogueVariant,
  options: {
    id: string;
    capturedAt: string;
    /** The full path this machine resolved for the variant's runtime, when it found one. */
    runtimePath?: string | null;
    secretRef: (id: string, name: string) => string;
  },
): ConnectorRecord {
  const toEntries = (variables: readonly CatalogueVariable[]): ConnectorValueEntry[] =>
    variables.map((variable) =>
      variable.secret
        ? { name: variable.name, secretRef: options.secretRef(options.id, variable.name) }
        : { name: variable.name },
    );
  const origin = `catalogue:${entry.id}@${options.capturedAt}`;
  if (variant.kind === 'remote') {
    return {
      id: options.id,
      name: entry.name,
      transport: 'http',
      args: [],
      url: variant.url,
      env: [],
      headers: toEntries(variant.headers),
      // Written down is not switched on. The person still presses the switch.
      enabled: false,
      origin,
    };
  }
  return {
    id: options.id,
    name: entry.name,
    transport: 'stdio',
    // Unresolved runtimes stay bare, so `connectorProblems` reports `command-not-absolute` now
    // rather than a guessed path failing later.
    command: options.runtimePath ?? variant.runtime,
    args: [...variant.args],
    env: toEntries(variant.env),
    headers: [],
    enabled: false,
    origin,
  };
}

export { MCP_CATALOGUE, MCP_CATALOGUE_CAPTURED_AT } from './mcp-catalogue.generated';
