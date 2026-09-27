import type { ScreenContextSnapshot } from './types';

/** What the screen shows, injected every turn; map state arrives as a prop to respect FSD direction. */

export const EMPTY_SCREEN_CONTEXT: ScreenContextSnapshot = {
  focusedSlug: null,
  focusedTitle: null,
  focusedKind: null,
  lenses: [],
  projectTitle: null,
  visibleNodeCount: 0,
  recentChanges: [],
};

/** Caps on the recent-changes block, which rides every round trip. */
export const RECENT_CHANGES_LINE_CAP = 5;
export const RECENT_CHANGES_CHAR_CAP = 120;

/** The structured block sent to the model. It states the same facts as the echo in the user's bubble. */
export function formatScreenContextBlock(snapshot: ScreenContextSnapshot): string {
  const lines: string[] = [];
  if (snapshot.focusedSlug) {
    lines.push(
      `looking_at: ${snapshot.focusedSlug}${snapshot.focusedTitle ? ` (${snapshot.focusedTitle})` : ''}${snapshot.focusedKind ? ` · kind=${snapshot.focusedKind}` : ''}`,
    );
  } else {
    lines.push('looking_at: (no concept selected — the whole map is in view)');
  }
  if (snapshot.projectTitle) lines.push(`project_scope: ${snapshot.projectTitle}`);
  if (snapshot.lenses.length > 0) lines.push(`active_lenses: ${snapshot.lenses.join(', ')}`);
  lines.push(`concepts_on_screen: ${snapshot.visibleNodeCount}`);
  // Omitted when absent: an empty list would read as "no recent changes" outside git.
  const recent = (snapshot.recentChanges ?? [])
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, RECENT_CHANGES_LINE_CAP)
    .map((entry) =>
      entry.length > RECENT_CHANGES_CHAR_CAP
        ? `${entry.slice(0, RECENT_CHANGES_CHAR_CAP - 1)}…`
        : entry,
    );
  if (recent.length > 0) {
    lines.push('recent_changes_in_this_folder (newest first, from git history):');
    for (const entry of recent) lines.push(`  - ${entry}`);
  }
  return `<screen_context>\n${lines.join('\n')}\n</screen_context>`;
}
