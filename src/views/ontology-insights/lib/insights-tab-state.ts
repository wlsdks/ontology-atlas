/**
 * `/ontology/insights` tab state. The URL `?tab=` is the source of truth — a refresh or a shared
 * link must open the same tab, so parsing and serialization are pure functions rather than
 * component-local state.
 *
 * There are five tabs, **one per question**: to do (the default) · composition · connections ·
 * boundaries · freshness. When one tab holds several questions, a user has to scroll past two
 * screens of unrelated material to answer their own — the former `structure` tab really did stack
 * "what exists / what is central / is the boundary healthy" into one column and grew to 2.2× the
 * viewport. One question per tab also removes any room for the scroll to grow long again.
 */
export const INSIGHTS_TABS = [
  "do-next",
  "composition",
  "connections",
  "boundaries",
  "freshness",
] as const;

export type InsightsTab = (typeof INSIGHTS_TABS)[number];

export const DEFAULT_INSIGHTS_TAB: InsightsTab = "do-next";

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
): string {
  return tab === DEFAULT_INSIGHTS_TAB ? pathname : `${pathname}?tab=${tab}`;
}
