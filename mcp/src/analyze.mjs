// R16 (b3) — analyze_repo_structure
//
// AI agent (Claude Code, Codex, Cursor) 가 사용자 한 줄 "이 codebase 분석해줘"
// 후 호출할 *deterministic* 도구. side effect 0 — vault 변경 안 함, 후보만
// 제안. agent 가 사용자에게 보여주고 *명시 add_concept* 호출.
//
// 단일 source of truth 보존:
//   - 결과는 return only. vault frontmatter 직접 안 건드림.
//   - 사용자 검토 + 명시 add 로만 vault 진입 → drift 0.
//
// 감지 패턴 (generic — 80% codebase cover. 더 정교한 framework 별 detect 는
// 후속 도구 — infer_imports / extract_domains_from_readme 등):
//   - package.json `name` → project slug + title
//   - README.md 첫 H1 → project title (package.json 없으면 fallback)
//   - README.md H2 sections → domain 후보
//   - src/ (또는 root) 깊이 1 폴더 → capability 후보 (단 dotfile / 일반 무시
//     폴더 제외)
//   - 각 capability 폴더의 main file (index.ts/js/mjs/tsx) → element 후보
//
// 결과 shape:
//   {
//     rootPath, framework: 'fsd' | 'next' | 'generic',
//     project?: { slug, title, definition, evidence, includes, excludes, confidence, uncertainty },
//     domains: [{ slug, title, evidence: { source, line? } }],
//     capabilities: [{ slug, title, evidence: { source } }],
//     elements: [{ slug, title, path, evidence: { source } }],
//       — slug 는 평평한 role 이름 (경로는 path/evidence 로만; 2026-08-01 판정)
//     meaningGate: {
//       policy: 'business-first',
//       sourceStructureRole: 'implementation-evidence',
//       businessOntology: { domains: [slug], capabilities: [slug], evidence: [{ slug, kind, source }] },
//       proposedBusinessOntology: {
//         domains: [{ slug, reason, evidence, title, definition, includes, excludes, confidence, uncertainty, evidenceSources }],
//         capabilities: [{ slug, reason, evidence, title, definition, includes, excludes, confidence, uncertainty, evidenceSources }],
//       },
//       implementationEvidence: { elements: [slug], reviewRequiredCapabilities: [{ slug, reason, evidence }] },
//       reviewQuestions: [string],
//     },
//     extractionContract: {
//       standard, status, assertionPolicy,
//       competencyQuestions: [{ id, type, question, priority, requiredWitnesses }],
//       qualityGates,
//     },
//     semanticEvidence: [{ source, role, title, headings, excerpt, trust, riskFlags }],
//     suggestedRelations: [{ from, to, type }],
//     skipped: [{ path, reason }],
//   }

import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
  realpathSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename, relative, isAbsolute, sep, dirname } from 'node:path';
import {
  COMPETENCY_QUESTION_CONTRACTS,
  validateMeaningProposalAgainstAnalysis,
} from './meaning-evaluation.mjs';
import { evaluateConstructionLifecycle } from './construction-lifecycle.mjs';
import { discoverDeclaredWorkspacePackages, inferImports } from './infer-imports.mjs';
import { collectRustFeatureConfigurationEvidence } from './rust-feature-evidence.mjs';

/**
 * FSD 모드가 **실제로 훑는** 폴더. 판정 목록과 스캔 목록이 같아야 한다 —
 * 갈라지면 "이 저장소는 FSD 다" 라고 부르면서 아무것도 안 읽는 상태가 생긴다
 * (2026-07-28 실측: `src/shared/` 하나로 그 상태에 빠졌다).
 */
const FSD_SCAN_ROOTS = ['features', 'entities', 'widgets', 'views'];

const DEFAULT_IGNORE = new Set([
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

const SOURCE_FOLDERS = ['src', 'source', 'lib', 'app', 'internal'];
const IMPLEMENTATION_ONLY_SOURCE_FOLDERS = new Set(['internal']);
const WORKSPACE_FOLDERS = ['apps', 'packages'];
const SOURCE_LAYOUT_COORDINATION_ELEMENT_LIMIT = 10;
const SOURCE_LAYOUT_COORDINATION_ROLE =
  /(?:^|[-_.])(app|main|index|manager|loader|registry|storage|client|server|router|controller)(?:[-_.]|$)/i;
const SOURCE_LAYOUT_CODE_FILE = /\.(?:[cm]?[jt]sx?|py)$/i;
const NATIVE_SOURCE_FILE = /\.(?:c|h)$/i;
const NATIVE_ROLE_EVIDENCE_FILE = /\.(?:c|h(?:\.in)?)$/i;
const PYTHON_NON_PRODUCT_PACKAGES = new Set(['test', 'tests']);
const PYTHON_IMPORT_ELEMENT_LIMIT = 12;
const PYTHON_IMPORT_RISK_ELEMENT_LIMIT = 2;
const STARTER_ONTOLOGY_SLUGS = new Set([
  'domains/example-domain',
  'capabilities/example-capability',
]);
const SEMANTIC_EVIDENCE_SEEDS = [
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
const SEMANTIC_EVIDENCE_MAX_EXCERPT = 1200;
const SEMANTIC_EVIDENCE_MAX_HEADINGS = 8;
const SEMANTIC_EVIDENCE_MAX_DOCUMENTS = 6;
const SEMANTIC_EVIDENCE_MAX_BYTES = 256 * 1024;
const WORKSPACE_SEMANTIC_EVIDENCE_MAX_MEMBERS = 48;
const WORKSPACE_ELEMENT_LIMIT = 48;
const NODE_PACKAGE_DESCRIPTION_MAX_LENGTH = 320;
const CARGO_MANIFEST_MAX_BYTES = 256 * 1024;
const PYTHON_SETUP_MAX_BYTES = 256 * 1024;
const PYTHON_PROJECT_MAX_BYTES = 256 * 1024;
const NODE_PACKAGE_MANIFEST_MAX_BYTES = 256 * 1024;
const NODE_PACKAGE_EXPORT_LIMIT = 24;
const NODE_PACKAGE_SCRIPT_LIMIT = 24;
const NODE_PACKAGE_DEPENDENCY_LIMIT = 48;
const RUST_IMPLEMENTATION_ELEMENT_LIMIT = 24;
const RUST_MODULES_PER_TARGET_LIMIT = 12;
const RUST_SOURCE_MAX_BYTES = 256 * 1024;
const NATIVE_SOURCE_ELEMENT_LIMIT = 36;
const NATIVE_DOC_BUILD_ELEMENT_LIMIT = 12;
const AUTOTOOLS_IMPLEMENTATION_MANIFESTS = new Map([
  ['configure.ac', { slug: 'elements/autotools-configure', title: 'Autotools Configure' }],
  ['configure.in', { slug: 'elements/autotools-configure', title: 'Autotools Configure' }],
  ['Makefile.am', { slug: 'elements/autotools-build', title: 'Autotools Build' }],
]);
const AUTOTOOLS_IDENTITY_FILES = ['configure.ac', 'configure.in'];
const AUTOTOOLS_IDENTITY_MAX_BYTES = 256 * 1024;
const AUTOTOOLS_IDENTITY_MAX_LENGTH = 160;
const AUTOTOOLS_ROLE_MANIFEST_MAX_BYTES = 256 * 1024;
const AUTOTOOLS_ROLE_TARGET_LIMIT = 48;
const AUTOTOOLS_ROLE_ASSIGNMENT_LIMIT = 256;
const AUTOTOOLS_ROLE_LITERAL_PATH_MAX_LENGTH = 240;
const AUTOTOOLS_ROLE_SELECTION_PRIORITY = new Map([
  ['Public interface contract', 0],
  ['Core implementation source', 1],
  ['Specialized API source', 2],
  ['Selectable platform backend', 3],
  ['Unclassified native source evidence', 4],
]);
const AUTOTOOLS_ROLE_CLASSIFICATION_PRIORITY = new Map([
  ['Public interface contract', 0],
  ['Specialized API source', 1],
  ['Core implementation source', 2],
  ['Selectable platform backend', 3],
]);
const LIBRARY_SOURCE_ELEMENT_LIMIT = 24;
const IMPLEMENTATION_SOURCE_ELEMENT_LIMIT = 48;
const CARGO_MANIFEST_MAX_FEATURES = 48;
const CARGO_MANIFEST_MAX_FEATURE_VALUES = 16;
const CARGO_MANIFEST_MAX_TOKEN_LENGTH = 80;
const CARGO_MANIFEST_MAX_DESCRIPTION_LENGTH = 320;
const CARGO_PACKAGE_EVIDENCE_FIELDS = new Set([
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
const BUSINESS_CAPABILITY_CLUES = [
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
const GENERIC_NARRATIVE_CAPABILITY_CLUES = [
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
const IMPLEMENTATION_SHAPED_CAPABILITY_TOKENS = new Set([
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
const GENERIC_BUSINESS_CAPABILITY_CANDIDATE_LIMIT = 12;
const GENERIC_BUSINESS_CAPABILITY_EVIDENCE_LIMIT = 3;
const SEMANTIC_DISCOVERY_MAX_FILES = 200;
const SEMANTIC_DISCOVERY_MAX_ENTRIES = 1000;
const SEMANTIC_DISCOVERY_ROOTS = ['docs', 'site', 'website'];
const SEMANTIC_DISCOVERY_SKIP_DIRS = new Set([
  '_theme',
  'archive',
  'assets',
  'benchmarks',
  'evaluations',
  'goals',
  'images',
  'ontology',
]);
const IGNORE_ARRAY_MAX_ITEMS = 200;

const ELEMENT_ENTRY_FILES = [
  'index.ts',
  'index.tsx',
  'index.js',
  'index.mjs',
  'main.ts',
  'main.js',
];

/**
 * 한 codebase 의 root 를 walk + README 분석 → ontology node 후보 list.
 *
 * @param {string} rootPath — 분석할 디렉토리 (보통 cwd 또는 user-provided).
 * @param {{ maxDepth?: number, ignore?: string[], precomputedPythonImports?: object|null }} options
 * @returns analysis result
 */
export function analyzeRepoStructure(rootPath, options = {}) {
  validateRootPath(rootPath);
  if (!existsSync(rootPath) || !statSync(rootPath).isDirectory()) {
    throw new Error(`rootPath not a directory: ${rootPath}`);
  }
  const maxDepth = optionalNonNegativeInteger(options.maxDepth, 'maxDepth', { max: 10 }) ?? 2;
  const extraIgnore = optionalStringArray(options.ignore, 'ignore', {
    max: IGNORE_ARRAY_MAX_ITEMS,
  });
  const ignore = new Set([
    ...DEFAULT_IGNORE,
    ...extraIgnore,
  ]);

  const skipped = [];
  const workspaceDiscovery = discoverDeclaredWorkspacePackages(rootPath, { ignore });
  skipped.push(...workspaceDiscovery.skipped);
  let project = detectProject(rootPath, skipped);
  const { domains, readmePath } = detectDomainsFromReadme(rootPath);
  const existingOntologyEvidence = detectExistingOntologyEvidence(rootPath, skipped);
  const semanticEvidence = collectSemanticEvidence(rootPath, skipped);
  project = enrichProjectCandidate(project, semanticEvidence);
  const configurationEvidence = collectRustFeatureConfigurationEvidence(rootPath);
  const domainForName = (name) => matchDomainSlug(name, domains);

  // SOURCE_FOLDERS 중 첫 번째 존재하는 것을 src dir 로
  let srcDir = null;
  for (const cand of SOURCE_FOLDERS) {
    const p = join(rootPath, cand);
    if (existsSync(p) && statSync(p).isDirectory()) {
      srcDir = p;
      break;
    }
  }
  const sourcePythonPackagePaths = discoverSourcePythonPackagePaths(rootPath, {
    srcDir,
    ignore,
    skipped,
  });
  const sourcePythonPackagePathSet = new Set(sourcePythonPackagePaths);
  const rustImplementationEvidence = discoverRustImplementationEvidence(rootPath, skipped);
  const nativeImplementationEvidence = discoverAutotoolsImplementationEvidence(rootPath, {
    ignore,
    skipped,
  });

  // framework heuristic — *features/* 만 있어도 fsd 로 (ontology-atlas 자체
  // 같이 lean FSD).
  //
  // **판정은 훑을 수 있는 폴더로만 한다** (2026-07-28 도그푸딩 실측 수정).
  // 종전 marker 목록에는 `shared` 가 있었는데, 그 이름은 아무 TS/Node
  // 프로젝트에나 흔하다. `src/shared/` 하나만 있어도 fsd 로 판정됐고, 그러면
  // 아래 FSD 경로가 `features/entities/widgets/views` 만 훑으므로 그중 아무것도
  // 없는 저장소는 **capabilities 0 · elements 0** 을 조용히 반환했다 — 응답
  // 어디에도 "framework 판정 때문에 0" 이라는 말이 없이. 같은 호출 안의
  // `inferImports` 는 같은 저장소에서 기능 폴더를 정확히 뽑아내므로, 두 도구가
  // 같은 저장소를 두고 서로 다른 말을 하고 있었다.
  //
  // 규율: **판정이 읽을 것을 바꾸지 못하면 그 판정을 하지 않는다.** fsd 로
  // 부르는 유일한 결과가 "훑을 폴더가 없다" 면 그 이름은 억제 말고는 하는
  // 일이 없다.
  let framework = 'generic';
  if (srcDir) {
    const subs = readdirSync(srcDir).filter((s) =>
      statSync(join(srcDir, s)).isDirectory(),
    );
    const fsdHits = subs.filter((s) => FSD_SCAN_ROOTS.includes(s)).length;
    if (fsdHits >= 1) framework = 'fsd';
  }
  if (existsSync(join(rootPath, 'next.config.js')) || existsSync(join(rootPath, 'next.config.ts'))) {
    framework = framework === 'fsd' ? 'fsd' : 'next';
  }

  const capabilities = [];
  const elements = [];

  if (srcDir) {
    if (basename(srcDir) === 'source') {
      for (const entry of readdirSync(srcDir).sort()) {
        if (elements.length >= SOURCE_LAYOUT_COORDINATION_ELEMENT_LIMIT) break;
        if (
          ignore.has(entry) ||
          entry.startsWith('.') ||
          /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/i.test(entry) ||
          !SOURCE_LAYOUT_CODE_FILE.test(entry) ||
          !SOURCE_LAYOUT_COORDINATION_ROLE.test(entry)
        ) {
          continue;
        }
        const entryPath = join(srcDir, entry);
        if (!statSync(entryPath).isFile()) continue;
        const stem = entry.replace(SOURCE_LAYOUT_CODE_FILE, '');
        const name = slugify(stem.replace(/_/g, '-'));
        if (!name) continue;
        const source = relative(rootPath, entryPath);
        elements.push({
          slug: `elements/${name}`,
          title: humanize(name),
          ...(domainForName(name) ? { domain: domainForName(name) } : {}),
          path: source,
          evidence: { source },
        });
      }
    }
    // FSD pattern — features/ 가 capability 의 main 영역
    const fsdRoots = framework === 'fsd' ? FSD_SCAN_ROOTS : null;

    if (fsdRoots) {
      // 슬러그는 평평한 식별자다 (2026-08-01 판정 — docs/DECISIONS.md).
      // 종전에는 `elements/${relative(rootPath, subPath)}` 를 제안해 규격
      // 문맥 없는 에이전트가 경로형 슬러그 43개를 **그대로** 볼트에 실었다
      // — 이 생성기가 재생성 볼트 결함의 1차 유도원이었다. 이제 이름(role)은
      // 슬러그에, 위치는 `path` 에 싣고, basename 이 레이어를 넘어 겹치면
      // (`entities/docs-vault` vs `views/docs-vault`) 레이어 단수형 접미로
      // 결정론적으로 갈라 tail 충돌을 생성 시점에 없앤다.
      const elementCandidates = [];
      for (const r of fsdRoots) {
        const dir = join(srcDir, r);
        if (!existsSync(dir)) continue;
        for (const sub of readdirSync(dir)) {
          if (ignore.has(sub) || sub.startsWith('.')) {
            skipped.push({ path: join(dir, sub), reason: 'dotfile/ignore' });
            continue;
          }
          const subPath = join(dir, sub);
          if (!statSync(subPath).isDirectory()) continue;
          // FSD semantics: features are user-facing capability candidates;
          // entities/widgets/views are implementation evidence, not business
          // capabilities merely because they have a directory.
          if (r === 'features') {
            capabilities.push({
              slug: `capabilities/${sub}`,
              title: humanize(sub),
              ...(domainForName(sub)
                ? { domain: domainForName(sub) }
                : {}),
              evidence: { source: relative(rootPath, subPath) },
            });
          } else {
            elementCandidates.push({ layer: r, sub, subPath });
          }
        }
      }
      const nameCount = new Map();
      for (const cand of elementCandidates) {
        nameCount.set(cand.sub, (nameCount.get(cand.sub) ?? 0) + 1);
      }
      for (const { layer, sub, subPath } of elementCandidates) {
        const collides = (nameCount.get(sub) ?? 0) > 1;
        const layerSingular = layer.replace(/ies$/, 'y').replace(/s$/, '');
        const name = collides ? `${sub}-${layerSingular}` : sub;
        elements.push({
          slug: `elements/${name}`,
          title: collides ? `${humanize(sub)} (${layerSingular})` : humanize(sub),
          ...(domainForName(sub) ? { domain: domainForName(sub) } : {}),
          path: relative(rootPath, subPath),
          evidence: { source: relative(rootPath, subPath) },
        });
      }
    } else if (!nativeImplementationEvidence.isNativeProject) {
      // generic — src/ 의 깊이 1 폴더 만
      let directLibraryElementCount = 0;
      let directLibraryLimitRecorded = false;
      let directImplementationElementCount = 0;
      let directImplementationLimitRecorded = false;
      for (const sub of readdirSync(srcDir).sort()) {
        if (ignore.has(sub) || sub.startsWith('.')) {
          skipped.push({ path: join(srcDir, sub), reason: 'dotfile/ignore' });
          continue;
        }
        const subPath = join(srcDir, sub);
        const subStat = statSync(subPath);
        const source = relative(rootPath, subPath);
        if (
          sourcePythonPackagePathSet.has(source) ||
          rustImplementationEvidence.skipDirectories.has(source)
        ) {
          continue;
        }
        if (IMPLEMENTATION_ONLY_SOURCE_FOLDERS.has(basename(srcDir))) {
          // Some large repositories keep product implementation below an
          // internal/ root instead of src/ or lib/. Its direct children are
          // implementation evidence only: a folder name must not become a
          // business capability without trusted narrative evidence.
          if (!subStat.isDirectory()) continue;
          if (directImplementationElementCount >= IMPLEMENTATION_SOURCE_ELEMENT_LIMIT) {
            if (!directImplementationLimitRecorded) {
              skipped.push({
                path: srcDir,
                reason: `implementation-source-element-limit: omitted direct internal entries after ${IMPLEMENTATION_SOURCE_ELEMENT_LIMIT}`,
              });
              directImplementationLimitRecorded = true;
            }
            continue;
          }
          const slug = slugify(sub);
          if (!slug) continue;
          elements.push({
            slug: `elements/${slug}`,
            title: humanize(slug),
            ...(domainForName(slug) ? { domain: domainForName(slug) } : {}),
            path: source,
            evidence: { source },
          });
          directImplementationElementCount += 1;
          continue;
        }
        if (basename(srcDir) === 'lib') {
          if (subStat.isDirectory()) {
            elements.push({
              slug: `elements/${sub}`,
              title: humanize(sub),
              ...(domainForName(sub) ? { domain: domainForName(sub) } : {}),
              path: source,
              evidence: { source },
            });
            continue;
          }
          if (
            !subStat.isFile() ||
            !SOURCE_LAYOUT_CODE_FILE.test(sub) ||
            /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/i.test(sub)
          ) {
            continue;
          }
          if (directLibraryElementCount >= LIBRARY_SOURCE_ELEMENT_LIMIT) {
            if (!directLibraryLimitRecorded) {
              skipped.push({
                path: srcDir,
                reason: `library-source-element-limit: omitted direct lib files after ${LIBRARY_SOURCE_ELEMENT_LIMIT}`,
              });
              directLibraryLimitRecorded = true;
            }
            continue;
          }
          const name = slugify(sub.replace(SOURCE_LAYOUT_CODE_FILE, ''));
          const slug = name ? `elements/${name}` : null;
          if (slug && !elements.some((element) => element.slug === slug)) {
            elements.push({
              slug,
              title: humanize(name),
              ...(domainForName(name) ? { domain: domainForName(name) } : {}),
              path: source,
              evidence: { source },
            });
            directLibraryElementCount += 1;
          }
          continue;
        }
        if (!subStat.isDirectory()) continue;
        capabilities.push({
          slug: `capabilities/${sub}`,
          title: humanize(sub),
          ...(domainForName(sub)
            ? { domain: domainForName(sub) }
            : {}),
          evidence: { source: relative(rootPath, subPath) },
        });
        // index 파일이 있으면 element 추가 — 슬러그는 role 이름, 위치는 path 로.
        for (const entry of ELEMENT_ENTRY_FILES) {
          const ep = join(subPath, entry);
          if (existsSync(ep)) {
            elements.push({
              slug: `elements/${sub}-entry`,
              title: `${humanize(sub)} entry`,
              ...(domainForName(sub) ? { domain: domainForName(sub) } : {}),
              path: relative(rootPath, ep),
              evidence: { source: relative(rootPath, ep) },
            });
            break;
          }
        }
      }
    }
  }

  // Native C projects expose source files and build manifests directly rather
  // than through the JS/Python folder conventions above. Keep those paths as
  // implementation evidence; the meaning gate still prevents them from
  // becoming business capabilities without semantic witnesses.
  elements.push(...nativeImplementationEvidence.elements);

  // Repositories may have both a conventional lib/ or src/ root and a
  // separately owned internal/ implementation tree. Keep the primary-root
  // behavior above, but admit bounded internal evidence as an additional
  // implementation witness instead of silently dropping it.
  for (const candidate of IMPLEMENTATION_ONLY_SOURCE_FOLDERS) {
    if (candidate === basename(srcDir ?? '')) continue;
    const implementationRoot = join(rootPath, candidate);
    if (!existsSync(implementationRoot) || !statSync(implementationRoot).isDirectory()) {
      continue;
    }
    elements.push(
      ...materializeImplementationOnlySourceElements(rootPath, implementationRoot, {
        ignore,
        domainForName,
        existingElements: elements,
        skipped,
      }),
    );
  }

  const workspaceElementAdmission = detectWorkspaceElements(rootPath, {
    ignore,
    domainForName,
    skipped,
    workspaceDiscovery,
    existingElements: elements,
  });
  elements.push(...workspaceElementAdmission.elements);
  const sourcePythonPackages = materializePythonPackageElements(
    sourcePythonPackagePaths,
    { domainForName, existingElements: elements },
  );
  elements.push(...sourcePythonPackages);
  elements.push(
    ...materializeRustImplementationElements(rustImplementationEvidence.rows, {
      existingElements: elements,
    }),
  );
  elements.push(
    ...detectRootPackages(rootPath, {
      ignore,
      domainForName,
      existingElements: elements,
    }),
  );
  const rootPythonPackages = detectRootPythonPackages(rootPath, {
    ignore,
    domainForName,
    existingElements: elements,
    skipped,
  });
  elements.push(...rootPythonPackages);
  const importAnalysis = Object.hasOwn(options, 'precomputedPythonImports')
    ? options.precomputedPythonImports
    : analyzeImportsForElementEvidence(rootPath, {
        extraIgnore,
        skipped,
        workspaceDiscovery,
        admittedWorkspacePackages: workspaceElementAdmission.packages,
      });
  const pythonImportBoundaryElements = detectPythonImportBoundaryElements(rootPath, {
    ignore,
    domainForName,
    existingElements: elements,
    rootPythonPackages,
    sourcePythonPackages,
    imports: importAnalysis,
    skipped,
  });
  elements.push(...pythonImportBoundaryElements);

  const semanticCapabilityCandidates = deriveBusinessCapabilityCandidates({
    domains,
    capabilities,
    elements,
    semanticEvidence,
  });

  // Element paths are implementation observations. Even an exact token match
  // with a README domain name does not prove that implementation role, so raw
  // elements stay project-scoped until a reviewed capability/element relation
  // carries role-specific evidence.
  for (const element of elements) delete element.domain;

  // Suggested relations form one coherent containment spine. A README-backed
  // domain sits under the project; matched capability candidates may sit under
  // that domain. Raw implementation elements remain directly under the project
  // instead of inventing business-role meaning from a name match.
  const suggestedRelations = [];
  if (project) {
    for (const domain of domains) {
      suggestedRelations.push({
        from: project.slug,
        to: domain.slug,
        type: 'contains',
      });
    }
    for (const node of [...capabilities, ...elements]) {
      suggestedRelations.push({
        from: node.domain ?? project.slug,
        to: node.slug,
        type: 'contains',
      });
    }
  }
  suggestedRelations.push(
    ...buildSuggestedDependencyRelations(importAnalysis?.moduleEdges ?? [], [
      ...capabilities,
      ...elements,
    ]),
  );
  if (maxDepth > 0); // reserved for deeper element walking

  void readmePath; // signal used

  const result = {
    rootPath,
    framework,
    project,
    domains,
    capabilities,
    elements,
    meaningGate: buildMeaningGate({
      domains,
      capabilities,
      semanticCapabilityCandidates,
      elements,
      existingOntologyEvidence,
      observedDependencyRelations: (importAnalysis?.moduleEdges ?? []).map(
        (relation) => ({ ...relation, type: 'depends_on' }),
      ),
      semanticEvidence,
    }),
    extractionContract: buildExtractionContract({
      project,
      domains,
      capabilities,
      semanticCapabilityCandidates,
      elements,
      existingOntologyEvidence,
      suggestedRelations,
      semanticEvidence,
    }),
    semanticEvidence,
    configurationEvidence,
    suggestedRelations,
    skipped,
  };
  const proposalValidation = validateMeaningProposalAgainstAnalysis(
    result,
    options.proposal,
    {
      observedImportEdges: importAnalysis?.edges ?? [],
      observedImportRelations: importAnalysis?.moduleEdges ?? [],
      importBoundaryElements: pythonImportBoundaryElements,
    },
  );
  const candidateWritePlan = proposalValidation.writePlan;
  delete proposalValidation.writePlan;
  const lifecycleWithPlans = evaluateConstructionLifecycle({
    reviewPlan: candidateWritePlan,
    sourceDigest: options.sourceDigest,
    expectedProjectSlug: options.proposal?.project?.slug,
    qualification: options.qualification,
    proposalFindings: proposalValidation.findings,
  });
  const { reviewPlan, writePlan, ...constructionLifecycle } = lifecycleWithPlans;
  proposalValidation.canWrite = constructionLifecycle.writeEligibility === 'executable';
  proposalValidation.constructionLifecycle = constructionLifecycle;
  if (reviewPlan) proposalValidation.reviewPlan = reviewPlan;
  if (writePlan) proposalValidation.writePlan = writePlan;
  proposalValidation.nextStep = constructionLifecycle.nextAction;
  return { ...result, proposalValidation };
}

/**
 * Turn the candidate-only result into an independently reviewable, but never
 * self-qualifying, competency packet. The statuses here describe how much of
 * the proposal can be inspected from this bounded result; they are deliberately
 * not the qualification contract's `answered` status.
 */
export function buildProposalAssessment(result) {
  const {
    project,
    domains,
    capabilities,
    elements,
    meaningGate,
    extractionContract,
    semanticEvidence,
    suggestedRelations,
    skipped,
  } = result;
  const candidateDomains = meaningGate.proposedBusinessOntology.domains;
  const candidateCapabilities = meaningGate.proposedBusinessOntology.capabilities;
  const persistedDomains = meaningGate.businessOntology.domains;
  const persistedCapabilities = meaningGate.businessOntology.capabilities;
  const dependencyRelations = suggestedRelations.filter((relation) => relation.type === 'depends_on');
  const productionBoundaryCount = extractionContract.qualityGates.typedRelationsProposed
    - suggestedRelations.filter((relation) => relation.type === 'contains').length;
  const trustedEvidence = semanticEvidence.filter((row) => row.trust === 'candidate-evidence');
  const riskEvidence = semanticEvidence.filter((row) => row.riskFlags.length > 0);
  const digestInput = {
    framework: result.framework,
    project,
    domains,
    capabilities,
    elements,
    meaningGate,
    extractionContract,
    semanticEvidence,
    configurationEvidence: result.configurationEvidence,
    suggestedRelations,
    skipped,
  };
  const sourceRefs = uniqueStrings(trustedEvidence.map((row) => row.source));
  const projectRefs = project ? [project.slug] : [];
  const domainRefs = uniqueStrings([
    ...domains.map((row) => row.slug),
    ...candidateDomains.map((row) => row.slug),
  ]);
  const capabilityRefs = uniqueStrings([
    ...capabilities.map((row) => row.slug),
    ...candidateCapabilities.map((row) => row.slug),
  ]);
  const elementRefs = elements.map((row) => row.slug);

  const evidence = {
    project: project
      ? [
          {
            evidenceType: 'project-purpose',
            sourceRef: project.evidence?.[0] ?? sourceRefs[0] ?? 'repository-root',
            location: project.evidence?.[0] ?? 'repository-root',
            excerpt: project.definition ?? project.title,
            resolution: project.definition ? 'bounded-candidate' : 'identity-only',
            supports: Boolean(project.definition && project.evidence?.length),
          },
        ]
      : [],
    domains: candidateDomains.slice(0, 12).map((row) => ({
      evidenceType: 'domain-candidate',
      sourceRef: row.evidence?.source ?? 'repository-structure',
      location: row.evidence?.line ? `${row.evidence.source}:${row.evidence.line}` : row.evidence?.source ?? 'repository-structure',
      excerpt: row.definition ?? row.reason,
      resolution: row.confidence >= 0.8 ? 'bounded-candidate' : 'proposal-only',
      supports: Boolean(row.evidence?.source),
    })),
    capabilities: candidateCapabilities.slice(0, 12).map((row) => ({
      evidenceType: 'capability-candidate',
      sourceRef: row.evidence?.source ?? row.evidenceSources?.[0] ?? 'repository-structure',
      location: row.evidence?.implementation ?? row.evidence?.source ?? 'repository-structure',
      excerpt: row.definition ?? row.reason,
      resolution: row.confidence >= 0.8 ? 'bounded-candidate' : 'proposal-only',
      supports: Boolean(row.evidence?.source || row.evidenceSources?.length),
    })),
    elements: elements.slice(0, 24).map((row) => ({
      evidenceType: 'implementation-path',
      sourceRef: row.evidence?.source ?? row.path,
      location: row.path,
      excerpt: `${row.title}; observed implementation path: ${row.path}`,
      resolution: 'path-observed',
      supports: Boolean(row.path && row.evidence?.source),
    })),
    relations: dependencyRelations.slice(0, 24).map((row) => ({
      evidenceType: 'static-production-import',
      sourceRef: row.evidence?.[0] ?? 'infer_imports',
      location: row.evidence?.join(', ') ?? 'infer_imports',
      excerpt: row.why,
      resolution: 'static-only',
      supports: Boolean(row.from && row.to && row.evidence?.length),
    })),
    omissions: skipped.slice(0, 12).map((row) => ({
      evidenceType: 'bounded-scan-omission',
      sourceRef: row.path,
      location: row.path,
      excerpt: row.reason,
      resolution: 'bounded-scan',
      supports: false,
    })),
  };

  const questions = [
    makeAssessmentQuestion({
      id: 'scope',
      status: project?.definition && project?.evidence?.length ? 'partial' : 'missing',
      statusReason: project?.definition
        ? 'A repository-purpose candidate is bounded by evidence, but no shared semantic approval is present.'
        : 'No bounded project-purpose witness was found in the scanned evidence.',
      claim: project?.definition ?? 'Repository purpose is not established by this bounded scan.',
      candidateRefs: projectRefs,
      questionEvidence: evidence.project,
      limits: [
        'Repository prose is a proposal witness, not a shared business assertion.',
        ...(project?.excludes ?? []),
      ],
      nextAction: {
        action: 'qualify_project_scope',
        targets: sourceRefs.slice(0, 6),
        completionCriterion: 'An independent evaluator confirms the purpose, includes, and excludes against portable evidence.',
      },
    }),
    makeAssessmentQuestion({
      id: 'domains',
      status: persistedDomains.length > 0
        ? 'reviewable_candidate'
        : candidateDomains.length > 0
          ? 'partial'
          : 'missing',
      statusReason: persistedDomains.length > 0
        ? 'Persisted domain evidence is available for review.'
        : candidateDomains.length > 0
          ? 'Domain-shaped candidates exist, but repository headings do not establish stable business boundaries.'
          : 'No bounded domain candidate with independent evidence was found.',
      claim: candidateDomains.length > 0
        ? `${candidateDomains.length} bounded domain candidate(s) require boundary review.`
        : 'No business domain boundary is asserted.',
      candidateRefs: domainRefs,
      questionEvidence: evidence.domains,
      limits: [
        'README headings and folder names are structural clues, not shared domain meaning.',
        'Overlaps, ownership, and external-system boundaries are not established by this scan.',
      ],
      nextAction: {
        action: 'confirm_domain_boundaries',
        targets: domainRefs.slice(0, 12),
        completionCriterion: 'Each retained domain has an independent responsibility sentence, excludes, and evidence-backed placement.',
      },
    }),
    makeAssessmentQuestion({
      id: 'abilities',
      status: candidateCapabilities.length > 0
        ? 'reviewable_candidate'
        : capabilities.length > 0
          ? 'partial'
          : 'missing',
      statusReason: candidateCapabilities.length > 0
        ? 'Outcome-oriented candidate abilities have bounded prose and implementation witnesses, but remain unqualified.'
        : capabilities.length > 0
          ? 'Implementation-shaped capabilities exist without enough independent business outcome evidence.'
          : 'No capability candidate was found.',
      claim: candidateCapabilities.length > 0
        ? `${candidateCapabilities.length} outcome-oriented capability candidate(s) are reviewable without automatic promotion.`
        : 'No business ability is asserted by this bounded scan.',
      candidateRefs: capabilityRefs,
      questionEvidence: evidence.capabilities,
      limits: [
        'A capability candidate is not a persisted capability and cannot be admitted automatically.',
        'The scan does not establish ownership, user success criteria, or complete behavior.',
      ],
      nextAction: {
        action: 'confirm_capability_outcomes',
        targets: capabilityRefs.slice(0, 12),
        completionCriterion: 'Each retained ability states an observable outcome, responsibility boundary, excludes, and evidence path.',
      },
    }),
    makeAssessmentQuestion({
      id: 'evidence',
      status: elements.length > 0 && elements.every((row) => row.path && row.evidence?.source)
        ? 'reviewable_candidate'
        : elements.length > 0
          ? 'partial'
          : 'missing',
      statusReason: elements.length > 0
        ? 'Implementation elements expose bounded repository-relative paths; role accuracy still requires review.'
        : 'No implementation element path was admitted by this bounded scan.',
      claim: `${elements.length} implementation element candidate(s) carry repository-relative evidence paths.`,
      candidateRefs: elementRefs,
      questionEvidence: evidence.elements,
      limits: [
        'A path proves an observable implementation location, not the business role assigned to it.',
        'Unsupported languages, runtime behavior, and tests are not silently inferred.',
      ],
      nextAction: {
        action: 'resolve_implementation_citations',
        targets: elementRefs.slice(0, 24),
        completionCriterion: 'Every retained ability has an exact, portable implementation path whose role is independently confirmed.',
      },
    }),
    makeAssessmentQuestion({
      id: 'impact',
      status: dependencyRelations.length > 0 ? 'reviewable_candidate' : 'unmeasured',
      statusReason: dependencyRelations.length > 0
        ? 'Static production import boundaries are available as review candidates; runtime impact is not measured.'
        : productionBoundaryCount > 0
          ? 'Typed import boundaries were observed, but no bounded dependency proposal was safe to emit.'
          : 'No production dependency witness was available in this bounded scan.',
      claim: dependencyRelations.length > 0
        ? `${dependencyRelations.length} bounded static dependency candidate(s) are available for impact review.`
        : 'Impact remains unmeasured.',
      candidateRefs: uniqueStrings(dependencyRelations.flatMap((row) => [row.from, row.to])),
      questionEvidence: evidence.relations,
      limits: [
        'Static imports are not runtime impact, business dependency, or approval to write depends_on.',
        'A dependency relation requires exact direction, rationale, and independent semantic review.',
      ],
      nextAction: {
        action: 'review_dependency_impact',
        targets: dependencyRelations.slice(0, 24).map((row) => `${row.from}->${row.to}`),
        completionCriterion: 'An independent evaluator confirms direction and business impact, or records a visible gap without promotion.',
      },
    }),
    makeAssessmentQuestion({
      id: 'omissions',
      status: skipped.length > 0 || extractionContract.limitations.length > 0 ? 'partial' : 'unmeasured',
      statusReason: 'The scan reports bounded omissions and limitations, but cannot establish the behavior of what it did not inspect.',
      claim: `${skipped.length} bounded scan omission(s) and ${extractionContract.limitations.length} general limitation(s) are visible.`,
      candidateRefs: uniqueStrings([...projectRefs, ...domainRefs, ...capabilityRefs]),
      questionEvidence: evidence.omissions,
      limits: [
        'Runtime, test, package, external-system, and unsupported-language behavior may remain outside this scan.',
        'A missing witness is not evidence that the behavior does not exist.',
      ],
      nextAction: {
        action: 'inspect_omitted_behavior',
        targets: uniqueStrings(skipped.map((row) => row.path)).slice(0, 12),
        completionCriterion: 'Each omission is either covered by a portable witness or kept visible as an unresolved gap.',
      },
    }),
  ];

  const qualityFindings = [];
  if (persistedDomains.length === 0 && persistedCapabilities.length === 0 && (candidateDomains.length > 0 || candidateCapabilities.length > 0)) {
    qualityFindings.push(makeQualityFinding({
      category: 'weak_meaning',
      severity: 'warning',
      summary: 'Repository evidence proposes meaning, but no shared business ontology is available to confirm it.',
      affectedQuestionIds: ['scope', 'domains', 'abilities'],
      affectedCandidateRefs: uniqueStrings([...projectRefs, ...domainRefs, ...capabilityRefs]),
      evidenceRefs: sourceRefs.slice(0, 6),
      detectionBasis: 'persisted business domain/capability evidence is empty while proposal candidates are present',
      remediation: 'Keep candidates proposal-only and obtain an independent semantic witness before admission.',
    }));
  }
  if (candidateDomains.length === 0 || candidateDomains.some((row) => row.reason?.includes('heading'))) {
    qualityFindings.push(makeQualityFinding({
      category: 'missing_boundary',
      severity: 'warning',
      summary: candidateDomains.length === 0
        ? 'No stable business domain boundary was found.'
        : 'Some domain candidates are heading-shaped and need explicit responsibility boundaries.',
      affectedQuestionIds: ['domains', 'omissions'],
      affectedCandidateRefs: domainRefs,
      evidenceRefs: sourceRefs.slice(0, 6),
      detectionBasis: candidateDomains.length === 0 ? 'no domain candidate with bounded evidence' : 'domain candidate reason identifies heading-only evidence',
      remediation: 'Supply a responsibility sentence, includes/excludes, ownership boundary, and independent source witness.',
    }));
  }
  if (dependencyRelations.length > 0 || productionBoundaryCount > 0) {
    qualityFindings.push(makeQualityFinding({
      category: 'runtime_impact_unmeasured',
      severity: 'warning',
      summary: 'Static production import evidence is visible, but runtime and business impact remain unmeasured.',
      affectedQuestionIds: ['impact'],
      affectedCandidateRefs: uniqueStrings(dependencyRelations.flatMap((row) => [row.from, row.to])),
      evidenceRefs: uniqueStrings(dependencyRelations.flatMap((row) => row.evidence ?? [])).slice(0, 12),
      detectionBasis: `${dependencyRelations.length} bounded depends_on candidate(s) or ${productionBoundaryCount} typed relation(s) observed`,
      remediation: 'Review exact direction and rationale independently; do not promote the edge to ontology truth without impact evidence.',
    }));
  }
  if (riskEvidence.length > 0) {
    qualityFindings.push(makeQualityFinding({
      category: 'policy_risk_conflict',
      severity: 'warning',
      summary: 'Evidence carries policy/risk flags that require review before semantic promotion.',
      affectedQuestionIds: ['scope', 'domains', 'abilities', 'omissions'],
      affectedCandidateRefs: uniqueStrings([...domainRefs, ...capabilityRefs]),
      evidenceRefs: riskEvidence.map((row) => row.source).slice(0, 12),
      detectionBasis: 'semantic evidence rows contain explicit riskFlags',
      remediation: 'Inspect each flagged source, distinguish current policy from instruction/future/negated prose, and record any contradiction explicitly.',
    }));
  }

  return {
    schemaVersion: 'proposalAssessment:v1',
    assessmentPolicyVersion: 'q1-q6-proposal-only:v1',
    analyzerResultDigest: stableAssessmentDigest(digestInput),
    sourceVisibility: 'analyzer-visible',
    assessmentKind: 'proposal_competency',
    qualificationState: 'unqualified_proposal',
    admissionState: 'not_admitted',
    proposalOnly: true,
    questions,
    qualityFindings,
    globalCaveats: uniqueStrings([
      'This assessment is a review packet, not an ontology qualification result.',
      'No analyzer-generated status is equivalent to answered, verified, or qualified.',
      'Automatic business assertions, admission, and write plans remain blocked until the existing independent qualification lifecycle succeeds.',
      ...extractionContract.limitations,
    ]),
    recommendedNextAction: {
      action: 'independent_semantic_review',
      targets: uniqueStrings([...projectRefs, ...domainRefs, ...capabilityRefs]).slice(0, 24),
      completionCriterion: 'An independent evaluator resolves or preserves every Q1-Q6 gap with portable evidence before any write consideration.',
    },
  };
}

function makeAssessmentQuestion({
  id,
  status,
  statusReason,
  claim,
  candidateRefs,
  questionEvidence,
  limits,
  nextAction,
}) {
  return {
    id,
    status,
    statusReason,
    claim,
    candidateRefs: uniqueStrings(candidateRefs),
    evidence: questionEvidence,
    limits: uniqueStrings(limits),
    nextAction,
    blocksQualification: true,
  };
}

function makeQualityFinding({
  category,
  severity,
  summary,
  affectedQuestionIds,
  affectedCandidateRefs,
  evidenceRefs,
  detectionBasis,
  remediation,
}) {
  return {
    category,
    severity,
    summary,
    affectedQuestionIds,
    affectedCandidateRefs: uniqueStrings(affectedCandidateRefs),
    evidenceRefs: uniqueStrings(evidenceRefs),
    detectionBasis,
    remediation,
    blocksBeta: false,
    blocksQualification: true,
  };
}

function stableAssessmentDigest(value) {
  const canonical = (input) => {
    if (Array.isArray(input)) return input.map(canonical);
    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, canonical(child)]),
      );
    }
    return input;
  };
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonical(value)), 'utf8')
    .digest('hex')}`;
}

function deriveBusinessCapabilityCandidates({
  domains,
  capabilities,
  elements,
  semanticEvidence,
}) {
  const trustedEvidence = semanticEvidence.filter(
    (row) => row.trust === 'candidate-evidence' && row.excerpt,
  );
  const businessNarrativeEvidence = trustedEvidence.filter((row) =>
    ['mission', 'product-contract', 'product-capabilities'].includes(row.role),
  );
  // A README containing only headings is structural evidence, not enough
  // material to suppress or promote implementation candidates. Preserve the
  // older review surface in that case; richer prose opts into the semantic
  // cross-check below.
  if (trustedEvidence.length === 0) return [];

  const implementationRows = [
    ...capabilities.map((row) => ({
      path: row.evidence?.source,
      slug: row.slug,
    })),
    ...elements.map((row) => ({
      path: row.path ?? row.evidence?.source,
      slug: row.slug,
    })),
  ].filter((row) => row.path);

  const candidates = [];
  for (const clue of BUSINESS_CAPABILITY_CLUES) {
    const matchedEvidence = businessNarrativeEvidence.filter((row) =>
      clue.prose.some((pattern) => pattern.test(`${row.headings.join('\n')}\n${row.excerpt}`)),
    );
    if (matchedEvidence.length === 0) continue;

    const matchedImplementations = implementationRows.filter((row) =>
      clue.implementation.some((pattern) => pattern.test(`${row.path}\n${row.slug}`)),
    );
    if (matchedImplementations.length === 0) continue;

    const structuralMatch = capabilities.find((row) =>
      matchedImplementations.some((implementation) => implementation.slug === row.slug),
    );
    const source = structuralMatch?.evidence?.source
      ?? matchedImplementations[0].path;
    const semanticSource = matchedEvidence[0].source;
    const domain = domains.some((row) => row.slug === clue.domain)
      ? clue.domain
      : matchDomainSlug(clue.title, domains);
    candidates.push({
      slug: clue.slug,
      title: clue.title,
      ...(domain ? { domain } : {}),
      reason: 'bounded business outcome prose cross-checked against implementation evidence',
      evidence: {
        source: semanticSource,
        implementation: source,
      },
      semanticSources: matchedEvidence.map((row) => row.source),
      implementationEvidence: matchedImplementations.map((row) => row.path),
    });
  }

  const emittedSlugs = new Set(candidates.map((row) => row.slug));
  // Generic candidates are intentionally stricter than the outcome clue table:
  // the prose must name the structural candidate and a separately observed
  // element path must carry the same normalized term. That keeps a documented
  // folder from becoming a capability when no implementation entrypoint exists.
  const genericBusinessEvidence = trustedEvidence
    .filter((row) =>
      ['mission', 'product-contract', 'product-capabilities', 'package-contract'].includes(
        row.role,
      ),
    )
    .sort((a, b) => a.source.localeCompare(b.source));
  const genericImplementationRows = elements
    .map((row) => ({
      path: row.path,
      slug: row.slug,
    }))
    .filter((row) => row.path)
    .sort((a, b) =>
      a.path.localeCompare(b.path) || a.slug.localeCompare(b.slug),
    );
  const genericCandidates = [];
  for (const capability of [...capabilities].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  )) {
    if (emittedSlugs.has(capability.slug)) continue;
    const candidateTokens = semanticTokens(tailSlug(capability.slug));
    if (candidateTokens.size === 0) continue;
    if ([...candidateTokens].some((token) =>
      IMPLEMENTATION_SHAPED_CAPABILITY_TOKENS.has(token),
    )) {
      continue;
    }
    const matchedEvidence = genericBusinessEvidence
      .filter((row) => {
        const evidenceTokens = semanticTokens(row.excerpt);
        return [...candidateTokens].every((token) => evidenceTokens.has(token));
      })
      .slice(0, GENERIC_BUSINESS_CAPABILITY_EVIDENCE_LIMIT);
    if (matchedEvidence.length === 0) continue;
    const matchedImplementations = genericImplementationRows
      .filter((row) => {
        const implementationTokens = pathSemanticTokens(`${row.path} ${row.slug}`);
        return [...candidateTokens].every((token) => implementationTokens.has(token));
      })
      .slice(0, GENERIC_BUSINESS_CAPABILITY_EVIDENCE_LIMIT);
    if (matchedImplementations.length === 0) continue;
    const domain = capability.domain
      ?? matchDomainSlug(tailSlug(capability.slug), domains);
    genericCandidates.push({
      slug: capability.slug,
      title: capability.title,
      ...(domain ? { domain } : {}),
      reason: 'proposal-only: bounded narrative terms cross-checked against an implemented element path; human approval required',
      evidence: {
        source: matchedEvidence[0].source,
        implementation: matchedImplementations[0].path,
      },
      semanticSources: matchedEvidence.map((row) => row.source),
      implementationEvidence: matchedImplementations.map((row) => row.path),
    });
  }
  for (const candidate of genericCandidates.slice(
    0,
    GENERIC_BUSINESS_CAPABILITY_CANDIDATE_LIMIT,
  )) {
    candidates.push(candidate);
    emittedSlugs.add(candidate.slug);
  }

  const narrativeImplementationRows = elements
    .map((row) => ({
      path: row.path ?? row.evidence?.source,
      slug: row.slug,
    }))
    .filter((row) => row.path)
    .sort((a, b) => a.path.localeCompare(b.path) || a.slug.localeCompare(b.slug));
  for (const clue of GENERIC_NARRATIVE_CAPABILITY_CLUES) {
    if (emittedSlugs.has(clue.slug)) continue;
    const matchedEvidence = genericBusinessEvidence.filter((row) =>
      /[.!?]/.test(row.excerpt)
      && clue.prose.some((pattern) => pattern.test(row.excerpt)),
    );
    if (matchedEvidence.length === 0) continue;
    const matchedImplementations = narrativeImplementationRows
      .filter((row) => clue.implementation.some((pattern) => pattern.test(`${row.path}\n${row.slug}`)))
      .slice(0, GENERIC_BUSINESS_CAPABILITY_EVIDENCE_LIMIT);
    if (matchedImplementations.length === 0) continue;
    const domain = matchDomainSlug(clue.title, domains);
    candidates.push({
      slug: clue.slug,
      title: clue.title,
      ...(domain ? { domain } : {}),
      reason: 'proposal-only: bounded outcome prose cross-checked against implementation evidence; human approval required',
      evidence: {
        source: matchedEvidence[0].source,
        implementation: matchedImplementations[0].path,
      },
      semanticSources: matchedEvidence.map((row) => row.source),
      implementationEvidence: matchedImplementations.map((row) => row.path),
    });
    emittedSlugs.add(clue.slug);
  }

  return candidates;
}

function enrichProjectCandidate(project, semanticEvidence) {
  if (!project) return project;
  const trustedRows = semanticEvidence.filter(
    (row) =>
      ['mission', 'product-contract', 'product-capabilities'].includes(row.role) &&
      row.trust === 'candidate-evidence' &&
      row.excerpt,
  );
  const purposeWitness = trustedRows
    .map((row) => ({ row, sentence: explicitPurposeSentence(row.excerpt, project.title) }))
    .find(({ sentence }) => sentence);
  const lead = purposeWitness?.row ?? trustedRows[0];
  const sentence = purposeWitness?.sentence ?? boundedEvidenceSentence(lead?.excerpt);
  // Project identity evidence can remain visible, but a second semantic source
  // corroborates this purpose only when its own bounded prose overlaps the
  // selected purpose claim. A trustworthy but unrelated product document is
  // still useful evidence elsewhere; it is not a purpose witness.
  const purposeCorroborators = sentence
    ? independentSemanticEvidenceRows(trustedRows.filter(
      (row) => row.source !== lead?.source && hasClaimSpecificSemanticOverlap(sentence, row.excerpt),
    ), [lead])
    : [];
  const sources = uniqueStrings([
    ...(project.evidence ?? []),
    lead?.source,
    ...purposeCorroborators.map((row) => row.source),
  ]).slice(0, 3);
  const definition = sentence
    ? `Proposed repository purpose from ${lead.source}: ${sentence}`
    : 'Repository purpose is not established by the bounded semantic evidence scan.';
  const limitations = [
    'shared business ownership is not established by repository evidence',
    'runtime, test, and external-system behavior remain outside this bounded scan',
  ];
  return {
    ...project,
    ...(sources.length > 0 ? { evidence: sources } : {}),
    definition,
    includes: ['repository-contained implementation evidence'],
    excludes: limitations,
    confidence: sources.length > 0 ? 0.5 : 0.2,
    uncertainty: 'proposal-only: source prose is a bounded purpose witness, not a shared business assertion',
  };
}

function enrichMeaningCandidate(candidate, kind, semanticEvidence, implementationPaths = []) {
  if (kind === 'domain') {
    return enrichDomainMeaningCandidate(candidate, semanticEvidence);
  }
  const sourceNames = uniqueStrings([
    ...(candidate.semanticSources ?? []),
    candidate.evidence?.source,
    candidate.evidence?.implementation,
  ]);
  const trustedRows = sourceNames
    .map((source) => semanticEvidence.find((row) => row.source === source))
    .filter((row) => row?.trust === 'candidate-evidence' && row.excerpt);
  const lead = trustedRows[0];
  const sentence = boundedEvidenceSentence(lead?.excerpt);
  const label = kind === 'domain' ? 'responsibility boundary' : 'ability';
  const definition = sentence
    ? `Proposed ${label} from ${lead.source}: ${sentence}`
    : `Proposed ${label} named by bounded repository evidence; shared meaning remains unconfirmed.`;
  const includes = kind === 'capability'
    ? uniqueStrings(implementationPaths).slice(0, GENERIC_BUSINESS_CAPABILITY_EVIDENCE_LIMIT)
    : [];
  return {
    title: candidate.title,
    ...(candidate.domain ? { domain: candidate.domain } : {}),
    definition,
    ...(includes.length > 0 ? { includes } : {}),
    excludes: [
      'shared business ownership is not established by this repository scan',
      'runtime behavior outside the cited implementation evidence is not asserted',
    ],
    confidence: 0.5,
    uncertainty: 'proposal-only: bounded prose and path evidence require semantic qualification before admission',
    evidenceSources: sourceNames,
  };
}

function enrichDomainMeaningCandidate(candidate, semanticEvidence) {
  const nameSource = candidate.evidence?.source;
  const witness = findDomainResponsibilityWitness(candidate, semanticEvidence);
  const evidenceSources = witness
    ? uniqueStrings([nameSource, witness.row.source])
    : uniqueStrings([nameSource]);
  const definition = witness
    ? `Proposed responsibility boundary from ${witness.row.source}: ${witness.sentence}`
    : 'Proposed responsibility boundary named by README heading; repository-contained responsibility remains unconfirmed.';
  return {
    title: candidate.title,
    definition,
    excludes: [
      'shared business ownership is not established by this repository scan',
      'runtime behavior outside the cited implementation evidence is not asserted',
    ],
    confidence: 0.5,
    uncertainty: witness
      ? 'proposal-only: repository prose corroborates this boundary candidate; human approval is still required'
      : 'proposal-only: README heading names a candidate, but no separate repository responsibility witness was found',
    evidenceSources,
  };
}

function buildSuggestedDependencyRelations(moduleEdges, implementationNodes) {
  const implementationSlugs = new Set(implementationNodes.map((node) => node.slug));
  return [...moduleEdges]
    .filter((edge) =>
      edge?.productValueCount > 0 &&
      implementationSlugs.has(edge.from) &&
      implementationSlugs.has(edge.to),
    )
    .sort((a, b) =>
      a.from.localeCompare(b.from) ||
      a.to.localeCompare(b.to),
    )
    .slice(0, 24)
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      type: 'depends_on',
      why: 'proposal-only: bounded production value-import evidence; runtime impact is not asserted',
      evidence: uniqueStrings(
        (edge.evidence ?? []).flatMap((row) => [row.from, row.to]),
      ).slice(0, 4),
      confidence: 0.5,
      uncertainty: 'static import evidence requires semantic impact review before relation admission',
    }));
}

function boundedEvidenceSentence(value) {
  const text = String(value ?? '')
    .replace(/[\*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  const sentence = text.match(/^(.{24,360}?[.!?])(?:\s|$)/)?.[1];
  return (sentence ?? text.slice(0, 360)).trim();
}

function explicitPurposeSentence(value, projectTitle = '') {
  const text = String(value ?? '')
    .replace(/[\*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  const sentences = text.match(/[^.!?]+(?:[.!?](?=\s|$)|$)/g) ?? [];
  const candidates = sentences
    .map((sentence) => sentence.trim())
    .filter((sentence) =>
      sentence.length >= 24 &&
      sentence.length <= 360 &&
      !/^\d+(?:\.\d+)*\s/.test(sentence) &&
      !/^(?:release|version)\b/i.test(sentence) &&
      !/\b(?:was|is|has been) released\b/i.test(sentence));
  const normalizedTitle = normalizeSemanticText(projectTitle);
  const identityPurpose = normalizedTitle
    ? candidates.find((sentence) => {
      const normalized = normalizeSemanticText(sentence);
      return (
        (normalized.startsWith(`${normalizedTitle} is `) ||
          normalized.startsWith(`${normalizedTitle} are `)) &&
        /\b(?:app|application|client|database|engine|framework|library|platform|runtime|server|service|tool|workbench)\b/i.test(sentence) &&
        /\b(?:built|created|designed|made)\s+for\b|\bfor\b|\bto\b/i.test(sentence)
      );
    })
    : null;
  return (
    identityPurpose ??
    candidates
      .find(
        (sentence) =>
          /\b(?:provides|allows|lets|enables|helps|exists\s+to)\b/i.test(sentence),
      ) ?? ''
  );
}

function hasClaimSpecificSemanticOverlap(purposeSentence, candidateProse) {
  const purposeTerms = semanticClaimTerms(purposeSentence);
  if (purposeTerms.size < 2) return false;
  const candidateTerms = semanticClaimTerms(candidateProse);
  let overlap = 0;
  for (const term of purposeTerms) {
    if (!candidateTerms.has(term)) continue;
    overlap += 1;
    if (overlap >= 2) return true;
  }
  return false;
}

function semanticClaimTerms(value) {
  const genericTerms = new Set([
    'a', 'an', 'and', 'application', 'applications', 'codebase', 'developer', 'developers',
    'for', 'from', 'helps', 'local', 'of', 'operations', 'platform', 'product', 'project',
    'provides', 'repository', 'service', 'services', 'software', 'system', 'the', 'this',
    'to', 'tool', 'tools', 'user', 'users', 'with', 'workflow', 'workflows',
  ]);
  const tokens = String(value ?? '').toLowerCase().match(/[a-z0-9]+|[가-힣]{2,}/g) ?? [];
  return new Set(tokens.filter((term) => (
    !genericTerms.has(term) && (term.length >= 4 || /^[가-힣]{2,}$/.test(term))
  )));
}

function findDomainResponsibilityWitness(candidate, semanticEvidence) {
  const nameSource = candidate.evidence?.source;
  const normalizedDomain = normalizeSemanticText(candidate.title);
  const nameFingerprint = semanticEvidenceFingerprint(
    semanticEvidence.find((row) => row.source === nameSource),
  );
  if (!normalizedDomain) return null;
  for (const row of semanticEvidence) {
    if (
      row.source === nameSource
      || !['product-contract', 'architecture'].includes(row.role)
      || row.trust !== 'candidate-evidence'
      || !row.excerpt
      || semanticEvidenceFingerprint(row) === nameFingerprint
    ) {
      continue;
    }
    const sentence = responsibilitySentenceForDomain(row.excerpt, normalizedDomain);
    if (sentence) return { row, sentence };
  }
  return null;
}

function independentSemanticEvidenceRows(rows, initialRows = []) {
  const seen = new Set(initialRows.map(semanticEvidenceFingerprint).filter(Boolean));
  return rows.filter((row) => {
    const fingerprint = semanticEvidenceFingerprint(row);
    if (!fingerprint || seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

function semanticEvidenceFingerprint(row) {
  return String(row?.excerpt ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function responsibilitySentenceForDomain(value, normalizedDomain) {
  const sentences = String(value ?? '').match(/[^.!?]+(?:[.!?](?=\s|$)|$)/g) ?? [];
  return sentences
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .find((sentence) => (
      normalizeSemanticText(sentence).includes(normalizedDomain)
      && /\b(?:owns|is responsible for|governs|handles|covers)\b|(?:소유(?:한다|함)?|책임(?:을)?\s*(?:진다|맡는다)|관할|담당(?:한다|함)?|다룬다|처리(?:한다|함)?|관리(?:한다|함)?|포괄(?:한다|함)?)/i.test(sentence)
    )) ?? '';
}

function normalizeSemanticText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))];
}

function buildMeaningGate({
  domains,
  capabilities,
  semanticCapabilityCandidates,
  elements,
  existingOntologyEvidence,
  observedDependencyRelations = [],
  semanticEvidence,
}) {
  const existingBySlug = new Map(
    existingOntologyEvidence.map((evidence) => [evidence.slug, evidence]),
  );
  const existingDomainEvidence = existingOntologyEvidence.filter((evidence) => evidence.kind === 'domain');
  // A README heading is evidence that a phrase is important enough to document,
  // not evidence that people share it as a stable business responsibility
  // boundary. Only persisted ontology docs count as already-shared concepts;
  // README/code-derived rows remain explicit proposals.
  const businessDomains = [...new Set(existingDomainEvidence.map((evidence) => evidence.slug))];
  const existingByElement = new Map();
  for (const evidence of existingOntologyEvidence) {
    if (evidence.kind !== 'capability') continue;
    for (const element of evidence.elements ?? []) {
      if (!existingByElement.has(element)) existingByElement.set(element, evidence);
    }
  }
  const existingEvidenceByCandidateSlug = new Map();
  const evidenceByBusinessCapabilitySlug = new Map();
  const businessCapabilities = capabilities.flatMap((capability) => {
    const evidence = existingBySlug.get(capability.slug) ?? existingByElement.get(capability.evidence.source);
    if (evidence) {
      existingEvidenceByCandidateSlug.set(capability.slug, evidence);
      evidenceByBusinessCapabilitySlug.set(evidence.slug, evidence);
      return [evidence.slug];
    }
    return [];
  });
  const businessCapabilitySet = new Set(businessCapabilities);
  const matchedCapabilityCandidateSlugs = new Set(
    [...existingEvidenceByCandidateSlug.keys()].filter(Boolean),
  );
  // Structural candidates remain visible below as implementation evidence,
  // but never become business proposals merely because the semantic packet is
  // empty. This is the fail-closed boundary that prevents a folder such as
  // `logger`, `web`, or `theme-toggle` from becoming a capability by default.
  const hasSharedBusinessContext = existingOntologyEvidence.some(
    (evidence) =>
      (evidence.kind === 'domain' || evidence.kind === 'capability') &&
      !STARTER_ONTOLOGY_SLUGS.has(evidence.slug),
  );
  const businessCandidates = semanticCapabilityCandidates.length > 0
    ? semanticCapabilityCandidates
    : hasSharedBusinessContext
      ? capabilities
      : [];
  const reviewRequiredCapabilities = capabilities
    .filter(
      (capability) =>
        !existingBySlug.has(capability.slug) &&
        !matchedCapabilityCandidateSlugs.has(capability.slug),
    )
    .map((capability) => ({
      slug: capability.slug,
      reason: 'source folder is implementation evidence, not proof of a shared capability meaning',
      evidence: capability.evidence,
    }));
  const proposedBusinessCapabilities = businessCandidates
    .filter(
      (capability) =>
        !existingBySlug.has(capability.slug) &&
        !matchedCapabilityCandidateSlugs.has(capability.slug),
    )
    .map((capability) => ({
      slug: capability.slug,
      reason: capability.reason
        ?? 'bounded semantic evidence is a proposal, not proof of shared business meaning',
      evidence: capability.evidence,
      ...enrichMeaningCandidate(
        capability,
        'capability',
        semanticEvidence,
        capability.implementationEvidence,
      ),
    }));
  const reviewRequiredDomains = domains
    .filter((domain) => !existingBySlug.has(domain.slug))
    .map((domain) => ({
      slug: domain.slug,
      reason: 'README heading is a concept clue, not proof of a shared business boundary',
      evidence: domain.evidence,
      ...enrichMeaningCandidate(domain, 'domain', semanticEvidence),
    }));
  const businessEvidence = uniqueEvidenceRows([
    ...existingDomainEvidence.map(formatOntologyEvidence),
    ...businessCapabilities.flatMap((capability) => {
      const existing = existingBySlug.get(capability) ?? evidenceByBusinessCapabilitySlug.get(capability);
      if (existing) return [formatOntologyEvidence(existing)];
      return [
        {
          slug: capability,
          kind: 'capability',
          source: businessCandidates.find((candidate) => candidate.slug === capability)?.evidence.source ?? capability,
        },
      ];
    }),
  ]);

  const reviewQuestions = [
    'What business/product outcome, user workflow, ownership boundary, or decision does this node explain?',
    'Which source path, README heading, import edge, or file-level element proves the implementation evidence?',
    'Should this code structure stay evidence-only instead of becoming a domain or capability node?',
    '[visible-gap · omitted-behavior] Record runtime, test, package, and unsupported-language behavior this scan did not inspect, plus the next repository-contained witness needed to assess it.',
    '[visible-gap · scope-exclusion] Separate project exclusions explicitly stated by evidence from boundaries that remain unknown; record the source citation for each.',
  ];
  const hasTrustedMissionOrProductEvidence = semanticEvidence.some(
    (row) =>
      ['mission', 'product-contract', 'product-capabilities'].includes(row.role) &&
      row.trust === 'candidate-evidence' &&
      row.excerpt,
  );
  const hasPersistedBusinessDomain = existingDomainEvidence.length > 0;
  const hasREADMEOnlyDomainCandidate = reviewRequiredDomains.length > 0;
  const hasUnconfirmedDomainBoundary = reviewRequiredDomains.some(
    (domain) => domain.evidenceSources.length < 2,
  );
  const hasRepositoryCorroboratedDomainBoundary = reviewRequiredDomains.some(
    (domain) => domain.evidenceSources.length >= 2,
  );
  if (!hasTrustedMissionOrProductEvidence) {
    reviewQuestions.push(
      '[missing · scope] Add trusted mission or product evidence that states the user outcome and the repository responsibility boundary.',
    );
  }
  if (!hasPersistedBusinessDomain && !hasREADMEOnlyDomainCandidate) {
    reviewQuestions.push(
      '[weak · domain-boundary] Confirm the domain boundary with persisted business evidence; a README heading alone is only a candidate.',
    );
  }
  if (hasUnconfirmedDomainBoundary) {
    reviewQuestions.push(
      '[weak · domain-boundary] Add a separate current product-contract or architecture responsibility witness; a README heading alone remains only a candidate.',
    );
  }
  if (hasRepositoryCorroboratedDomainBoundary) {
    reviewQuestions.push(
      '[proposal · domain-boundary] Repository prose corroborates a proposed boundary, but human approval is still required before it becomes shared meaning.',
    );
  }
  if (reviewRequiredCapabilities.length > 0) {
    for (const capability of reviewRequiredCapabilities) {
      capability.reason =
        'implementation-only: source folder is implementation evidence, not proof of a shared capability meaning; add business outcome and stable responsibility evidence before promoting this capability';
    }
  }
  if (proposedBusinessCapabilities.length > 0) {
    reviewQuestions.push(
      '[weak · capability-outcome] Confirm the proposed capability with a concrete business outcome and the responsibility it owns.',
    );
  }
  const implementationEvidenceSlugs = new Set([
    ...capabilities.map((capability) => capability.slug),
    ...elements.map((element) => element.slug),
  ]);
  const hasTypedDependencyRelation = observedDependencyRelations.some(
    (relation) =>
      relation?.type === 'depends_on' &&
      implementationEvidenceSlugs.has(relation.from) &&
      implementationEvidenceSlugs.has(relation.to) &&
      (relation.productValueCount === undefined || relation.productValueCount > 0),
  );
  if (elements.length >= 2 || hasTypedDependencyRelation) {
    if (hasTypedDependencyRelation) {
      const typedDependencyCount = observedDependencyRelations.filter(
        (relation) =>
          relation?.type === 'depends_on' &&
          implementationEvidenceSlugs.has(relation.from) &&
          implementationEvidenceSlugs.has(relation.to) &&
          (relation.productValueCount === undefined || relation.productValueCount > 0),
      ).length;
      reviewQuestions.push(
        `[observed · impact] ${typedDependencyCount} typed production import ${typedDependencyCount === 1 ? 'boundary' : 'boundaries'} link implementation candidates; review bounded infer_imports evidence before promoting a depends_on relation.`,
      );
    } else {
      reviewQuestions.push(
        '[not-measured · impact] Identify the typed depends_on relation between implementation elements, or record why no dependency impact is currently measurable.',
      );
    }
  }
  const hasPolicyEvidenceRisk = semanticEvidence.some((row) =>
    row.riskFlags.some((risk) =>
      ['future-state-claim', 'negated-claim', 'deprecated-state'].includes(risk),
    ),
  );
  if (hasPolicyEvidenceRisk) {
    reviewQuestions.push(
      '[review · policy-evidence] Review future, negated, or deprecated evidence before treating it as current policy; the risk alone is not current policy.',
    );
  }

  return {
    policy: 'business-first',
    sourceStructureRole: 'implementation-evidence',
    businessOntology: {
      domains: businessDomains,
      capabilities: [...businessCapabilitySet],
      evidence: businessEvidence,
    },
    proposedBusinessOntology: {
      domains: reviewRequiredDomains,
      capabilities: proposedBusinessCapabilities,
    },
    implementationEvidence: {
      elements: elements.map((element) => element.slug),
      reviewRequiredCapabilities,
    },
    reviewQuestions,
  };
}

function buildExtractionContract({
  project,
  domains,
  capabilities,
  semanticCapabilityCandidates,
  elements,
  existingOntologyEvidence,
  suggestedRelations,
  semanticEvidence,
}) {
  const persistedBusinessConcepts = existingOntologyEvidence.filter(
    (evidence) => evidence.kind === 'domain' || evidence.kind === 'capability',
  ).length;
  const proposedBusinessConcepts = domains.length + semanticCapabilityCandidates.length;
  const observedImplementationEvidence = elements.length;
  return {
    standard: 'formal-explicit-shared-conceptualization',
    status:
      persistedBusinessConcepts > 0
        ? 'grounded-in-existing-ontology'
        : observedImplementationEvidence > 0 || proposedBusinessConcepts > 0
          ? 'evidence-gathering'
          : 'scope-discovery-required',
    assertionPolicy: {
      sourceFacts: 'observed',
      readmeAndFolderMeanings: 'proposed',
      persistedOntologyMeanings: 'shared',
      automaticBusinessAssertions: 0,
      humanApprovalRequired: true,
    },
    competencyQuestions: COMPETENCY_QUESTION_CONTRACTS.map((contract) => ({
      ...contract,
      requiredWitnesses: [...contract.requiredWitnesses],
    })),
    qualityGates: {
      scopeCandidateAvailable: Boolean(project),
      sharedBusinessConceptsAvailable: persistedBusinessConcepts > 0,
      proposedBusinessConcepts,
      implementationEvidenceAvailable: observedImplementationEvidence > 0,
      semanticEvidenceAvailable: semanticEvidence.length > 0,
      semanticEvidenceReviewRequired: semanticEvidence.filter(
        (row) => row.riskFlags.length > 0,
      ).length,
      typedRelationsProposed: suggestedRelations.length,
      provenanceAttached:
        domains.every((row) => Boolean(row.evidence?.source)) &&
        capabilities.every((row) => Boolean(row.evidence?.source)) &&
        elements.every((row) => Boolean(row.evidence?.source)),
      uncertaintyExplicit: true,
      approvalRequired: true,
    },
    limitations: [
      'Repository structure can prove implementation shape, but cannot by itself prove business meaning.',
      'README headings and source-folder names remain proposals until a human or persisted ontology establishes shared intent.',
      'Instructions, future-state claims, negations, and deprecated-state prose are review signals, not current business facts.',
      'Completeness is evaluated against competency questions, not against the number of discovered folders.',
      'A resolved witness proves that the cited graph fact or repository path exists; semantic role accuracy still depends on the bounded evidence packet and human approval.',
    ],
    nextStep:
      'Use semanticEvidence to propose defined domains and capabilities; answer each competency question with answer/status/witnesses, keep unsupported claims as partial or visible-gap, and write only after every witness resolves.',
  };
}

function collectSemanticEvidence(rootPath, skipped = []) {
  const candidates = discoverSemanticEvidenceCandidates(rootPath, skipped);
  const rows = [];
  for (const { source, role, pathScore } of candidates) {
    const path = join(rootPath, source);
    if (!existsSync(path)) continue;
    try {
      const nodePackageContract = source === 'package.json' || source.endsWith('/package.json');
      const packageContractMaxBytes = source === 'Cargo.toml'
        ? CARGO_MANIFEST_MAX_BYTES
        : source === 'setup.py'
          ? PYTHON_SETUP_MAX_BYTES
          : source === 'pyproject.toml'
            ? PYTHON_PROJECT_MAX_BYTES
            : nodePackageContract
              ? NODE_PACKAGE_MANIFEST_MAX_BYTES
          : null;
      if (packageContractMaxBytes !== null) {
        const issue = packageContractPathIssue(
          rootPath,
          path,
          source,
          packageContractMaxBytes,
        );
        if (issue) {
          pushSkippedOnce(skipped, {
            path,
            reason:
              nodePackageContract && issue.endsWith('resolves outside repository root')
                ? `semantic-evidence-skip: ${source} resolves outside repository root`
                : issue,
          });
          continue;
        }
      } else {
        if (!pathResolvesInsideRoot(rootPath, path)) {
          pushSkippedOnce(skipped, {
            path,
            reason: `semantic-evidence-skip: ${source} resolves outside repository root`,
          });
          continue;
        }
        if (statSync(path).size > SEMANTIC_EVIDENCE_MAX_BYTES) {
          pushSkippedOnce(skipped, {
            path,
            reason: `semantic-evidence-skip: ${source} exceeds ${SEMANTIC_EVIDENCE_MAX_BYTES} bytes`,
          });
          continue;
        }
      }
      const text = readFileSync(path, 'utf-8');
      const extracted = source === 'Cargo.toml'
        ? extractCargoPackageContract(text)
        : source === 'setup.py'
          ? extractPythonSetupPackageContract(text)
          : source === 'pyproject.toml'
            ? extractPythonPyprojectPackageContract(text)
          : nodePackageContract
            ? extractNodePackageContract(text)
          : extractSemanticDocument(text);
      if (extracted.skipReason) {
        if (
          !(
            source === 'package.json' &&
            skipped.some(
              (row) => row.path === path && /^package-json-parse-error:/.test(row.reason),
            )
          )
        ) {
          pushSkippedOnce(skipped, { path, reason: extracted.skipReason });
        }
        continue;
      }
      if (!extracted.excerpt && extracted.headings.length === 0) continue;
      rows.push({
        source,
        role,
        title: extracted.title || humanize(basename(source).replace(/\.md$/i, '')),
        headings: extracted.headings,
        excerpt: extracted.excerpt,
        _riskText: extracted.riskText,
        _score: pathScore + semanticContentScore(extracted),
      });
    } catch (err) {
      skipped.push({
        path,
        reason: `semantic-evidence-read-error: ${err.message}`,
      });
    }
  }
  const ranked = rows.sort(
    (a, b) => b._score - a._score || a.source.localeCompare(b.source),
  );
  const selected = [];
  const selectedSources = new Set();
  // Preserve evidence-role diversity before filling remaining slots by score.
  // Otherwise a large feature catalog can crowd mission/strategy/architecture
  // evidence out of the bounded packet.
  for (const role of [
    'mission',
    'package-contract',
    'product-contract',
    'product-capabilities',
    'architecture',
    'agent-guidance',
  ]) {
    const row = ranked.find(
      (candidate) =>
        candidate.role === role && !selectedSources.has(candidate.source),
    );
    if (!row) continue;
    selected.push(row);
    selectedSources.add(row.source);
  }
  for (const row of ranked) {
    if (selected.length >= SEMANTIC_EVIDENCE_MAX_DOCUMENTS) break;
    if (selectedSources.has(row.source)) continue;
    selected.push(row);
    selectedSources.add(row.source);
  }
  return selected.map((row) => {
    const riskFlags = scanSemanticEvidenceRisks(row);
    return {
      source: row.source,
      role: row.role,
      title: row.title,
      headings: row.headings,
      excerpt: row.excerpt,
      trust: semanticEvidenceTrust(riskFlags),
      riskFlags,
    };
  });
}

function packageContractPathIssue(rootPath, path, source, maxBytes) {
  if (!pathResolvesInsideRoot(rootPath, path)) {
    return `package-contract-skip: ${source} resolves outside repository root`;
  }
  if (statSync(path).size > maxBytes) {
    return `package-contract-skip: ${source} exceeds ${maxBytes} bytes`;
  }
  return null;
}

function pathResolvesInsideRoot(rootPath, path) {
  const resolvedFromRoot = relative(realpathSync(rootPath), realpathSync(path));
  return !(
    resolvedFromRoot === '..' ||
    resolvedFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(resolvedFromRoot)
  );
}

function pushSkippedOnce(skipped, row) {
  if (
    skipped.some(
      (existing) =>
        existing.path === row.path && existing.reason === row.reason,
    )
  ) {
    return;
  }
  skipped.push(row);
}

function extractPythonSetupPackageContract(text) {
  const packageFields = new Map();
  let insideSetupCall = false;
  let nesting = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripPythonComment(rawLine).trim();
    if (!insideSetupCall) {
      if (!/^(?:setup|setuptools\.setup)\s*\(\s*$/.test(line)) continue;
      insideSetupCall = true;
      nesting = 1;
      continue;
    }
    const staticField = line.match(
      /^(name|description|python_requires)\s*=\s*(['"])(.*?)\2\s*,?$/,
    );
    if (staticField) packageFields.set(staticField[1], staticField[3]);
    nesting += pythonDelimiterDelta(line);
    if (nesting <= 0) break;
  }
  const packageName = packageFields.get('name');
  if (!packageName) {
    return {
      title: null,
      headings: [],
      excerpt: '',
      skipReason: 'package-contract-skip: setup.py has no static setup name',
    };
  }
  const visiblePackageName = truncateCargoValue(
    packageName,
    CARGO_MANIFEST_MAX_TOKEN_LENGTH,
  );
  const details = [
    `Package: ${visiblePackageName}`,
    packageFields.get('description')
      ? `Description: ${truncateCargoValue(
          packageFields.get('description'),
          CARGO_MANIFEST_MAX_DESCRIPTION_LENGTH,
        )}`
      : null,
    packageFields.get('python_requires')
      ? `Python: ${truncateCargoValue(
          packageFields.get('python_requires'),
          CARGO_MANIFEST_MAX_TOKEN_LENGTH,
        )}`
      : null,
  ].filter(Boolean);
  return {
    packageName: visiblePackageName,
    title: `${visiblePackageName} package contract`,
    headings: ['Package contract'],
    excerpt: details.join('. ').slice(0, SEMANTIC_EVIDENCE_MAX_EXCERPT),
    riskText: [...packageFields.values()].join('\n'),
  };
}

function extractPythonPyprojectPackageContract(text) {
  const projectFields = new Map();
  let section = '';
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    if (section !== 'project') continue;
    const assignment = line.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (!assignment) continue;
    const key = normalizeTomlKey(assignment[1]);
    if (!['name', 'description', 'requires-python'].includes(key)) continue;
    const value = staticTomlString(assignment[2]);
    if (value !== null) projectFields.set(key, value);
  }
  const packageName = projectFields.get('name');
  if (!packageName) {
    return {
      title: null,
      headings: [],
      excerpt: '',
      skipReason: 'package-contract-skip: pyproject.toml has no static project name',
    };
  }
  const visiblePackageName = truncateCargoValue(
    packageName,
    CARGO_MANIFEST_MAX_TOKEN_LENGTH,
  );
  const details = [
    `Package: ${visiblePackageName}`,
    projectFields.get('description')
      ? `Description: ${truncateCargoValue(
        projectFields.get('description'),
        CARGO_MANIFEST_MAX_DESCRIPTION_LENGTH,
      )}`
      : null,
    projectFields.get('requires-python')
      ? `Python: ${truncateCargoValue(
        projectFields.get('requires-python'),
        CARGO_MANIFEST_MAX_TOKEN_LENGTH,
      )}`
      : null,
  ].filter(Boolean);
  return {
    packageName: visiblePackageName,
    title: `${visiblePackageName} package contract`,
    headings: ['Package contract'],
    excerpt: details.join('. ').slice(0, SEMANTIC_EVIDENCE_MAX_EXCERPT),
    riskText: [...projectFields.values()].join('\n'),
  };
}

function extractNodePackageContract(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      title: null,
      headings: [],
      excerpt: '',
      skipReason: `package-contract-skip: malformed package.json: ${error.message}`,
    };
  }
  const packageName = typeof parsed?.name === 'string' ? parsed.name.trim() : '';
  const description = typeof parsed?.description === 'string'
    ? parsed.description.replace(/\s+/g, ' ').trim()
    : '';
  if (!packageName || !description) {
    return {
      title: null,
      headings: [],
      excerpt: '',
      skipReason: 'package-contract-skip: workspace package.json requires static name and description',
    };
  }
  const visiblePackageName = truncateCargoValue(
    packageName,
    CARGO_MANIFEST_MAX_TOKEN_LENGTH,
  );
  const visibleDescription = truncateCargoValue(
    description,
    NODE_PACKAGE_DESCRIPTION_MAX_LENGTH,
  );
  const publicExports = collectNodePublicExportKeys(parsed.exports);
  const scripts = collectStaticManifestKeys(parsed.scripts, NODE_PACKAGE_SCRIPT_LIMIT);
  const dependencies = collectStaticManifestKeys(
    parsed.dependencies,
    NODE_PACKAGE_DEPENDENCY_LIMIT,
    isPackageDependencyName,
  );
  const details = [
    `Package: ${visiblePackageName}`,
    `Description: ${visibleDescription}`,
    publicExports.length > 0 ? `Exports: ${publicExports.join(', ')}` : null,
    scripts.length > 0 ? `Scripts: ${scripts.join(', ')}` : null,
    dependencies.length > 0 ? `Dependencies: ${dependencies.join(', ')}` : null,
  ].filter(Boolean);
  return {
    packageName: visiblePackageName,
    title: `${visiblePackageName} package contract`,
    headings: ['Package contract'],
    excerpt: details.join('. ').slice(0, SEMANTIC_EVIDENCE_MAX_EXCERPT),
    riskText: `${packageName}\n${description}`,
  };
}

function staticTomlString(value) {
  const trimmed = String(value).trim();
  if (trimmed.length < 2) return null;
  const quote = trimmed[0];
  if ((quote !== '"' && quote !== "'") || trimmed.at(-1) !== quote) return null;
  const body = trimmed.slice(1, -1);
  return /[\r\n]/.test(body) ? null : body;
}

function collectNodePublicExportKeys(exports) {
  if (typeof exports === 'string') {
    return isSafeNodeExportTarget(exports) ? ['.'] : [];
  }
  if (!exports || typeof exports !== 'object' || Array.isArray(exports)) return [];
  const subpathKeys = Object.keys(exports)
    .filter((key) => key === '.' || /^\.\/[A-Za-z0-9@._/-]+$/.test(key))
    .sort();
  if (subpathKeys.length === 0) {
    return collectNodeExportTargets(exports).some(isSafeNodeExportTarget) ? ['.'] : [];
  }
  return subpathKeys
    .filter((key) => collectNodeExportTargets(exports[key]).some(isSafeNodeExportTarget))
    .slice(0, NODE_PACKAGE_EXPORT_LIMIT);
}

function collectNodeExportTargets(value, targets = []) {
  if (typeof value === 'string') {
    targets.push(value);
  } else if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const nested of Object.values(value)) collectNodeExportTargets(nested, targets);
  }
  return targets;
}

function isSafeNodeExportTarget(value) {
  if (typeof value !== 'string' || !value.startsWith('./') || value.includes('\\')) {
    return false;
  }
  return !value.split('/').some((segment) => segment === '..' || segment.length === 0 && value !== './');
}

function collectStaticManifestKeys(value, limit, isAllowed = isSafeManifestKey) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value)
    .filter((key) => isAllowed(key))
    .sort()
    .slice(0, limit);
}

function isSafeManifestKey(value) {
  return /^[A-Za-z0-9@._:/-]{1,100}$/.test(value);
}

function isPackageDependencyName(value) {
  return /^(?:@[A-Za-z0-9][A-Za-z0-9._-]*\/)?[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value);
}

function stripPythonComment(line) {
  let quote = null;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote) {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = quote === character ? null : quote ?? character;
      continue;
    }
    if (character === '#' && quote === null) return line.slice(0, index);
  }
  return line;
}

function pythonDelimiterDelta(line) {
  let quote = null;
  let escaped = false;
  let delta = 0;
  for (const character of line) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote) {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = quote === character ? null : quote ?? character;
      continue;
    }
    if (quote) continue;
    if (character === '(' || character === '[' || character === '{') delta += 1;
    if (character === ')' || character === ']' || character === '}') delta -= 1;
  }
  return delta;
}

function extractCargoPackageContract(text) {
  const packageFields = new Map();
  const features = [];
  let section = '';
  const lines = text.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = stripTomlComment(lines[lineIndex]).trim();
    if (!line) continue;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    const assignment = line.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (!assignment) continue;
    const key = normalizeTomlKey(assignment[1]);
    const packageEvidenceField =
      section === 'package' && CARGO_PACKAGE_EVIDENCE_FIELDS.has(key);
    let assignmentValue = assignment[2];
    if (
      section === 'features' &&
      assignmentValue.trimStart().startsWith('[')
    ) {
      while (
        !isBalancedTomlFragment(assignmentValue) &&
        lineIndex + 1 < lines.length
      ) {
        lineIndex += 1;
        assignmentValue += ` ${stripTomlComment(lines[lineIndex]).trim()}`;
      }
    }
    if (packageEvidenceField) {
      const staticValue = isBalancedTomlFragment(assignmentValue)
        ? staticTomlString(assignmentValue)
        : null;
      if (key === 'name' && staticValue === null) {
        return {
          title: null,
          headings: [],
          excerpt: '',
          skipReason: 'package-contract-skip: root Cargo.toml has no static package name',
        };
      }
      if (staticValue !== null) packageFields.set(key, staticValue);
      continue;
    }
    if (section === 'features' && !isBalancedTomlFragment(assignmentValue)) {
      return {
        title: null,
        headings: [],
        excerpt: '',
        skipReason: 'package-contract-skip: malformed Cargo.toml package/features contract',
      };
    }
    if (section === 'features') {
      features.push({
        name: key,
        values: [...assignmentValue.matchAll(/["']([^"']+)["']/g)]
          .map((match) => match[1]),
      });
    }
  }
  const packageName = packageFields.get('name');
  if (!packageName) {
    return {
      title: null,
      headings: [],
      excerpt: '',
      skipReason: 'package-contract-skip: root Cargo.toml has no [package] table',
    };
  }
  const visiblePackageName = truncateCargoValue(
    packageName,
    CARGO_MANIFEST_MAX_TOKEN_LENGTH,
  );
  const details = [
    `Package: ${visiblePackageName}`,
    packageFields.get('description')
      ? `Description: ${truncateCargoValue(
        packageFields.get('description'),
        CARGO_MANIFEST_MAX_DESCRIPTION_LENGTH,
      )}`
      : null,
    packageFields.get('version')
      ? `Version: ${truncateCargoValue(
        packageFields.get('version'),
        CARGO_MANIFEST_MAX_TOKEN_LENGTH,
      )}`
      : null,
    packageFields.get('edition')
      ? `Edition: ${truncateCargoValue(
        packageFields.get('edition'),
        CARGO_MANIFEST_MAX_TOKEN_LENGTH,
      )}`
      : null,
    packageFields.get('rust-version')
      ? `Rust version: ${truncateCargoValue(
        packageFields.get('rust-version'),
        CARGO_MANIFEST_MAX_TOKEN_LENGTH,
      )}`
      : null,
  ].filter(Boolean);
  const visibleFeatures = features
    .slice(0, CARGO_MANIFEST_MAX_FEATURES)
    .map((feature) => ({
      name: truncateCargoValue(feature.name, CARGO_MANIFEST_MAX_TOKEN_LENGTH),
      values: feature.values
        .slice(0, CARGO_MANIFEST_MAX_FEATURE_VALUES)
        .map((value) =>
          truncateCargoValue(value, CARGO_MANIFEST_MAX_TOKEN_LENGTH)
        ),
      omittedValues: Math.max(
        0,
        feature.values.length - CARGO_MANIFEST_MAX_FEATURE_VALUES,
      ),
    }));
  const excerpt = cargoPackageContractExcerpt(
    details,
    visibleFeatures,
    features.length,
  );
  return {
    packageName: visiblePackageName,
    title: `${visiblePackageName} package contract`,
    headings: features.length > 0
      ? ['Package contract', 'Features']
      : ['Package contract'],
    excerpt,
    riskText: [
      ...packageFields.values(),
      ...features.flatMap((feature) => [feature.name, ...feature.values]),
    ].join('\n'),
  };
}

function cargoPackageContractExcerpt(details, candidateFeatures, totalFeatures) {
  const visibleFeatures = [...candidateFeatures];
  while (true) {
    const featureRows = visibleFeatures.map((feature) => {
      const values = feature.values.join(', ') || '(empty)';
      const suffix = feature.omittedValues > 0
        ? ` (+${feature.omittedValues} values omitted)`
        : '';
      return `${feature.name} -> ${values}${suffix}`;
    });
    const omittedFeatures = Math.max(0, totalFeatures - visibleFeatures.length);
    const parts = [
      ...details,
      featureRows.length > 0 ? `Features: ${featureRows.join('; ')}` : null,
      omittedFeatures > 0
        ? `Feature declarations omitted: ${omittedFeatures}`
        : null,
    ].filter(Boolean);
    const excerpt = parts.join('. ');
    if (
      excerpt.length <= SEMANTIC_EVIDENCE_MAX_EXCERPT ||
      visibleFeatures.length === 0
    ) {
      return excerpt.slice(0, SEMANTIC_EVIDENCE_MAX_EXCERPT);
    }
    visibleFeatures.pop();
  }
}

function truncateCargoValue(value, maxLength) {
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function stripTomlComment(line) {
  let quote = null;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote === '"') {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = quote === character ? null : quote ?? character;
      continue;
    }
    if (character === '#' && quote === null) return line.slice(0, index);
  }
  return line;
}

function normalizeTomlKey(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isBalancedTomlFragment(value) {
  const stack = [];
  let quote = null;
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote === '"') {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = quote === character ? null : quote ?? character;
      continue;
    }
    if (quote) continue;
    if (character === '[' || character === '{') stack.push(character);
    if (character === ']' || character === '}') {
      const expected = character === ']' ? '[' : '{';
      if (stack.pop() !== expected) return false;
    }
  }
  return quote === null && stack.length === 0;
}

function scanSemanticEvidenceRisks({
  headings = [],
  excerpt = '',
  _riskText = '',
}) {
  const text = `${headings.join('\n')}\n${excerpt}\n${_riskText}`;
  const risks = [];
  if (
    /\b(?:ignore|disregard|override)\b.{0,80}\b(?:previous|prior|system|developer|agent|instructions?)\b/is.test(text) ||
    /\b(?:system|developer)\s+prompt\b/i.test(text)
  ) {
    risks.push('instruction-injection');
  }
  if (
    /\b(?:call|invoke|execute|run)\s+(?:the\s+)?(?:add_concepts?|patch_concept|add_relations?|rename_concept)\b/i.test(text)
  ) {
    risks.push('ontology-write-instruction');
  }
  if (
    /\b(?:roadmap|planned|planning to|will support|future state|coming soon|not yet)\b/i.test(text) ||
    /(?:향후|추후|예정|계획 중)/.test(text)
  ) {
    risks.push('future-state-claim');
  }
  if (
    /\b(?:does not|do not|not a|not yet|never supports?|out of scope|non-goal)\b/i.test(text) ||
    /(?:지원하지 않|범위가 아니|제공하지 않)/.test(text)
  ) {
    risks.push('negated-claim');
  }
  if (
    /\b(?:deprecated|legacy|no longer|removed)\b/i.test(text) ||
    /(?:폐기|더 이상|제거됨)/.test(text)
  ) {
    risks.push('deprecated-state');
  }
  return risks;
}

function semanticEvidenceTrust(riskFlags) {
  if (
    riskFlags.includes('instruction-injection') ||
    riskFlags.includes('ontology-write-instruction')
  ) {
    return 'untrusted-instruction';
  }
  if (riskFlags.length > 0) return 'claim-review-required';
  return 'candidate-evidence';
}

function discoverSemanticEvidenceCandidates(rootPath, skipped = []) {
  const bySource = new Map();
  for (const [source, role] of SEMANTIC_EVIDENCE_SEEDS) {
    if (existsSync(join(rootPath, source))) {
      bySource.set(source, { source, role, pathScore: 100 });
    }
  }
  discoverWorkspaceSemanticEvidenceCandidates(rootPath, bySource, skipped);
  let filesSeen = 0;
  let entriesSeen = 0;
  const visitedDirectories = new Set();
  function walkBudgetReached(dir) {
    if (entriesSeen < SEMANTIC_DISCOVERY_MAX_ENTRIES) return false;
    pushSkippedOnce(skipped, {
      path: dir,
      reason: `semantic-evidence-skip: ${relative(rootPath, dir)} reached ${SEMANTIC_DISCOVERY_MAX_ENTRIES} entry walk budget`,
    });
    return true;
  }
  function visit(dir) {
    if (filesSeen >= SEMANTIC_DISCOVERY_MAX_FILES || walkBudgetReached(dir)) return;
    const realDirectory = realpathSync(dir);
    if (visitedDirectories.has(realDirectory)) {
      pushSkippedOnce(skipped, {
        path: dir,
        reason: `semantic-evidence-skip: ${relative(rootPath, dir)} repeats a visited directory`,
      });
      return;
    }
    visitedDirectories.add(realDirectory);
    for (const entry of readdirSync(dir).sort()) {
      if (filesSeen >= SEMANTIC_DISCOVERY_MAX_FILES || walkBudgetReached(dir)) return;
      entriesSeen += 1;
      const path = join(dir, entry);
      let resolvesInsideRoot = false;
      try {
        resolvesInsideRoot = pathResolvesInsideRoot(rootPath, path);
      } catch {
        pushSkippedOnce(skipped, {
          path,
          reason: `semantic-evidence-skip: ${relative(rootPath, path)} cannot resolve inside repository root`,
        });
        continue;
      }
      if (!resolvesInsideRoot) {
        pushSkippedOnce(skipped, {
          path,
          reason: `semantic-evidence-skip: ${relative(rootPath, path)} resolves outside repository root`,
        });
        continue;
      }
      const stat = statSync(path);
      if (stat.isDirectory()) {
        if (!SEMANTIC_DISCOVERY_SKIP_DIRS.has(entry.toLowerCase())) visit(path);
        continue;
      }
      if (!entry.toLowerCase().endsWith('.md')) continue;
      filesSeen += 1;
      const source = relative(rootPath, path);
      if (bySource.has(source)) continue;
      const classified = classifySemanticEvidencePath(source);
      if (classified) bySource.set(source, { source, ...classified });
    }
  }
  for (const rootName of SEMANTIC_DISCOVERY_ROOTS) {
    if (filesSeen >= SEMANTIC_DISCOVERY_MAX_FILES) break;
    const discoveryRoot = join(rootPath, rootName);
    if (!existsSync(discoveryRoot)) continue;
    if (!pathResolvesInsideRoot(rootPath, discoveryRoot)) {
      pushSkippedOnce(skipped, {
        path: discoveryRoot,
        reason: `semantic-evidence-skip: ${rootName} resolves outside repository root`,
      });
      continue;
    }
    if (!statSync(discoveryRoot).isDirectory()) continue;
    visit(discoveryRoot);
  }
  return [...bySource.values()];
}

function discoverWorkspaceSemanticEvidenceCandidates(rootPath, bySource, skipped) {
  for (const folder of WORKSPACE_FOLDERS) {
    const workspaceRoot = join(rootPath, folder);
    if (!existsSync(workspaceRoot)) continue;
    let entries;
    try {
      entries = readdirSync(workspaceRoot).sort();
    } catch (error) {
      pushSkippedOnce(skipped, {
        path: workspaceRoot,
        reason: `semantic-evidence-read-error: ${error.message}`,
      });
      continue;
    }
    const eligible = entries.filter((entry) => {
      if (entry.startsWith('.')) return false;
      try {
        return statSync(join(workspaceRoot, entry)).isDirectory();
      } catch {
        return false;
      }
    });
    const considered = eligible.slice(0, WORKSPACE_SEMANTIC_EVIDENCE_MAX_MEMBERS);
    if (eligible.length > considered.length) {
      pushSkippedOnce(skipped, {
        path: workspaceRoot,
        reason: `semantic-evidence-skip: ${folder} workspace members limited to ${WORKSPACE_SEMANTIC_EVIDENCE_MAX_MEMBERS}`,
      });
    }
    for (const entry of considered) {
      const packageSource = `${folder}/${entry}/package.json`;
      if (existsSync(join(rootPath, packageSource))) {
        bySource.set(packageSource, {
          source: packageSource,
          role: 'package-contract',
          pathScore: 74,
        });
      }
      const readmeSource = `${folder}/${entry}/README.md`;
      if (existsSync(join(rootPath, readmeSource))) {
        bySource.set(readmeSource, {
          source: readmeSource,
          role: 'product-capabilities',
          pathScore: 75,
        });
      }
    }
  }
}

function classifySemanticEvidencePath(source) {
  const normalized = source.toLowerCase();
  if (/(?:^|\/)(?:readme|features?|capabilit(?:y|ies)|feature-catalog)(?:[._/-]|$)/.test(normalized)) {
    return { role: 'product-capabilities', pathScore: 70 };
  }
  if (/(?:^|\/)(?:product|strategy|vision|mission|direction|principles?)(?:[._/-]|$)/.test(normalized)) {
    return { role: 'product-contract', pathScore: 65 };
  }
  if (/(?:^|\/)(?:architecture|system-map|system_map|system|domain-map)(?:[._/-]|$)/.test(normalized)) {
    return { role: 'architecture', pathScore: 60 };
  }
  if (/(?:^|\/)glossary(?:[._/-]|$)/.test(normalized)) {
    return { role: 'product-contract', pathScore: 50 };
  }
  if (/(?:^|\/)(?:introduction|overview|about)(?:[._/-]|$)/.test(normalized)) {
    return { role: 'product-contract', pathScore: 45 };
  }
  return null;
}

function semanticContentScore({ title, headings, excerpt }) {
  const text = `${title ?? ''}\n${headings.join('\n')}\n${excerpt}`.toLowerCase();
  let score = 0;
  for (const pattern of [
    /\bproduct goal\b/,
    /\buser need\b/,
    /\bmission\b/,
    /\bcapabilit(?:y|ies)\b/,
    /\bkey features\b/,
    /\bresponsibilit(?:y|ies)\b/,
    /\bdomain\b/,
    /한 줄 정의/,
    /제품 목표/,
    /기능 정의/,
  ]) {
    if (pattern.test(text)) score += 12;
  }
  if (/\b(?:backlog|roadmap|implementation plan|research findings|competitor)\b/.test(text)) {
    score -= 20;
  }
  return score;
}

function extractSemanticDocument(text) {
  const lines = text.split(/\r?\n/);
  const headings = [];
  const prose = [];
  let proseLength = 0;
  let title = null;
  let fence = null;
  let rstLiteralBlock = false;
  let frontmatter = lines[0]?.trim() === '---';
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const line = rawLine.trim();
    if (rstLiteralBlock) {
      if (!line || /^\s/.test(rawLine)) continue;
      rstLiteralBlock = false;
    }
    if (frontmatter) {
      if (lineIndex > 0 && line === '---') frontmatter = false;
      continue;
    }
    const fenceMatch = line.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      fence = fence === marker ? null : fence ?? marker;
      continue;
    }
    if (fence) continue;
    if (/^\.\.\s+(?:code-block|sourcecode|literalinclude)::/i.test(line)) {
      rstLiteralBlock = true;
      continue;
    }
    const nextLine = lines[lineIndex + 1]?.trim() ?? '';
    const setextOrRstHeading =
      line && isHeadingAdornment(nextLine)
        ? {
            level: headingLevelForAdornment(nextLine, Boolean(title)),
            value: line,
          }
        : null;
    const markdownHeading = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    const htmlHeading = line.match(/<h([1-3])\b[^>]*>(.*?)<\/h\1>/i);
    if (setextOrRstHeading || markdownHeading || htmlHeading) {
      const level = setextOrRstHeading
        ? setextOrRstHeading.level
        : markdownHeading
        ? markdownHeading[1].length
        : Number(htmlHeading[1]);
      const value = (setextOrRstHeading
        ? setextOrRstHeading.value
        : markdownHeading
          ? markdownHeading[2]
          : htmlHeading[2])
        .replace(/<[^>]+>/g, '')
        .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
        .trim();
      if (!value) continue;
      if (level === 1 && !title) title = value;
      if (headings.length < SEMANTIC_EVIDENCE_MAX_HEADINGS) headings.push(value);
      if (setextOrRstHeading) lineIndex += 1;
      continue;
    }
    if (
      !line ||
      /^\.\.\s+\S+::/.test(line) ||
      /^<!--/.test(line) ||
      /^<\/?(?:p|div|img|a)\b/i.test(line) ||
      /^!\[/.test(line) ||
      /^[-*_]{3,}$/.test(line) ||
      /shields\.io/.test(line)
    ) {
      continue;
    }
    const cleaned = line
      .replace(/^>\s*/, '')
      .replace(/^[-*]\s+/, '')
      .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&(?:nbsp|middot|amp|lt|gt);/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned && proseLength < SEMANTIC_EVIDENCE_MAX_EXCERPT) {
      prose.push(cleaned);
      proseLength += cleaned.length + 1;
    }
  }
  return {
    title,
    headings,
    excerpt: prose.join(' ').slice(0, SEMANTIC_EVIDENCE_MAX_EXCERPT).trim(),
  };
}

function formatOntologyEvidence(evidence) {
  return {
    slug: evidence.slug,
    kind: evidence.kind,
    source: evidence.source,
  };
}

function uniqueEvidenceRows(rows) {
  const seen = new Set();
  const unique = [];
  for (const row of rows) {
    const key = `${row.slug}\0${row.kind}\0${row.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

function extractStaticAutotoolsIdentity(text) {
  const match = String(text).match(
    /^\s*AC_INIT\s*\(\s*(\[[^\]\r\n]{1,160}\]|"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*')\s*(?=,|\))/m,
  );
  if (!match) return '';
  const literal = match[1];
  const identity = literal.slice(1, -1).trim();
  if (
    !identity ||
    identity.length > AUTOTOOLS_IDENTITY_MAX_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(identity) ||
    /[`$\\]/.test(identity) ||
    /\b(?:m4_[A-Za-z0-9_]+|esyscmd|syscmd|eval|include|ifdef|ifelse)\s*\(/i.test(identity)
  ) {
    return '';
  }
  return identity;
}

function detectAutotoolsIdentity(rootPath, skipped = []) {
  for (const source of AUTOTOOLS_IDENTITY_FILES) {
    const path = join(rootPath, source);
    if (!existsSync(path)) continue;
    try {
      const pathStat = statSync(path);
      if (!pathStat.isFile()) continue;
      if (!pathResolvesInsideRoot(rootPath, path)) {
        pushSkippedOnce(skipped, {
          path,
          reason: `project-identity-skip: ${source} resolves outside repository root`,
        });
        continue;
      }
      if (pathStat.size > AUTOTOOLS_IDENTITY_MAX_BYTES) {
        pushSkippedOnce(skipped, {
          path,
          reason: `project-identity-skip: ${source} exceeds ${AUTOTOOLS_IDENTITY_MAX_BYTES} bytes`,
        });
        continue;
      }
      const identity = extractStaticAutotoolsIdentity(readFileSync(path, 'utf-8'));
      const slug = identity ? slugify(identity.replace(/[_/]+/g, '-')) : '';
      if (identity && slug) {
        return { slug, title: identity, evidence: [source] };
      }
    } catch {
      // An unreadable or concurrently removed configure file is not identity evidence.
    }
  }
  return null;
}

function detectProject(rootPath, skipped = []) {
  const autotoolsIdentity = detectAutotoolsIdentity(rootPath, skipped);
  if (autotoolsIdentity) return autotoolsIdentity;
  const pkgPath = join(rootPath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const slugRaw = String(pkg.name || basename(rootPath));
      const slug = slugRaw.replace(/^@/, '').replace(/\//g, '-');
      // package.json `description` is explanatory prose, not an identity label.
      // Using it as `title` produced sentence-long project names (Muse exposed
      // this in dogfood). Prefer the README H1, then the package name.
      const title = detectReadmeH1(rootPath) || humanize(slug);
      return { slug, title };
    } catch (err) {
      skipped.push({
        path: pkgPath,
        reason: `package-json-parse-error: ${err.message}`,
      });
    }
  }
  const pyprojectPath = join(rootPath, 'pyproject.toml');
  if (existsSync(pyprojectPath)) {
    try {
      const issue = packageContractPathIssue(
        rootPath,
        pyprojectPath,
        'pyproject.toml',
        PYTHON_PROJECT_MAX_BYTES,
      );
      if (issue) {
        pushSkippedOnce(skipped, { path: pyprojectPath, reason: issue });
      } else {
        const contract = extractPythonPyprojectPackageContract(
          readFileSync(pyprojectPath, 'utf-8'),
        );
        if (contract.packageName) {
          const slug = slugify(contract.packageName.replace(/_/g, '-'));
          if (slug) {
            return {
              slug,
              title: detectReadmeH1(rootPath) || humanize(contract.packageName),
            };
          }
        }
      }
    } catch (err) {
      skipped.push({
        path: pyprojectPath,
        reason: `python-package-contract-read-error: ${err.message}`,
      });
    }
  }
  const setupPath = join(rootPath, 'setup.py');
  if (existsSync(setupPath)) {
    try {
      const issue = packageContractPathIssue(
        rootPath,
        setupPath,
        'setup.py',
        PYTHON_SETUP_MAX_BYTES,
      );
      if (issue) {
        pushSkippedOnce(skipped, { path: setupPath, reason: issue });
      } else {
        const contract = extractPythonSetupPackageContract(
          readFileSync(setupPath, 'utf-8'),
        );
        if (contract.packageName) {
          const slug = slugify(contract.packageName.replace(/_/g, '-'));
          if (slug) {
            return {
              slug,
              title: detectReadmeH1(rootPath) || humanize(contract.packageName),
            };
          }
        }
      }
    } catch (err) {
      skipped.push({
        path: setupPath,
        reason: `python-package-contract-read-error: ${err.message}`,
      });
    }
  }
  const readmeTitle = detectReadmeH1(rootPath);
  if (readmeTitle) return { slug: basename(rootPath), title: readmeTitle };
  return { slug: basename(rootPath), title: humanize(basename(rootPath)) };
}

function detectReadmeH1(rootPath) {
  for (const cand of ['README.md', 'readme.md', 'README.rst', 'readme.rst', 'README']) {
    const path = join(rootPath, cand);
    if (!existsSync(path)) continue;
    try {
      const lines = readFileSync(path, 'utf-8').split(/\r?\n/);
      let fence = null;
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
        if (fenceMatch) {
          const marker = fenceMatch[1][0];
          fence = fence === marker ? null : fence ?? marker;
          continue;
        }
        if (fence) continue;
        const nextLine = lines[lineIndex + 1]?.trim() ?? '';
        if (
          line.trim() &&
          isHeadingAdornment(nextLine) &&
          (cand.toLowerCase().endsWith('.rst') || nextLine.startsWith('='))
        ) {
          const title = cleanHeadingLabel(line);
          if (title) return title;
        }
        const markdownHeading = line.match(/^#\s+(.+?)\s*$/);
        if (markdownHeading) {
          const title = cleanHeadingLabel(markdownHeading[1]);
          if (title) return title;
        }
        const htmlHeading = line.match(/<h1\b[^>]*>(.*?)<\/h1>/i);
        if (htmlHeading) {
          const title = cleanHeadingLabel(htmlHeading[1]);
          if (title) return title;
        }
      }
    } catch {
      // A missing/unreadable README is not fatal to repository analysis.
    }
  }
  return null;
}

function cleanHeadingLabel(value) {
  return String(value)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|middot|amp|lt|gt);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isHeadingAdornment(line) {
  return /^([^\p{L}\p{N}\s])\1{2,}$/u.test(line);
}

function headingLevelForAdornment(line, hasTitle) {
  if (line.startsWith('=')) return 1;
  if (line.startsWith('-')) return 2;
  return hasTitle ? 2 : 1;
}

function detectExistingOntologyEvidence(rootPath, skipped = []) {
  const ontologyRoot = join(rootPath, 'docs', 'ontology');
  if (!existsSync(ontologyRoot) || !statSync(ontologyRoot).isDirectory()) {
    return [];
  }
  const rows = [];
  const seen = new Set();

  function visit(dir) {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      let stat;
      try {
        stat = statSync(path);
      } catch (err) {
        skipped.push({ path, reason: `ontology-stat-error: ${err.message}` });
        continue;
      }
      if (stat.isDirectory()) {
        visit(path);
        continue;
      }
      if (!entry.endsWith('.md')) continue;
      const evidence = readOntologyEvidence(rootPath, ontologyRoot, path);
      if (!evidence || seen.has(evidence.slug)) continue;
      seen.add(evidence.slug);
      rows.push(evidence);
    }
  }

  visit(ontologyRoot);
  return rows;
}

function readOntologyEvidence(rootPath, ontologyRoot, path) {
  let text;
  try {
    text = readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
  const frontmatter = parseSimpleFrontmatter(text);
  const kind = frontmatter.kind;
  if (kind !== 'domain' && kind !== 'capability') return null;
  const source = relative(rootPath, path);
  const slug = frontmatter.slug || relative(ontologyRoot, path).replace(/\.md$/i, '');
  if (STARTER_ONTOLOGY_SLUGS.has(slug)) return null;
  return { slug, kind, source, elements: frontmatter.elements ?? [] };
}

function parseSimpleFrontmatter(text) {
  if (!text.startsWith('---')) return {};
  const end = text.indexOf('\n---', 3);
  if (end === -1) return {};
  const block = text.slice(4, end).trim();
  const frontmatter = {};
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    if (!value) {
      const items = [];
      let j = i + 1;
      while (j < lines.length) {
        const item = lines[j].match(/^\s+-\s+(.+)$/);
        if (!item) break;
        items.push(item[1].trim().replace(/^['"]|['"]$/g, ''));
        j += 1;
      }
      if (items.length > 0) {
        frontmatter[key] = items;
        i = j - 1;
      }
      continue;
    }
    if (value.startsWith('[') && value.endsWith(']')) {
      frontmatter[key] = value
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
      continue;
    }
    frontmatter[key] = value.replace(/^['"]|['"]$/g, '');
  }
  return frontmatter;
}

function detectDomainsFromReadme(rootPath) {
  const candidates = ['README.md', 'readme.md', 'README'];
  for (const cand of candidates) {
    const p = join(rootPath, cand);
    if (!existsSync(p)) continue;
    try {
      const text = readFileSync(p, 'utf-8');
      const lines = text.split(/\r?\n/);
      const domains = [];
      const seen = new Set();
      for (let i = 0; i < lines.length; i += 1) {
        const m = lines[i].match(/^##\s+(.+?)\s*$/);
        if (!m) continue;
        const title = m[1].trim();
        const normalizedTitle = title
          .replace(/^[^a-z0-9가-힣]+/i, '')
          .trim();
        // README H2 is a heuristic domain source. Skip headers that are almost
        // never real codebase domains and only add bootstrap noise: generic doc
        // sections, narrative / question-style headers ("Why It Exists"),
        // language-guide headers ("한국어 가이드"), and sentence-like headers
        // ("Three views plus MCP, one vault").
        const wordCount = title.split(/\s+/).filter(Boolean).length;
        if (
          // generic doc sections (exact match)
          /^(usage|installation|getting started|quick start|license|contributing|requirements|features|setup|status|tech stack|architecture|folder map|routes|tests?|documentation|overview|development|deployment|changelog|roadmap|faq|demo|examples?|guides?|table of contents|toc|acknowledge?ments?|sponsors?)$/i.test(
            normalizedTitle,
          ) ||
          // operational / aggregate sections that describe the README, not a
          // product ownership boundary
          /\bin numbers$|^install\b|^core capabilities$|^providers? and (?:local|offline) (?:path|setup|mode)$|^verification$|^community(?:\s+(?:and|&)\s+support)?$/i.test(
            normalizedTitle,
          ) ||
          /^(?:documentation\s+(?:and|&)\s+community(?:\s+support|\s+(?:and|&)\s+support)|documentation\s+(?:and|&)\s+support)$/i.test(
            normalizedTitle,
          ) ||
          // narrative / question-style headers
          /^(why|what|how|when|where|who)\b/i.test(normalizedTitle) ||
          // language-guide / translation section headers
          /가이드|\bguide\b/i.test(normalizedTitle) ||
          // bare language-name headers ("## 한국어", "## English") — a
          // translated-README section, same noise class as "## 한국어 가이드".
          // Measured 2026-07-30: the repo's own "## 한국어" section counted as
          // a 6th domain candidate and drifted the verify census when the
          // section moved.
          /^(한국어|한글|english|日本語|中文|简体中文|繁體中文|español|français|deutsch|português|русский|italiano|türkçe)$/i.test(
            normalizedTitle,
          ) ||
          // sentence-like headers (clause separator or long phrase)
          title.includes(',') ||
          wordCount > 5
        ) {
          continue;
        }
        const rawSlug = slugify(title);
        if (!rawSlug) continue;
        const slug = `domains/${rawSlug}`;
        if (seen.has(slug)) continue;
        seen.add(slug);
        domains.push({
          slug,
          title,
          evidence: { source: cand, line: i + 1 },
        });
        if (domains.length >= 12) break; // sanity cap
      }
      return { domains, readmePath: p };
    } catch {
      // ignore
    }
  }
  return { domains: [], readmePath: null };
}

function discoverSourcePythonPackagePaths(rootPath, { srcDir, ignore, skipped }) {
  if (!srcDir || !['src', 'source'].includes(basename(srcDir))) return [];
  let entries;
  try {
    entries = readdirSync(srcDir).sort();
  } catch {
    return [];
  }
  const paths = [];
  for (const entry of entries) {
    if (
      ignore.has(entry) ||
      PYTHON_NON_PRODUCT_PACKAGES.has(entry.toLowerCase()) ||
      entry.startsWith('.')
    ) {
      continue;
    }
    const packagePath = join(srcDir, entry);
    const packageEntry = join(packagePath, '__init__.py');
    try {
      if (!statSync(packagePath).isDirectory() || !existsSync(packageEntry)) continue;
      if (
        !pathResolvesInsideRoot(rootPath, packagePath) ||
        !pathResolvesInsideRoot(rootPath, packageEntry)
      ) {
        pushSkippedOnce(skipped, {
          path: packagePath,
          reason: 'python-package-skip: path resolves outside repository root',
        });
        continue;
      }
      paths.push(relative(rootPath, packagePath));
    } catch {
      // A concurrent or unreadable package is not evidence.
    }
  }
  return paths;
}

function materializePythonPackageElements(paths, { domainForName, existingElements }) {
  const out = [];
  const claimed = new Set(existingElements.map((element) => element.slug));
  for (const path of [...paths].sort()) {
    const flatName = slugify(basename(path).replace(/_/g, '-'));
    if (!flatName || claimed.has(`elements/${flatName}`)) continue;
    const slug = `elements/${flatName}`;
    claimed.add(slug);
    out.push({
      slug,
      title: humanize(flatName),
      ...(domainForName(flatName) ? { domain: domainForName(flatName) } : {}),
      path,
      evidence: { source: path },
    });
  }
  return out;
}

function materializeImplementationOnlySourceElements(
  rootPath,
  sourceDir,
  { ignore, domainForName, existingElements, skipped },
) {
  const out = [];
  const claimed = new Set(existingElements.map((element) => element.slug));
  let admitted = 0;
  let limitRecorded = false;
  for (const entry of readdirSync(sourceDir).sort()) {
    if (ignore.has(entry) || entry.startsWith('.')) {
      skipped.push({ path: join(sourceDir, entry), reason: 'dotfile/ignore' });
      continue;
    }
    const entryPath = join(sourceDir, entry);
    let entryStat;
    try {
      entryStat = statSync(entryPath);
    } catch {
      continue;
    }
    if (!entryStat.isDirectory()) continue;
    if (admitted >= IMPLEMENTATION_SOURCE_ELEMENT_LIMIT) {
      if (!limitRecorded) {
        skipped.push({
          path: sourceDir,
          reason: `implementation-source-element-limit: omitted direct internal entries after ${IMPLEMENTATION_SOURCE_ELEMENT_LIMIT}`,
        });
        limitRecorded = true;
      }
      continue;
    }
    const name = slugify(entry);
    const slug = name ? `elements/${name}` : null;
    const source = relative(rootPath, entryPath);
    if (!slug || claimed.has(slug)) continue;
    out.push({
      slug,
      title: humanize(name),
      ...(domainForName(name) ? { domain: domainForName(name) } : {}),
      path: source,
      evidence: { source },
    });
    claimed.add(slug);
    admitted += 1;
  }
  return out;
}

function readAutotoolsRoleManifest(rootPath, path, skipped) {
  const source = relative(rootPath, path);
  try {
    if (!existsSync(path) || !statSync(path).isFile()) return null;
    if (!pathResolvesInsideRoot(rootPath, path)) {
      pushSkippedOnce(skipped, {
        path,
        reason: 'autotools-role-evidence-skip: ' + source + ' resolves outside repository root',
      });
      return null;
    }
    if (statSync(path).size > AUTOTOOLS_ROLE_MANIFEST_MAX_BYTES) {
      pushSkippedOnce(skipped, {
        path,
        reason: 'autotools-role-evidence-skip: ' + source + ' exceeds ' + AUTOTOOLS_ROLE_MANIFEST_MAX_BYTES + ' bytes',
      });
      return null;
    }
    return readFileSync(path, 'utf-8');
  } catch {
    pushSkippedOnce(skipped, {
      path,
      reason: 'autotools-role-evidence-skip: ' + source + ' is unreadable',
    });
    return null;
  }
}

function staticAutotoolsLines(contents) {
  return contents
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:dnl\b|#)/i.test(line))
    .map((line) => line.trim());
}

function isStaticAutotoolsRolePath(value) {
  if (
    !value ||
    value.length > AUTOTOOLS_ROLE_LITERAL_PATH_MAX_LENGTH ||
    isAbsolute(value) ||
    value.includes('\\') ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)
  ) {
    return false;
  }
  return value.split('/').every(
    (segment) => segment !== '.' && segment !== '..' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment),
  );
}

function extractStaticAutotoolsMakefileTargets(contents) {
  const targets = new Set();
  const source = staticAutotoolsLines(contents).join('\n');
  const pattern = /\bAC_CONFIG_FILES\s*\(\s*(?:\[([^\]]*)\]|([^)]*))\s*\)/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const candidates = (match[1] ?? match[2] ?? '').trim().split(/\s+/).filter(Boolean);
    if (
      candidates.length === 0 ||
      candidates.length > AUTOTOOLS_ROLE_TARGET_LIMIT ||
      !candidates.every(isStaticAutotoolsRolePath)
    ) {
      continue;
    }
    for (const candidate of candidates) {
      const segments = candidate.split('/');
      if (
        candidate === 'Makefile' ||
        (segments.length === 2 && segments[1] === 'Makefile')
      ) {
        targets.add(candidate);
      }
    }
  }
  return [...targets].sort().slice(0, AUTOTOOLS_ROLE_TARGET_LIMIT);
}

function makefileAmPathForTarget(rootPath, target) {
  if (target === 'Makefile') return join(rootPath, 'Makefile.am');
  return join(rootPath, target.slice(0, -'/Makefile'.length), 'Makefile.am');
}

function extractStaticAutotoolsRoleAssignments(contents) {
  const assignments = [];
  let pending = '';
  const flush = (line) => {
    const assignment = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s*(?:\+?=|:=)\s*(.+)$/);
    if (!assignment) return;
    const name = assignment[1];
    if (!/_HEADERS$/.test(name) && !/_SOURCES$/.test(name)) return;
    const values = assignment[2].trim().split(/\s+/).filter(Boolean);
    if (
      values.length === 0 ||
      values.length > AUTOTOOLS_ROLE_ASSIGNMENT_LIMIT ||
      !values.every(isStaticAutotoolsRolePath)
    ) {
      return;
    }
    assignments.push({ name, values });
  };

  for (const line of staticAutotoolsLines(contents)) {
    if (!line) continue;
    const current = pending ? pending + ' ' + line : line;
    if (current.endsWith('\\')) {
      pending = current.slice(0, -1).trim();
      continue;
    }
    flush(current);
    pending = '';
    if (assignments.length >= AUTOTOOLS_ROLE_ASSIGNMENT_LIMIT) break;
  }
  return assignments;
}

function resolveStaticAutotoolsRoleFile(rootPath, manifestPath, literalPath) {
  if (!isStaticAutotoolsRolePath(literalPath)) return null;
  const path = join(dirname(manifestPath), literalPath);
  try {
    if (
      !existsSync(path) ||
      !statSync(path).isFile() ||
      !pathResolvesInsideRoot(rootPath, path)
    ) {
      return null;
    }
    return path;
  } catch {
    return null;
  }
}

function resolveStaticAutotoolsHeaderFile(rootPath, manifestPath, literalPath) {
  if (!/\.h(?:\.in)?$/i.test(literalPath)) return null;
  const direct = resolveStaticAutotoolsRoleFile(rootPath, manifestPath, literalPath);
  if (direct && NATIVE_ROLE_EVIDENCE_FILE.test(direct)) return direct;
  if (!/\.h$/i.test(literalPath)) return null;
  const template = resolveStaticAutotoolsRoleFile(rootPath, manifestPath, literalPath + '.in');
  return template && /\.h\.in$/i.test(template) ? template : null;
}

function nativeRoleForSource(path, isExtra, source) {
  const name = basename(path).replace(NATIVE_ROLE_EVIDENCE_FILE, '');
  if (/(?:^|[-_.])(raw|api)(?:[-_.]|$)/i.test(name)) {
    return 'Specialized API source';
  }
  if (isExtra && source.includes('/')) {
    return 'Selectable platform backend';
  }
  return 'Core implementation source';
}

function discoverAutotoolsDeclaredRoleEvidence(rootPath, skipped) {
  const roleCandidates = new Map();
  const makefilePaths = new Set();
  const addRoleCandidate = (path, role, evidenceSource) => {
    if (!NATIVE_ROLE_EVIDENCE_FILE.test(path)) return;
    const source = relative(rootPath, path);
    const existing = roleCandidates.get(source);
    if (
      !existing ||
      (AUTOTOOLS_ROLE_CLASSIFICATION_PRIORITY.get(role) ?? Infinity) <
        (AUTOTOOLS_ROLE_CLASSIFICATION_PRIORITY.get(existing.role) ?? Infinity)
    ) {
      roleCandidates.set(source, { path, role, evidenceSource });
    }
  };

  for (const configName of AUTOTOOLS_IDENTITY_FILES) {
    const configPath = join(rootPath, configName);
    const contents = readAutotoolsRoleManifest(rootPath, configPath, skipped);
    if (!contents) continue;
    for (const target of extractStaticAutotoolsMakefileTargets(contents)) {
      makefilePaths.add(makefileAmPathForTarget(rootPath, target));
    }
  }

  for (const manifestPath of [...makefilePaths].sort()) {
    const contents = readAutotoolsRoleManifest(rootPath, manifestPath, skipped);
    if (!contents) continue;
    const manifestSource = relative(rootPath, manifestPath);
    for (const assignment of extractStaticAutotoolsRoleAssignments(contents)) {
      if (/(?:^|_)(?:include|pkginclude)_HEADERS$/.test(assignment.name)) {
        for (const literalPath of assignment.values) {
          const path = resolveStaticAutotoolsHeaderFile(rootPath, manifestPath, literalPath);
          if (path) addRoleCandidate(path, 'Public interface contract', manifestSource);
        }
        continue;
      }
      if (assignment.name.endsWith('_HEADERS')) continue;

      const isExtra = assignment.name.startsWith('EXTRA_');
      for (const literalPath of assignment.values) {
        const path = resolveStaticAutotoolsRoleFile(rootPath, manifestPath, literalPath);
        if (!path || !NATIVE_SOURCE_FILE.test(path)) continue;
        const source = relative(rootPath, path);
        const role = nativeRoleForSource(path, isExtra, source);
        addRoleCandidate(
          path,
          role,
          role === 'Specialized API source' ? source : manifestSource,
        );
      }
    }
  }

  return roleCandidates;
}

function nativeEvidenceTitle(source, role) {
  const fileName = source.split('/').at(-1);
  const stem = slugify(fileName.replace(NATIVE_ROLE_EVIDENCE_FILE, ''));
  return role + ': ' + humanize(stem);
}

function compareNativeEvidenceCandidates(left, right) {
  const roleDelta =
    (AUTOTOOLS_ROLE_SELECTION_PRIORITY.get(left.role) ?? Infinity) -
    (AUTOTOOLS_ROLE_SELECTION_PRIORITY.get(right.role) ?? Infinity);
  if (roleDelta !== 0) return roleDelta;
  const representativePriority = (candidate) => {
    const fileName = candidate.source.split('/').at(-1).toLowerCase();
    const stem = fileName.replace(NATIVE_ROLE_EVIDENCE_FILE, '');
    if (candidate.role === 'Public interface contract') {
      return fileName.endsWith('.h.in') ? 0 : candidate.source.startsWith('include/') ? 1 : 2;
    }
    if (candidate.role === 'Core implementation source') {
      if (/(?:^|[-_.])prep(?:[-_.]|$)/.test(stem)) return 0;
      return /(?:^|[-_.])(main|core)(?:[-_.]|$)/.test(stem) ? 1 : 2;
    }
    if (candidate.role === 'Specialized API source') {
      return /^(?:raw[-_.]?api|api)$/.test(stem) ? 0 : 1;
    }
    return 0;
  };
  const representativeDelta = representativePriority(left) - representativePriority(right);
  if (representativeDelta !== 0) return representativeDelta;
  const leftBase = left.source.split('/').at(-1).toLowerCase();
  const rightBase = right.source.split('/').at(-1).toLowerCase();
  const basePriority = (base) => (
    base === 'main.c' || base === 'main.h' ? 0 : base.endsWith('.c') ? 1 : 2
  );
  return basePriority(leftBase) - basePriority(rightBase) || left.source.localeCompare(right.source);
}

function discoverAutotoolsImplementationEvidence(rootPath, { ignore, skipped }) {
  const hasAutotoolsManifest = [...AUTOTOOLS_IMPLEMENTATION_MANIFESTS.keys()].some(
    (manifest) => {
      const path = join(rootPath, manifest);
      try {
        return existsSync(path) && statSync(path).isFile() && pathResolvesInsideRoot(rootPath, path);
      } catch {
        return false;
      }
    },
  );
  if (!hasAutotoolsManifest) {
    return { isNativeProject: false, elements: [] };
  }

  const sourceCandidates = new Map();
  const visitedDirectories = new Set();
  let entriesSeen = 0;

  const addSourceCandidate = (path) => {
    const source = relative(rootPath, path);
    if (!source || sourceCandidates.has(source)) return;
    try {
      if (
        !statSync(path).isFile() ||
        !NATIVE_SOURCE_FILE.test(path) ||
        !pathResolvesInsideRoot(rootPath, path)
      ) {
        return;
      }
      sourceCandidates.set(source, path);
    } catch {
      // A broken or concurrently removed path is not evidence.
    }
  };

  const visitSourceRoot = (dir, depth, descend = true) => {
    if (depth > 3 || entriesSeen >= 2000) return;
    let realDirectory;
    try {
      realDirectory = realpathSync(dir);
      if (visitedDirectories.has(realDirectory)) return;
      visitedDirectories.add(realDirectory);
    } catch {
      return;
    }
    let entries;
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entriesSeen >= 2000) break;
      entriesSeen += 1;
      if (ignore.has(entry) || entry.startsWith('.')) continue;
      const path = join(dir, entry);
      let pathStat;
      try {
        if (!pathResolvesInsideRoot(rootPath, path)) continue;
        pathStat = statSync(path);
      } catch {
        continue;
      }
      if (pathStat.isDirectory() && descend) {
        visitSourceRoot(path, depth + 1);
      } else if (pathStat.isFile()) {
        addSourceCandidate(path);
      }
    }
  };

  // Root-level C files are common in small native tools. Conventional source
  // roots are walked separately so a large repository does not turn every
  // documentation/vendor file into an implementation candidate.
  visitSourceRoot(rootPath, 0, false);
  for (const sourceFolder of SOURCE_FOLDERS) {
    const sourceRoot = join(rootPath, sourceFolder);
    try {
      if (existsSync(sourceRoot) && statSync(sourceRoot).isDirectory()) {
        visitSourceRoot(sourceRoot, 0);
      }
    } catch {
      // Continue with the remaining conventional source roots.
    }
  }

  const declaredRoleEvidence = discoverAutotoolsDeclaredRoleEvidence(rootPath, skipped);
  for (const [source, row] of declaredRoleEvidence) {
    sourceCandidates.set(source, row.path);
  }

  if (sourceCandidates.size === 0) {
    return { isNativeProject: false, elements: [] };
  }

  const elements = [];
  const claimedSlugs = new Set();
  const addElement = (row) => {
    if (claimedSlugs.has(row.slug)) return;
    claimedSlugs.add(row.slug);
    elements.push(row);
  };

  for (const [manifest, descriptor] of AUTOTOOLS_IMPLEMENTATION_MANIFESTS) {
    const path = join(rootPath, manifest);
    try {
      if (!existsSync(path) || !statSync(path).isFile() || !pathResolvesInsideRoot(rootPath, path)) {
        continue;
      }
    } catch {
      continue;
    }
    const source = relative(rootPath, path);
    addElement({
      slug: descriptor.slug,
      title: descriptor.title,
      path: source,
      evidence: { source },
    });
  }

  const docsDependencyPath = join(rootPath, 'docs', 'Pipfile');
  try {
    if (
      existsSync(docsDependencyPath) &&
      statSync(docsDependencyPath).isFile() &&
      pathResolvesInsideRoot(rootPath, docsDependencyPath)
    ) {
      const source = relative(rootPath, docsDependencyPath);
      addElement({
        slug: 'elements/docs-dependencies',
        title: 'Documentation Dependencies',
        path: source,
        evidence: { source },
      });
    }
  } catch {
    // An unreadable dependency manifest is not evidence.
  }

  const docsRoot = join(rootPath, 'docs');
  let docsBuildScripts = [];
  try {
    if (existsSync(docsRoot) && statSync(docsRoot).isDirectory()) {
      docsBuildScripts = readdirSync(docsRoot)
        .filter((entry) => /^build_[A-Za-z0-9_-]+\.py$/i.test(entry))
        .filter((entry) => {
          const path = join(docsRoot, entry);
          try {
            return statSync(path).isFile() && pathResolvesInsideRoot(rootPath, path);
          } catch {
            return false;
          }
        })
        .sort()
        .slice(0, NATIVE_DOC_BUILD_ELEMENT_LIMIT);
    }
  } catch {
    docsBuildScripts = [];
  }
  for (const entry of docsBuildScripts) {
    const source = `docs/${entry}`;
    const suffix = slugify(entry.slice('build_'.length, -'.py'.length));
    if (!suffix) continue;
    addElement({
      slug: `elements/docs-build-${suffix}`,
      title: `Documentation Build ${humanize(suffix)}`,
      path: source,
      evidence: { source },
    });
  }

  const sortedSources = [...sourceCandidates.entries()]
    .map(([source, path]) => ({
      source,
      path,
      role: declaredRoleEvidence.get(source)?.role ?? 'Unclassified native source evidence',
    }))
    .sort(compareNativeEvidenceCandidates);
  const selectedSources = [];
  const selectedSourcePaths = new Set();
  for (const role of AUTOTOOLS_ROLE_SELECTION_PRIORITY.keys()) {
    const representative = sortedSources.find((candidate) => candidate.role === role);
    if (!representative || selectedSourcePaths.has(representative.source)) continue;
    selectedSources.push(representative);
    selectedSourcePaths.add(representative.source);
  }
  for (const candidate of sortedSources) {
    if (selectedSources.length >= NATIVE_SOURCE_ELEMENT_LIMIT) break;
    if (selectedSourcePaths.has(candidate.source)) continue;
    selectedSources.push(candidate);
    selectedSourcePaths.add(candidate.source);
  }
  if (sortedSources.length > selectedSources.length) {
    pushSkippedOnce(skipped, {
      path: rootPath,
      reason: `native-source-element-limit: omitted ${sortedSources.length - selectedSources.length} C/C header paths after ${NATIVE_SOURCE_ELEMENT_LIMIT}`,
    });
  }
  const sourceSlugCounts = new Map();
  for (const { source, role } of selectedSources) {
    const fileName = source.split('/').at(-1);
    const stem = slugify(fileName.replace(NATIVE_ROLE_EVIDENCE_FILE, ''));
    if (!stem) continue;
    const count = sourceSlugCounts.get(stem) ?? 0;
    sourceSlugCounts.set(stem, count + 1);
    const slug = count === 0
      ? `elements/${stem}`
      : `elements/${stem}-${slugify(source.split('/').slice(-2, -1)[0]) || 'native'}`;
    addElement({
      slug,
      title: nativeEvidenceTitle(source, role),
      path: source,
      evidence: {
        source: declaredRoleEvidence.get(source)?.evidenceSource ?? source,
      },
    });
  }

  return { isNativeProject: true, elements };
}

function discoverRustImplementationEvidence(rootPath, skipped) {
  const empty = { rows: [], skipDirectories: new Set() };
  const manifestPath = join(rootPath, 'Cargo.toml');
  if (!existsSync(manifestPath)) return empty;
  try {
    const issue = packageContractPathIssue(
      rootPath,
      manifestPath,
      'Cargo.toml',
      CARGO_MANIFEST_MAX_BYTES,
    );
    if (issue) {
      pushSkippedOnce(skipped, { path: manifestPath, reason: issue });
      return empty;
    }
    if (!extractCargoPackageContract(readFileSync(manifestPath, 'utf-8')).packageName) {
      return empty;
    }
  } catch {
    return empty;
  }

  const srcRoot = join(rootPath, 'src');
  try {
    if (!existsSync(srcRoot) || !statSync(srcRoot).isDirectory()) return empty;
    if (!pathResolvesInsideRoot(rootPath, srcRoot)) return empty;
  } catch {
    return empty;
  }

  const targetRows = [];
  const skipDirectories = new Set();
  const addTarget = (path, name) => {
    try {
      if (
        !existsSync(path) ||
        !statSync(path).isFile() ||
        !pathResolvesInsideRoot(rootPath, path)
      ) {
        return;
      }
      targetRows.push({
        path: relative(rootPath, path),
        name,
        kind: 'rust-target',
      });
    } catch {
      // Only resolved, regular files can become evidence.
    }
  };
  addTarget(join(srcRoot, 'lib.rs'), 'lib');
  addTarget(join(srcRoot, 'main.rs'), 'main');

  const binRoot = join(srcRoot, 'bin');
  try {
    if (existsSync(binRoot) && statSync(binRoot).isDirectory()) {
      if (pathResolvesInsideRoot(rootPath, binRoot)) {
        skipDirectories.add('src/bin');
        for (const entry of readdirSync(binRoot).sort()) {
          const path = join(binRoot, entry);
          if (entry.endsWith('.rs')) {
            addTarget(path, entry.slice(0, -3));
          } else if (statSync(path).isDirectory()) {
            addTarget(join(path, 'main.rs'), entry);
          }
        }
      }
    }
  } catch {
    // An unreadable target directory contributes no evidence.
  }

  const moduleRows = [];
  const seenModulePaths = new Set(targetRows.map((row) => row.path));
  for (const target of targetRows) {
    if (moduleRows.length >= RUST_IMPLEMENTATION_ELEMENT_LIMIT) break;
    const targetPath = join(rootPath, target.path);
    let text;
    try {
      if (statSync(targetPath).size > RUST_SOURCE_MAX_BYTES) continue;
      text = readFileSync(targetPath, 'utf-8');
    } catch {
      continue;
    }
    for (const moduleName of extractRustModuleNames(text).slice(0, RUST_MODULES_PER_TARGET_LIMIT)) {
      const modulePath = resolveRustModulePath(rootPath, targetPath, moduleName);
      if (!modulePath) continue;
      const source = relative(rootPath, modulePath);
      if (seenModulePaths.has(source)) continue;
      seenModulePaths.add(source);
      const moduleRoot = relative(rootPath, join(modulePath, '..')).replaceAll('\\', '/');
      if (moduleRoot !== 'src') skipDirectories.add(moduleRoot);
      moduleRows.push({ path: source, name: moduleName, kind: 'rust-module' });
      if (targetRows.length + moduleRows.length >= RUST_IMPLEMENTATION_ELEMENT_LIMIT) break;
    }
  }
  return {
    rows: [...targetRows, ...moduleRows].slice(0, RUST_IMPLEMENTATION_ELEMENT_LIMIT),
    skipDirectories,
  };
}

function materializeRustImplementationElements(rows, { existingElements }) {
  const out = [];
  const claimed = new Set(existingElements.map((element) => element.slug));
  for (const row of rows) {
    const base = slugify(row.name.replace(/_/g, '-'));
    if (!base) continue;
    const bareSlug = `elements/${base}`;
    const slug = claimed.has(bareSlug)
      ? `elements/${base}-${row.kind}`
      : bareSlug;
    if (claimed.has(slug)) continue;
    claimed.add(slug);
    out.push({
      slug,
      title: humanize(base),
      path: row.path,
      evidence: { source: row.path },
    });
  }
  return out;
}

function resolveRustModulePath(rootPath, targetPath, moduleName) {
  const targetDir = join(targetPath, '..');
  for (const candidate of [
    join(targetDir, `${moduleName}.rs`),
    join(targetDir, moduleName, 'mod.rs'),
  ]) {
    try {
      if (
        existsSync(candidate) &&
        statSync(candidate).isFile() &&
        pathResolvesInsideRoot(rootPath, candidate)
      ) {
        return candidate;
      }
    } catch {
      // Continue to the alternate Rust module convention.
    }
  }
  return null;
}

function extractRustModuleNames(text) {
  const names = new Set();
  for (const line of stripRustNonCode(text).split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:pub(?:\s*\([^\r\n)]*\))?\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/,
    );
    if (match) names.add(match[1]);
  }
  return [...names].sort();
}

function stripRustNonCode(text) {
  let output = '';
  let index = 0;
  while (index < text.length) {
    if (text.startsWith('//', index)) {
      const end = text.indexOf('\n', index + 2);
      const consumed = end === -1 ? text.length : end;
      output += text.slice(index, consumed).replace(/[^\n]/g, ' ');
      index = consumed;
      continue;
    }
    if (text.startsWith('/*', index)) {
      const consumed = consumeRustBlockComment(text, index);
      output += text.slice(index, consumed).replace(/[^\n]/g, ' ');
      index = consumed;
      continue;
    }
    const rawEnd = consumeRustRawString(text, index);
    if (rawEnd !== null) {
      output += text.slice(index, rawEnd).replace(/[^\n]/g, ' ');
      index = rawEnd;
      continue;
    }
    if (text[index] === '"') {
      const consumed = consumeRustQuoted(text, index);
      output += text.slice(index, consumed).replace(/[^\n]/g, ' ');
      index = consumed;
      continue;
    }
    output += text[index];
    index += 1;
  }
  return output;
}

function consumeRustBlockComment(text, start) {
  let depth = 1;
  let index = start + 2;
  while (index < text.length && depth > 0) {
    if (text.startsWith('/*', index)) {
      depth += 1;
      index += 2;
    } else if (text.startsWith('*/', index)) {
      depth -= 1;
      index += 2;
    } else {
      index += 1;
    }
  }
  return index;
}

function consumeRustRawString(text, start) {
  const match = text.slice(start).match(/^(?:br|r)(#*)"/);
  if (!match) return null;
  const terminator = `"${match[1]}`;
  const end = text.indexOf(terminator, start + match[0].length);
  return end === -1 ? text.length : end + terminator.length;
}

function consumeRustQuoted(text, start) {
  let escaped = false;
  for (let index = start + 1; index < text.length; index += 1) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (text[index] === '\\') {
      escaped = true;
      continue;
    }
    if (text[index] === '"') return index + 1;
  }
  return text.length;
}

/**
 * 최상위 독립 패키지 (root 바로 아래 `package.json` 을 가진 디렉토리) 를
 * 요소 후보로 제안한다 — `mcp/`, `cli/` 같은 sibling 패키지.
 *
 * 왜 (2026-08-01 실측): 이 함수가 없던 동안 analyze 는 `src/` FSD 레이어와
 * `apps/`·`packages/` 워크스페이스만 걸었고, **도구의 시야가 곧 볼트의
 * 사정거리가 됐다** — 규격 문맥 없는 에이전트가 이 제안만으로 도그푸드
 * 볼트를 재생성하자 이 저장소의 에이전트 표면(MCP 서버 `mcp/`, CLI `cli/`)
 * 이 통째로 지도에서 빠졌다. path: 43개 전부가 `src/` 였다. 제안 도구의
 * 누락은 침묵으로 전파되므로, 사정거리는 코드로 고친다 (문구만 고치면
 * 다음 사람이 같은 볼트를 만든다).
 *
 * `package.json` 이 판별자다 — `scripts/`·`tests/`·`docs/` 처럼 독립 패키지
 * 가 아닌 최상위 폴더는 제안하지 않는다 (덮는 것이 목적이 아니다).
 */
function detectRootPackages(rootPath, { ignore, domainForName, existingElements }) {
  const out = [];
  const claimed = new Set(existingElements.map((el) => el.slug));
  let entries;
  try {
    entries = readdirSync(rootPath).sort();
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (ignore.has(entry) || entry.startsWith('.')) continue;
    if (SOURCE_FOLDERS.includes(entry) || WORKSPACE_FOLDERS.includes(entry)) continue;
    const memberPath = join(rootPath, entry);
    let isDir;
    try {
      isDir = statSync(memberPath).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    if (!existsSync(join(memberPath, 'package.json'))) continue;
    // 슬러그는 평평하게 — 이미 잡힌 이름과 겹치면 -package 접미로 가른다.
    const flatName = claimed.has(`elements/${entry}`) ? `${entry}-package` : entry;
    const slug = `elements/${flatName}`;
    claimed.add(slug);
    out.push({
      slug,
      title: humanize(entry),
      ...(domainForName(entry) ? { domain: domainForName(entry) } : {}),
      path: entry,
      evidence: { source: entry },
    });
  }
  return out;
}

function detectRootPythonPackages(
  rootPath,
  { ignore, domainForName, existingElements, skipped },
) {
  const out = [];
  const claimed = new Set(existingElements.map((element) => element.slug));
  let entries;
  try {
    entries = readdirSync(rootPath).sort();
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (
      ignore.has(entry) ||
      PYTHON_NON_PRODUCT_PACKAGES.has(entry.toLowerCase()) ||
      entry.startsWith('.') ||
      SOURCE_FOLDERS.includes(entry) ||
      WORKSPACE_FOLDERS.includes(entry)
    ) {
      continue;
    }
    const packagePath = join(rootPath, entry);
    try {
      if (!statSync(packagePath).isDirectory()) continue;
    } catch {
      continue;
    }
    const packageEntry = join(packagePath, '__init__.py');
    if (!existsSync(packageEntry)) continue;
    if (
      !pathResolvesInsideRoot(rootPath, packagePath) ||
      !pathResolvesInsideRoot(rootPath, packageEntry)
    ) {
      pushSkippedOnce(skipped, {
        path: packagePath,
        reason: 'python-package-skip: path resolves outside repository root',
      });
      continue;
    }
    const flatName = slugify(entry.replace(/_/g, '-'));
    if (!flatName || claimed.has(`elements/${flatName}`)) continue;
    const slug = `elements/${flatName}`;
    claimed.add(slug);
    out.push({
      slug,
      title: humanize(entry),
      ...(domainForName(entry) ? { domain: domainForName(entry) } : {}),
      path: entry,
      evidence: { source: entry },
    });
  }
  return out;
}

function detectPythonImportBoundaryElements(
  rootPath,
  {
    ignore,
    domainForName,
    existingElements,
    rootPythonPackages,
    sourcePythonPackages = [],
    imports,
    skipped,
  },
) {
  const pythonPackages = [...rootPythonPackages, ...sourcePythonPackages];
  if (pythonPackages.length === 0 || !imports) return [];

  const scores = new Map();
  const neighbors = new Map();
  for (const edge of imports.moduleEdges) {
    if (!edge.from.startsWith('elements/') || !edge.to.startsWith('elements/')) {
      continue;
    }
    for (const [slug, neighbor] of [
      [edge.from, edge.to],
      [edge.to, edge.from],
    ]) {
      scores.set(slug, (scores.get(slug) ?? 0) + edge.count);
      const adjacent = neighbors.get(slug) ?? new Set();
      adjacent.add(neighbor);
      neighbors.set(slug, adjacent);
    }
  }

  const pathCandidates = new Map();
  for (const packageElement of pythonPackages) {
    const packagePath = join(rootPath, packageElement.path);
    let entries;
    try {
      entries = readdirSync(packagePath).sort();
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry === '__init__.py' || ignore.has(entry) || entry.startsWith('.')) {
        continue;
      }
      const path = join(packagePath, entry);
      let isModuleBoundary = false;
      try {
        if (!pathResolvesInsideRoot(rootPath, path)) continue;
        if (statSync(path).isFile() && entry.endsWith('.py')) {
          isModuleBoundary = true;
        } else if (
          statSync(path).isDirectory() &&
          existsSync(join(path, '__init__.py')) &&
          pathResolvesInsideRoot(rootPath, join(path, '__init__.py'))
        ) {
          isModuleBoundary = true;
        }
      } catch {
        continue;
      }
      if (!isModuleBoundary) continue;
      const name = entry.endsWith('.py') ? entry.slice(0, -3) : entry;
      const flatName = slugify(name.replace(/_/g, '-'));
      if (!flatName) continue;
      const slug = `elements/${flatName}`;
      const candidates = pathCandidates.get(slug) ?? [];
      candidates.push(relative(rootPath, path));
      pathCandidates.set(slug, candidates);
    }
  }

  const claimed = new Set(existingElements.map((element) => element.slug));
  const riskPathCandidates = new Map();
  for (const source of new Set(
    imports.edges.flatMap((edge) => [edge.from, edge.to]),
  )) {
    if (!source.endsWith('.py') || source.endsWith('/__init__.py')) continue;
    if (!pythonPackages.some((row) => source.startsWith(`${row.path}/`))) {
      continue;
    }
    const relativeParts = source.split('/');
    if (relativeParts.length < 3) continue;
    const fileName = relativeParts.at(-1).slice(0, -3);
    const priority = pythonRiskEndpointPriority(fileName);
    if (priority === 0) continue;
    const flatName = slugify(
      fileName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/_/g, '-'),
    );
    if (!flatName) continue;
    const slug = `elements/${flatName}`;
    const paths = riskPathCandidates.get(slug) ?? [];
    paths.push({ path: source, priority });
    riskPathCandidates.set(slug, paths);
  }
  const ranked = [...scores.keys()]
    .filter((slug) => !claimed.has(slug))
    .sort((a, b) => {
      const degreeDelta = (neighbors.get(b)?.size ?? 0) - (neighbors.get(a)?.size ?? 0);
      if (degreeDelta !== 0) return degreeDelta;
      const weightDelta = (scores.get(b) ?? 0) - (scores.get(a) ?? 0);
      return weightDelta !== 0 ? weightDelta : a.localeCompare(b);
    });
  const admissible = ranked.filter((slug) => {
    const paths = pathCandidates.get(slug) ?? [];
    if (paths.length === 1) return true;
    if (paths.length > 1) {
      pushSkippedOnce(skipped, {
        path: paths.join(', '),
        reason: `python-import-element-skip: ambiguous module slug ${slug}`,
      });
    }
    return false;
  });
  const riskAdmissible = [...riskPathCandidates]
    .filter(([slug, paths]) => {
      if (claimed.has(slug)) return false;
      const directPaths = pathCandidates.get(slug) ?? [];
      if (paths.length === 1 && directPaths.length === 0) return true;
      pushSkippedOnce(skipped, {
        path: [...directPaths, ...paths.map((row) => row.path)].join(', '),
        reason: `python-import-element-skip: ambiguous module slug ${slug}`,
      });
      return false;
    })
    .map(([slug, [candidate]]) => ({ slug, ...candidate }))
    .sort((a, b) => b.priority - a.priority || a.slug.localeCompare(b.slug));
  const selectedRisk = riskAdmissible.slice(0, PYTHON_IMPORT_RISK_ELEMENT_LIMIT);
  const selectedRiskSlugs = new Set(selectedRisk.map((row) => row.slug));
  const selected = [
    ...selectedRisk,
    ...admissible
      .filter((slug) => !selectedRiskSlugs.has(slug))
      .slice(0, PYTHON_IMPORT_ELEMENT_LIMIT - selectedRisk.length)
      .map((slug) => ({ slug, path: pathCandidates.get(slug)[0] })),
  ];
  const candidateCount = new Set([
    ...riskAdmissible.map((row) => row.slug),
    ...admissible,
  ]).size;
  const omitted = Math.max(0, candidateCount - selected.length);
  if (omitted > 0) {
    pushSkippedOnce(skipped, {
      path: rootPath,
      reason: `python-import-element-limit: omitted ${omitted} lower-ranked boundaries`,
    });
  }
  return selected
    .map(({ slug, path }) => {
      const name = slug.slice('elements/'.length);
      claimed.add(slug);
      return {
        slug,
        title: humanize(name),
        ...(domainForName(name) ? { domain: domainForName(name) } : {}),
        path,
        evidence: { source: path },
      };
    });
}

function pythonRiskEndpointPriority(fileName) {
  const normalized = fileName.replace(/[_-]/g, '').toLowerCase();
  if (normalized.includes('security')) return 100;
  if (normalized.includes('authorization') || normalized.includes('authentication')) {
    return 90;
  }
  if (normalized.includes('permission') || normalized.includes('credential')) return 80;
  if (normalized.includes('policy') || normalized.includes('encryption')) return 70;
  return 0;
}

function analyzeImportsForElementEvidence(
  rootPath,
  { extraIgnore, skipped, workspaceDiscovery, admittedWorkspacePackages = null },
) {
  try {
    if (
      admittedWorkspacePackages &&
      workspaceDiscovery.packages.length > admittedWorkspacePackages.length
    ) {
      pushSkippedOnce(skipped, {
        path: '.',
        reason:
          `workspace-import-evidence-limit: omitted ${workspaceDiscovery.packages.length - admittedWorkspacePackages.length} ` +
          'declared package roots to match analyzer elements',
      });
    }
    const options = {
      ignore: extraIgnore,
      ...(admittedWorkspacePackages
        ? { workspacePackages: admittedWorkspacePackages }
        : {}),
    };
    return inferImports(rootPath, options);
  } catch (error) {
    pushSkippedOnce(skipped, {
      path: rootPath,
      reason: `import-evidence-skip: ${error.message}`,
    });
    return null;
  }
}

function detectWorkspaceElements(
  rootPath,
  { ignore, domainForName, skipped, workspaceDiscovery, existingElements = [] },
) {
  if (workspaceDiscovery?.hasDeclaration) {
    const elements = [];
    const admittedWorkspacePackages = [];
    const claimed = new Set(existingElements.map((element) => element.slug));
    const admitted = workspaceDiscovery.packages.slice(0, WORKSPACE_ELEMENT_LIMIT);
    const omitted = Math.max(0, workspaceDiscovery.packages.length - admitted.length);
    if (omitted > 0) {
      pushSkippedOnce(skipped, {
        path: '.',
        reason: `workspace-element-limit: omitted ${omitted} declared package elements`,
      });
    }
    for (const workspacePackage of admitted) {
      const slug = `elements/${workspacePackage.slug}`;
      if (claimed.has(slug)) {
        pushSkippedOnce(skipped, {
          path: workspacePackage.path,
          reason: `workspace-element-skip: duplicate implementation slug ${slug}`,
        });
        continue;
      }
      claimed.add(slug);
      elements.push({
        slug,
        title: humanize(workspacePackage.slug),
        path: workspacePackage.path,
        evidence: { source: workspacePackage.path },
      });
      admittedWorkspacePackages.push(workspacePackage);
    }
    return { elements, packages: admittedWorkspacePackages };
  }
  const elements = [];
  for (const folder of WORKSPACE_FOLDERS) {
    const workspaceRoot = join(rootPath, folder);
    if (ignore.has(folder)) {
      if (existsSync(workspaceRoot)) {
        skipped.push({ path: workspaceRoot, reason: 'dotfile/ignore' });
      }
      continue;
    }
    if (!existsSync(workspaceRoot) || !statSync(workspaceRoot).isDirectory()) {
      continue;
    }
    for (const entry of readdirSync(workspaceRoot).sort()) {
      const memberPath = join(workspaceRoot, entry);
      if (ignore.has(entry) || entry.startsWith('.')) {
        skipped.push({ path: memberPath, reason: 'dotfile/ignore' });
        continue;
      }
      if (!statSync(memberPath).isDirectory()) continue;
      if (!existsSync(join(memberPath, 'package.json'))) continue;
      const source = relative(rootPath, memberPath);
      // 슬러그는 평평하게 — workspace 멤버 이름이 곧 role 이름. apps/foo 와
      // packages/foo 가 겹치면 폴더 접두로 갈라 tail 충돌을 피한다.
      const flatName = elements.some((el) => el.slug === `elements/${entry}`)
        ? `${folder}-${entry}`
        : entry;
      elements.push({
        slug: `elements/${flatName}`,
        title: humanize(entry),
        ...(domainForName(entry) ? { domain: domainForName(entry) } : {}),
        path: source,
        evidence: { source },
      });
    }
  }
  return { elements, packages: null };
}

function humanize(s) {
  return s
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function tailSlug(slug) {
  return String(slug).split('/').filter(Boolean).at(-1) ?? '';
}

function matchDomainSlug(name, domains) {
  const candidateTokens = semanticTokens(name);
  if (candidateTokens.size === 0) return domains.length === 1 ? domains[0].slug : null;
  let best = null;
  let bestScore = 0;
  let tied = false;
  for (const domain of domains) {
    const domainTokens = semanticTokens(tailSlug(domain.slug));
    let overlap = 0;
    for (const token of candidateTokens) {
      if (domainTokens.has(token)) overlap += 1;
    }
    if (overlap > bestScore) {
      best = domain.slug;
      bestScore = overlap;
      tied = false;
    } else if (overlap > 0 && overlap === bestScore) {
      tied = true;
    }
  }
  if (bestScore > 0 && !tied) return best;
  // A sole README heading is still not role evidence. Unmatched implementation
  // candidates remain under the project instead of being absorbed into the
  // only available domain by elimination.
  return null;
}

function semanticTokens(value) {
  return new Set(
    slugify(String(value))
      .split('-')
      .filter(Boolean)
      .map((token) => (token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token)),
  );
}

function pathSemanticTokens(value) {
  return semanticTokens(String(value).replace(/[\\/._]+/g, '-'));
}

function validateRootPath(rootPath) {
  if (typeof rootPath !== 'string' || !rootPath.trim()) {
    throw new Error('rootPath must be a non-empty string.');
  }
  if (rootPath.trim() !== rootPath) {
    throw new Error('rootPath must not have leading or trailing whitespace.');
  }
  if (rootPath.includes('\0')) {
    throw new Error('rootPath must not contain a null byte.');
  }
}

function optionalNonNegativeInteger(value, name, options = {}) {
  if (value === undefined) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new Error(`${name} must be <= ${options.max}.`);
  }
  return value;
}

function optionalStringArray(value, name, options = {}) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${name} must be an array of strings.`);
  }
  if (options.max !== undefined && value.length > options.max) {
    throw new Error(`${name} must contain at most ${options.max} items.`);
  }
  return value.map((item) => {
    const trimmed = item.trim();
    if (!trimmed) {
      throw new Error(`${name} items must be non-empty strings.`);
    }
    if (trimmed !== item) {
      throw new Error(`${name} items must not have leading or trailing whitespace.`);
    }
    if (trimmed.includes('\0')) {
      throw new Error(`${name} items must not contain a null byte.`);
    }
    return trimmed;
  });
}
