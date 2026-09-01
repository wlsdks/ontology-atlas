// analyze_repo_structure — the *deterministic* tool an agent (Claude Code, Codex,
// Cursor) calls after the user says "analyse this codebase". Zero side effects: it
// never changes the vault, it only proposes candidates for the agent to show the
// user, who then calls `add_concept` explicitly.
//
// That is what preserves the single source of truth: results are returned, never
// written to frontmatter, so the only way into the vault is user review plus an
// explicit add — and drift stays at zero.
//
// Detection patterns are generic, covering roughly 80% of codebases; finer
// framework-specific detection belongs to the follow-up tools (infer_imports,
// extract_domains_from_readme):
//   - package.json `name` → project slug + title
//   - README.md first H1 → project title (fallback when package.json is absent)
//   - README.md H2 sections → domain candidates
//   - depth-1 folders under src/ (or root) → capability candidates (dotfiles and
//     the usual ignored folders excluded)
//   - the main file of each capability folder (index.ts/js/mjs/tsx) → element candidate
//
// Result shape:
//   {
//     rootPath, framework: 'fsd' | 'next' | 'generic',
//     project?: { slug, title, definition, evidence, includes, excludes, confidence, uncertainty },
//     domains: [{ slug, title, evidence: { source, line? } }],
//     capabilities: [{ slug, title, evidence: { source } }],
//     elements: [{ slug, title, path, evidence: { source } }],
//       — the slug is a flat role name; location lives only in path/evidence (2026-08-01 decision)
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
//     semanticEvidence: [{ source, role, title, headings, excerpt, trust,
//       riskFlags, reviewRequiredEvidence? }],
//     suggestedRelations: [{ from, to, type }],
//     skipped: [{ path, reason }],
//   }

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import { validateMeaningProposalAgainstAnalysis } from '../meaning-evaluation.mjs';
import { evaluateConstructionLifecycle } from '../construction-lifecycle.mjs';
import { discoverDeclaredWorkspacePackages } from '../infer-imports.mjs';
import { collectRustFeatureConfigurationEvidence } from '../rust-feature-evidence.mjs';
import {
  DEFAULT_IGNORE,
  ELEMENT_ENTRY_FILES,
  FSD_SCAN_ROOTS,
  IGNORE_ARRAY_MAX_ITEMS,
  IMPLEMENTATION_ONLY_SOURCE_FOLDERS,
  IMPLEMENTATION_SOURCE_ELEMENT_LIMIT,
  LIBRARY_SOURCE_ELEMENT_LIMIT,
  SOURCE_FOLDERS,
  SOURCE_LAYOUT_CODE_FILE,
  SOURCE_LAYOUT_COORDINATION_ELEMENT_LIMIT,
  SOURCE_LAYOUT_COORDINATION_ROLE,
} from './constants.mjs';
import { humanize, matchDomainSlug, slugify } from './text.mjs';
import {
  optionalNonNegativeInteger,
  optionalStringArray,
  validateRootPath,
} from './scan-guards.mjs';
import { collectSemanticEvidence } from './semantic-evidence.mjs';
import {
  detectDomainsFromReadme,
  detectExistingOntologyEvidence,
  detectProject,
} from './project-detection.mjs';
import {
  discoverAutotoolsImplementationEvidence,
  discoverRustImplementationEvidence,
  materializeRustImplementationElements,
} from './native-evidence.mjs';
import {
  analyzeImportsForElementEvidence,
  buildSuggestedDependencyRelations,
  detectPythonImportBoundaryElements,
  detectRootPackages,
  detectRootPythonPackages,
  detectWorkspaceElements,
  discoverSourcePythonPackagePaths,
  mapGoPackageDependencyRelations,
  mapGoPackageImportReceipts,
  materializeGoPackageElements,
  materializeImplementationOnlySourceElements,
  materializePythonPackageElements,
} from './source-elements.mjs';
import {
  buildExtractionContract,
  buildMeaningGate,
  deriveBusinessCapabilityCandidates,
  enrichProjectCandidate,
} from './meaning-gate.mjs';

/**
 * Walks a codebase root and analyses its README into a list of ontology node candidates.
 *
 * @param {string} rootPath — the directory to analyse (usually cwd, or user-provided).
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

  // The first existing entry in SOURCE_FOLDERS becomes the src dir
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

  // Framework heuristic — `features/` alone is enough for fsd (lean FSD, as in
  // ontology-atlas itself).
  //
  // **Detect only on folders that can be scanned** (fix measured while dogfooding,
  // 2026-07-28). The old marker list included `shared`, a name common to any
  // TS/Node project. A lone `src/shared/` was enough to detect fsd, and the FSD
  // path below scans only `features/entities/widgets/views` — so a repository with
  // none of those silently returned **0 capabilities and 0 elements**, with
  // nothing anywhere in the response saying "zero because of the framework
  // verdict". `inferImports` in the same call extracted the feature folders of
  // that same repository correctly, so two tools were saying different things
  // about one repository.
  //
  // The rule: **if a verdict cannot change what gets read, do not make it.** When
  // the only consequence of calling something fsd is "there is nothing to scan",
  // that name does nothing but suppress.
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
    // FSD pattern — features/ is the main area for capabilities
    const fsdRoots = framework === 'fsd' ? FSD_SCAN_ROOTS : null;

    if (fsdRoots) {
      // A slug is a flat identifier (2026-08-01 decision — docs/DECISIONS.md).
      // This used to propose `elements/${relative(rootPath, subPath)}`, and an
      // agent with no spec context landed all 43 path-shaped slugs in the vault
      // **verbatim** — this generator was the primary cause of the regenerated
      // vault's defects. Now the role name goes in the slug and the location in
      // `path`; when basenames collide across layers (`entities/docs-vault` vs
      // `views/docs-vault`) they are split deterministically by a singular layer
      // suffix, removing tail collisions at generation time.
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
      // generic — depth-1 folders under src/ only
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
        // An index file adds an element — role name in the slug, location in path.
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
  const goPackageElementAdmission = materializeGoPackageElements(
    importAnalysis?.packageImportEvidence,
    { existingElements: elements, skipped },
  );
  elements.push(...goPackageElementAdmission.elements);
  const goPackageBoundaryElements = elements.filter((element) =>
    goPackageElementAdmission.packagePaths.has(element.path),
  );
  const observedGoDependencyRelations = mapGoPackageDependencyRelations(
    importAnalysis?.packageImportEvidence,
    goPackageBoundaryElements,
  );
  const observedDependencyRelations = [
    ...(importAnalysis?.moduleEdges ?? []),
    ...observedGoDependencyRelations,
  ];
  const productGoPackageElementSlugs = new Set(
    observedGoDependencyRelations
      .filter((relation) => relation.productValueCount > 0)
      .flatMap((relation) => [relation.from, relation.to]),
  );
  const nonProductGoPackageElementSlugs = new Set(
    goPackageBoundaryElements
      .map((element) => element.slug)
      .filter((slug) => !productGoPackageElementSlugs.has(slug)),
  );
  const observedImportEdges = [
    ...(importAnalysis?.edges ?? []),
    ...mapGoPackageImportReceipts(importAnalysis?.packageImportEvidence),
  ];

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
    ...buildSuggestedDependencyRelations(observedDependencyRelations, [
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
      observedDependencyRelations: observedDependencyRelations.map(
        (relation) => ({ ...relation, type: 'depends_on' }),
      ),
      nonProductGoPackageElementSlugs,
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
      observedImportEdges,
      observedImportRelations: observedDependencyRelations,
      importBoundaryElements: [
        ...pythonImportBoundaryElements,
        ...goPackageBoundaryElements,
      ],
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
