/** The `/` command list from `available_commands_update`, i.e. what the agent found in the vault folder; only what arrived is drawn. */

export interface AcpSlashCommand {
  name: string;
  description: string;
}

const cleanString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/** A malformed entry is discarded silently: with no name there is nothing to type, and dropping the whole list for one odd entry would be worse. */
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

/** Only while the first character is `/` and there is no space yet; with arguments being typed the choosing stage has passed. */
export function slashQuery(draft: string): string | null {
  if (!draft.startsWith('/')) return null;
  const rest = draft.slice(1);
  if (/\s/u.test(rest)) return null;
  return rest;
}

export function matchSlashCommands(
  commands: readonly AcpSlashCommand[],
  query: string,
): AcpSlashCommand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...commands];
  return commands.filter((command) => command.name.toLowerCase().includes(needle));
}
