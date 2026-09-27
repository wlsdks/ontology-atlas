/**
 * The one batch repair on this board: give a domain back the members that already name it. `computeVaultHealth`
 * flags a capability or element whose `domain: X` is not listed back by X; both facts are on disk, so the value
 * to append is fully determined. Other findings need a person's sentence or judgement, so no button fills them.
 * One frontmatter key (`capabilities` or `elements`) on the domain document gets its members plus the missing
 * slugs appended; `applyFrontmatterUpdates` keeps every other key and the body. Members of one domain become one
 * write, or the second write to a file fails its own `expected_mtime` guard. The target, members and mtime are
 * frozen at open (`buildContainmentPlan`), which is the whole conflict guard: read at Apply, a changed file's
 * mtime would pass against itself. At Apply (`selectContainmentWrites`) the concept must still name the domain,
 * or the back-link states a containment nobody approved.
 */

/** The subset of a vault document this plan reads. `VaultDoc` satisfies it. */
export interface ContainmentPlanDoc {
  slug: string;
  /** Shown on the row, since several documents may share a title. */
  path?: string;
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
  /** `path` when the manifest has one, else the slug; shown on the row since titles may repeat. */
  domainPath: string;
  /** Which frontmatter key on the domain document gains the concept. */
  key: "capabilities" | "elements";
}

/** One document the plan may write, as it stood when the sheet opened; built only here. */
interface ContainmentPlanTarget {
  domainSlug: string;
  domainPath: string;
  key: "capabilities" | "elements";
  /** The members the document already listed at open. New slugs are appended to these. */
  baseMembers: string[];
  /** `file.lastModified` at open, or null when the document carried none. */
  expectedMtime: number | null;
  /** Every proposal that would land in this one write, ticked or not. */
  proposalIds: string[];
}

/** Rows and documents read when the sheet opened; nothing is recomputed while it is open. */
export interface ContainmentPlan {
  proposals: readonly ContainmentProposal[];
  targets: readonly ContainmentPlanTarget[];
}

/** One file write, after the accepted proposals are grouped by the document they touch. */
export interface ContainmentWrite {
  domainSlug: string;
  domainPath: string;
  key: "capabilities" | "elements";
  /** The complete next value for that key — existing members first, new ones appended. */
  members: string[];
  /** `file.lastModified` read at open. Never null: an unknown mtime becomes a skip, since an unguarded write is never made. */
  expectedMtime: number;
  /** The proposals this one write satisfies, so a failure can be reported on each of their rows. */
  proposalIds: string[];
}

/** Why a ticked row is not attempted at all. Each reason is stated on the row in plain words. */
type ContainmentSkipReason =
  /** The app cannot tell when this file last changed, so no write can be guarded against it. */
  | "unknown-mtime"
  /** The concept no longer names this domain — the fact that justified the proposal is gone. */
  | "domain-changed";

/** One group of rows that is not attempted, and why. */
export interface ContainmentSkip {
  domainSlug: string;
  domainPath: string;
  reason: ContainmentSkipReason;
  proposalIds: string[];
}

/** What Apply will do: these writes, and these rows left alone with a reason. */
export interface ContainmentRun {
  writes: ContainmentWrite[];
  skipped: ContainmentSkip[];
}

/**
 * `conflict` means the file changed since open and `expected_mtime` refused the write (the guard
 * working); `skipped` carries the reason it was never attempted; `failed` carries the thrown message.
 */
export type ContainmentRowStatus =
  | { phase: "pending" }
  | { phase: "running" }
  | { phase: "done" }
  | { phase: "conflict" }
  | { phase: "skipped"; message: string }
  | { phase: "failed"; message: string };

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

function kindOf(doc: ContainmentPlanDoc | undefined): string | null {
  const kind = doc?.frontmatter?.kind;
  return typeof kind === "string" ? kind : null;
}

/**
 * Turns the health verdict's missing-containment targets into proposals. A target is dropped, never repaired, when
 * the concept or domain document is missing, the concept is neither capability nor element, or the domain already
 * lists it (verdict and manifest disagree, so the safe answer is to write nothing).
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
      domainPath: documentPath(domain),
      key,
    });
  }
  return proposals;
}

/** Where a person finds the file: its vault path when the manifest has one, else its slug. */
function documentPath(doc: ContainmentPlanDoc): string {
  return doc.path && doc.path.trim() ? doc.path : doc.slug;
}

/**
 * Whether this reference still names the domain, by the three names `computeVaultHealth` resolves (slug, its last
 * segment, frontmatter `slug:`). Anything else counts as changed: a skipped row, never an unapproved write.
 */
function namesDomain(reference: unknown, domain: ContainmentPlanDoc): boolean {
  if (typeof reference !== "string") return false;
  const ref = reference.trim();
  if (!ref) return false;
  if (ref === domain.slug) return true;
  const tail = domain.slug.split("/").pop();
  if (tail && ref === tail) return true;
  const declared = domain.frontmatter?.slug;
  return typeof declared === "string" && ref === declared.trim();
}

/**
 * Reads the documents once, when the sheet opens: one target per (document, key), with members and mtime as they
 * are now. Ticking afterwards changes nothing here, which keeps the mtime a valid baseline.
 */
export function buildContainmentPlan(
  proposals: readonly ContainmentProposal[],
  docs: readonly ContainmentPlanDoc[],
): ContainmentPlan {
  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  const targets = new Map<string, ContainmentPlanTarget>();
  const planned: ContainmentProposal[] = [];
  for (const proposal of proposals) {
    const domain = bySlug.get(proposal.domainSlug);
    if (!domain) continue;
    planned.push(proposal);
    const targetKey = `${proposal.domainSlug}::${proposal.key}`;
    let target = targets.get(targetKey);
    if (!target) {
      target = {
        domainSlug: proposal.domainSlug,
        domainPath: documentPath(domain),
        key: proposal.key,
        baseMembers: stringArray(domain.frontmatter[proposal.key]),
        expectedMtime: typeof domain.mtime === "number" ? domain.mtime : null,
        proposalIds: [],
      };
      targets.set(targetKey, target);
    }
    target.proposalIds.push(proposal.id);
  }
  return { proposals: planned, targets: [...targets.values()] };
}

/**
 * Decides what Apply may still do. An unknown mtime or a concept that no longer names the domain becomes a skip
 * with a reason; the run continues over the other, independent files. Members and mtime come from the
 * plan; `docs` are the current ones.
 */
export function selectContainmentWrites(
  plan: ContainmentPlan,
  accepted: ReadonlySet<string>,
  docs: readonly ContainmentPlanDoc[],
): ContainmentRun {
  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  const proposalById = new Map(plan.proposals.map((proposal) => [proposal.id, proposal]));
  const writes: ContainmentWrite[] = [];
  const skipped: ContainmentSkip[] = [];

  for (const target of plan.targets) {
    const ticked = target.proposalIds.filter((id) => accepted.has(id));
    if (ticked.length === 0) continue;

    const justified: ContainmentProposal[] = [];
    const contradicted: string[] = [];
    for (const id of ticked) {
      const proposal = proposalById.get(id);
      if (!proposal) continue;
      const concept = bySlug.get(proposal.conceptSlug);
      const domain = bySlug.get(proposal.domainSlug);
      if (concept && domain && namesDomain(concept.frontmatter?.domain, domain)) {
        justified.push(proposal);
      } else {
        contradicted.push(id);
      }
    }
    if (contradicted.length > 0) {
      skipped.push({
        domainSlug: target.domainSlug,
        domainPath: target.domainPath,
        reason: "domain-changed",
        proposalIds: contradicted,
      });
    }
    if (justified.length === 0) continue;

    if (target.expectedMtime === null) {
      skipped.push({
        domainSlug: target.domainSlug,
        domainPath: target.domainPath,
        reason: "unknown-mtime",
        proposalIds: justified.map((proposal) => proposal.id),
      });
      continue;
    }

    const members = [...target.baseMembers];
    for (const proposal of justified) {
      if (!members.includes(proposal.conceptSlug)) members.push(proposal.conceptSlug);
    }
    writes.push({
      domainSlug: target.domainSlug,
      domainPath: target.domainPath,
      key: target.key,
      members,
      expectedMtime: target.expectedMtime,
      proposalIds: justified.map((proposal) => proposal.id),
    });
  }
  return { writes, skipped };
}

/**
 * Runs one document at a time, reporting each row. A refusal does not stop the run, since the documents are
 * independent; a `VaultConflictError` is reported as the guard working, not an unexplained failure.
 */
export async function runContainmentBatch(
  run: ContainmentRun,
  io: {
    write: (write: ContainmentWrite) => Promise<void>;
    /** The sentence a person reads on a row that was never attempted. */
    skipMessage: (skip: ContainmentSkip) => string;
    onStatuses: (statuses: ReadonlyMap<string, ContainmentRowStatus>) => void;
  },
): Promise<void> {
  const statuses = new Map<string, ContainmentRowStatus>();
  const mark = (ids: readonly string[], status: ContainmentRowStatus) => {
    for (const id of ids) statuses.set(id, status);
    io.onStatuses(new Map(statuses));
  };

  for (const skip of run.skipped) {
    mark(skip.proposalIds, { phase: "skipped", message: io.skipMessage(skip) });
  }
  for (const write of run.writes) {
    mark(write.proposalIds, { phase: "running" });
    try {
      await io.write(write);
      mark(write.proposalIds, { phase: "done" });
    } catch (error) {
      if (error instanceof Error && error.name === "VaultConflictError") {
        mark(write.proposalIds, { phase: "conflict" });
      } else {
        mark(write.proposalIds, {
          phase: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
