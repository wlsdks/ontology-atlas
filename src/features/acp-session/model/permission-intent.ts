/**
 * **What the agent is trying to do** — the one word the permission card shows.
 *
 * ## Why (measured 2026-08-17)
 *
 * The permission card shows the path large and in mono, but **whether it means to read, edit, or
 * delete was nowhere.** Reading `/etc/hosts` and editing it are entirely different decisions, and the
 * screen looked identical.
 *
 * The value was arriving — `toolKind` comes with the request, and that field's own comment says it is
 * *"the typed fact the screen picks its icon and colour from"*. The screen simply was not using it.
 * A shape this repository met several times in one day: **computed, with nobody reading it.**
 *
 * ## Unknown is stated as unknown
 *
 * The kind names differ per adapter and may not be sent at all. Guessing "read" then **errs toward the
 * most dangerous side** — a person allows it with confidence. Unknown is stated as unknown, and the
 * judgement is left to the path and the tool name. The same goes for `other`: the adapter failing to
 * classify is not the same statement as "read".
 */

export type PermissionIntent = 'read' | 'edit' | 'delete' | 'execute' | 'unknown';

/**
 * The adapter's word → our kind. Widening this table means confirming **the value that adapter
 * actually sends** before adding it — guessing makes something dangerous read as safe.
 */
const INTENT_BY_KIND: Readonly<Record<string, PermissionIntent>> = {
  read: 'read',
  fetch: 'read',
  search: 'read',
  edit: 'edit',
  write: 'edit',
  move: 'edit',
  delete: 'delete',
  execute: 'execute',
};

export function permissionIntent(toolKind: string | null | undefined): PermissionIntent {
  if (typeof toolKind !== 'string') return 'unknown';
  const key = toolKind.trim().toLowerCase();
  if (key.length === 0) return 'unknown';
  return INTENT_BY_KIND[key] ?? 'unknown';
}
