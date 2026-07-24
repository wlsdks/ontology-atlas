/**
 * Vault kind schema — per-kind frontmatter shape that AI agents and the CLI
 * both follow when they create new ontology nodes. Single source of truth for
 * `add_concept` (MCP) and `ontology-atlas add` (CLI).
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
    // `display` — 과제 ⑩ (표시 이름 레이어). title 이 길 때 (괄호 부연
    // 설명 포함) 토폴로지 라벨/INDEX/팝오버/상세 헤더가 그리는 짧은 이름.
    // 없으면 렌더러가 title 의 " (" 앞부분으로 자동 파생 (`deriveDisplayTitle`,
    // `src/shared/lib/derive-display-title.ts`) — 대부분의 title 은 이 키를
    // 안 써도 된다. 검색/매칭은 항상 title 전체로 계속된다.
    optional: ['dependencies', 'relates', 'description', 'status', 'display'],
    requiredExtras: [],
    // 사용자 가독성을 위한 권장 키 순서. buildFrontmatter 가 이 순서로
    // 정렬 후 미정의 키 (외부 import 의 custom_field 등) 는 뒤에 append.
    preferredOrder: [
      'slug',
      'kind',
      'title',
      'display',
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
    optional: ['depends_on', 'relates', 'broader', 'description', 'display'],
    requiredExtras: [],
    preferredOrder: [
      'slug',
      'kind',
      'title',
      'display',
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
    optional: ['depends_on', 'relates', 'broader', 'description', 'display'],
    // `domain` 은 트리 위계의 부모 — 비어 있으면 capability 가 orphan 으로
    // 떠다니며 사용자 인사이트에 분포 노이즈를 만든다. validator 가 경고.
    requiredExtras: ['domain'],
    // capability 의 핵심 정체성은 'domain 안의 한 기능' 이라 domain 이
    // arrays 보다 위. 자식 (elements / depends_on) 은 그 다음.
    preferredOrder: [
      'slug',
      'kind',
      'title',
      'display',
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
    optional: ['path', 'depends_on', 'relates', 'broader', 'description', 'display'],
    // element 는 어느 domain 안의 어느 capability 가 쓰는 단위 — domain 누락 시
    // 트리에서 sink 로 떠다닌다.
    requiredExtras: ['domain'],
    preferredOrder: [
      'slug',
      'kind',
      'title',
      'display',
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
    optional: ['describes', 'relates', 'display'],
    requiredExtras: [],
    preferredOrder: ['slug', 'kind', 'title', 'display', 'describes', 'relates'],
    bodyTemplate: (title) => `# ${title}\n`,
  },
};

const GRAPH_ARRAY_KEYS = new Set([
  'domains',
  'capabilities',
  'elements',
  'dependencies',
  'depends_on',
  'relates',
  'contains',
  'describes',
  'broader',
]);

function normalizeGraphArray(key, value) {
  if (!GRAPH_ARRAY_KEYS.has(key) || !Array.isArray(value)) return value;
  const seen = new Set();
  const refs = [];
  const passthrough = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      passthrough.push(item);
      continue;
    }
    const ref = item.trim();
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    refs.push(ref);
  }
  refs.sort((a, b) => a.localeCompare(b, 'en'));
  return [...refs, ...passthrough];
}

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
    accumulator[key] = Array.isArray(extras[key]) ? normalizeGraphArray(key, extras[key]) : [];
  }
  for (const [key, value] of Object.entries(extras)) {
    if (value === undefined || value === null) continue;
    if (key in accumulator && Array.isArray(accumulator[key]) && Array.isArray(value)) {
      accumulator[key] = normalizeGraphArray(key, value);
      continue;
    }
    accumulator[key] = normalizeGraphArray(key, value);
  }
  // 사용자 가독성 — schema 의 preferredOrder 로 키 정렬. 정의 안 된 키
  // (사용자가 import 한 외부 frontmatter 의 custom_field 등) 는 뒤에 append.
  const ordered = {};
  for (const key of schema.preferredOrder) {
    if (key in accumulator) ordered[key] = accumulator[key];
    // 어권별 표시 이름(`display_ko` 등)은 `display` 바로 뒤에 모아 둔다 —
    // 사람이 파일을 열었을 때 이름 계열 키가 흩어지지 않게(2026-07-24).
    if (key === 'display') {
      for (const localeKey of Object.keys(accumulator)) {
        if (/^display_[a-z]{2}$/.test(localeKey)) ordered[localeKey] = accumulator[localeKey];
      }
    }
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
 * 자동 folder prefix — `ontology-atlas add capability foo` 일 때 사용자가
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

/**
 * 어권별 표시 이름 정규화 (소유자 지시 2026-07-24) — `labels: { ko, en }` →
 * `{ display_ko, display_en }` frontmatter 키.
 *
 * 왜 별도 레이어인가: `title` 은 검색/매칭/파일 정체성의 단일 진실원이라
 * 로케일별로 바꾸면 안 된다. 렌더 표면(지도 라벨·INDEX·팝오버)만 화면
 * 로케일에 맞는 `display_<locale>` 을 읽는다
 * (`src/features/vault-ontology/model/use-ontology-insight.ts`).
 *
 * 2글자 로케일 코드 + 비어있지 않은 문자열만 통과. 그 외는 조용히 무시
 * (agent 가 잘못된 키를 보내도 vault 가 오염되지 않는다).
 */
export function normalizeLocaleLabels(labels) {
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) return {};
  const out = {};
  for (const [locale, value] of Object.entries(labels)) {
    if (!/^[a-z]{2}$/.test(locale)) continue;
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    out[`display_${locale}`] = trimmed;
  }
  return out;
}

/** `normalizeLocaleLabels` 결과에서 로케일 코드만 뽑는다(경고 문구용). */
export function localeLabelCodes(normalized) {
  return Object.keys(normalized)
    .map((key) => key.slice('display_'.length))
    .sort();
}
