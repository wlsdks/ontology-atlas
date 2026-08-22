import {
  buildDomainMarkdown,
  buildProjectMarkdown,
  domainDocSlug,
  selectedElements,
  type BootstrapPlan,
} from './bootstrap-candidates';
import { generateNodeUid } from '@/entities/docs-vault';

/**
 * Orchestrates writing the approved part of a bootstrap ("start an ontology from my documents") into
 * the vault.
 *
 * Contracts (every one has a regression history; the tests pin them):
 * - every write uses skipRefresh, with exactly one refresh() at the end (batched, so the result lands
 *   even when the last write is a no-op)
 * - elements: frontmatter is added only (the body is untouched)
 * - domains: a real `.md` is created, skipped when a domain document of the same path or name exists
 * - project: with an existing `kind: project`, the approved domains are merged into that document's
 *   `domains` instead of creating a second file
 */

/**
 * The minimal contract of the vault write surface — a subset of what use-local-vault returns, so a
 * fake can satisfy it in tests. Written in method shorthand so use-local-vault's wider
 * `FrontmatterUpdateValue` signature assigns directly.
 */
export interface BootstrapVaultWriter {
  manifest: {
    docs: ReadonlyArray<{ slug: string; frontmatter: Record<string, unknown> }>;
  } | null;
  updateFrontmatter(
    slug: string,
    updates: Record<string, string | string[]>,
    opts?: { skipRefresh?: boolean },
  ): Promise<void>;
  createDoc(slug: string, content: string, opts?: { skipRefresh?: boolean }): Promise<void>;
  refresh(): Promise<void>;
}

export interface ExecuteBootstrapResult {
  /** Whether it was appended to an existing project (used to branch the toast). */
  addedToExisting: boolean;
  /** How many elements were promoted. */
  elementCount: number;
}

export async function executeBootstrapPlan(
  vault: BootstrapVaultWriter,
  basePlan: BootstrapPlan,
  input: { projectTitle: string; acceptedDomains: ReadonlySet<string> },
): Promise<ExecuteBootstrapResult | null> {
  if (!vault.manifest) return null;
  const plan = { ...basePlan, projectTitle: input.projectTitle };
  const elements = selectedElements(plan, input.acceptedDomains);

  for (const el of elements) {
    const existing = vault.manifest.docs.find((doc) => doc.slug === el.slug);
    const uid = generateNodeUid(
      existing?.frontmatter.uid === undefined || existing.frontmatter.uid === null || existing.frontmatter.uid === ''
        ? undefined
        : String(existing.frontmatter.uid),
    );
    await vault.updateFrontmatter(
      el.slug,
      el.domain
        ? { uid, kind: 'element', title: el.title, domain: el.domain }
        : { uid, kind: 'element', title: el.title },
      { skipRefresh: true },
    );
  }

  const acceptedDomainCandidates = plan.domains.filter((d) => input.acceptedDomains.has(d.name));
  for (const domain of acceptedDomainCandidates) {
    const slug = domainDocSlug(domain.name);
    const tail = slug.split('/').pop();
    const taken =
      vault.manifest.docs.some((d) => d.slug === slug) ||
      vault.manifest.docs.some(
        (d) => d.frontmatter.kind === 'domain' && d.slug.split('/').pop() === tail,
      );
    if (!taken) await vault.createDoc(slug, buildDomainMarkdown(domain), { skipRefresh: true });
  }

  if (plan.existingProjectSlug) {
    const existing = vault.manifest.docs.find((d) => d.slug === plan.existingProjectSlug);
    const prevDomains = Array.isArray(existing?.frontmatter.domains)
      ? (existing.frontmatter.domains as string[])
      : [];
    const accepted = acceptedDomainCandidates.map((d) => d.name);
    const mergedDomains = [...new Set([...prevDomains, ...accepted])];
    const uid = generateNodeUid(
      existing?.frontmatter.uid === undefined || existing.frontmatter.uid === null || existing.frontmatter.uid === ''
        ? undefined
        : String(existing.frontmatter.uid),
    );
    await vault.updateFrontmatter(
      plan.existingProjectSlug,
      { uid, domains: mergedDomains },
      { skipRefresh: true },
    );
  } else {
    await vault.createDoc(plan.projectSlug, buildProjectMarkdown(plan, input.acceptedDomains), {
      skipRefresh: true,
    });
  }

  await vault.refresh();
  return { addedToExisting: plan.existingProjectSlug !== null, elementCount: elements.length };
}
