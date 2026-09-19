/**
 * `/ontology/insights` tab state. The URL `?tab=` is the source of truth — a refresh or a shared
 * link must open the same tab, so parsing and serialization are pure functions rather than
 * component-local state.
 *
 * There are eight tabs, **one per question**: brief (the default) · to do · unmatched · composition ·
 * connections · boundaries · growth · flow. Flow is the only one whose answer is written by an agent rather
 * than computed from the graph: its question is "what is this product and how does it move", and
 * that is prose a person reads once on first contact, not a measurement. When one tab holds several questions, a user has to scroll past two
 * screens of unrelated material to answer their own — the former `structure` tab really did stack
 * "what exists / what is central / is the boundary healthy" into one column and grew to 2.2× the
 * viewport. One question per tab also removes any room for the scroll to grow long again.
 */
/*
 * `unmatched` is the second work question and sits deliberately beside the first: what did
 * an agent ask this folder for that it does not hold. A count of names nothing answers to
 * is repair work, not inventory, so it reads next to the repair queue rather than after
 * the measurement tabs. The literal below is pinned character for character by
 * `scripts/check-ontology-design-surface.mjs`, so nothing may be written inside it.
 */
export const INSIGHTS_TABS = [
  "brief",
  "do-next",
  "unmatched",
  "composition",
  "connections",
  "boundaries",
  "growth",
  "flow",
] as const;

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
