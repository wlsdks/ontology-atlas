/**
 * The project detail tab contract.
 *
 * **Why tabs.** The detail page was a single scroll dump — hero → domain composition → **the whole
 * project.md** (thousands of px in the dogfood vault) → connections/handoff → footer. Owner:
 * *"스크롤로 모든거 보여주려 안해도 되니까?"* (you don't have to show everything by scrolling).
 *
 * Tabs split by **the question they answer**, not by "kind of information":
 *
 * - `overview` — **what is** this project (the project.md body)
 * - `composition` — **what is it made of** (the mini map plus domain composition)
 *
 * **Why the URL.** This app keeps session state in the URL (`?p=`, `?realm=`, `?open=`, `?recent=`).
 * Two reasons: it is **shareable** and **an agent can read and reproduce it**. Left as hidden state, the
 * handoff packet loses "which tab they were on".
 *
 * The default tab **omits** the parameter — `?tab=overview` is noise that need not be there, and a
 * shorter share link is easier to paste.
 */

export const PROJECT_DETAIL_TABS = ["overview", "composition"] as const;

export type ProjectDetailTab = (typeof PROJECT_DETAIL_TABS)[number];

export const DEFAULT_PROJECT_DETAIL_TAB: ProjectDetailTab = "overview";

/**
 * Interprets `?tab=` as a tab. An unknown or absent value is the default tab — **not an error.** A stale
 * link or a typo must not block the screen (a share link gets edited in other people's hands).
 */
export function parseProjectDetailTab(raw: string | null | undefined): ProjectDetailTab {
  if (!raw) return DEFAULT_PROJECT_DETAIL_TAB;
  const found = PROJECT_DETAIL_TABS.find((tab) => tab === raw);
  return found ?? DEFAULT_PROJECT_DETAIL_TAB;
}

/**
 * Serializes a tab into a URL query. The default tab returns `null` and the caller drops the parameter.
 * Deciding "do not write defaults into the URL" in one place keeps it from varying per screen.
 */
export function serializeProjectDetailTab(tab: ProjectDetailTab): string | null {
  return tab === DEFAULT_PROJECT_DETAIL_TAB ? null : tab;
}

/**
 * Whether the composition tab can be shown.
 *
 * With zero domains the **tab is still not hidden** — a tab set that shifts per project breaks spatial
 * memory (you press the same place and get something else). Instead the tab holds an empty state and a
 * "connect your first domain" prompt. This function only decides whether to attach a **count badge** —
 * drawing 0 as a badge would emphasize the absence, so it is omitted.
 */
export function compositionTabCount(domainCount: number): number | undefined {
  return domainCount > 0 ? domainCount : undefined;
}
