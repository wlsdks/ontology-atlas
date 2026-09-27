/**
 * One discovered row per server that actually runs. The same server is often registered in
 * several files; identity is the transport plus command line if any, else the URL, not the
 * invented name. The first spelling wins the row and every source becomes a chip.
 * One pass over a Map keyed by that identity: O(n × sources per group).
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
      server.transport === 'http' || server.command === null
        ? (server.url ?? '').trim()
        : [server.command, ...server.args].join(' ').trim();
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
 * A source id reduced to the tool a person recognises: `claude-user` and `claude-project` both
 * read "claude", rather than naming the file.
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
