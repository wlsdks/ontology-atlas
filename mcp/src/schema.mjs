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

/**
 * 저작 출처 (2026-07-31 원장 — 「사람이 만든 노드 표기」).
 *
 * 값 규약은 `human` 또는 `agent:<name>` 둘뿐이다. **스탬프는 쓰기 시점에,
 * 호출 경로가 증명하는 행위자에게만 찍는다** — 소급 추론(「로그 없음=사람」·
 * git blame)으로는 출처가 존재하지 않기 때문이다(98노드에 활동 로그 4줄,
 * git user 는 단일 사람). 그래서:
 *
 *   - 이 키는 **선택**이다. `requiredExtras` 에 넣지 않는다.
 *   - **부재는 결함이 아니라 unknown 이다.** validator 경고를 붙이지 않으며,
 *     어떤 경로도 부재를 `human` 으로 기본값 처리하지 않는다.
 */
export const CREATED_BY_KEY = 'created_by';
export const CREATED_BY_HUMAN = 'human';
export const CREATED_BY_AGENT_PREFIX = 'agent:';
/**
 * 경로가 「에이전트가 썼다」는 증명하지만 그 **이름**은 증명하지 못할 때
 * (활동 하트비트 없음 등). 이름을 모른다고 사람 쪽으로 떨어지면 그것이 바로
 * 이 결정이 금지한 소급 추론이라, 모름은 모름으로 적는다.
 */
export const CREATED_BY_AGENT_UNKNOWN = `${CREATED_BY_AGENT_PREFIX}unknown`;

/** 에이전트 이름 → `agent:<name>`. 이름이 없으면 `agent:unknown`. */
export function agentCreatedBy(agentName) {
  const name = typeof agentName === 'string' ? agentName.trim() : '';
  return name ? `${CREATED_BY_AGENT_PREFIX}${name}` : CREATED_BY_AGENT_UNKNOWN;
}

/**
 * Node-eligibility gate — the numbers half (2026-07-31 council, `docs/DECISIONS.md`
 * 「온톨로지 구축 규격」). The gate logic lives in `mcp/src/vault.mjs`, the wording in
 * `mcp/src/construction-rules.mjs`; only the values live here.
 *
 * ⚠️ **None of these is a limit.** The council removed the fan-out cap in every
 * form, including per-kind caps: a number a model can be told to stay under is a
 * number it games with empty buckets while the graph gets no better. Each value
 * below answers "when is it worth *asking* a question", never "how many children
 * may a node have". Do not phrase anything derived from these as "keep under N".
 *
 * They live in the schema module because it is already the two-package value
 * canon: `cli/src/lib/schema.mjs` carries a literal mirror (the packages have
 * zero cross-imports by design) and `tests/contract/vault-schema.contract.test.ts`
 * fails the build when the two drift.
 */
export const NODE_ELIGIBILITY_GATE = Object.freeze({
  /**
   * A node with this many unresolved graph references is worth one sentence.
   * One is enough: an entry that resolves to nothing is not a small version of a
   * child, it is a different category of thing (evidence) sitting in a meaning
   * slot. There is no "acceptable amount" to tune down to.
   */
  NOTICE_THRESHOLD: 1,
  /**
   * After the first notice, stay quiet until the count crosses a multiple of
   * this. Repeating the same sentence on every write is how `missing-expected-field`
   * became invisible — the reader filters a channel that always talks.
   */
  NOTICE_REPEAT_MULTIPLE: 10,
  /**
   * Siblings born under one parent inside a single machine batch before the gate
   * asks whether they name distinct roles. Provenance, not population: five nodes
   * a person wrote over five days say nothing, five the same batch emitted say
   * a directory listing was transcribed. A static vault scan cannot tell the two
   * apart, which is why this check can only exist on the write path.
   */
  BULK_PROVENANCE_SIBLING_TRIGGER: 5,
  /**
   * How many offending refs a single message names before it says "and N more".
   * A warning that pastes 92 paths is a wall, and a wall is not read.
   */
  REFERENCE_SAMPLE_LIMIT: 5,
});

export const VAULT_KIND_SCHEMA = {
  project: {
    folder: '',
    arrayDefaults: ['domains', 'capabilities', 'elements'],
    // `display` — 과제 ⑩ (표시 이름 레이어). title 이 길 때 (괄호 부연
    // 설명 포함) 토폴로지 라벨/INDEX/팝오버/상세 헤더가 그리는 짧은 이름.
    // 없으면 렌더러가 title 의 " (" 앞부분으로 자동 파생 (`deriveDisplayTitle`,
    // `src/shared/lib/derive-display-title.ts`) — 대부분의 title 은 이 키를
    // 안 써도 된다. 검색/매칭은 항상 title 전체로 계속된다.
    optional: ['dependencies', 'relates', 'description', 'status', 'display', CREATED_BY_KEY],
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
      CREATED_BY_KEY,
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
    optional: ['depends_on', 'relates', 'broader', 'description', 'display', CREATED_BY_KEY],
    requiredExtras: [],
    preferredOrder: [
      'slug',
      'kind',
      'title',
      'display',
      'description',
      'depends_on',
      'capabilities',
      CREATED_BY_KEY,
    ],
    bodyTemplate: (title) =>
      `# ${title}\n\n` +
      `A *domain* is a large area of the project (auth, billing, search, …). ` +
      `Describe in one or two paragraphs what it covers and which capabilities live inside.\n`,
  },
  capability: {
    folder: 'capabilities/',
    arrayDefaults: ['elements'],
    optional: ['depends_on', 'relates', 'broader', 'description', 'display', CREATED_BY_KEY],
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
      CREATED_BY_KEY,
    ],
    bodyTemplate: (title) =>
      `# ${title}\n\n` +
      `A *capability* is one user-visible feature within a domain. Describe what it does and one or two user scenarios.\n`,
  },
  element: {
    folder: 'elements/',
    arrayDefaults: [],
    optional: ['path', 'depends_on', 'relates', 'broader', 'description', 'display', CREATED_BY_KEY],
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
      CREATED_BY_KEY,
    ],
    bodyTemplate: (title) =>
      `# ${title}\n\n` +
      `An *element* is a smaller unit a capability uses (jwt-token, indexeddb-adapter, sigma-canvas, …). Cover *what / why / which interface*.\n`,
  },
  document: {
    folder: '',
    arrayDefaults: [],
    optional: ['describes', 'relates', 'display', CREATED_BY_KEY],
    requiredExtras: [],
    preferredOrder: ['slug', 'kind', 'title', 'display', 'describes', 'relates', CREATED_BY_KEY],
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
