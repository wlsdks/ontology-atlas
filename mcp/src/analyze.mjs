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
//     project?: { slug, title },
//     domains: [{ slug, title, evidence: { source, line? } }],
//     capabilities: [{ slug, title, evidence: { source } }],
//     elements: [{ slug, title, evidence: { source } }],
//     meaningGate: {
//       policy: 'business-first',
//       sourceStructureRole: 'implementation-evidence',
//       businessOntology: { domains: [slug], capabilities: [slug], evidence: [{ slug, kind, source }] },
//       proposedBusinessOntology: {
//         domains: [{ slug, reason, evidence }],
//         capabilities: [{ slug, reason, evidence }],
//       },
//       implementationEvidence: { elements: [slug], reviewRequiredCapabilities: [{ slug, reason, evidence }] },
//       reviewQuestions: [string],
//     },
//     extractionContract: {
//       standard, status, assertionPolicy, competencyQuestions, qualityGates,
//     },
//     semanticEvidence: [{ source, role, title, headings, excerpt, trust, riskFlags }],
//     suggestedRelations: [{ from, to, type }],
//     skipped: [{ path, reason }],
//   }

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import { validateMeaningProposalAgainstAnalysis } from './meaning-evaluation.mjs';

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

const SOURCE_FOLDERS = ['src', 'lib', 'app'];
const WORKSPACE_FOLDERS = ['apps', 'packages'];
const STARTER_ONTOLOGY_SLUGS = new Set([
  'domains/example-domain',
  'capabilities/example-capability',
]);
const SEMANTIC_EVIDENCE_SEEDS = [
  ['README.md', 'mission'],
  ['docs/FEATURES.md', 'product-capabilities'],
  ['docs/SYSTEM-MAP.md', 'architecture'],
  ['AGENTS.md', 'agent-guidance'],
];
const SEMANTIC_EVIDENCE_MAX_EXCERPT = 1200;
const SEMANTIC_EVIDENCE_MAX_HEADINGS = 8;
const SEMANTIC_EVIDENCE_MAX_DOCUMENTS = 6;
const SEMANTIC_DISCOVERY_MAX_FILES = 200;
const SEMANTIC_DISCOVERY_SKIP_DIRS = new Set([
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
 * @param {{ maxDepth?: number, ignore?: string[] }} options
 * @returns analysis result
 */
export function analyzeRepoStructure(rootPath, options = {}) {
  validateRootPath(rootPath);
  if (!existsSync(rootPath) || !statSync(rootPath).isDirectory()) {
    throw new Error(`rootPath not a directory: ${rootPath}`);
  }
  const maxDepth = optionalNonNegativeInteger(options.maxDepth, 'maxDepth', { max: 10 }) ?? 2;
  const ignore = new Set([
    ...DEFAULT_IGNORE,
    ...optionalStringArray(options.ignore, 'ignore', { max: IGNORE_ARRAY_MAX_ITEMS }),
  ]);

  const skipped = [];
  const project = detectProject(rootPath, skipped);
  const { domains, readmePath } = detectDomainsFromReadme(rootPath);
  const existingOntologyEvidence = detectExistingOntologyEvidence(rootPath, skipped);
  const semanticEvidence = collectSemanticEvidence(rootPath, skipped);
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
    // FSD pattern — features/ 가 capability 의 main 영역
    const fsdRoots = framework === 'fsd' ? FSD_SCAN_ROOTS : null;

    if (fsdRoots) {
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
          const isCapabilityish = r === 'features';
          const slug = isCapabilityish
            ? `capabilities/${sub}`
            : `elements/${relative(rootPath, subPath)}`;
          const evidence = {
            source: relative(rootPath, subPath),
          };
          if (isCapabilityish) {
            capabilities.push({
              slug,
              title: humanize(sub),
              ...(domainForName(sub)
                ? { domain: domainForName(sub) }
                : {}),
              evidence,
            });
          } else {
            elements.push({
              slug,
              title: humanize(sub),
              ...(domainForName(sub) ? { domain: domainForName(sub) } : {}),
              evidence,
            });
          }
        }
      }
    } else {
      // generic — src/ 의 깊이 1 폴더 만
      for (const sub of readdirSync(srcDir)) {
        if (ignore.has(sub) || sub.startsWith('.')) {
          skipped.push({ path: join(srcDir, sub), reason: 'dotfile/ignore' });
          continue;
        }
        const subPath = join(srcDir, sub);
        if (!statSync(subPath).isDirectory()) continue;
        capabilities.push({
          slug: `capabilities/${sub}`,
          title: humanize(sub),
          ...(domainForName(sub)
            ? { domain: domainForName(sub) }
            : {}),
          evidence: { source: relative(rootPath, subPath) },
        });
        // index 파일이 있으면 element 추가
        for (const entry of ELEMENT_ENTRY_FILES) {
          const ep = join(subPath, entry);
          if (existsSync(ep)) {
            elements.push({
              slug: `elements/${relative(rootPath, ep)}`,
              title: `${humanize(sub)} entry`,
              ...(domainForName(sub) ? { domain: domainForName(sub) } : {}),
              evidence: { source: relative(rootPath, ep) },
            });
            break;
          }
        }
      }
    }
  }

  elements.push(
    ...detectWorkspaceElements(rootPath, {
      ignore,
      domainForName,
      skipped,
    }),
  );

  // Suggested relations form one coherent containment spine. A README-backed
  // domain sits under the project; matched capabilities/elements sit under
  // that domain. Evidence without a defensible domain match remains directly
  // under the project instead of inventing business meaning.
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
      elements,
      existingOntologyEvidence,
    }),
    extractionContract: buildExtractionContract({
      project,
      domains,
      capabilities,
      elements,
      existingOntologyEvidence,
      suggestedRelations,
      semanticEvidence,
    }),
    semanticEvidence,
    suggestedRelations,
    skipped,
  };
  return {
    ...result,
    proposalValidation: validateMeaningProposalAgainstAnalysis(
      result,
      options.proposal,
    ),
  };
}

function buildMeaningGate({ domains, capabilities, elements, existingOntologyEvidence }) {
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
  const reviewRequiredDomains = domains
    .filter((domain) => !existingBySlug.has(domain.slug))
    .map((domain) => ({
      slug: domain.slug,
      reason: 'README heading is a concept clue, not proof of a shared business boundary',
      evidence: domain.evidence,
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
          source: capabilities.find((candidate) => candidate.slug === capability)?.evidence.source ?? capability,
        },
      ];
    }),
  ]);

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
      capabilities: reviewRequiredCapabilities,
    },
    implementationEvidence: {
      elements: elements.map((element) => element.slug),
      reviewRequiredCapabilities,
    },
    reviewQuestions: [
      'What business/product outcome, user workflow, ownership boundary, or decision does this node explain?',
      'Which source path, README heading, import edge, or file-level element proves the implementation evidence?',
      'Should this code structure stay evidence-only instead of becoming a domain or capability node?',
    ],
  };
}

function buildExtractionContract({
  project,
  domains,
  capabilities,
  elements,
  existingOntologyEvidence,
  suggestedRelations,
  semanticEvidence,
}) {
  const persistedBusinessConcepts = existingOntologyEvidence.filter(
    (evidence) => evidence.kind === 'domain' || evidence.kind === 'capability',
  ).length;
  const proposedBusinessConcepts = domains.length + capabilities.length;
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
    competencyQuestions: [
      'What product/system outcome and user problem define the ontology scope?',
      'Which stable business responsibilities or decision boundaries form its domains?',
      'Which observable abilities realize those outcomes inside each domain?',
      'Which source artifacts provide implementation evidence for each ability?',
      'Which typed dependencies explain change impact across the model?',
    ],
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
    ],
    nextStep:
      'Use semanticEvidence to propose defined domains and capabilities; cite a source for every claim, test the result against the competency questions, and keep unproven meanings in review.',
  };
}

function collectSemanticEvidence(rootPath, skipped = []) {
  const candidates = discoverSemanticEvidenceCandidates(rootPath);
  const rows = [];
  for (const { source, role, pathScore } of candidates) {
    const path = join(rootPath, source);
    if (!existsSync(path)) continue;
    try {
      const text = readFileSync(path, 'utf-8');
      const extracted = extractSemanticDocument(text);
      if (!extracted.excerpt && extracted.headings.length === 0) continue;
      rows.push({
        source,
        role,
        title: extracted.title || humanize(basename(source).replace(/\.md$/i, '')),
        headings: extracted.headings,
        excerpt: extracted.excerpt,
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

function scanSemanticEvidenceRisks({ headings = [], excerpt = '' }) {
  const text = `${headings.join('\n')}\n${excerpt}`;
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

function discoverSemanticEvidenceCandidates(rootPath) {
  const bySource = new Map();
  for (const [source, role] of SEMANTIC_EVIDENCE_SEEDS) {
    if (existsSync(join(rootPath, source))) {
      bySource.set(source, { source, role, pathScore: 100 });
    }
  }
  const docsRoot = join(rootPath, 'docs');
  if (!existsSync(docsRoot) || !statSync(docsRoot).isDirectory()) {
    return [...bySource.values()];
  }
  let filesSeen = 0;
  function visit(dir) {
    if (filesSeen >= SEMANTIC_DISCOVERY_MAX_FILES) return;
    for (const entry of readdirSync(dir).sort()) {
      if (filesSeen >= SEMANTIC_DISCOVERY_MAX_FILES) return;
      const path = join(dir, entry);
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
  visit(docsRoot);
  return [...bySource.values()];
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
  let frontmatter = lines[0]?.trim() === '---';
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const line = rawLine.trim();
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
    const markdownHeading = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    const htmlHeading = line.match(/<h([1-3])\b[^>]*>(.*?)<\/h\1>/i);
    if (markdownHeading || htmlHeading) {
      const level = markdownHeading
        ? markdownHeading[1].length
        : Number(htmlHeading[1]);
      const value = (markdownHeading ? markdownHeading[2] : htmlHeading[2])
        .replace(/<[^>]+>/g, '')
        .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
        .trim();
      if (!value) continue;
      if (level === 1 && !title) title = value;
      if (headings.length < SEMANTIC_EVIDENCE_MAX_HEADINGS) headings.push(value);
      continue;
    }
    if (
      !line ||
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

function detectProject(rootPath, skipped = []) {
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
  const readmeTitle = detectReadmeH1(rootPath);
  if (readmeTitle) return { slug: basename(rootPath), title: readmeTitle };
  return { slug: basename(rootPath), title: humanize(basename(rootPath)) };
}

function detectReadmeH1(rootPath) {
  for (const cand of ['README.md', 'readme.md', 'README']) {
    const path = join(rootPath, cand);
    if (!existsSync(path)) continue;
    try {
      const lines = readFileSync(path, 'utf-8').split(/\r?\n/);
      let fence = null;
      for (const line of lines) {
        const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
        if (fenceMatch) {
          const marker = fenceMatch[1][0];
          fence = fence === marker ? null : fence ?? marker;
          continue;
        }
        if (fence) continue;
        const markdownHeading = line.match(/^#\s+(.+?)\s*$/);
        if (markdownHeading) return markdownHeading[1].trim();
        const htmlHeading = line.match(/<h1\b[^>]*>(.*?)<\/h1>/i);
        if (htmlHeading) {
          const title = htmlHeading[1].replace(/<[^>]+>/g, '').trim();
          if (title) return title;
        }
      }
    } catch {
      // A missing/unreadable README is not fatal to repository analysis.
    }
  }
  return null;
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
          /^(usage|installation|getting started|quick start|license|contributing|requirements|features|setup|status|tech stack|architecture|folder map|routes|tests?|documentation|overview|development|deployment|changelog|roadmap|faq|demo|examples?|guides?|table of contents|toc|acknowledge?ments?)$/i.test(
            normalizedTitle,
          ) ||
          // operational / aggregate sections that describe the README, not a
          // product ownership boundary
          /\bin numbers$|^install\b|^core capabilities$|^providers? and (?:local|offline) (?:path|setup|mode)$|^verification$|^community(?: and support)?$/i.test(
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

function detectWorkspaceElements(rootPath, { ignore, domainForName, skipped }) {
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
      elements.push({
        slug: `elements/${source}`,
        title: humanize(entry),
        ...(domainForName(entry) ? { domain: domainForName(entry) } : {}),
        evidence: { source },
      });
    }
  }
  return elements;
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
  // With exactly one README-backed business domain there is no competing
  // meaning to invent: assigning unmatched implementation candidates to that
  // sole domain creates a valid containment spine. Multiple domains remain
  // unassigned unless token evidence disambiguates them.
  return domains.length === 1 ? domains[0].slug : null;
}

function semanticTokens(value) {
  return new Set(
    slugify(String(value))
      .split('-')
      .filter(Boolean)
      .map((token) => (token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token)),
  );
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
