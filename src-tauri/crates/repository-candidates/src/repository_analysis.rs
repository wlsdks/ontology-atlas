//! `analyze_repo_structure`'s deterministic, side-effect-free scan: the candidates a repository's
//! layout, documents and imports propose. It only proposes; the vault changes only through a
//! reviewed, explicit write, so frontmatter stays the single truth.

use std::collections::BTreeSet;

use serde::Serialize;
use source_scan::{discover_declared_workspace, scan_imports, ImportScan, ImportScanOptions};

use crate::candidate_nodes::{
    CapabilityCandidate, ElementCandidate, SourceEvidence, SuggestedRelation,
};
use crate::candidate_text::{humanize, match_domain_slug, slugify};
use crate::meaning_gate::{
    build_extraction_contract, build_meaning_gate, ContractInput, derive_business_capability_candidates,
    enrich_project, find_domain_responsibility_witness, DependencyRelation, EnrichedProject,
    ExtractionContract, GateInput, MeaningGate,
};
use crate::native_evidence::{
    discover_autotools_evidence, discover_rust_implementation_evidence,
    materialize_rust_implementation_elements,
};
use crate::project_detection::{
    detect_domains_from_readme, detect_existing_ontology, detect_project, DomainCandidate,
};
use crate::repository_files::{join, Probe, RepositoryFiles, SkipLog, Skipped};
use crate::rust_feature_configuration::{not_present, ConfigurationEvidence};
use crate::scan_limits::{
    IMPLEMENTATION_SOURCE_ELEMENT_LIMIT, LIBRARY_SOURCE_ELEMENT_LIMIT,
    SOURCE_LAYOUT_COORDINATION_ELEMENT_LIMIT,
};
use crate::scan_tables::{
    BUSINESS_CAPABILITY_CLUES, ELEMENT_ENTRY_FILES, FSD_SCAN_ROOTS,
    IMPLEMENTATION_ONLY_SOURCE_FOLDERS, SOURCE_FOLDERS, SOURCE_LAYOUT_CODE_FILE,
    SOURCE_LAYOUT_COORDINATION_ROLE, TEST_OR_SPEC_SCRIPT,
};
use crate::semantic_evidence::{collect_semantic_evidence, SemanticEvidence};
use crate::source_elements::{
    build_suggested_dependency_relations, detect_python_import_boundary_elements,
    detect_root_packages, detect_root_python_packages, detect_workspace_elements,
    discover_source_python_package_paths, go_import_receipts, map_go_dependency_relations,
    materialize_go_package_elements, materialize_implementation_only_source_elements,
    materialize_python_package_elements, module_edge_relations, ObservedRelation,
};

/// What the caller chose for one analysis.
pub struct AnalysisRequest<'a> {
    /// Folder names to skip besides the defaults.
    pub ignore: &'a [String],
}

/// The structural analysis of one repository.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryAnalysis {
    pub root_path: String,
    pub framework: &'static str,
    pub project: EnrichedProject,
    pub domains: Vec<DomainCandidate>,
    pub capabilities: Vec<CapabilityCandidate>,
    pub elements: Vec<ElementCandidate>,
    pub meaning_gate: MeaningGate,
    pub extraction_contract: ExtractionContract,
    pub semantic_evidence: Vec<SemanticEvidence>,
    pub configuration_evidence: ConfigurationEvidence,
    pub suggested_relations: Vec<SuggestedRelation>,
    pub skipped: Vec<Skipped>,
}

/// The import evidence a proposal may cite, kept beside the analysis.
#[derive(Debug, Default)]
pub struct ObservedImports {
    /// The `(from, to)` of every import the scan observed.
    pub edges: Vec<(String, String)>,
    pub relations: Vec<ObservedRelation>,
    pub boundary_elements: Vec<ElementCandidate>,
}

/// The one reason a repository is not analysed by this build.
#[derive(Debug, PartialEq, Eq)]
pub enum AnalysisRefusal {
    /// The repository has a root `Cargo.toml`; its feature configuration evidence is not built.
    RustFeatureConfiguration,
}

fn domain_matcher(domains: &[DomainCandidate]) -> impl Fn(&str) -> Option<String> {
    let slugs: Vec<String> = domains.iter().map(|row| row.slug.clone()).collect();
    move |name: &str| {
        let refs: Vec<&str> = slugs.iter().map(String::as_str).collect();
        match_domain_slug(name, &refs)
    }
}

fn base_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

fn capability(
    name: &str,
    domain: Option<String>,
    evidence_source: &str,
) -> CapabilityCandidate {
    CapabilityCandidate {
        slug: format!("capabilities/{name}"),
        title: humanize(name),
        domain,
        evidence: SourceEvidence::of(evidence_source),
    }
}

/// Walks a repository root and analyses what it holds into candidates.
pub fn analyze_repository(
    files: &RepositoryFiles<'_>,
    request: &AnalysisRequest<'_>,
) -> Result<(RepositoryAnalysis, ObservedImports), AnalysisRefusal> {
    if files.probe("Cargo.toml") != Probe::Missing {
        return Err(AnalysisRefusal::RustFeatureConfiguration);
    }
    let ignore: BTreeSet<String> = source_scan::DEFAULT_IGNORE
        .iter()
        .map(|name| (*name).to_string())
        .chain(request.ignore.iter().cloned())
        .collect();
    let mut skipped = SkipLog::default();
    let workspace = discover_declared_workspace(files.source(), request.ignore);
    for (path, reason) in &workspace.skipped {
        skipped.push(path.clone(), reason.clone());
    }
    let project = detect_project(files, &mut skipped);
    let mut domains = detect_domains_from_readme(files);
    let existing_ontology = detect_existing_ontology(files, &mut skipped);
    let semantic_evidence = collect_semantic_evidence(files, &mut skipped);
    let enriched_project = enrich_project(&project, &semantic_evidence);
    let domain_for = domain_matcher(&domains);

    let src_dir: Option<&str> = SOURCE_FOLDERS
        .iter()
        .copied()
        .find(|candidate| files.is_folder(candidate));
    let source_python_paths =
        discover_source_python_package_paths(files, src_dir, &ignore, &mut skipped);
    let source_python_path_set: BTreeSet<&str> =
        source_python_paths.iter().map(String::as_str).collect();
    let rust_evidence = discover_rust_implementation_evidence(files, &mut skipped);
    let native_evidence = discover_autotools_evidence(files, &ignore, &mut skipped);

    let mut framework = "generic";
    if let Some(src) = src_dir {
        let folders = files
            .entries(src)
            .into_iter()
            .filter(|(_, probe)| *probe == Probe::Folder)
            .filter(|(name, _)| FSD_SCAN_ROOTS.contains(&name.as_str()))
            .count();
        if folders >= 1 {
            framework = "fsd";
        }
    }
    if files.probe("next.config.js") != Probe::Missing
        || files.probe("next.config.ts") != Probe::Missing
    {
        framework = if framework == "fsd" { "fsd" } else { "next" };
    }

    let mut capabilities: Vec<CapabilityCandidate> = Vec::new();
    let mut elements: Vec<ElementCandidate> = Vec::new();

    if let Some(src) = src_dir {
        if base_name(src) == "source" {
            for (entry, probe) in files.entries(src) {
                if elements.len() >= SOURCE_LAYOUT_COORDINATION_ELEMENT_LIMIT {
                    break;
                }
                if ignore.contains(&entry)
                    || entry.starts_with('.')
                    || TEST_OR_SPEC_SCRIPT.is_match(&entry)
                    || !SOURCE_LAYOUT_CODE_FILE.is_match(&entry)
                    || !SOURCE_LAYOUT_COORDINATION_ROLE.is_match(&entry)
                {
                    continue;
                }
                if probe != Probe::File {
                    continue;
                }
                let stem = SOURCE_LAYOUT_CODE_FILE.replace(&entry, "");
                let name = slugify(&stem.replace('_', "-"));
                if name.is_empty() {
                    continue;
                }
                let source = join(src, &entry);
                elements.push(ElementCandidate::at(
                    format!("elements/{name}"),
                    humanize(&name),
                    domain_for(&name),
                    &source,
                ));
            }
        }
        if framework == "fsd" {
            let mut layered: Vec<(&str, String, String)> = Vec::new();
            for layer in FSD_SCAN_ROOTS {
                let directory = join(src, layer);
                if files.probe(&directory) == Probe::Missing {
                    continue;
                }
                for (sub, probe) in files.entries(&directory) {
                    let sub_path = join(&directory, &sub);
                    if ignore.contains(&sub) || sub.starts_with('.') {
                        skipped.push(files.display(&sub_path), "dotfile/ignore");
                        continue;
                    }
                    if probe != Probe::Folder {
                        continue;
                    }
                    if layer == "features" {
                        capabilities.push(capability(&sub, domain_for(&sub), &sub_path));
                    } else {
                        layered.push((layer, sub, sub_path));
                    }
                }
            }
            for (layer, sub, sub_path) in &layered {
                let collides = layered.iter().filter(|(_, other, _)| other == sub).count() > 1;
                let singular = layer
                    .strip_suffix("ies")
                    .map_or_else(|| (*layer).to_string(), |stem| format!("{stem}y"));
                let singular = singular.strip_suffix('s').unwrap_or(&singular).to_string();
                let name = if collides {
                    format!("{sub}-{singular}")
                } else {
                    sub.clone()
                };
                elements.push(ElementCandidate::at(
                    format!("elements/{name}"),
                    if collides {
                        format!("{} ({singular})", humanize(sub))
                    } else {
                        humanize(sub)
                    },
                    domain_for(sub),
                    sub_path,
                ));
            }
        } else if !native_evidence.is_native_project {
            generic_layout(
                files,
                src,
                &ignore,
                &domain_for,
                &source_python_path_set,
                &rust_evidence.skip_directories,
                &mut capabilities,
                &mut elements,
                &mut skipped,
            );
        }
    }

    elements.extend(native_evidence.elements);

    for candidate in IMPLEMENTATION_ONLY_SOURCE_FOLDERS {
        if Some(candidate) == src_dir.map(base_name) {
            continue;
        }
        if !files.is_folder(candidate) {
            continue;
        }
        let found = materialize_implementation_only_source_elements(
            files, candidate, &ignore, &domain_for, &elements, &mut skipped,
        );
        elements.extend(found);
    }

    let workspace_admission = detect_workspace_elements(
        files, &ignore, &domain_for, &mut skipped, &workspace, &elements,
    );
    elements.extend(workspace_admission.elements);
    let source_python_packages =
        materialize_python_package_elements(&source_python_paths, &domain_for, &elements);
    elements.extend(source_python_packages.iter().cloned());
    let rust_elements = materialize_rust_implementation_elements(&rust_evidence.rows, &elements);
    elements.extend(rust_elements);
    let root_packages = detect_root_packages(files, &ignore, &domain_for, &elements);
    elements.extend(root_packages);
    let root_python_packages =
        detect_root_python_packages(files, &ignore, &domain_for, &elements, &mut skipped);
    elements.extend(root_python_packages.iter().cloned());

    let imports = scan_for_elements(files, request, &workspace_admission.packages, &workspace, &mut skipped);
    let python_packages: Vec<&ElementCandidate> = root_python_packages
        .iter()
        .chain(source_python_packages.iter())
        .collect();
    let boundary_elements = detect_python_import_boundary_elements(
        files, &ignore, &domain_for, &elements, &python_packages, &imports, &mut skipped,
    );
    elements.extend(boundary_elements.iter().cloned());
    let go_admission = materialize_go_package_elements(
        imports.package_import_evidence.as_ref(),
        &elements,
        &mut skipped,
    );
    elements.extend(go_admission.elements);
    let go_boundary_elements: Vec<&ElementCandidate> = elements
        .iter()
        .filter(|element| go_admission.package_paths.contains(&element.path))
        .collect();
    let go_relations = map_go_dependency_relations(
        imports.package_import_evidence.as_ref(),
        &go_boundary_elements,
    );
    let mut observed_relations = module_edge_relations(&imports);
    observed_relations.extend(go_relations.iter().cloned());
    let product_go_slugs: BTreeSet<&str> = go_relations
        .iter()
        .filter(|relation| relation.product_value_count > 0)
        .flat_map(|relation| [relation.from.as_str(), relation.to.as_str()])
        .collect();
    let non_product_go_slugs: BTreeSet<String> = go_boundary_elements
        .iter()
        .map(|element| element.slug.clone())
        .filter(|slug| !product_go_slugs.contains(slug.as_str()))
        .collect();
    let go_boundary_owned: Vec<ElementCandidate> =
        go_boundary_elements.iter().map(|element| (*element).clone()).collect();
    let mut observed_edges: Vec<(String, String)> = imports
        .edges
        .iter()
        .map(|edge| (edge.from.clone(), edge.to.clone()))
        .collect();
    observed_edges.extend(go_import_receipts(imports.package_import_evidence.as_ref()));

    // A README heading is a domain candidate only when something besides the heading answers to
    // it: a source folder or package the scan matched to it, an ability the prose states and the
    // code implements whose clue declares that domain, or a separate document stating its
    // responsibility.
    let mut answered: BTreeSet<String> = capabilities
        .iter()
        .filter_map(|node| node.domain.clone())
        .chain(elements.iter().filter_map(|node| node.domain.clone()))
        .collect();
    for candidate in
        derive_business_capability_candidates(&domains, &capabilities, &elements, &semantic_evidence)
    {
        let declared = BUSINESS_CAPABILITY_CLUES
            .iter()
            .find(|clue| clue.slug == candidate.slug)
            .and_then(|clue| clue.domain);
        if let (Some(declared), Some(domain)) = (declared, candidate.domain.as_deref()) {
            if declared == domain {
                answered.insert(domain.to_string());
            }
        }
    }
    domains.retain(|domain| {
        answered.contains(&domain.slug)
            || find_domain_responsibility_witness(domain, &semantic_evidence).is_some()
    });

    let semantic_capability_candidates =
        derive_business_capability_candidates(&domains, &capabilities, &elements, &semantic_evidence);

    // Element paths are implementation observations: even an exact token match with a README
    // domain does not prove the role, so raw elements stay project-scoped until a reviewed
    // relation carries role evidence.
    for element in &mut elements {
        element.domain = None;
    }

    let mut suggested_relations: Vec<SuggestedRelation> = Vec::new();
    for domain in &domains {
        suggested_relations.push(SuggestedRelation::contains(&project.slug, &domain.slug));
    }
    for capability in &capabilities {
        suggested_relations.push(SuggestedRelation::contains(
            capability.domain.clone().unwrap_or_else(|| project.slug.clone()),
            &capability.slug,
        ));
    }
    for element in &elements {
        suggested_relations.push(SuggestedRelation::contains(&project.slug, &element.slug));
    }
    let implementation_slugs: BTreeSet<&str> = capabilities
        .iter()
        .map(|node| node.slug.as_str())
        .chain(elements.iter().map(|node| node.slug.as_str()))
        .collect();
    suggested_relations.extend(build_suggested_dependency_relations(
        &observed_relations,
        &implementation_slugs,
    ));

    let dependencies: Vec<DependencyRelation> = observed_relations
        .iter()
        .map(|relation| DependencyRelation {
            from: relation.from.clone(),
            to: relation.to.clone(),
            product_value_count: Some(relation.product_value_count),
        })
        .collect();
    let meaning_gate = build_meaning_gate(&GateInput {
        domains: &domains,
        capabilities: &capabilities,
        semantic_capability_candidates: &semantic_capability_candidates,
        elements: &elements,
        existing_ontology: &existing_ontology,
        observed_dependencies: &dependencies,
        non_product_go_package_slugs: &non_product_go_slugs,
        semantic_evidence: &semantic_evidence,
    });
    let extraction_contract = build_extraction_contract(&ContractInput {
        has_project: true,
        domains: &domains,
        capabilities: &capabilities,
        semantic_capability_candidates: &semantic_capability_candidates,
        elements: &elements,
        existing_ontology: &existing_ontology,
        suggested_relations: &suggested_relations,
        semantic_evidence: &semantic_evidence,
    });
    let analysis = RepositoryAnalysis {
        root_path: files.label().to_string(),
        framework,
        project: enriched_project,
        domains,
        capabilities,
        elements,
        meaning_gate,
        extraction_contract,
        semantic_evidence,
        configuration_evidence: not_present(),
        suggested_relations,
        skipped: skipped.into_rows(),
    };
    Ok((
        analysis,
        ObservedImports {
            edges: observed_edges,
            relations: observed_relations,
            boundary_elements: boundary_elements
                .into_iter()
                .chain(go_boundary_owned)
                .collect(),
        },
    ))
}

/// The import scan the element evidence rests on, over the workspace packages that became
/// elements when the repository declares any.
fn scan_for_elements(
    files: &RepositoryFiles<'_>,
    request: &AnalysisRequest<'_>,
    admitted: &Option<Vec<source_scan::WorkspacePackage>>,
    workspace: &source_scan::WorkspaceDiscovery,
    skipped: &mut SkipLog,
) -> ImportScan {
    if let Some(admitted) = admitted {
        if workspace.packages.len() > admitted.len() {
            skipped.push_once(
                ".",
                format!(
                    "workspace-import-evidence-limit: omitted {} declared package roots to match analyzer elements",
                    workspace.packages.len() - admitted.len()
                ),
            );
        }
    }
    scan_imports(
        files.source(),
        files.label(),
        &ImportScanOptions {
            ignore: request.ignore.to_vec(),
            workspace_packages: admitted.clone(),
            ..ImportScanOptions::default()
        },
    )
}

/// The element and capability candidates a repository without a feature-sliced layout offers:
/// folders and files directly under its source folder.
#[allow(clippy::too_many_arguments)]
fn generic_layout(
    files: &RepositoryFiles<'_>,
    src: &str,
    ignore: &BTreeSet<String>,
    domain_for: &dyn Fn(&str) -> Option<String>,
    source_python_paths: &BTreeSet<&str>,
    rust_skip_directories: &BTreeSet<String>,
    capabilities: &mut Vec<CapabilityCandidate>,
    elements: &mut Vec<ElementCandidate>,
    skipped: &mut SkipLog,
) {
    let mut library_count = 0;
    let mut library_limit_recorded = false;
    let mut implementation_count = 0;
    let mut implementation_limit_recorded = false;
    for (sub, probe) in files.entries(src) {
        let source = join(src, &sub);
        if ignore.contains(&sub) || sub.starts_with('.') {
            skipped.push(files.display(&source), "dotfile/ignore");
            continue;
        }
        if source_python_paths.contains(source.as_str())
            || rust_skip_directories.contains(&source)
        {
            continue;
        }
        let is_dir = probe == Probe::Folder;
        let is_file = probe == Probe::File;
        if IMPLEMENTATION_ONLY_SOURCE_FOLDERS.contains(&base_name(src)) {
            if !is_dir {
                continue;
            }
            if implementation_count >= IMPLEMENTATION_SOURCE_ELEMENT_LIMIT {
                if !implementation_limit_recorded {
                    skipped.push(
                        files.display(src),
                        format!(
                            "implementation-source-element-limit: omitted direct internal entries after {IMPLEMENTATION_SOURCE_ELEMENT_LIMIT}"
                        ),
                    );
                    implementation_limit_recorded = true;
                }
                continue;
            }
            let slug = slugify(&sub);
            if slug.is_empty() {
                continue;
            }
            elements.push(ElementCandidate::at(
                format!("elements/{slug}"),
                humanize(&slug),
                domain_for(&slug),
                &source,
            ));
            implementation_count += 1;
            continue;
        }
        if base_name(src) == "lib" {
            if is_dir {
                elements.push(ElementCandidate::at(
                    format!("elements/{sub}"),
                    humanize(&sub),
                    domain_for(&sub),
                    &source,
                ));
                continue;
            }
            if !is_file
                || !SOURCE_LAYOUT_CODE_FILE.is_match(&sub)
                || TEST_OR_SPEC_SCRIPT.is_match(&sub)
            {
                continue;
            }
            if library_count >= LIBRARY_SOURCE_ELEMENT_LIMIT {
                if !library_limit_recorded {
                    skipped.push(
                        files.display(src),
                        format!(
                            "library-source-element-limit: omitted direct lib files after {LIBRARY_SOURCE_ELEMENT_LIMIT}"
                        ),
                    );
                    library_limit_recorded = true;
                }
                continue;
            }
            let name = slugify(&SOURCE_LAYOUT_CODE_FILE.replace(&sub, ""));
            let slug = format!("elements/{name}");
            if !name.is_empty() && !elements.iter().any(|element| element.slug == slug) {
                elements.push(ElementCandidate::at(
                    slug,
                    humanize(&name),
                    domain_for(&name),
                    &source,
                ));
                library_count += 1;
            }
            continue;
        }
        if !is_dir {
            continue;
        }
        capabilities.push(capability(&sub, domain_for(&sub), &source));
        for entry in ELEMENT_ENTRY_FILES {
            let entry_path = join(&source, entry);
            if files.probe(&entry_path) != Probe::Missing {
                elements.push(ElementCandidate::at(
                    format!("elements/{sub}-entry"),
                    format!("{} entry", humanize(&sub)),
                    domain_for(&sub),
                    &entry_path,
                ));
                break;
            }
        }
    }
}
