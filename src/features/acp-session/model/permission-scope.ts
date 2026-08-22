/**
 * **What "always allow" actually allows** — exactly as the adapter declared it.
 *
 * ## Why (2026-08-17)
 *
 * The permission card's third button **asserted** *"allow the entire folder containing the path above
 * for this whole conversation"*. But the adapter, not us, decides that scope. The adapter states it
 * through `_meta.permission.changes[].targets[]`, and measured, that value was **a tool, not a folder**:
 *
 * ```
 * { type: 'tool', toolName: 'mcp__atlas-vault__add_concept' }
 * ```
 *
 * Writing "allow the folder" while actually allowing a tool leaves the user believing **they granted
 * a permission they never gave, or the reverse.** That is the screen lying at this product's most
 * expensive decision.
 *
 * ## The rule
 *
 * **State only what the adapter declared.** The folder is not computed from the path and written down
 * by us — that would be guessing at the adapter's rules, and a wrong guess makes the card lie. Given
 * nothing, it asserts nothing.
 *
 * Mixed types is also "unknown". Forcing something that cannot be stated honestly in one sentence into
 * one sentence makes that sentence wrong about one of the two.
 */

export type PermissionScope =
  | { kind: 'tool'; names: string[] }
  | { kind: 'directory'; names: string[] }
  | { kind: 'unknown'; names: [] };

const UNKNOWN: PermissionScope = { kind: 'unknown', names: [] };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/**
 * @param options The `options` array of `session/request_permission`, verbatim.
 *   **Only the `_meta` of the "always allow" option is read** — reading another option's would
 *   describe the scope of a button that was not pressed.
 */
export function permissionScope(options: readonly unknown[]): PermissionScope {
  if (!Array.isArray(options)) return UNKNOWN;
  const always = options.find((o) => asRecord(o).kind === 'allow_always');
  if (!always) return UNKNOWN;

  const changes = asRecord(asRecord(asRecord(always)._meta).permission).changes;
  if (!Array.isArray(changes)) return UNKNOWN;

  const tools: string[] = [];
  const directories: string[] = [];
  let sawUnknownType = false;

  for (const change of changes) {
    const targets = asRecord(change).targets;
    if (!Array.isArray(targets)) continue;
    for (const target of targets) {
      const t = asRecord(target);
      if (t.type === 'tool' && typeof t.toolName === 'string' && t.toolName.trim()) {
        tools.push(t.toolName);
      } else if (t.type === 'directory' && typeof t.path === 'string' && t.path.trim()) {
        directories.push(t.path);
      } else {
        // Silently discarding an unknown type lets something else be allowed alongside while the card
        // says "only this one tool".
        sawUnknownType = true;
      }
    }
  }

  if (sawUnknownType) return UNKNOWN;
  if (tools.length > 0 && directories.length > 0) return UNKNOWN;
  if (tools.length > 0) return { kind: 'tool', names: tools };
  if (directories.length > 0) return { kind: 'directory', names: directories };
  return UNKNOWN;
}
