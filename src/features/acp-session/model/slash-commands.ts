/**
 * The `/` command list the agent reports mid-session as `available_commands_update`, i.e.
 * what the agent found in the vault folder. Only what arrived is drawn; with nothing
 * arriving, `/` does nothing.
 */

export interface AcpSlashCommand {
  /** The name typed after `/`. */
  name: string;
  /** A one-line description, exactly as the adapter gave it. Empty string when absent. */
  description: string;
}

const cleanString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/**
 * Reads the command list out of one `available_commands_update`.
 *
 * A malformed entry is **discarded silently** — with no name there is nothing to type, and throwing
 * away the whole list because one entry is odd would be worse.
 */
export function readSlashCommands(update: unknown): AcpSlashCommand[] {
  const raw = (update as { availableCommands?: unknown } | null)?.availableCommands;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: AcpSlashCommand[] = [];
  for (const item of raw) {
    const name = cleanString((item as { name?: unknown } | null)?.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({
      name,
      description: cleanString((item as { description?: unknown } | null)?.description),
    });
  }
  return out;
}

/**
 * Is what is currently typed in the composer **choosing a command**, and if so, filtered by what?
 *
 * Only while the first character is `/` and there is no space yet — with arguments already being
 * typed (`/skill arg`), the choosing stage has passed.
 */
export function slashQuery(draft: string): string | null {
  if (!draft.startsWith('/')) return null;
  const rest = draft.slice(1);
  if (/\s/u.test(rest)) return null;
  return rest;
}

/** The commands matching this query. Everything when the query is empty. */
export function matchSlashCommands(
  commands: readonly AcpSlashCommand[],
  query: string,
): AcpSlashCommand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...commands];
  return commands.filter((command) => command.name.toLowerCase().includes(needle));
}
