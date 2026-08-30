// Detection tables and read limits shared by every `analyze_repo_structure` topic
// module. They sit alone in one leaf file because several of them are read from
// more than one topic (a Cargo byte cap is needed by both the semantic-evidence
// reader and the Rust evidence walker), and a table that lived inside one topic
// would force that topic to be imported for a number.

/**
 * The folders FSD mode **actually scans**. The detection list and the scan list
 * must be the same — when they diverge you get a state that calls a repository
 * "FSD" and then reads nothing (measured 2026-07-28: a lone `src/shared/` produced
 * exactly that).
 */
export const FSD_SCAN_ROOTS = ['features', 'entities', 'widgets', 'views'];

export const DEFAULT_IGNORE = new Set([
  'node_modules',
  '.git',
  'out',
  'dist',
  'build',
  '.next',
  '.expo',
  '.turbo',
  '.cache',
  '.idea',
  '.vscode',
  'coverage',
  '__pycache__',
  '.pytest_cache',
  '.venv',
  'venv',
]);

export const SOURCE_FOLDERS = ['src', 'source', 'lib', 'app', 'internal'];
export const IMPLEMENTATION_ONLY_SOURCE_FOLDERS = new Set(['internal']);
export const WORKSPACE_FOLDERS = ['apps', 'packages'];
export const SOURCE_LAYOUT_COORDINATION_ELEMENT_LIMIT = 10;
export const SOURCE_LAYOUT_COORDINATION_ROLE =
  /(?:^|[-_.])(app|main|index|manager|loader|registry|storage|client|server|router|controller)(?:[-_.]|$)/i;
export const SOURCE_LAYOUT_CODE_FILE = /\.(?:[cm]?[jt]sx?|py)$/i;
export const NATIVE_SOURCE_FILE = /\.(?:c|h)$/i;
export const NATIVE_ROLE_EVIDENCE_FILE = /\.(?:c|h(?:\.in)?)$/i;
export const PYTHON_NON_PRODUCT_PACKAGES = new Set(['test', 'tests']);
export const PYTHON_IMPORT_ELEMENT_LIMIT = 12;
export const PYTHON_IMPORT_RISK_ELEMENT_LIMIT = 2;
export const GO_PACKAGE_ELEMENT_LIMIT = 24;
export const STARTER_ONTOLOGY_SLUGS = new Set([
  'domains/example-domain',
  'capabilities/example-capability',
]);
export const SEMANTIC_EVIDENCE_SEEDS = [
  ['README.md', 'mission'],
  ['README.rst', 'mission'],
  ['ARCHITECTURE.md', 'architecture'],
  ['package.json', 'package-contract'],
  ['Cargo.toml', 'package-contract'],
  ['pyproject.toml', 'package-contract'],
  ['setup.py', 'package-contract'],
  ['docs/FEATURES.md', 'product-capabilities'],
  ['docs/SYSTEM-MAP.md', 'architecture'],
  ['AGENTS.md', 'agent-guidance'],
];
export const SEMANTIC_EVIDENCE_MAX_EXCERPT = 1200;
export const SEMANTIC_EVIDENCE_MAX_HEADINGS = 8;
export const SEMANTIC_EVIDENCE_MAX_DOCUMENTS = 6;
export const SEMANTIC_EVIDENCE_MAX_BYTES = 256 * 1024;
export const WORKSPACE_SEMANTIC_EVIDENCE_MAX_MEMBERS = 48;
export const WORKSPACE_ELEMENT_LIMIT = 48;
export const NODE_PACKAGE_DESCRIPTION_MAX_LENGTH = 320;
export const CARGO_MANIFEST_MAX_BYTES = 256 * 1024;
export const PYTHON_SETUP_MAX_BYTES = 256 * 1024;
export const PYTHON_PROJECT_MAX_BYTES = 256 * 1024;
export const NODE_PACKAGE_MANIFEST_MAX_BYTES = 256 * 1024;
export const NODE_PACKAGE_EXPORT_LIMIT = 24;
export const NODE_PACKAGE_SCRIPT_LIMIT = 24;
export const NODE_PACKAGE_DEPENDENCY_LIMIT = 48;
export const RUST_IMPLEMENTATION_ELEMENT_LIMIT = 24;
export const RUST_MODULES_PER_TARGET_LIMIT = 12;
export const RUST_SOURCE_MAX_BYTES = 256 * 1024;
export const NATIVE_SOURCE_ELEMENT_LIMIT = 36;
export const NATIVE_DOC_BUILD_ELEMENT_LIMIT = 12;
export const AUTOTOOLS_IMPLEMENTATION_MANIFESTS = new Map([
  ['configure.ac', { slug: 'elements/autotools-configure', title: 'Autotools Configure' }],
  ['configure.in', { slug: 'elements/autotools-configure', title: 'Autotools Configure' }],
  ['Makefile.am', { slug: 'elements/autotools-build', title: 'Autotools Build' }],
]);
export const AUTOTOOLS_IDENTITY_FILES = ['configure.ac', 'configure.in'];
export const AUTOTOOLS_IDENTITY_MAX_BYTES = 256 * 1024;
export const AUTOTOOLS_IDENTITY_MAX_LENGTH = 160;
export const AUTOTOOLS_ROLE_MANIFEST_MAX_BYTES = 256 * 1024;
export const AUTOTOOLS_ROLE_TARGET_LIMIT = 48;
export const AUTOTOOLS_ROLE_ASSIGNMENT_LIMIT = 256;
export const AUTOTOOLS_ROLE_LITERAL_PATH_MAX_LENGTH = 240;
export const AUTOTOOLS_ROLE_SELECTION_PRIORITY = new Map([
  ['Public interface contract', 0],
  ['Core implementation source', 1],
  ['Specialized API source', 2],
  ['Selectable platform backend', 3],
  ['Unclassified native source evidence', 4],
]);
export const AUTOTOOLS_ROLE_CLASSIFICATION_PRIORITY = new Map([
  ['Public interface contract', 0],
  ['Specialized API source', 1],
  ['Core implementation source', 2],
  ['Selectable platform backend', 3],
]);
export const LIBRARY_SOURCE_ELEMENT_LIMIT = 24;
export const IMPLEMENTATION_SOURCE_ELEMENT_LIMIT = 48;
export const CARGO_MANIFEST_MAX_FEATURES = 48;
export const CARGO_MANIFEST_MAX_FEATURE_VALUES = 16;
export const CARGO_MANIFEST_MAX_TOKEN_LENGTH = 80;
export const CARGO_MANIFEST_MAX_DESCRIPTION_LENGTH = 320;
export const CARGO_PACKAGE_EVIDENCE_FIELDS = new Set([
  'name',
  'version',
  'description',
  'edition',
  'rust-version',
]);

// These are deliberately outcome-oriented clues, not a list of framework or
// folder names. They let the deterministic analyzer connect bounded prose to
// implementation evidence while keeping a human/agent approval step between
// a clue and a written business concept. A rule must have both semantic prose
// and a matching implementation witness before it can become a proposal.
export const BUSINESS_CAPABILITY_CLUES = [
  {
    slug: 'capabilities/decision-broadcast',
    title: 'Decision Broadcast',
    domain: 'domains/coordination',
    prose: [
      /\bpublish(?:es|ed|ing)?\b.{0,60}\bdecisions?\b/i,
      /\bdistribut(?:e|es|ed|ing)\b.{0,60}\btimeline updates?\b/i,
    ],
    implementation: [/realtime/i, /timeline/i, /distribut/i],
  },
  {
    slug: 'capabilities/acknowledgement-tracking',
    title: 'Acknowledgement Tracking',
    domain: 'domains/coordination',
    prose: [
      /\b(?:has|have|who has)\s+acknowledged\b/i,
      /\backnowledg(?:e|ed|ement|ements|ing)\b/i,
    ],
    implementation: [/\bweb\b/i, /console/i, /present/i, /timeline/i],
  },
  {
    slug: 'capabilities/workspace-authorization',
    title: 'Workspace Authorization',
    domain: 'domains/access-control',
    prose: [
      /\bworkspace permissions?\b/i,
      /\b(?:read|coordinate|administer)\b.{0,70}\b(?:incident|workspace)\b/i,
      /\b(?:may|can)\s+read\b.{0,70}\badminister\b/i,
    ],
    implementation: [/policy/i, /permission/i, /authori[sz]/i, /access/i],
  },
  {
    slug: 'capabilities/checkout',
    title: 'Checkout',
    domain: 'domains/purchase',
    prose: [
      /\bauthori[sz]e\s+payment\b/i,
      /\border confirmation\b/i,
      /\b(?:purchase|purchase completion)\b/i,
    ],
    implementation: [/checkout/i, /cart/i, /payment/i, /order/i],
  },
  {
    slug: 'capabilities/inventory-sync',
    title: 'Inventory Sync',
    domain: 'domains/inventory',
    prose: [
      /\breconcil\w*\b.{0,70}\b(?:stock|warehouse|availability)\b/i,
      /\b(?:sellable|available) stock\b/i,
      /\binventory availability\b/i,
    ],
    implementation: [/inventory/i, /stock/i, /warehouse/i, /reconcil/i],
  },
  {
    slug: 'capabilities/intake',
    title: 'Document Intake',
    domain: 'domains/intake',
    prose: [
      /\baccept\s+(?:a|the)\s+document\b/i,
      /\bpreserv\w*\b.{0,70}\b(?:source|provenance|identity)\b/i,
      /\bsubmitted business documents?\b/i,
    ],
    implementation: [/\bintake\b/i, /document/i, /provenance/i, /source/i],
  },
  {
    slug: 'capabilities/review',
    title: 'Uncertainty Review',
    domain: 'domains/review',
    prose: [
      /\broute\s+uncertain\b/i,
      /\buncertain\s+(?:fields?|extraction results?)\b/i,
      /\breviewer\s+before\s+(?:records?\s+are\s+)?published\b/i,
    ],
    implementation: [/\breview\b/i, /uncertain/i, /reviewer/i, /publish/i],
  },
];
export const GENERIC_NARRATIVE_CAPABILITY_CLUES = [
  {
    slug: 'capabilities/request-client',
    title: 'Request Client',
    prose: [
      /\b(?:promise[-\s]+based\s+)?(?:http|https)(?:\/\d+(?:\.\d+)?)?\s+client\b/i,
      /\bclient\b.{0,80}\b(?:http|https)(?:\/\d+(?:\.\d+)?)?\s+(?:requests?|responses?|apis?)\b/i,
      /\b(?:make|perform|issue|send)\s+(?:http|https)(?:\/\d+(?:\.\d+)?)?\s+(?:requests?|calls?)\b/i,
    ],
    implementation: [
      /\b(?:client|request|response)s?\b/i,
      /\b(?:adapters?|dispatchers?|transports?|handlers?)\b/i,
      /\b(?:http|https|fetch|xhr)\b/i,
    ],
  },
  {
    slug: 'capabilities/package-management',
    title: 'Package Management',
    prose: [
      /\bpackage manager\b.{0,100}\b(?:keeps?|manages?|resolves?|installs?|publishes?|coordinates?|fast|efficient|strict|deterministic|for|that|which|using)\b/i,
      /\bdependency graph\b.{0,80}\b(?:consistent|resolv|manage|coordinate)/i,
      /\b(?:downloads?|manages?|resolves?|installs?|compiles?)\b.{0,80}\b(?:project|dependencies|packages?)\b/i,
      /\bmonorepos?\b.{0,80}\b(?:support|manage|work|build|coordinate)/i,
    ],
    implementation: [
      /package/i,
      /workspace/i,
      /dependenc/i,
      /lockfile/i,
      /install/i,
    ],
  },
  {
    slug: 'capabilities/data-validation',
    title: 'Data Validation',
    prose: [
      /\bdata validation\b.{0,80}\b(?:using|with|keeps?|rejects?|validat(?:es|ed|ing)?|ensur(?:es|e)|checks?)\b/i,
      /\bvalidat(?:e|es|ed|ing)\b.{0,80}\b(?:data|records?|models?|fields?)\b/i,
    ],
    implementation: [/valid/i, /schema/i, /model/i, /field/i, /parse/i],
  },
  {
    slug: 'capabilities/web-framework',
    title: 'Web Framework',
    prose: [
      /\bweb framework\b.{0,100}\b(?:routes?|serves?|handles?|builds?|provides?|supports?|for|that|which|node\.js)\b/i,
      /\bframework\b.{0,80}\b(?:routes?|serves?|handles?|builds?|for|that|which)\b.{0,40}\b(?:web|http|node\.js)\b/i,
    ],
    implementation: [/web/i, /http/i, /request/i, /response/i, /application/i, /route/i, /url/i],
  },
  {
    slug: 'capabilities/build-tooling',
    title: 'Build Tooling',
    prose: [
      /\b(?:web|javascript|typescript)\s+bundler\b/i,
      /\bbundler\s+project\b/i,
      /\bbundl(?:e|es|ed|ing)\b.{0,80}\b(?:web|javascript|typescript)\b/i,
    ],
    implementation: [/\b(?:bundler|builder|compiler|linker)s?\b/i],
  },
];
export const IMPLEMENTATION_SHAPED_CAPABILITY_TOKENS = new Set([
  'adapter',
  'api',
  'client',
  'config',
  'controller',
  'infra',
  'infrastructure',
  'logger',
  'middleware',
  'policy',
  'registry',
  'router',
  'server',
  'storage',
  'telemetry',
  'transport',
  'ui',
  'web',
]);
export const GENERIC_BUSINESS_CAPABILITY_CANDIDATE_LIMIT = 12;
export const GENERIC_BUSINESS_CAPABILITY_EVIDENCE_LIMIT = 3;
export const SEMANTIC_DISCOVERY_MAX_FILES = 200;
export const SEMANTIC_DISCOVERY_MAX_ENTRIES = 1000;
export const SEMANTIC_DISCOVERY_ROOTS = ['docs', 'site', 'website'];
export const SEMANTIC_DISCOVERY_SKIP_DIRS = new Set([
  '_theme',
  'archive',
  'assets',
  'benchmarks',
  'evaluations',
  'goals',
  'images',
  'ontology',
]);
export const IGNORE_ARRAY_MAX_ITEMS = 200;

export const ELEMENT_ENTRY_FILES = [
  'index.ts',
  'index.tsx',
  'index.js',
  'index.mjs',
  'main.ts',
  'main.js',
];
