/**
 * **One discovered row per thing that actually runs.**
 *
 * The same server is normally registered in several places at once — anyone who set up two coding
 * tools has byte-identical entries in `~/.claude.json` and `~/.codex/config.toml` — and the first
 * list drew one row per file. That is the same command offered two or three times, and choosing
 * between identical rows teaches a person nothing.
 *
 * **What makes two entries the same thing** is the transport plus the command and its arguments,
 * or the URL. Not the name: somebody who wrote `notion` in one file and `notion-mcp` in another
 * still registered one server, and the name is the part they were free to invent. The first
 * spelling seen wins the row, and every file it appeared in becomes a chip.
 *
 * Lifted out of `ConnectorsPanel.tsx` on 2026-09-07 when the add dialog became its own file:
 * both need this and a feature file importing a sibling's UI module for two pure functions is
 * how a 1,600-line component starts.
 */
import type { DiscoveredConnector } from '@/shared/lib/tauri-connectors';

export interface DiscoveredGroup {
  key: string;
  server: DiscoveredConnector;
  /** Every source id the identical entry appeared in, in the order discovery reported them. */
  sources: string[];
}

export function groupDiscovered(servers: readonly DiscoveredConnector[]): DiscoveredGroup[] {
  const groups = new Map<string, DiscoveredGroup>();
  for (const server of servers) {
    const runs =
      server.transport === 'http'
        ? (server.url ?? '').trim()
        : [server.command ?? '', ...server.args].join(' ').trim();
    const key = `${server.transport} ${runs}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { key, server, sources: [server.source] });
      continue;
    }
    if (!existing.sources.includes(server.source)) existing.sources.push(server.source);
  }
  return [...groups.values()];
}

/**
 * A source id, reduced to the one word a person recognises. `claude-user` and `claude-project` are
 * the same tool asked twice, so both read "claude"; naming the file instead would put
 * `~/.claude.json` on a chip, which says where the entry lives rather than which tool put it
 * there.
 */
export function shortSourceKey(
  source: string,
): 'claude' | 'codex' | 'cursor' | 'folder' | 'other' {
  if (source.startsWith('claude')) return 'claude';
  if (source.startsWith('codex')) return 'codex';
  if (source.startsWith('cursor')) return 'cursor';
  if (source.startsWith('vault')) return 'folder';
  return 'other';
}
