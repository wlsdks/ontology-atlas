import type { ScreenContextSnapshot } from './types';

/**
 * Screen context injection — this agent's biggest advantage.
 *
 * An MCP agent has no eyes on the screen. When the user says "fix this definition",
 * it does not know what "this" is. The app agent injects what is currently being
 * viewed **from the system side** on every turn, so the model never has to call for
 * it and it is always fresh.
 *
 * Map state arrives as a prop from the widget. A feature importing a widget would
 * violate the FSD direction.
 */

export const EMPTY_SCREEN_CONTEXT: ScreenContextSnapshot = {
  focusedSlug: null,
  focusedTitle: null,
  focusedKind: null,
  lenses: [],
  projectTitle: null,
  visibleNodeCount: 0,
  recentChanges: [],
};

/**
 * The caps on the recent-changes block — both the line count and the line length.
 * This block is carried on every round trip (the user's cost = BYOK billing), so the
 * path by which longer commit messages quietly inflate it is blocked here.
 */
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
  // Continuity between sessions — the conversation disappears but the vault and git
  // remain. When absent the line is omitted entirely: sending an empty list makes the
  // model read "no recent changes" as fact, when in reality this may not be a git folder.
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
