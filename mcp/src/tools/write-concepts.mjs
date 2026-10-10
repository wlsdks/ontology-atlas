import {
  CREATED_BY_KEY,
  buildFrontmatter,
  defaultBody,
  localeLabelCodes,
  missingExpectedFields,
  normalizeLocaleLabels,
} from '../schema.mjs';
import { structuredRowErrorDetails } from '../server/rpc.mjs';
import { REPO_ROOT, REPO_ROOT_IS_GROUNDED, VAULT_ROOT } from '../server/runtime.mjs';
import { GRAPH_REF_ARRAY_MAX_ITEMS } from '../server/tool-schemas/array-limits.mjs';
import {
  requireAllowedObjectKeys,
  requireNonBlankString,
  requireOptionalNonNegativeNumber,
  requireOptionalPlainObject,
  requireOptionalStringArray,
  requirePlainObject,
} from '../server/validate.mjs';
import { formatAllowedValueError } from '../suggestions.mjs';
import { isValidVaultTitle } from '../validate.mjs';
import { loadVaultDocs } from '../vault/documents.mjs';
import {
  configureNodeEligibilityRepoRoot,
  detectDuplicateTitle,
  updateDoc,
  writeDoc,
} from '../vault/doc-writes.mjs';
import { compactPostWriteMaintenance } from './maintenance.mjs';
import {
  ADD_CONCEPT_KINDS,
  agentProvenance,
  readDocIfPresent,
  requireNodeNotReservedForHuman,
  requireValidFrontmatterPatch,
} from './vault-nodes.mjs';

/** Creating and patching nodes: `add_concept`, `add_concepts`, `patch_concept`. */

/*
 * These three are the only writes that can set a `path:`, so the write gate learns
 * the repository root here (it cannot import `server/runtime.mjs`). An ungrounded
 * root is passed as nothing, or drift is measured against an unrelated directory.
 */
configureNodeEligibilityRepoRoot(REPO_ROOT_IS_GROUNDED ? REPO_ROOT : null);

function addConcept({ slug, kind, title, domain, capabilities, elements, path, body, labels }, options = {}) {
  requireNonBlankString(slug, 'slug');
  requireNonBlankString(kind, 'kind');
  requireNonBlankString(title, 'title');
  if (domain !== undefined) requireNonBlankString(domain, 'domain');
  requireOptionalStringArray(capabilities, 'capabilities', { max: GRAPH_REF_ARRAY_MAX_ITEMS });
  requireOptionalStringArray(elements, 'elements', { max: GRAPH_REF_ARRAY_MAX_ITEMS });
  if (path !== undefined) requireNonBlankString(path, 'path');
  if (body !== undefined && typeof body !== 'string') {
    throw new Error('body must be a string.');
  }
  // A whitespace-only title is silent pollution too. The UI's isUntitledTitle
  // applies the same gate; MCP keeps parity.
  if (!isValidVaultTitle(title)) {
    throw new Error('title must be a non-empty string.');
  }
  if (!ADD_CONCEPT_KINDS.has(kind)) {
    throw new Error(formatAllowedValueError('kind', kind, [...ADD_CONCEPT_KINDS]));
  }
  // The schema fills the per-kind shape so partial input still leaves consistent
  // frontmatter; the CLI `add` shares it under a contract test. `labels` become
  // `display_<locale>`; `title` stays the single source for search and identity.
  const localeLabels = normalizeLocaleLabels(labels);
  const fm = buildFrontmatter({
    slug,
    kind,
    title,
    domain,
    capabilities,
    elements,
    path,
    ...localeLabels,
    // Authorship — passing through MCP is itself the proof that an agent wrote it.
    [CREATED_BY_KEY]: agentProvenance(),
  });
  // Advisory title-collision warning before the write; it never blocks. Batches skip
  // it: their candidates were already reviewed and a per-node vault load costs.
  const duplicateWarning =
    options.includePostWriteMaintenance === false
      ? null
      : detectDuplicateTitle(title, slug, loadVaultDocs(VAULT_ROOT));
  const filePath = writeDoc(VAULT_ROOT, slug, {
    frontmatter: fm,
    body: body === undefined ? defaultBody(kind, title) : body,
  });
  // Missing `requiredExtras` become advisories rather than a throw, so the flow
  // continues and a follow-up patch_concept fills the gap.
  const missing = missingExpectedFields(kind, fm);
  // Guards the mistake of filling one locale and moving on: the author only ever
  // sees their own screen language, while other-locale users get the raw title.
  const localeCodes = localeLabelCodes(localeLabels);
  const partialLocaleWarning =
    localeCodes.length === 1
      ? `labels only has "${localeCodes[0]}" — add the other locale (e.g. labels: { ko, en }) so both audiences read a native name`
      : null;
  const warnings = [
    ...missing.map((k) => `expected field "${k}" missing for kind "${kind}"`),
    ...(duplicateWarning ? [duplicateWarning] : []),
    ...(partialLocaleWarning ? [partialLocaleWarning] : []),
  ];
  return {
    ok: true,
    slug,
    filePath,
    changed: true,
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(options.includePostWriteMaintenance === false
      ? {}
      : { postWriteMaintenance: compactPostWriteMaintenance() }),
  };
}

// Batch add_concept: input order preserved, each row independent, so one failing
// row surfaces as ok:false without aborting the rest. No atomic rollback; use
// serial add_concept calls for that.
function addConceptsBatch({ concepts }) {
  if (!Array.isArray(concepts)) {
    throw new Error('concepts must be an array of concept specs');
  }
  if (concepts.length === 0) {
    return { concepts: [] };
  }
  if (concepts.length > 50) {
    throw new Error(
      `Too many concepts: ${concepts.length}. Max 50 per call — split into multiple add_concepts batches.`
    );
  }
  // Detect duplicate slugs within the input up front, so the second row does not
  // fail with the confusing "already exists". Only the first row for a slug is
  // attempted; later rows with the same slug fail at the input stage.
  const seenInBatch = new Map();
  // Rows already landed in this batch ({slug, frontmatter}) — the in-memory
  // comparison target that catches a later row as a near-duplicate (zero vault loads).
  const landed = [];
  const results = concepts.map((spec, index) => {
    let slug = '';
    try {
      requirePlainObject(spec, `concepts[${index}]`);
      slug = typeof spec.slug === 'string' ? spec.slug : '';
      requireAllowedObjectKeys(spec, `concepts[${index}]`, [
        'slug',
        'kind',
        'title',
        'domain',
        'capabilities',
        'elements',
        'path',
        'body',
        // Per-locale display names — same contract as single add_concept.
        'labels',
      ]);
      if (slug && seenInBatch.has(slug)) {
        const firstSeenAt = `concepts[${seenInBatch.get(slug)}]`;
        return {
          slug,
          ok: false,
          error: `concepts[${index}] duplicate slug in input batch; first seen at ${firstSeenAt}`,
          errorCode: 'conflict',
          rowName: `concepts[${index}]`,
          conflictSubject: 'Duplicate slug in input batch',
          conflictSlug: slug,
          firstSeenAt,
        };
      }
      if (slug) seenInBatch.set(slug, index);
      const result = addConcept(spec, { includePostWriteMaintenance: false });
      // Advisory warning when a node already landed in this batch has the same
      // normalised title, catching one concept split into two nodes without a vault load.
      if (result.ok) {
        const dupWarning = detectDuplicateTitle(spec.title, result.slug ?? slug, landed);
        if (dupWarning) result.warnings = [...(result.warnings ?? []), dupWarning];
        landed.push({
          slug: result.slug ?? slug,
          frontmatter: { title: spec.title, kind: spec.kind },
        });
      }
      return result;
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      return {
        slug: slug || String(slug),
        ok: false,
        error: msg,
        ...structuredRowErrorDetails(err, msg),
      };
    }
  });
  return {
    concepts: results,
    postWriteMaintenance: results.some((row) => row.ok && row.changed !== false)
      ? compactPostWriteMaintenance()
      : undefined,
  };
}

function patchConcept({ slug, frontmatter, body, expected_mtime }) {
  requireNonBlankString(slug, 'slug');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  if (frontmatter === undefined && body === undefined) {
    throw new Error('At least one of `frontmatter` or `body` is required.');
  }
  requireOptionalPlainObject(frontmatter, 'frontmatter');
  requireValidFrontmatterPatch(frontmatter);
  if (body !== undefined && typeof body !== 'string') {
    throw new Error('body must be a string.');
  }
  // A patch with `title` must be non-empty, matching the UI's renameVaultDoc. `null`
  // means "delete the key", and deleting `title` breaks the frontmatter.
  if (frontmatter !== undefined && Object.prototype.hasOwnProperty.call(frontmatter, 'title')) {
    const t = frontmatter.title;
    if (t === null) {
      throw new Error('title cannot be deleted from a vault node — pass a new non-empty string instead.');
    }
    if (!isValidVaultTitle(t)) {
      throw new Error('title must be a non-empty string.');
    }
  }
  requireNodeNotReservedForHuman(readDocIfPresent(slug), 'patch_concept');
  const { filePath, mintedUid } = updateDoc(VAULT_ROOT, slug, {
    frontmatter,
    body,
    expectedMtime: typeof expected_mtime === 'number' ? expected_mtime : undefined,
  });
  return {
    ok: true,
    slug,
    filePath,
    changed: true,
    // Say when this write gave identity (`uid:`) to a hand-authored node, so a person
    // knows why it appeared.
    ...(mintedUid
      ? {
          mintedUid,
          notice:
            `This node had no \`uid:\` (hand-written in an editor), which stops the whole vault from compiling. ` +
            `This write minted ${mintedUid} for it. Tell the human — the node now has a permanent identity.`,
        }
      : {}),
    postWriteMaintenance: compactPostWriteMaintenance(),
  };
}

export {
  addConcept,
  addConceptsBatch,
  patchConcept,
};
