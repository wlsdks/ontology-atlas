import type {
  McpInstallLinkProblem,
  McpInstallLinkResult,
} from '@/shared/lib/connectors/mcp-install-link';

export type InstallLinkNotice =
  | { kind: 'dropped'; keys: string[] }
  | { kind: 'refused'; problem: McpInstallLinkProblem };

/**
 * What the person is told about an arriving install link: a refusal with its reason, or the
 * variable names whose values were dropped because a link never carries a secret. A clean link
 * says nothing.
 */
export function installLinkNotice(
  arrival: McpInstallLinkResult | null,
): InstallLinkNotice | null {
  if (!arrival) return null;
  if (!arrival.ok) return { kind: 'refused', problem: arrival.problem ?? 'config-unreadable' };
  return arrival.droppedValues.length > 0
    ? { kind: 'dropped', keys: arrival.droppedValues }
    : null;
}
