import {
  buildDomainMarkdown,
  buildProjectMarkdown,
  domainDocSlug,
  selectedElements,
  type BootstrapPlan,
} from './bootstrap-candidates';
import { generateNodeUid } from '@/entities/docs-vault';

/**
 * Writes the approved part of a bootstrap plan into the vault.
 * - every write uses skipRefresh and one refresh() runs at the end, so the result lands even when
 *   the last write is a no-op
 * - elements: frontmatter only, the body is untouched
 * - domains: a real `.md`, skipped when a domain document of the same path or name exists
 * - project: an existing `kind: project` receives the approved domains instead of a second file
 */

/**
 * The subset of use-local-vault a test fake can satisfy. Method shorthand lets use-local-vault's
 * wider `FrontmatterUpdateValue` signature assign directly.
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
  /** Branches the toast. */
  addedToExisting: boolean;
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
