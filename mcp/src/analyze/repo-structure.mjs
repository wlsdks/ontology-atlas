// analyze_repo_structure: the deterministic, side-effect-free scan an agent runs
// when asked to analyse a codebase. It only proposes candidates; the vault changes
// only through a reviewed, explicit add, so frontmatter stays the single truth.

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

/** Walks a codebase root and analyses its README into ontology node candidates. */
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

  // `features/` alone is enough for fsd. Detect only on folders the FSD path scans:
  // a verdict that cannot change what gets read must not be made, or a lone
  // `src/shared/` yields zero capabilities with no explanation.
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
    const fsdRoots = framework === 'fsd' ? FSD_SCAN_ROOTS : null;

    if (fsdRoots) {
      // Slugs are flat role names and location goes in `path` (docs/DECISIONS.md);
      // basenames that collide across layers get a singular layer suffix.
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
          // Some large repositories keep implementation under internal/ instead of src/ or
          // lib/. Its children are implementation evidence only, never a business
          // capability without trusted narrative evidence.
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

  // Native C projects expose source files and build manifests directly. Keep them as
  // implementation evidence; the meaning gate still needs semantic witnesses before
  // they become business capabilities.
  elements.push(...nativeImplementationEvidence.elements);

  // A repository may have both a primary lib/ or src/ root and a separately owned
  // internal/ tree; admit bounded internal evidence as an extra witness instead of
  // dropping it.
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

  // Element paths are implementation observations: even an exact token match with a
  // README domain does not prove the role, so raw elements stay project-scoped until
  // a reviewed relation carries role evidence.
  for (const element of elements) delete element.domain;

  // One containment spine: README-backed domains under the project, matched
  // capabilities under their domain, raw elements directly under the project rather
  // than a role invented from a name match.
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
    ...(options.sourceEvidence === undefined ? {} : { sourceEvidence: options.sourceEvidence }),
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
      sourceEvidence: options.sourceEvidence,
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
