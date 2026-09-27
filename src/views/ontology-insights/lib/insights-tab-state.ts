/**
 * `/ontology/insights` tab state. The URL `?tab=` is the source of truth, so a refresh or shared link opens the same
 * tab; parsing and serialization are pure. Two rows: the first names the subject (brief, ontology, library,
 * harness), and the ontology's questions sit in a second row, one question per tab.
 */
export const INSIGHTS_TABS = [
  "brief",
  "library",
  "harness",
  "do-next",
  "unmatched",
  "composition",
  "connections",
  "boundaries",
  "growth",
  "flow",
] as const;

/** The first row: what a tab is about. `ontology` opens the question row underneath. */
export const INSIGHTS_CORES = ["brief", "ontology", "library", "harness"] as const;

export type InsightsCore = (typeof INSIGHTS_CORES)[number];

/** The ontology's questions in reading order, for the second row. */
export const ONTOLOGY_TABS = [
  "do-next",
  "unmatched",
  "composition",
  "connections",
  "boundaries",
  "growth",
  "flow",
] as const satisfies readonly InsightsTab[];

/** Every ontology question answers to `ontology`. */
export function coreOfTab(tab: InsightsTab): InsightsCore {
  if (tab === "brief" || tab === "library" || tab === "harness") return tab;
  return "ontology";
}

/** The tab a subject opens; the ontology lands on its first question, which the address then carries. */
export function tabOfCore(core: InsightsCore): InsightsTab {
  return core === "ontology" ? ONTOLOGY_TABS[0] : core;
}

export type InsightsTab = (typeof INSIGHTS_TABS)[number];

/** The path every in-screen destination on this board shares, without its locale prefix. */
const INSIGHTS_PATH = "/ontology/insights/";

/**
 * The tab an href opens on this same board, or `null` when it leads elsewhere. The board keeps its tab in component
 * state and writes the address with `history.replaceState`, since a router navigation moves WebView focus to the
 * document root; a `<Link>` here would change the address and leave the screen. Matching links are answered by `setTab`.
 */
export function parseInsightsTabHref(href: string): InsightsTab | null {
  if (!href.startsWith(INSIGHTS_PATH)) return null;
  const query = href.slice(INSIGHTS_PATH.length);
  if (!query.startsWith("?")) return query === "" ? DEFAULT_INSIGHTS_TAB : null;
  return parseInsightsTab(new URLSearchParams(query.slice(1)).get("tab"));
}

// The brief opens first: "what in my understanding has to change", across ontology, wiki and harness.
export const DEFAULT_INSIGHTS_TAB: InsightsTab = "brief";

function isInsightsTab(value: string): value is InsightsTab {
  return (INSIGHTS_TABS as readonly string[]).includes(value);
}

/** Old tab names from saved URLs, handoff links and the `via=insights:<tab>` chip, kept so those links still open. */
const LEGACY_TAB_ALIASES: Record<string, InsightsTab> = {
  // The former overview and relations tabs.
  overview: "composition",
  relations: "connections",
  // The former structure tab; its first question, "what exists, how much", is composition.
  structure: "composition",
  // The former freshness tab, now growth, with the file-date answer as its supporting detail.
  freshness: "growth",
};

/** The raw `?tab=` value to a valid tab; unknown or missing gives the default. */
export function parseInsightsTab(raw: string | null | undefined): InsightsTab {
  if (!raw) return DEFAULT_INSIGHTS_TAB;
  if (isInsightsTab(raw)) return raw;
  return LEGACY_TAB_ALIASES[raw] ?? DEFAULT_INSIGHTS_TAB;
}

/**
 * The href for a tab switch; the default tab omits `?tab=`. Pass the locale-prefixed current pathname so a native
 * history update keeps the WebView URL and focus.
 */
export function buildInsightsTabHref(
  tab: InsightsTab,
  pathname = "/ontology/insights/",
  /** The query to switch from; defaults to the live one, passed in by tests. */
  currentSearch = typeof window === "undefined" ? "" : window.location.search,
): string {
  // Keep every other query flag (the guide flag, fixtures, later view options), as `/architecture` does, so the two
  // boards agree on what an address means.
  const query = new URLSearchParams(currentSearch);
  query.delete("tab");
  if (tab !== DEFAULT_INSIGHTS_TAB) query.set("tab", tab);
  const search = query.toString();
  return search ? `${pathname}?${search}` : pathname;
}
