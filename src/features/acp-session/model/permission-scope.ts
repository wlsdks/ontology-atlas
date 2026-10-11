/**
 * States only what the adapter declared in `_meta.permission.changes[].targets[]`, which is
 * a tool, not a folder. Never compute a folder from the path; mixed types are unknown.
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
