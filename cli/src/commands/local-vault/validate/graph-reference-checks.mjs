const GRAPH_REFERENCE_KEYS = [
  'domains',
  'capabilities',
  'elements',
  'dependencies',
  'depends_on',
  'relates',
  'contains',
  'describes',
];

function collectGraphRefs(frontmatter) {
  const refs = [];
  for (const key of GRAPH_REFERENCE_KEYS) {
    const value = frontmatter[key];
    if (!Array.isArray(value)) continue;
    for (const ref of value) refs.push({ key, ref });
  }
  const domain = frontmatter.domain;
  if (typeof domain === 'string' && domain.trim()) {
    refs.push({ key: 'domain', ref: domain });
  }
  return refs;
}

/**
 * Two documents claiming one canonical slug: invisible per file, so checked over the whole vault. An error,
 * since `patch_concept` can still write a taken slug and every relation naming it becomes unresolvable.
 */
export function findDuplicateSlugIssues(entries) {
  const byDeclared = new Map();
  for (const entry of entries) {
    const declared = entry.frontmatter?.slug;
    const value = typeof declared === 'string' ? declared.trim() : '';
    if (!value) continue;
    if (!byDeclared.has(value)) byDeclared.set(value, []);
    byDeclared.get(value).push(entry);
  }
  const issues = [];
  for (const [declared, group] of byDeclared) {
    if (group.length < 2) continue;
    const others = group.map((entry) => entry.slug);
    for (const entry of group) {
      const rest = others.filter((slug) => slug !== entry.slug);
      issues.push({
        file: entry.file,
        slug: entry.slug,
        issue: {
          code: 'duplicate-slug',
          severity: 'error',
          message:
            `another document also claims \`slug: ${declared}\` (${rest.join(', ')}). ` +
            `A relation naming it cannot say which one it means: ` +
            `change one slug, or merge them with rename_concept.`,
        },
      });
    }
  }
  return issues;
}

export function findDuplicateUidIssues(entries) {
  const claims = new Map();
  for (const entry of entries) {
    const primary = typeof entry.frontmatter?.uid === 'string' ? entry.frontmatter.uid.trim() : '';
    const merged = Array.isArray(entry.frontmatter?.merged_uids) ? entry.frontmatter.merged_uids : [];
    for (const uid of new Set([primary, ...merged].filter((value) => typeof value === 'string' && value))) {
      if (!claims.has(uid)) claims.set(uid, []);
      claims.get(uid).push(entry);
    }
  }
  const issues = [];
  for (const [uid, group] of claims) {
    if (group.length < 2) continue;
    for (const entry of group) {
      const others = group.filter((candidate) => candidate !== entry).map((candidate) => candidate.slug);
      issues.push({
        file: entry.file,
        slug: entry.slug,
        issue: {
          code: 'duplicate-uid',
          severity: 'error',
          message:
            `another document also claims UID ${uid} as its identity (${others.join(', ')}). ` +
            'That is a permanent identity collision: mint a new UID for the new node, and merge through merge_concepts.',
        },
      });
    }
  }
  return issues;
}

/**
 * A graph reference must resolve to a node, not to any `.md` in the vault: loose notes are allowed
 * in a vault, and counting them would contradict `compile`, which reports them unresolved.
 */
export function findDanglingGraphReferenceIssues(entries) {
  const isNodeEntry = (entry) =>
    typeof entry.frontmatter?.kind === 'string' && entry.frontmatter.kind.trim() !== '';
  const nodeEntries = entries.filter(isNodeEntry);
  // Slugs of documents that are not nodes, held separately so «missing» and «not a
  // node» can be said apart. For a person those are entirely different tasks.
  const nonNodeSlugs = new Set(entries.filter((e) => !isNodeEntry(e)).map((e) => e.slug));
  const nonNodeTails = new Set(
    [...nonNodeSlugs].map((slug) => slug.split('/').pop()).filter(Boolean),
  );
  const slugs = new Set(nodeEntries.map((entry) => entry.slug));
  const tailToFull = new Map();
  const frontmatterSlugToFull = new Map();
  for (const slug of slugs) {
    const tail = slug.split('/').pop();
    if (tail && tail !== slug && !tailToFull.has(tail)) {
      tailToFull.set(tail, slug);
    }
  }
  for (const entry of nodeEntries) {
    const fmSlug = entry.frontmatter.slug;
    if (typeof fmSlug === 'string' && fmSlug.trim() && !frontmatterSlugToFull.has(fmSlug)) {
      frontmatterSlugToFull.set(fmSlug, entry.slug);
    }
  }
  const resolveRef = (rawRef) => {
    if (typeof rawRef !== 'string') return null;
    // Normalise references to NFC too — slugs are already NFC via `pathToSlug`.
    // Normalising one side only leaves characters that look identical but do not match.
    const ref = rawRef.normalize('NFC');
    if (slugs.has(ref)) return ref;
    if (frontmatterSlugToFull.has(ref)) return frontmatterSlugToFull.get(ref);
    if (tailToFull.has(ref)) return tailToFull.get(ref);
    for (const slug of slugs) {
      if (slug.endsWith(`/${ref}`)) return slug;
    }
    return null;
  };
  const issues = [];
  for (const entry of entries) {
    for (const { key, ref } of collectGraphRefs(entry.frontmatter)) {
      if (typeof ref !== 'string' || ref.trim() === '') continue;
      if (key === 'elements' && isPathLikeGraphRef(ref)) continue;
      if (resolveRef(ref)) continue;
      // A missing file and a file that is not a node are different tasks (create or fix a typo, versus
      // add a `kind:` or drop the relation); one sentence for both sends a person hunting.
      const normalized = ref.normalize('NFC');
      const isNonNodeDoc = nonNodeSlugs.has(normalized) || nonNodeTails.has(normalized);
      issues.push({
        file: entry.file,
        issue: {
          code: 'dangling-graph-reference',
          severity: 'warning',
          message: isNonNodeDoc
            ? `\`${key}:\` graph reference "${ref}" exists in the vault as a file but is **not a node** ` +
              '(no `kind:` -- notes and minutes stay outside the graph). Give it a `kind:` to raise it ' +
              'into one, or remove this relation.'
            : `\`${key}:\` graph reference "${ref}" resolves to no node in the vault.`,
        },
      });
    }
  }
  return issues;
}

function isPathLikeGraphRef(ref) {
  return (
    ref.startsWith('src/') ||
    ref.startsWith('mcp/') ||
    ref.startsWith('cli/') ||
    ref.startsWith('scripts/') ||
    ref.startsWith('.claude/') ||
    /\.[A-Za-z0-9]+$/.test(ref)
  );
}
