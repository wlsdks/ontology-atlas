/**
 * Vault kind schema — per-kind frontmatter shape that AI agents and the CLI
 * both follow when they create new ontology nodes. Single source of truth for
 * `add_concept` (MCP) and `oh-my-ontology add` (CLI).
 *
 * The mirror copy lives at `cli/src/lib/schema.mjs`; a contract test
 * (`tests/contract/vault-schema.contract.test.ts`) keeps the two in lock-step.
 *
 * Why a schema beyond the existing templates?
 *
 *   - The example .md templates under `cli/templates/vault/` are seeds for
 *     `cli init` only — they don't constrain `cli add` or `add_concept`.
 *   - Without per-kind defaults, an agent calling `add_concept(kind:
 *     'capability', slug, title)` produced a node missing `domain:` and
 *     `elements: []`, which silently degraded downstream tooling.
 *   - This schema makes "what fields belong on what kind" explicit and
 *     mechanically applied so external `.md` ingestion later (cli import)
 *     can normalize the same way.
 *
 * Two field categories:
 *   - `arrayDefaults`: keys that should be present as an empty array if not
 *     supplied. Always emitted so AI agents and humans can read/edit them.
 *   - `optional`: keys that may appear but are not auto-emitted.
 *
 * `requiredExtras` is the *expected* set beyond `slug/kind/title`. Missing
 * extras are surfaced as validator warnings (not hard errors) — they are
 * advisory in v0.x to avoid breaking pre-existing vaults.
 */

export const VAULT_KINDS = ['project', 'domain', 'capability', 'element', 'document'];

export const VAULT_KIND_SCHEMA = {
  project: {
    folder: '',
    arrayDefaults: ['domains', 'capabilities', 'elements'],
    optional: ['dependencies', 'relates', 'description', 'status'],
    requiredExtras: [],
    // 사용자 가독성을 위한 권장 키 순서. buildFrontmatter 가 이 순서로
    // 정렬 후 미정의 키 (외부 import 의 custom_field 등) 는 뒤에 append.
    preferredOrder: [
      'slug',
      'kind',
      'title',
      'description',
      'status',
      'dependencies',
      'domains',
      'capabilities',
      'elements',
    ],
    bodyTemplate: (title) =>
      `# ${title}\n\n` +
      `One- or two-line summary of this project — *what / for whom / why*.\n\n` +
      `## How it grows\n\n` +
      `- Fill \`domains: [...]\` in the frontmatter and the domain nodes hang\n` +
      `  off the project tree automatically.\n` +
      `- Each domain's capabilities and elements follow the same pattern.\n`,
  },
  domain: {
    folder: 'domains/',
    arrayDefaults: ['capabilities'],
    optional: ['depends_on', 'relates', 'description'],
    requiredExtras: [],
    preferredOrder: [
      'slug',
      'kind',
      'title',
      'description',
      'depends_on',
      'capabilities',
    ],
    bodyTemplate: (title) =>
      `# ${title}\n\n` +
      `A *domain* is a large area of the project (auth, billing, search, …). ` +
      `Describe in one or two paragraphs what it covers and which capabilities live inside.\n`,
  },
  capability: {
    folder: 'capabilities/',
    arrayDefaults: ['elements'],
    optional: ['depends_on', 'relates', 'description'],
    // `domain` 은 트리 위계의 부모 — 비어 있으면 capability 가 orphan 으로
    // 떠다니며 사용자 인사이트에 분포 노이즈를 만든다. validator 가 경고.
    requiredExtras: ['domain'],
    // capability 의 핵심 정체성은 'domain 안의 한 기능' 이라 domain 이
    // arrays 보다 위. 자식 (elements / depends_on) 은 그 다음.
    preferredOrder: [
      'slug',
      'kind',
      'title',
      'description',
      'domain',
      'depends_on',
      'elements',
    ],
    bodyTemplate: (title) =>
      `# ${title}\n\n` +
      `A *capability* is one user-visible feature within a domain. Describe what it does and one or two user scenarios.\n`,
  },
  element: {
    folder: 'elements/',
    arrayDefaults: [],
    optional: ['path', 'depends_on', 'relates', 'description'],
    // element 는 어느 domain 안의 어느 capability 가 쓰는 단위 — domain 누락 시
    // 트리에서 sink 로 떠다닌다.
    requiredExtras: ['domain'],
    preferredOrder: [
      'slug',
      'kind',
      'title',
      'description',
      'domain',
      'path',
      'depends_on',
    ],
    bodyTemplate: (title) =>
      `# ${title}\n\n` +
      `An *element* is a smaller unit a capability uses (jwt-token, indexeddb-adapter, sigma-canvas, …). Cover *what / why / which interface*.\n`,
  },
  document: {
    folder: '',
    arrayDefaults: [],
    optional: ['describes', 'relates'],
    requiredExtras: [],
    preferredOrder: ['slug', 'kind', 'title', 'describes', 'relates'],
    bodyTemplate: (title) => `# ${title}\n`,
  },
};

/**
 * Build a normalized frontmatter object for a new node.
 *
 *   - Always: { slug, kind, title }
 *   - Add arrayDefaults as [] if not provided.
 *   - Pass-through any other supplied keys (so callers can also set
 *     `domain`, `capabilities`, `elements`, `dependencies`, custom keys …).
 *
 * Throws if kind is unknown.
 */
export function buildFrontmatter({ slug, kind, title, ...extras }) {
  if (!VAULT_KIND_SCHEMA[kind]) {
    throw new Error(
      `Unknown kind: ${kind}. Expected one of ${VAULT_KINDS.join(' / ')}.`,
    );
  }
  const schema = VAULT_KIND_SCHEMA[kind];
  const accumulator = { slug, kind, title };
  // Caller-supplied keys win over arrayDefaults — explicit values aren't
  // overwritten by an empty array.
  for (const key of schema.arrayDefaults) {
    accumulator[key] = Array.isArray(extras[key]) ? extras[key] : [];
  }
  for (const [key, value] of Object.entries(extras)) {
    if (value === undefined || value === null) continue;
    if (key in accumulator && Array.isArray(accumulator[key]) && Array.isArray(value)) {
      accumulator[key] = value;
      continue;
    }
    accumulator[key] = value;
  }
  // 사용자 가독성 — schema 의 preferredOrder 로 키 정렬. 정의 안 된 키
  // (사용자가 import 한 외부 frontmatter 의 custom_field 등) 는 뒤에 append.
  const ordered = {};
  for (const key of schema.preferredOrder) {
    if (key in accumulator) ordered[key] = accumulator[key];
  }
  for (const [key, value] of Object.entries(accumulator)) {
    if (!(key in ordered)) ordered[key] = value;
  }
  return ordered;
}

/**
 * Body 보조 — 호출자가 명시적으로 body 안 줬을 때 schema 의 kind 별 ‘starter
 * markdown’ 채워서 사용자가 첫 .md 만으로도 어떤 게 들어가야 하는지 감을 잡게.
 */
export function defaultBody(kind, title) {
  const schema = VAULT_KIND_SCHEMA[kind];
  if (!schema) throw new Error(`Unknown kind: ${kind}`);
  return schema.bodyTemplate(title);
}

/**
 * 자동 folder prefix — `oh-my-ontology add capability foo` 일 때 사용자가
 * `--auto-prefix` 켜면 slug 가 `capabilities/foo` 로 정규화. project /
 * document 는 root level (prefix 없음).
 */
export function folderForKind(kind) {
  const schema = VAULT_KIND_SCHEMA[kind];
  if (!schema) return '';
  return schema.folder;
}

/**
 * Validator helper — 기존 frontmatter 가 schema 의 requiredExtras 누락 했는지.
 * 누락된 키 배열 반환 (없으면 빈 배열). hard error 가 아니라 advisory.
 */
export function missingExpectedFields(kind, frontmatter) {
  const schema = VAULT_KIND_SCHEMA[kind];
  if (!schema) return [];
  const missing = [];
  for (const key of schema.requiredExtras) {
    const value = frontmatter[key];
    if (value === undefined || value === null) {
      missing.push(key);
      continue;
    }
    if (typeof value === 'string' && value.trim() === '') {
      missing.push(key);
    }
  }
  return missing;
}
