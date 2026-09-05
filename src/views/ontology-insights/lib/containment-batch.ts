/**
 * **The one batch this board offers: give a domain back the members it already claims.**
 *
 * ## Why this repair, and only this one
 *
 * `computeVaultHealth` reports a missing containment when a capability or element declares
 * `domain: X` **and X does not list it back** (`missingDomainContainment`). Both halves are
 * already written by a person: the concept named its domain, and the domain exists. Nothing is
 * inferred, guessed, or ranked — the repair is to append one slug to one array on one document,
 * and the value to append is fully determined by the two facts on disk.
 *
 * That is the whole reason a batch is offered here and nowhere else on this board. A missing
 * definition needs a sentence only a person can write; a duplicate pair needs a judgement about
 * whether two names mean one thing; an island needs a relation nobody has decided yet. Those have
 * no correct value to fill in, so no button may fill them.
 *
 * ## What is written
 *
 * One frontmatter key on the **domain** document — `capabilities` for a capability member,
 * `elements` for an element — set to its current members plus the missing ones, in the order the
 * file already had them, with the new slugs appended. Every other key, the body, and key order are
 * preserved by `applyFrontmatterUpdates`; a block-style list is rewritten as an inline list, which
 * is that function's standing behaviour and visible in the git diff like any other edit.
 *
 * Several missing members of one domain become **one write to that file**, because two writes to
 * one file in one run would make the second fail its own `expected_mtime` guard.
 */

/** The subset of a vault document this plan reads. `VaultDoc` satisfies it. */
export interface ContainmentPlanDoc {
  slug: string;
  title: string;
  frontmatter: Record<string, unknown>;
  mtime?: number;
}

/** One proposed change, as a person reads it: this concept, into that domain's list. */
export interface ContainmentProposal {
  /** Stable row identity — the concept is proposed at most once. */
  id: string;
  conceptSlug: string;
  conceptTitle: string;
  domainSlug: string;
  domainTitle: string;
  /** Which frontmatter key on the domain document gains the concept. */
  key: "capabilities" | "elements";
}

/** One file write, after the accepted proposals are grouped by the document they touch. */
export interface ContainmentWrite {
  domainSlug: string;
  key: "capabilities" | "elements";
  /** The complete next value for that key — existing members first, new ones appended. */
  members: string[];
  /** `file.lastModified` at plan time, or null when unknown (static mode has no mtime). */
  expectedMtime: number | null;
  /** The proposals this one write satisfies, so a failure can be reported on each of their rows. */
  proposalIds: string[];
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

function kindOf(doc: ContainmentPlanDoc | undefined): string | null {
  const kind = doc?.frontmatter?.kind;
  return typeof kind === "string" ? kind : null;
}

/**
 * Turns the health verdict's missing-containment targets into proposals a person can read and
 * tick. A target is dropped — never silently repaired — when the concept or the domain document
 * is not in this manifest, when the concept is neither a capability nor an element, or when the
 * domain already lists it (which means the verdict and the manifest disagree and the safe answer
 * is to write nothing).
 */
export function buildContainmentProposals(
  targets: ReadonlyArray<{ slug: string; domain: string }>,
  docs: readonly ContainmentPlanDoc[],
): ContainmentProposal[] {
  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  const proposals: ContainmentProposal[] = [];
  const seen = new Set<string>();
  for (const target of targets) {
    if (seen.has(target.slug)) continue;
    const concept = bySlug.get(target.slug);
    const domain = bySlug.get(target.domain);
    if (!concept || !domain) continue;
    const conceptKind = kindOf(concept);
    if (conceptKind !== "capability" && conceptKind !== "element") continue;
    if (kindOf(domain) !== "domain") continue;
    const key = conceptKind === "capability" ? "capabilities" : "elements";
    const already =
      stringArray(domain.frontmatter[key]).includes(target.slug) ||
      stringArray(domain.frontmatter.contains).includes(target.slug);
    if (already) continue;
    seen.add(target.slug);
    proposals.push({
      id: `${target.domain}::${target.slug}`,
      conceptSlug: target.slug,
      conceptTitle: concept.title || target.slug,
      domainSlug: target.domain,
      domainTitle: domain.title || target.domain,
      key,
    });
  }
  return proposals;
}

/**
 * Groups the accepted proposals into one write per (document, key). The order of writes follows
 * the order of the proposals, so the review sheet and the run report the same sequence.
 */
export function planContainmentWrites(
  proposals: readonly ContainmentProposal[],
  accepted: ReadonlySet<string>,
  docs: readonly ContainmentPlanDoc[],
): ContainmentWrite[] {
  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  const writes = new Map<string, ContainmentWrite>();
  for (const proposal of proposals) {
    if (!accepted.has(proposal.id)) continue;
    const domain = bySlug.get(proposal.domainSlug);
    if (!domain) continue;
    const writeKey = `${proposal.domainSlug}::${proposal.key}`;
    let write = writes.get(writeKey);
    if (!write) {
      write = {
        domainSlug: proposal.domainSlug,
        key: proposal.key,
        members: stringArray(domain.frontmatter[proposal.key]),
        expectedMtime: typeof domain.mtime === "number" ? domain.mtime : null,
        proposalIds: [],
      };
      writes.set(writeKey, write);
    }
    if (!write.members.includes(proposal.conceptSlug)) write.members.push(proposal.conceptSlug);
    write.proposalIds.push(proposal.id);
  }
  return [...writes.values()];
}
