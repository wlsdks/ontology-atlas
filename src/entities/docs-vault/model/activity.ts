export type DeveloperActivitySource = 'mcp' | 'api' | 'github';

export type DeveloperActivityKind =
  | 'doc.created'
  | 'doc.updated'
  | 'doc.linked'
  | 'github.push'
  | 'github.pull_request'
  | 'github.issue';

export interface DeveloperActivityEvent {
  id: string;
  source: DeveloperActivitySource;
  kind: DeveloperActivityKind;
  title: string;
  createdAt: string;
  summary?: string;
  actor?: string;
  docSlug?: string;
  projectSlug?: string;
  targetSlugs?: string[];
  repository?: string;
  branch?: string;
  href?: string;
  unread?: boolean;
}

export interface DeveloperActivityInput {
  id?: string;
  source: DeveloperActivitySource;
  kind: DeveloperActivityKind;
  title: string;
  createdAt?: string;
  summary?: string;
  actor?: string;
  docSlug?: string;
  projectSlug?: string;
  targetSlugs?: string[];
  repository?: string;
  branch?: string;
  href?: string;
  unread?: boolean;
}

export function normalizeDeveloperActivityEvent(
  input: DeveloperActivityInput,
): DeveloperActivityEvent | null {
  if (!input.title.trim()) return null;
  return {
    id: input.id?.trim() || createActivityId(input),
    source: input.source,
    kind: input.kind,
    title: input.title.trim(),
    createdAt: input.createdAt || new Date().toISOString(),
    summary: cleanOptional(input.summary),
    actor: cleanOptional(input.actor),
    docSlug: cleanOptional(input.docSlug),
    projectSlug: cleanOptional(input.projectSlug),
    targetSlugs: cleanStringList(input.targetSlugs),
    repository: cleanOptional(input.repository),
    branch: cleanOptional(input.branch),
    href: cleanOptional(input.href),
    unread: input.unread ?? true,
  };
}

export function getDeveloperActivityTargetSlugs(
  event: DeveloperActivityEvent,
): string[] {
  const out = new Set<string>();
  for (const slug of event.targetSlugs ?? []) {
    out.add(slug);
  }
  if (event.docSlug) out.add(event.docSlug);
  if (event.projectSlug) {
    out.add(event.projectSlug);
    out.add(`projects/${event.projectSlug.replace(/^projects\//, '')}`);
  }
  return [...out];
}

function cleanOptional(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function cleanStringList(values?: string[]): string[] | undefined {
  const cleaned = values
    ?.map((value) => value.trim())
    .filter((value, index, list) => value && list.indexOf(value) === index);
  return cleaned && cleaned.length > 0 ? cleaned : undefined;
}

function createActivityId(input: DeveloperActivityInput): string {
  const target = input.docSlug || input.projectSlug || input.repository || 'event';
  return `${input.source}:${input.kind}:${target}:${Date.now()}`;
}
