import { existsSync } from 'node:fs';
import { detachText } from '../parser.mjs';
import { NODE_ELIGIBILITY_GATE, folderForKind } from '../schema.mjs';
import {
  STARTER_EXAMPLE_SLUGS,
  bulkProvenanceMessage,
  capabilityWithoutEvidenceMessage,
  danglingGraphReferenceMessage,
  denseParentActionMessage,
  looksLikeEvidencePath,
  looksLikePath,
  pathShapedReferenceMessage,
  pathShapedTitleMessage,
  slugOutsideKindFolderMessage,
} from '../construction-rules.mjs';
import { hasCapabilityImplementationEvidence } from '../capability-evidence.mjs';
import {
  dependencyWitnessFinding,
  isStarterExampleNode,
  meaningFindings,
  starterExampleFinding,
} from '../meaning-findings.mjs';

import { loadVaultDocs, readDoc } from './documents.mjs';
import { GRAPH_ARRAY_KEYS, collectNeighborRefs } from './relation-refs.mjs';
import { slugToPath } from './slug-paths.mjs';

/*
 * Node-eligibility gate (`docs/DECISIONS.md`); every write door reaches it through
 * `commitDoc`. It never blocks a write or enforces a child count: a rejection
 * strands an agent mid-batch, and a cap is met with empty filler buckets.
 */

/**
 * Session memory the compiled vault cannot have: how often a node was already
 * mentioned, and what this run created (a static scan cannot tell a person's
 * week of nodes from one batch).
 */
const GATE = {
  findings: [],
  /** `slug\0code\0key` → the count we last spoke about. */
  noticed: new Map(),
  /** parent ref → slugs created under it during this session. */
  createdUnderParent: new Map(),
  /** parent ref → the sibling count we last spoke about. */
  noticedBulk: new Map(),
  /**
   * parent slug → child refs this session's writes added to its graph arrays: a
   * parent's own list growing (`patch_concept` on `elements:`), the direction the
   * other provenance map cannot see.
   */
  parentGrewBy: new Map(),
  /** Lazy slug index: { rootPath, names: Set<string> }. */
  index: null,
  /**
   * Repository root a cited `path:` resolves against; `null` until grounded, which
   * keeps the check silent instead of measuring against the process cwd.
   */
  repoRoot: null,
};

/**
 * Called once at module load by the door that owns add_concept, add_concepts and
 * patch_concept, the only writes that set `path:`. `null` keeps the
 * folder-only check silent.
 */
export function configureNodeEligibilityRepoRoot(repoRoot) {
  GATE.repoRoot = typeof repoRoot === 'string' && repoRoot.trim() ? repoRoot : null;
}

/** Test seam, and the reset a long-lived server would need if the vault root moved. */
export function resetNodeEligibilityGate() {
  GATE.findings = [];
  GATE.noticed.clear();
  GATE.createdUnderParent.clear();
  GATE.noticedBulk.clear();
  GATE.parentGrewBy.clear();
  GATE.index = null;
}

/**
 * Takes and clears the findings since the last drain: each tool response carries
 * them once, and a finding delivered twice is one the reader starts filtering.
 */
export function drainNodeEligibilityFindings() {
  const findings = GATE.findings;
  GATE.findings = [];
  return findings;
}

/**
 * Every name the vault answers to (slugs, tails, frontmatter `slug:` aliases),
 * the same three the MCP resolver accepts, so the gate never calls "unresolved"
 * what get_concept would return.
 */
function buildGateIndex(rootPath) {
  const names = new Set();
  for (const doc of loadVaultDocs(rootPath)) {
    names.add(doc.slug);
    const tail = doc.slug.split('/').pop();
    if (tail) names.add(tail);
    const fmSlug = doc.frontmatter?.slug;
    if (typeof fmSlug === 'string' && fmSlug.trim()) names.add(detachText(fmSlug.trim()));
  }
  return { rootPath, names };
}

function gateIndex(rootPath, { rebuild = false } = {}) {
  if (rebuild || !GATE.index || GATE.index.rootPath !== rootPath) {
    GATE.index = buildGateIndex(rootPath);
  }
  return GATE.index;
}

/**
 * A miss is never trusted: a doc written elsewhere since the index was built
 * would look missing, so a miss rebuilds once and re-checks. A hit is trusted,
 * so a file deleted outside this process resolves until the next rebuild.
 */
function gateResolves(rootPath, ref) {
  const name = String(ref).normalize('NFC');
  if (gateIndex(rootPath).names.has(name)) return true;
  return gateIndex(rootPath, { rebuild: true }).names.has(name);
}

/**
 * The `path:` the node at the other end of an edge cites, read through the
 * existing helpers. `null` whenever the answer would be a guess (missing,
 * unreadable, no `path:`); the caller stays silent on `null`.
 */
function gateTargetPath(rootPath, ref) {
  const name = String(ref ?? '').trim();
  if (!name) return null;
  try {
    const filePath = slugToPath(rootPath, name);
    if (!existsSync(filePath)) return null;
    const path = readDoc(rootPath, filePath).frontmatter?.path;
    return typeof path === 'string' && path.trim() ? path.trim() : null;
  } catch {
    return null;
  }
}

/**
 * The `init` starter example for one kind, if still present: one existsSync and
 * at most one readDoc at its known address. A renamed starter is the finished
 * state; the whole-vault pass covers a copy under another name.
 */
function gateStarterExample(rootPath, kind) {
  const starterSlug = STARTER_EXAMPLE_SLUGS[kind];
  if (!starterSlug) return null;
  try {
    const filePath = slugToPath(rootPath, starterSlug);
    if (!existsSync(filePath)) return null;
    const doc = readDoc(rootPath, filePath);
    const docKind = typeof doc.frontmatter?.kind === 'string' ? doc.frontmatter.kind.trim() : '';
    if (docKind !== kind) return null;
    return { slug: starterSlug, kind, title: doc.frontmatter?.title, body: doc.body };
  } catch {
    return null;
  }
}

/** Keep the cache warm across a batch instead of rebuilding on every row. */
export function noteGateWrite(rootPath, slug) {
  if (!GATE.index || GATE.index.rootPath !== rootPath) return;
  GATE.index.names.add(slug);
  const tail = slug.split('/').pop();
  if (tail) GATE.index.names.add(tail);
}
/**
 * Drops the gate index after a removal: another slug may still provide the same
 * tail, so only a rebuild is safe. Otherwise gateResolves keeps answering true
 * for a removed slug and silences the dangling-reference advisory.
 */
export function noteGateRemoval() {
  GATE.index = null;
}

/**
 * Speaks on the first crossing, then only on each new multiple: a channel that
 * repeats on every write becomes invisible.
 */
function shouldNotice(ledger, key, count, { threshold, multiple }) {
  if (count < threshold) return false;
  const last = ledger.get(key) ?? 0;
  if (last === 0) {
    ledger.set(key, count);
    return true;
  }
  if (Math.floor(count / multiple) > Math.floor(last / multiple)) {
    ledger.set(key, count);
    return true;
  }
  if (count > last) ledger.set(key, count);
  return false;
}

const {
  NOTICE_THRESHOLD,
  NOTICE_REPEAT_MULTIPLE,
  BULK_PROVENANCE_SIBLING_TRIGGER,
  REFERENCE_SAMPLE_LIMIT,
  BOOTSTRAP_FANOUT_TRIGGER,
  MIN_PARENTS_FOR_LIVE_PERCENTILE,
  DENSE_PARENT_RESOLUTION_FLOOR,
} = NODE_ELIGIBILITY_GATE;

/**
 * Which containment array makes a node a parent, per kind. No `project → domain`
 * entry: a vault has a handful of projects, too few for a percentile.
 */
const DENSE_PARENT_RELATIONS = Object.freeze({
  domain: Object.freeze({ key: 'capabilities', childKind: 'capability', bootstrap: 'domain_to_capability' }),
  capability: Object.freeze({ key: 'elements', childKind: 'element', bootstrap: 'capability_to_element' }),
});

/** Nearest-rank p90: no interpolation, so the answer is always an observed count. */
function percentile90(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(0.9 * sorted.length) - 1)];
}

/**
 * "Wide" for this parent kind: the vault's p90 when there are enough parents,
 * else the researched starting range, which must not be reported as the vault's
 * own measurement. Costs a full scan; call it only for a parent worth a sentence.
 */
function siblingFanoutTrigger(rootPath, parentKind) {
  const relation = DENSE_PARENT_RELATIONS[parentKind];
  const counts = [];
  for (const doc of loadVaultDocs(rootPath)) {
    if (doc.frontmatter?.kind !== parentKind) continue;
    const refs = doc.frontmatter[relation.key];
    counts.push(
      Array.isArray(refs) ? refs.filter((ref) => gateResolves(rootPath, ref)).length : 0,
    );
  }
  if (counts.length < MIN_PARENTS_FOR_LIVE_PERCENTILE) {
    return { trigger: BOOTSTRAP_FANOUT_TRIGGER[relation.bootstrap], basis: 'bootstrap' };
  }
  return { trigger: percentile90(counts), basis: 'vault-p90' };
}

/**
 * Did a machine fill this parent this session? `createdUnderParent` sees children
 * each declaring `domain:`; `parentGrewBy` sees the parent's own array grow.
 */
function machineFilledParent(slug) {
  if (GATE.noticedBulk.has(slug)) return true;
  return (GATE.parentGrewBy.get(slug)?.size ?? 0) >= BULK_PROVENANCE_SIBLING_TRIGGER;
}

function pushRefFinding(slug, code, key, refs, message) {
  const noticeKey = `${slug}\0${code}\0${key}`;
  if (!shouldNotice(GATE.noticed, noticeKey, refs.length, {
    threshold: NOTICE_THRESHOLD,
    multiple: NOTICE_REPEAT_MULTIPLE,
  })) {
    return;
  }
  GATE.findings.push({
    code,
    slug,
    key,
    refs,
    count: refs.length,
    message: message({ slug, key, refs, count: refs.length, sampleLimit: REFERENCE_SAMPLE_LIMIT }),
  });
}

/**
 * Runs on the committed frontmatter after the file is on disk, so it observes and
 * never blocks; `previousFrontmatter` tells a new edge from one already on disk.
 */
export function runNodeEligibilityGate(
  rootPath,
  slug,
  frontmatter,
  {
    created = false,
    body = '',
    bodyWritten = false,
    pathWritten = false,
    previousFrontmatter,
  } = {},
) {
  if (!frontmatter || typeof frontmatter !== 'object') return;

  // ⓪ A capability born with no evidence. Creation only: "name the behaviour,
  //    then attach the file" is the honest order, and `maintenance_plan` carries
  //    the durable question.
  if (created && frontmatter.kind === 'capability') {
    const elements = Array.isArray(frontmatter.elements) ? frontmatter.elements : [];
    const hasEvidence = hasCapabilityImplementationEvidence({
      path: frontmatter.path,
      hasElementsEdge: elements.some((ref) => gateResolves(rootPath, ref)),
    });
    if (!hasEvidence) {
      GATE.findings.push({
        code: 'capability-without-evidence',
        slug,
        key: 'path',
        refs: [],
        count: 1,
        message: capabilityWithoutEvidenceMessage({ slug }),
      });
    }
  }

  // ⓪b A node written outside its kind folder. Creation only, since a slug is
  //     minted once and a patch cannot undo it. Advisory: a flat slug is valid,
  //     and writeDoc's `flatSlugIssue` rejects the shape that merges distinct nodes.
  if (created && typeof frontmatter.kind === 'string') {
    const folder = folderForKind(frontmatter.kind.trim());
    if (folder && !slug.startsWith(folder)) {
      GATE.findings.push({
        code: 'slug-outside-kind-folder',
        slug,
        key: 'slug',
        refs: [`${folder}${slug}`],
        count: 1,
        message: slugOutsideKindFolderMessage({
          slug,
          kind: frontmatter.kind.trim(),
          canonicalSlug: `${folder}${slug}`,
        }),
      });
    }
  }

  // ① A path in the title slot: an element names a role, not a location.
  const title = frontmatter.title;
  if (looksLikePath(title)) {
    if (shouldNotice(GATE.noticed, `${slug}\0path-shaped-title\0title`, 1, {
      threshold: NOTICE_THRESHOLD,
      multiple: NOTICE_REPEAT_MULTIPLE,
    })) {
      GATE.findings.push({
        code: 'path-shaped-title',
        slug,
        key: 'title',
        refs: [String(title)],
        count: 1,
        message: pathShapedTitleMessage(String(title)),
      });
    }
  }

  // ② Reference resolution. validate_vault exempts path-shaped `elements:`
  //    entries; here nothing is exempt, and the path shape only picks the repair
  //    named first.
  const evidenceByKey = new Map();
  const danglingByKey = new Map();
  let totalRefs = 0;
  let resolvedRefs = 0;
  for (const { key, ref } of collectNeighborRefs({ frontmatter })) {
    totalRefs += 1;
    if (gateResolves(rootPath, ref)) {
      resolvedRefs += 1;
      continue;
    }
    const bucket = looksLikeEvidencePath(ref) ? evidenceByKey : danglingByKey;
    if (!bucket.has(key)) bucket.set(key, []);
    bucket.get(key).push(ref);
  }
  for (const [key, refs] of evidenceByKey) {
    pushRefFinding(slug, 'path-shaped-reference', key, refs, pathShapedReferenceMessage);
  }
  for (const [key, refs] of danglingByKey) {
    pushRefFinding(slug, 'dangling-graph-reference', key, refs, danglingGraphReferenceMessage);
  }

  // ③ Fires only when something else is already wrong, so a healthy wide parent
  // never pays for the percentile scan; unresolved strings are not children, or
  // the defect would read as growth.
  const relation = DENSE_PARENT_RELATIONS[frontmatter.kind];
  if (relation) {
    const childRefs = Array.isArray(frontmatter[relation.key]) ? frontmatter[relation.key] : [];
    const resolvedChildren = childRefs.filter((ref) => gateResolves(rootPath, ref));
    const resolutionRate = totalRefs === 0 ? 1 : resolvedRefs / totalRefs;
    const brokenParent = resolutionRate < DENSE_PARENT_RESOLUTION_FLOOR;
    const machineFilled = machineFilledParent(slug);
    if (resolvedChildren.length > 0 && (brokenParent || machineFilled)) {
      const { trigger, basis } = siblingFanoutTrigger(rootPath, frontmatter.kind);
      if (shouldNotice(GATE.noticed, `${slug}\0dense-parent\0${relation.key}`, resolvedChildren.length, {
        threshold: trigger + 1, // "above the trigger", not "at" it
        multiple: NOTICE_REPEAT_MULTIPLE,
      })) {
        GATE.findings.push({
          code: 'dense-parent',
          slug,
          key: relation.key,
          refs: resolvedChildren,
          count: resolvedChildren.length,
          trigger,
          basis,
          message: denseParentActionMessage({
            parentSlug: slug,
            count: resolvedChildren.length,
            childKind: relation.childKind,
            trigger,
            basis,
            evidence: brokenParent
              ? `only ${Math.round(resolutionRate * 100)}% of this node's graph references resolve to real nodes`
              : 'a single session filled this parent, so its children share a provenance rather than a reason',
          }),
        });
      }
    }
  }

  // ④ Meaning gaps in the body: the logic lives in `meaning-findings.mjs` and the
  //    sentences in `construction-rules.mjs`; this is the wiring. Gated on what
  //    the write touched, so an unrelated patch does not repeat the accusation.
  for (const finding of meaningFindings({
    kind: frontmatter.kind,
    slug,
    frontmatter,
    body,
    repoRoot: GATE.repoRoot,
    bodyWritten: created || bodyWritten,
    pathWritten: created || pathWritten,
  })) {
    if (!shouldNotice(GATE.noticed, `${slug}\0${finding.code}\0${finding.key}`, finding.count ?? 1, {
      threshold: NOTICE_THRESHOLD,
      multiple: NOTICE_REPEAT_MULTIPLE,
    })) {
      continue;
    }
    GATE.findings.push(finding);
  }

  // ④b A new dependency whose cited source never names the target's file, keyed by
  // target so two edges are two sentences. No compiled-plan half: only the
  // write door and the validators hold the repository root.
  for (const finding of dependencyWitnessFinding({
    slug,
    frontmatter,
    previousFrontmatter,
    repoRoot: GATE.repoRoot,
    resolveTargetPath: (ref) => gateTargetPath(rootPath, ref),
  })) {
    if (!shouldNotice(GATE.noticed, `${slug}\0${finding.code}\0${finding.key}`, finding.count ?? 1, {
      threshold: NOTICE_THRESHOLD,
      multiple: NOTICE_REPEAT_MULTIPLE,
    })) {
      continue;
    }
    GATE.findings.push(finding);
  }

  // ④c A starter example becomes a fake concept once a real node of its kind lands.
  // Attached to the starter, as the vault-wide row is, so the queue drops the
  // duplicate; once per starter per session.
  if (created && typeof frontmatter.kind === 'string') {
    const kind = frontmatter.kind.trim();
    const title = frontmatter.title;
    if (!isStarterExampleNode({ slug, kind, title })) {
      const starter = gateStarterExample(rootPath, kind);
      if (starter && shouldNotice(GATE.noticed, `${starter.slug}\0starter-example-node`, 1, {
        threshold: NOTICE_THRESHOLD,
        multiple: NOTICE_REPEAT_MULTIPLE,
      })) {
        const finding = starterExampleFinding({ ...starter, realSlug: slug });
        if (finding) GATE.findings.push(finding);
      }
    }
  }

  // ⑤ Bulk provenance: who made these and when, which only the write path knows.
  //    Not a size limit.
  if (!created) return;
  const parent = typeof frontmatter.domain === 'string' ? frontmatter.domain.trim() : '';
  if (!parent) return;
  const siblings = GATE.createdUnderParent.get(parent) ?? [];
  if (!siblings.includes(slug)) siblings.push(slug);
  GATE.createdUnderParent.set(parent, siblings);
  if (shouldNotice(GATE.noticedBulk, parent, siblings.length, {
    threshold: BULK_PROVENANCE_SIBLING_TRIGGER,
    multiple: BULK_PROVENANCE_SIBLING_TRIGGER,
  })) {
    GATE.findings.push({
      code: 'bulk-provenance',
      slug,
      parent,
      count: siblings.length,
      refs: siblings.slice(),
      message: bulkProvenanceMessage({
        parent,
        count: siblings.length,
        slugs: siblings,
        sampleLimit: REFERENCE_SAMPLE_LIMIT,
      }),
    });
  }
}

/**
 * Records which child refs this write added to a parent's graph arrays: on disk,
 * a child a person added over a week and one a loop appended look identical.
 */
export function noteParentGrowth(slug, previousFrontmatter, nextFrontmatter) {
  if (!previousFrontmatter) return;
  for (const key of GRAPH_ARRAY_KEYS) {
    const next = nextFrontmatter?.[key];
    if (!Array.isArray(next)) continue;
    const before = new Set(Array.isArray(previousFrontmatter[key]) ? previousFrontmatter[key] : []);
    for (const ref of next) {
      if (typeof ref !== 'string' || before.has(ref)) continue;
      const added = GATE.parentGrewBy.get(slug) ?? new Set();
      added.add(ref);
      GATE.parentGrewBy.set(slug, added);
    }
  }
}
