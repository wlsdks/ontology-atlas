import { statSync } from 'node:fs';
import {
  CREATED_BY_KEY,
  buildFrontmatter,
  defaultBody,
  localeLabelCodes,
  missingExpectedFields,
  normalizeLocaleLabels,
} from '../../schema.mjs';
import { structuredRowErrorDetails } from '../../server/rpc.mjs';
import { MEASURED_COVERAGE } from '../../server/map-analysis-measure.mjs';
import { REPO_ROOT, REPO_ROOT_IS_GROUNDED, VAULT_ROOT } from '../../server/runtime.mjs';
import { GRAPH_REF_ARRAY_MAX_ITEMS } from '../../server/tool-schemas/array-limits.mjs';
import {
  requireAllowedObjectKeys,
  requireNonBlankString,
  requireOptionalNonNegativeNumber,
  requireOptionalPlainObject,
  requireOptionalStringArray,
  requirePlainObject,
} from '../../server/validate.mjs';
import { formatAllowedValueError } from '../../suggestions.mjs';
import { isValidVaultTitle } from '../../validate.mjs';
import { loadVaultDocs } from '../../vault/documents/document-cache.mjs';
import { configureNodeEligibilityRepoRoot } from '../../vault/writes/eligibility-gate.mjs';
import { updateDoc, writeDoc } from '../../vault/writes/doc-writes.mjs';
import { detectDuplicateTitle } from '../../vault/graph/graph-queries.mjs';
import { measureBuildDepth, repositorySurvey } from '../../construction/build-depth.mjs';
import { sessionReads } from '../../construction/session-reads.mjs';
import { findingsOnWrittenNodes } from '../result-attachments.mjs';
import { agentProvenance, readDocIfPresent } from '../vault-nodes.mjs';
import {
  ADD_CONCEPT_KINDS,
  requireNodeNotReservedForHuman,
  refuseRecheckMark,
  requireValidFrontmatterPatch,
} from './write-gates.mjs';

/** The `display_<locale>` codes any node in the vault carries. */
function vaultLocaleCodes(docs) {
  const codes = new Set();
  for (const doc of docs) {
    for (const key of Object.keys(doc?.frontmatter ?? {})) {
      const match = /^display_([a-z]{2})$/.exec(key);
      if (match) codes.add(match[1]);
    }
  }
  return codes;
}

/*
 * These three are the only writes that can set a `path:`, so the write gate learns
 * the repository root here (it cannot import `server/runtime.mjs`). An ungrounded
 * root is passed as nothing, or drift is measured against an unrelated directory.
 */
configureNodeEligibilityRepoRoot(REPO_ROOT_IS_GROUNDED ? REPO_ROOT : null);

function addConcept({ slug, kind, title, domain, domains, capabilities, elements, path, body, labels }, options = {}) {
  requireNonBlankString(slug, 'slug');
  requireNonBlankString(kind, 'kind');
  requireNonBlankString(title, 'title');
  if (domain !== undefined) requireNonBlankString(domain, 'domain');
  requireOptionalStringArray(domains, 'domains', { max: GRAPH_REF_ARRAY_MAX_ITEMS });
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
  // Only a project lists domains; every other kind names its one parent.
  if (domains !== undefined && kind !== 'project') {
    throw new Error(`domains lists a project's domains; a ${kind} names its one parent domain in \`domain\`.`);
  }
  // The schema fills the per-kind shape so partial input still leaves consistent
  // frontmatter. `labels` become
  // `display_<locale>`; `title` stays the single source for search and identity.
  const localeLabels = normalizeLocaleLabels(labels);
  const fm = buildFrontmatter({
    slug,
    kind,
    title,
    domain,
    domains,
    capabilities,
    elements,
    path,
    ...localeLabels,
    // Authorship — passing through MCP is itself the proof that an agent wrote it.
    [CREATED_BY_KEY]: agentProvenance(),
  });
  // Advisory title-collision warning before the write; it never blocks. Batches skip
  // it: their candidates were already reviewed and a per-node vault load costs.
  const vaultDocs = options.asBatchRow === true ? null : loadVaultDocs(VAULT_ROOT);
  const duplicateWarning = vaultDocs ? detectDuplicateTitle(title, slug, vaultDocs) : null;
  const filePath = writeDoc(VAULT_ROOT, slug, {
    frontmatter: fm,
    body: body === undefined ? defaultBody(kind, title) : body,
  });
  // Missing `requiredExtras` become advisories rather than a throw, so the flow
  // continues and a follow-up patch_concept fills the gap.
  const missing = missingExpectedFields(kind, fm);
  // Guards filling one locale and moving on in a vault that names its nodes in more
  // than one: other-locale readers would see the raw title. A one-locale vault has
  // nothing to add, so it gets no warning.
  const localeCodes = localeLabelCodes(localeLabels);
  const vaultLocales = options.vaultLocales ?? vaultLocaleCodes(vaultDocs ?? []);
  const usedLocales = new Set([...vaultLocales, ...localeCodes]);
  const missingLocales = [...usedLocales].filter((code) => !localeCodes.includes(code)).sort();
  const partialLocaleWarning = usedLocales.size >= 2 && missingLocales.length > 0
    ? `labels has no ${missingLocales.map((code) => `"${code}"`).join(', ')}, which other nodes in this vault use; add it (labels: { ${[...usedLocales].sort().join(', ')} }) so those readers see a native name`
    : null;
  const warnings = [
    ...missing.map((k) => `expected field "${k}" missing for kind "${kind}"`),
    ...(duplicateWarning ? [duplicateWarning] : []),
    ...(partialLocaleWarning ? [partialLocaleWarning] : []),
  ];
  const findings = options.asBatchRow === true ? [] : findingsOnWrittenNodes([slug]);
  return {
    ok: true,
    slug,
    changed: true,
    mtime: statSync(filePath).mtimeMs,
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(findings.length > 0 ? { findings } : {}),
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
  // The vault as it stood before the batch plus the rows landed so far: one load
  // serves the title check for every row, including a one-row call.
  const vaultDocs = loadVaultDocs(VAULT_ROOT);
  const landed = [];
  // Every locale the vault or this batch names, read once for the whole batch.
  const vaultLocales = new Set([
    ...vaultLocaleCodes(vaultDocs),
    ...concepts.flatMap((spec) => localeLabelCodes(normalizeLocaleLabels(spec?.labels))),
  ]);
  const results = concepts.map((spec, index) => {
    let slug = '';
    try {
      requirePlainObject(spec, `concepts[${index}]`);
      slug = typeof spec.slug === 'string' ? spec.slug : '';
      refuseRecheckMark(spec, `concepts[${index}]`);
      requireAllowedObjectKeys(spec, `concepts[${index}]`, [
        'slug',
        'kind',
        'title',
        'domain',
        'domains',
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
      const result = addConcept(spec, { asBatchRow: true, vaultLocales });
      if (result.ok) {
        const dupWarning = detectDuplicateTitle(spec.title, result.slug ?? slug, [...vaultDocs, ...landed]);
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
  const written = results.filter((row) => row.ok && row.changed !== false).map((row) => row.slug);
  const findings = written.length > 0 ? findingsOnWrittenNodes(written) : [];
  const depth = written.length > 0 ? measureBatchDepth() : null;
  const coverage = depth?.line ?? null;
  const answer = {
    concepts: results,
    ...(findings.length > 0 ? { findings } : {}),
    ...(coverage ? { coverage } : {}),
  };
  // Not enumerable: the map analysis record reuses this measure instead of walking the code again.
  if (depth) Object.defineProperty(answer, MEASURED_COVERAGE, { value: depth.measured });
  return answer;
}

/**
 * The coverage line after a batch: which abilities nothing places yet, which entry
 * files were never read, which rules cite no read lines, and which capabilities no
 * ability-to-ability edge touches, with the share it measured. A measurement
 * failure never fails the write.
 */
function measureBatchDepth() {
  if (!REPO_ROOT_IS_GROUNDED) return null;
  try {
    const repo = repositorySurvey(REPO_ROOT, VAULT_ROOT);
    const depth = measureBuildDepth(loadVaultDocs(VAULT_ROOT), repo, sessionReads(REPO_ROOT));
    return { line: depth.line, measured: { coverage: depth.areaCoverage, collection: repo?.collection ?? null } };
  } catch {
    return null;
  }
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
  const findings = findingsOnWrittenNodes([slug]);
  return {
    ok: true,
    slug,
    changed: true,
    mtime: statSync(filePath).mtimeMs,
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
    ...(findings.length > 0 ? { findings } : {}),
  };
}

export {
  addConcept,
  addConceptsBatch,
  patchConcept,
};
