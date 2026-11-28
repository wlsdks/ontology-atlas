import { screenSearch, type ScreenSearch } from "./search-text";

/**
 * The query each screen reads, declared where a route module can import it without loading the screen: a
 * route's critical chunk carries its `validateSearch`, and a schema imported through a view's public
 * file would pull that whole view (and the map's graph) in with it. Each view re-exports its own.
 */

/**
 * The registry's source of truth: `tests/contract/routes/scope-registry.contract.test.ts` requires
 * a `global` or `vault-scoped` tag for every key, so each new key answers "clear on vault change?".
 */
export const HOME_QUERY_KEYS = {
  project: "p",
  category: "c",
  hub: "hub",
  impact: "impact",
  pulse: "pulse",
  mode: "mode",
  pathSource: "pathFrom",
  pathTarget: "pathTo",
  pathSourceAlias: "from",
  pathTargetAlias: "to",
  create: "create",
  workbench: "workbench",
  edit: "edit",
  index: "index",
  open: "open",
  realm: "realm",
  recent: "recent",
  constellation: "constellation",
  ask: "ask",
  view: "view",
} as const;

export type HomeQueryKey = (typeof HOME_QUERY_KEYS)[keyof typeof HOME_QUERY_KEYS];

/** The keys that draw a synthetic vault for measurement (`synth-vault.ts`); they are not part of the address a person shares. */
type HomeSynthKey = "synth" | "synthDeps" | "synthShape" | "synthEvidence";

export type HomeSearch = ScreenSearch<readonly (HomeQueryKey | HomeSynthKey)[]>;

/** The map route's query: the keys the map reads are typed text, any other key passes through. */
export const homeSearch = screenSearch<readonly (HomeQueryKey | HomeSynthKey)[]>();

/** The Agents page's tab, and beside it the page reads `returnTo`, and its MCP tab reads `mcp` and `install`. */
export type AgentsSearch = ScreenSearch<readonly ["tab", "returnTo", "mcp", "install"]>;

export const agentsSearch = screenSearch<readonly ["tab", "returnTo", "mcp", "install"]>();

/** The Harness route's query: `?role=` and `?stage=` exist only on the blueprint, so an address with one names it. */
export type HarnessSearch = ScreenSearch<readonly ["view", "role", "stage"]>;

export const harnessSearch = screenSearch<readonly ["view", "role", "stage"]>();

/** The lane (`kind`), the round open in it and the run that just landed. */
export type AutomationsSearch = ScreenSearch<readonly ["kind", "round", "run"]>;

export const automationsSearch = screenSearch<readonly ["kind", "round", "run"]>();

/**
 * The Library's tab and ontology view, the round a retired link named, and the document reader's keys:
 * the open document (`slug`), its list (`view`, `sort`, `group`), the sample vault (`dogfood`) and the
 * return marker (`via`). `/docs` reads the same keys, because the Library's Ontology tab embeds it.
 */
export type LibrarySearch = ScreenSearch<
  readonly ["tab", "ontologyView", "round", "slug", "view", "dogfood", "sort", "group", "via"]
>;

export const librarySearch = screenSearch<
  readonly ["tab", "ontologyView", "round", "slug", "view", "dogfood", "sort", "group", "via"]
>();
