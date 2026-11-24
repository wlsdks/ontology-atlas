import registry from '@/src-tauri/src/acp-registry.json';
import { agentDisplayName } from '@/shared/lib/agent-activity/agent-display-name';

/**
 * The name a person knows an agent by: the label it reported, the bundled agent list's name for
 * its id, then a known product name. Null for an id nothing names, which a caller words as
 * "Your agent", so a raw id never reaches the screen.
 */
export function agentProductName(id: string | null | undefined, label?: string | null): string | null {
  const reported = label?.trim();
  if (reported) return reported;
  const trimmed = id?.trim();
  if (!trimmed) return null;
  const listed = registry.agents.find((agent) => agent.id === trimmed)?.name;
  if (listed) return listed;
  const known = agentDisplayName(trimmed);
  return known !== trimmed ? known : null;
}
