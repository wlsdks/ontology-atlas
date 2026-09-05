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
 *
 * ## When each fact is read, and why that is the whole guarantee
 *
 * The sheet promises two things a person cannot check themselves: *a write never lands on a file
 * that changed since the proposal*, and *only the named files are written*. Both depend on **when**
 * each fact is read, so the split is deliberate and structural:
 *
 * - **At open** (`buildContainmentPlan`): the target document, the members it already lists, and
 *   its `mtime`. Freezing the mtime here is the entire conflict guard. Reading it at Apply would
 *   capture the mtime of a file that had *already* been changed and re-read in between, so the
 *   guard would compare a stale baseline against itself and pass — the write the sheet promised to
 *   refuse. A document whose mtime is unknown is refused rather than written unguarded.
 * - **At Apply** (`selectContainmentWrites`): whether the concept *still* names this domain. That
 *   is the fact that justified the proposal; if a person or an agent changed `domain:` while the
 *   sheet was open, writing the back-link would state a containment nobody approved.
 */

/** The subset of a vault document this plan reads. `VaultDoc` satisfies it. */
export interface ContainmentPlanDoc {
  slug: string;
  /**
   * The document's path in the vault, when the manifest carries one. Shown on the row: the
   * dogfood folder holds several documents with the same title, so a title alone does not say
   * which file a write lands in.
   */
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
  /**
   * Where the changed file sits in the vault — `path` when the manifest has one, the slug
   * otherwise. The row shows this, because two documents may carry the same title.
   */
  domainPath: string;
  /** Which frontmatter key on the domain document gains the concept. */
  key: "capabilities" | "elements";
}

/**
 * One document the plan may write, exactly as it stood when the sheet opened. Reachable through
 * `ContainmentPlan['targets']`; it is not exported separately because nothing outside builds one.
 */
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

/**
 * The frozen plan: the rows the sheet shows and the documents they would change, both read at the
 * moment the sheet opened. Nothing here is recomputed while the sheet is open.
 */
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
  /**
   * `file.lastModified` read when the sheet opened. Never null: a document whose mtime is unknown
   * becomes a skip, because a write with no guard is exactly the write this sheet promises never
   * to make.
   */
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
 * What happened to one row.
 *
 * `done` · `conflict` (the file changed since the sheet was opened — its `expected_mtime` refused
 * the write, which is the guard working) · `skipped` with the sentence saying why it was never
 * attempted · `failed` with the message the write threw.
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
 * Does this reference still name that domain document?
 *
 * The same three names `computeVaultHealth` resolves a `domain:` through — the slug, its last
 * segment, and a `slug:` written in the frontmatter — so a reference the verdict accepted is not
 * called a contradiction here. Anything else is treated as changed, which costs a skipped row and
 * never a write nobody approved.
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
 * **Reads the documents once, when the sheet opens.**
 *
 * Groups the proposals into one target per (document, key) — two writes to one file in one run
 * would make the second fail its own `expected_mtime` guard — and records the members and the
 * mtime as they are right now. Ticking happens afterwards and changes nothing here, which is what
 * lets the mtime be the baseline the write is judged against.
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
 * **Decides what Apply may still do**, from the frozen plan and the ticks.
 *
 * Two things are refused rather than written. A target whose mtime was unknown at open has no
 * guard to offer, and an unguarded write is the one this sheet promised not to make. A ticked row
 * whose concept no longer names this domain has lost the fact that justified it, so writing the
 * back-link would state a containment nobody approved. Both leave the row with a reason and the
 * rest of the run continues — the other documents are independent files.
 *
 * The `docs` here are the current ones; the members and the mtime still come from the plan.
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
 * Runs one selected batch, **one document at a time**, reporting each row as it resolves.
 *
 * A refusal does not stop the run: the remaining documents are independent files, and abandoning
 * them would leave the folder in a state nobody chose. The conflict branch is keyed on the vault's
 * own `VaultConflictError` name, so the guard refusing a changed file reads as the guard working
 * and not as an unexplained failure.
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
