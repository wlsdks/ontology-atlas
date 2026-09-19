/**
 * `/ontology/insights` tab state. The URL `?tab=` is the source of truth — a refresh or a shared
 * link must open the same tab, so parsing and serialization are pure functions rather than
 * component-local state.
 *
 * **Two levels, because one row could not say what it was about.** The screen answers questions
 * about three different things — the ontology, the wiki, and the harness — and a single row of
 * names like "connections" or "boundaries" left a reader unable to tell which of the three a tab
 * counted — the owner could not tell whether a tab meant the ontology, the library or the
 * harness (2026-09-19).
 * The first row now names the thing: the brief across all of them, then the ontology, the library,
 * the harness. The ontology's own questions sit in a second row, **one question per tab**: a single
 * tab holding several questions made a person scroll past two screens of unrelated material to
 * answer their own, which is why the former `structure` tab was split.
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

/** The first row: the thing a tab is about. `ontology` opens the question row underneath. */
export const INSIGHTS_CORES = ["brief", "ontology", "library", "harness"] as const;

export type InsightsCore = (typeof INSIGHTS_CORES)[number];

/** The ontology's own questions, in reading order, for the second row. */
export const ONTOLOGY_TABS = [
  "do-next",
  "unmatched",
  "composition",
  "connections",
  "boundaries",
  "growth",
  "flow",
] as const satisfies readonly InsightsTab[];

/** Which row-one entry a tab belongs to. Every ontology question answers to `ontology`. */
export function coreOfTab(tab: InsightsTab): InsightsCore {
  if (tab === "brief" || tab === "library" || tab === "harness") return tab;
  return "ontology";
}

/**
 * The tab a row-one entry opens. Picking the ontology lands on its first question rather than on
 * an empty shelf; the address then carries that question, so a shared link reopens it exactly.
 */
export function tabOfCore(core: InsightsCore): InsightsTab {
  return core === "ontology" ? ONTOLOGY_TABS[0] : core;
}

export type InsightsTab = (typeof INSIGHTS_TABS)[number];

/*
 * The brief opens first (2026-09-19). A person who delegated work and came back asks "what in
 * my understanding has to change", and that is one screen across the ontology, the wiki and the
 * harness; the six measured tabs and Flow keep answering their own questions behind it.
 */
export const DEFAULT_INSIGHTS_TAB: InsightsTab = "brief";

function isInsightsTab(value: string): value is InsightsTab {
  return (INSIGHTS_TABS as readonly string[]).includes(value);
}

/**
 * Compatibility with URLs saved under old tab names — bookmarks and agent handoff links (including
 * the `via=insights:<tab>` return chip) live a long time once written. Each rename leaves the old
 * name here so those links do not die.
 */
const LEGACY_TAB_ALIASES: Record<string, InsightsTab> = {
  // The former overview and relations tabs → the former single structure tab
  overview: "composition",
  relations: "connections",
  // The former structure tab → split into composition/connections/boundaries. Its first question
  // ("what exists, how much") is composition, so it goes there.
  structure: "composition",
  // The former freshness tab. It asked "what moved lately" and answered it from file dates;
  // it now asks "what has this folder grown into", and the file-date answer became the
  // supporting detail under it (owner, 2026-09-09).
  freshness: "growth",
};

/** The raw `searchParams.get("tab")` value (string | null) → a valid tab. Unknown or missing gives the default. */
export function parseInsightsTab(raw: string | null | undefined): InsightsTab {
  if (!raw) return DEFAULT_INSIGHTS_TAB;
  if (isInsightsTab(raw)) return raw;
  return LEGACY_TAB_ALIASES[raw] ?? DEFAULT_INSIGHTS_TAB;
}

/**
 * The pathname to navigate to when switching tabs — the default tab omits `?tab=` entirely, keeping
 * the URL clean. When changing only the query within the current document through native history,
 * the locale-prefixed current pathname is passed so the WebView URL and keyboard focus are both preserved.
 */
export function buildInsightsTabHref(
  tab: InsightsTab,
  pathname = "/ontology/insights/",
  /** The query the switch happens from. Defaults to the live one; passed in by tests. */
  currentSearch = typeof window === "undefined" ? "" : window.location.search,
): string {
  /*
   * ⚠️ **Switching tabs used to throw the rest of the address away.** This returned
   * `${pathname}?tab=${tab}`, replacing the whole query, so `?guides=off&tab=growth` became
   * `?tab=connections` on the next click and the guide suppression silently came back
   * (design-interaction, 2026-09-09). Every orthogonal flag on this route — the guide flag,
   * fixtures, anything a later view option adds — died the same way.
   *
   * `/architecture` already solved this and pins it; this is the same shape, so the two
   * boards cannot drift apart on what an address means.
   */
  const query = new URLSearchParams(currentSearch);
  query.delete("tab");
  if (tab !== DEFAULT_INSIGHTS_TAB) query.set("tab", tab);
  const search = query.toString();
  return search ? `${pathname}?${search}` : pathname;
}
