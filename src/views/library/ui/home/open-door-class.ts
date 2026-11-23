import { SEGMENTED_SELECTED_SURFACE } from "@/shared/ui";

/**
 * A header door whose surface is open wears the current tab's raised surface, so the doors and the
 * Library's tab strip say "selected" one way. The inset ring draws the edge in place of the border.
 */
export const OPEN_DOOR_CLASS = `${SEGMENTED_SELECTED_SURFACE} border-transparent text-[color:var(--color-text-primary)] hover:border-transparent hover:bg-[color:var(--color-elevated)]`;
