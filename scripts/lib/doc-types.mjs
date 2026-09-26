// One place that says which Markdown under docs/ is a living document, which is
// frozen history, and which document kinds exist. `pnpm docs:move`,
// `pnpm doc:new` and `pnpm docs:meta` all read it, so the three can never
// disagree about what is exempt or what a kind requires.
//
// Only machine-derivable facts live here: frontmatter keys, enums, folders and
// paths. Section headings and prose belong to their authors
// (`.claude/rules/documentation.md`, "What CI may check about prose").

/**
 * Files and folders that are history. Nothing rewrites them, no template applies
 * to them, and the metadata check skips them.
 *
 * - `DECISIONS`, `CHANGELOG`, `PO-PILOT`: keyed by path and hash in
 *   `docs/records/legacy.json`.
 * - `BACKLOG-SNAPSHOT-*`: `scripts/backlog.mjs` refuses any diff but an add.
 * - `records/**`: immutable fragments. `records/README.md` is the one living
 *   file there.
 * - `archive`, `audits`, `benchmark`, `prototypes`: dated evidence and drafts.
 *   `benchmark/rubric.md` is fed into grader prompts, so even frontmatter would
 *   change the instrument.
 * - `ontology/**`: the dogfood vault. `mcp/src/schema.mjs` owns its schema.
 * - `.generated/**`, `.templates/**`: machine output and the templates themselves.
 */
export function isFrozenDocPath(repoPath) {
  const p = repoPath.split('\\').join('/');
  if (p === 'docs/records/README.md') return false;
  return (
    /^docs\/(DECISIONS|CHANGELOG|PO-PILOT)\.md$/.test(p) ||
    /^docs\/BACKLOG-SNAPSHOT-[^/]+\.md$/.test(p) ||
    /^docs\/(records|archive|audits|benchmark|prototypes|ontology|\.generated|\.templates)\//.test(p)
  );
}

/** Paths outside docs/ that a rewrite never touches: user-vault templates and generated output. */
export function isFrozenRepoPath(repoPath) {
  const p = repoPath.split('\\').join('/');
  return (
    isFrozenDocPath(p) ||
    p.startsWith('cli/templates/') ||
    p.startsWith('src/entities/docs-vault/data/') ||
    p.startsWith('public/docs-vault/')
  );
}

/** The owning area. It stands in for an owner, because a person's name is barred (`forbidden.md`). */
export const DOC_AREAS = Object.freeze([
  'product',
  'architecture',
  'map',
  'library',
  'agents',
  'git',
  'analysis',
  'harness',
  'automations',
  'projects',
  'mcp',
  'cli',
  'desktop',
  'ontology-model',
  'design-system',
  'process',
  'release',
]);

const LIVING_STATUS = Object.freeze(['current', 'draft', 'superseded', 'historical']);
const PLAN_STATUS = Object.freeze(['active', 'done', 'abandoned']);

/**
 * Each kind: where it lives, what its frontmatter must carry, what it may carry,
 * and where `pnpm doc:new` puts a new one. `folders` lists the docs/-relative
 * directories a kind may sit in (`''` is the docs/ root); a README.md in any of
 * them may also be an `index`.
 */
export const DOC_TYPES = Object.freeze({
  authority: { folders: [''], required: [], optional: ['decisions', 'contract_version'] },
  index: { folders: ['', 'features', 'plans', 'launch'], required: [], optional: [] },
  guide: { folders: ['guide'], required: [], optional: ['gateway'] },
  feature: { folders: ['features', 'features/*'], required: ['routes'], optional: ['decisions'] },
  contract: {
    folders: ['contracts'],
    required: ['stores', 'contract_version', 'enforced_by'],
    optional: ['decisions'],
  },
  design: { folders: ['design'], required: [], optional: ['enforced_by', 'decisions'] },
  runbook: { folders: ['', 'engineering', 'records'], required: [], optional: [] },
  spec: { folders: ['specs'], required: ['date', 'decisions'], optional: ['contract_version'] },
  plan: { folders: ['', 'plans'], required: [], optional: ['decisions'] },
  launch: { folders: ['launch'], required: [], optional: [] },
  finding: { folders: ['benchmark'], required: ['date', 'question'], optional: [] },
});

/** Keys every living document carries. */
export const COMMON_REQUIRED = Object.freeze(['title', 'doc_type', 'status', 'area']);

/** Keys any kind may carry. */
const COMMON_OPTIONAL = Object.freeze(['tags', 'description', 'supersedes', 'superseded_by']);

/**
 * Keys a document must never write.
 *
 * - `kind`, `uid`, `describes`, `relates`, `slug`, `display_*` are ontology-vault
 *   keys: `kind: document` would make the app treat a living doc as a graph node,
 *   and `describes` would move it into the ontology collection.
 * - `updated`, `revision`, `last_commit`, `version` are derived from Git at build
 *   time. A hand-written counter conflicts on every concurrent edit.
 */
const FORBIDDEN_KEYS = Object.freeze([
  'kind',
  'uid',
  'describes',
  'relates',
  'slug',
  'updated',
  'updated_at',
  'last_updated',
  'revision',
  'last_commit',
  'version',
]);

export function statusValues(docType) {
  return docType === 'plan' ? PLAN_STATUS : LIVING_STATUS;
}

export function isForbiddenKey(key) {
  return FORBIDDEN_KEYS.includes(key) || key.startsWith('display_');
}

export function allowedKeys(docType) {
  const spec = DOC_TYPES[docType];
  if (!spec) return new Set(COMMON_REQUIRED);
  return new Set([...COMMON_REQUIRED, ...COMMON_OPTIONAL, ...spec.required, ...spec.optional]);
}

/** The docs/-relative folder of a repo path: a file in `docs/features/map/` gives `features/map`. */
function docFolder(repoPath) {
  const rel = repoPath.split('\\').join('/').replace(/^docs\//, '');
  const index = rel.lastIndexOf('/');
  return index === -1 ? '' : rel.slice(0, index);
}

/** Whether a kind may live in the folder of this path. */
export function typeFitsFolder(docType, repoPath) {
  const spec = DOC_TYPES[docType];
  if (!spec) return false;
  const folder = docFolder(repoPath);
  const isReadme = /(^|\/)README\.md$/.test(repoPath);
  if (docType === 'index' && isReadme) return true;
  return spec.folders.some((pattern) =>
    pattern.endsWith('/*') ? folder.startsWith(`${pattern.slice(0, -2)}/`) && !folder.slice(pattern.length - 1).includes('/') : folder === pattern,
  );
}

/** The docs/ path `pnpm doc:new` gives a new document of this kind. */
export function newDocPath(docType, { slug, area, date, featureDirs = [] }) {
  switch (docType) {
    case 'authority':
      return `docs/${slug.toUpperCase()}.md`;
    case 'guide':
      return `docs/guide/${slug}.md`;
    case 'feature':
      return featureDirs.includes(area) ? `docs/features/${area}/${slug}.md` : `docs/features/${slug}.md`;
    case 'contract':
      return `docs/contracts/${slug}.md`;
    case 'design':
      return `docs/design/${slug}.md`;
    case 'runbook':
      return `docs/engineering/${slug}.md`;
    case 'spec':
      return `docs/specs/${date}-${slug}.md`;
    case 'plan':
      return `docs/plans/${slug}.md`;
    case 'launch':
      return `docs/launch/${slug}.md`;
    case 'finding':
      return `docs/benchmark/FINDINGS-${slug}-${date}.md`;
    default:
      throw new Error(`doc_type must be one of ${Object.keys(DOC_TYPES).filter((type) => type !== 'index').join(', ')}`);
  }
}
