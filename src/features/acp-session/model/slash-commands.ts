/**
 * The **command list** invoked with `/` — the agent reports it during the session.
 *
 * ## Why (owner question, 2026-08-17)
 *
 * *"typing `/` here ought to offer something like Atlas-specific skills"* (typing `/` here
 * ought to offer something like Atlas-specific skills).
 *
 * It works. The adapter was already sending it and **we were not receiving it** — the list arrives
 * mid-session as `available_commands_update` (the adapter's `sendAvailableCommandsUpdate`). Until now
 * that line was silently discarded.
 *
 * ## Where "Atlas-specific" comes from
 *
 * This list is **what the agent found in that folder**. The vault folder is the working folder, so
 * skills placed inside the vault appear here directly. The path to making dedicated skills is
 * therefore already open, and this file is the side that makes them **visible on screen**.
 *
 * The rule against inventing a list stands: only what arrived is drawn. With nothing arriving, typing
 * `/` does nothing — we do not pretend a feature exists.
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
