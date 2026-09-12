/** Creating and patching nodes: `add_concept`, `add_concepts`, `patch_concept`. */
import {
  CREATED_BY_KEY,
  buildFrontmatter,
  defaultBody,
  localeLabelCodes,
  missingExpectedFields,
  normalizeLocaleLabels,
} from '../schema.mjs';
import { structuredRowErrorDetails } from '../server/rpc.mjs';
import { VAULT_ROOT } from '../server/runtime.mjs';
import { GRAPH_REF_ARRAY_MAX_ITEMS } from '../server/tool-schemas.mjs';
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
import {
  detectDuplicateTitle,
  loadVaultDocs,
  updateDoc,
  writeDoc,
} from '../vault.mjs';
import { compactPostWriteMaintenance } from './maintenance.mjs';
import {
  ADD_CONCEPT_KINDS,
  agentProvenance,
  readDocIfPresent,
  requireNodeNotReservedForHuman,
  requireValidFrontmatterPatch,
} from './vault-nodes.mjs';

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
  // The schema fills the per-kind shape (project: empty domains/capabilities/
  // elements arrays, capability: empty elements array, …) so partial input still
  // leaves consistent frontmatter on disk. The CLI `add` shares this schema
  // module and a contract test blocks drift.
  // Per-locale display names (owner decision, 2026-07-24) — `labels: { ko, en }`
  // is normalised to `display_<locale>` so one node reads correctly on Korean and
  // English screens. `title` is untouched: it stays the single source of truth for
  // search, matching, and file identity.
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
  // Safety net for the #1 failure mode of a growing vault (duplicate nodes):
  // before the write, scan existing nodes and warn (advisory only) on a title
  // collision. It never blocks the write. Batches skip it — in flows where the
  // user already reviewed the candidates (/ontology-bootstrap) a per-node full
  // vault load is not worth its cost.
  const duplicateWarning =
    options.includePostWriteMaintenance === false
      ? null
      : detectDuplicateTitle(title, slug, loadVaultDocs(VAULT_ROOT));
  const filePath = writeDoc(VAULT_ROOT, slug, {
    frontmatter: fm,
    body: body === undefined ? defaultBody(kind, title) : body,
  });
  // Missing `requiredExtras` from the schema become advisories in the response
  // rather than a throw, so the agent's flow continues and the user can fill the
  // gap with a follow-up patch_concept (a capability or element missing its
  // domain is the common case).
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

// Batch variant of add_concept. Turns K round trips into one when a
// /ontology-bootstrap flow lands 5–15 nodes at once. Input order is preserved and
// each row is independent, so one row failing (existing slug, invalid kind,
// missing required field) does not abort the rest — that row alone surfaces as
// ok:false. There is no atomic rollback; use serial add_concept calls if you need one.
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
        // Per-locale display names — same contract as single add_concept (2026-07-24).
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
      // When a node already landed in this batch has the same normalised title,
      // warn (advisory — it may be legitimate). This blocks bootstrap's #1 failure
      // mode (splitting one concept into two nodes) by in-batch comparison, with no
      // vault load, reusing the same helper as single add_concept's dup check.
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
  // A patch that includes `title` forces a non-empty string. The UI's
  // renameVaultDoc rejects blanks; leaving MCP open lets an agent's slip create an
  // untitled node and drift the ontology. `null` is separate — it means "delete
  // the key" — and deleting `title` itself breaks the frontmatter.
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
    // If this write gave identity to a hand-authored node (one created in an
    // editor with no `uid:`), say so. Identity appearing is an event a person
    // should know about; passing over it silently leaves nobody able to explain
    // why it was needed next time.
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
