import { screenSearch, type ScreenSearch } from "@/shared/lib/navigation/search-text";

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

/**
 * The map route's query: the keys the map reads are typed text, any other key passes through. Kept
 * apart from `url-state.ts` because the route module loads it with the app's first screen, and the
 * rules in `url-state.ts` pull in the map's whole graph.
 */
export const homeSearch = screenSearch<readonly HomeQueryKey[]>(Object.values(HOME_QUERY_KEYS));

export type HomeSearch = ScreenSearch<readonly HomeQueryKey[]>;
