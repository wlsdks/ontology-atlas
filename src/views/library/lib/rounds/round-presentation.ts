export function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/**
 * The derived name a new round can carry without colliding with one already in the index:
 * the name itself, then "<name> 2", "<name> 3", and so on. The person may still type any name
 * they like — this only decides what the field offers.
 */
export function unusedRoundName(base: string, existing: readonly string[]): string {
  const taken = new Set(existing.map((name) => name.trim()));
  const trimmed = base.trim();
  if (!taken.has(trimmed)) return base;
  let ordinal = 2;
  while (taken.has(`${trimmed} ${ordinal}`)) ordinal += 1;
  return `${trimmed} ${ordinal}`;
}

/**
 * Which example the "what to look for" field offers, by the connector's own name.
 *
 * A Slack row asking for "pages changed in the last day in space ENG" teaches the person the
 * wrong shape of question for the service in front of them: Slack has channels and posts, not
 * spaces and pages. The match is on the name the person attached the connector under, which is
 * the only thing Atlas knows about it; anything it does not recognise gets a neutral example
 * rather than a guess dressed as one.
 */
export type ServiceExample = "Slack" | "Notion" | "Confluence" | "Jira" | "Generic";

export function serviceExample(connectorName: string): ServiceExample {
  const name = connectorName.toLowerCase();
  if (name.includes("slack")) return "Slack";
  if (name.includes("notion")) return "Notion";
  if (name.includes("confluence") || name.includes("atlassian-wiki")) return "Confluence";
  if (name.includes("jira")) return "Jira";
  return "Generic";
}
