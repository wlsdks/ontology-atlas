/**
 * The one word the permission card shows for what the agent is trying to do. Unknown stays
 * unknown: guessing "read" errs toward the dangerous side, and `other` is not "read".
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
