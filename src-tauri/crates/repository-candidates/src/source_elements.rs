//! Element candidates materialised from source layout and import evidence: Go packages and their
//! dependency edges, Python packages and import boundaries, root-level packages, and workspace
//! members.

use std::collections::{BTreeMap, BTreeSet};
use std::sync::LazyLock;

use answer_format::collation::compare_text;
use regex::Regex;
use repository_survey::js_regex;
use source_scan::{GoPackageEvidence, ImportScan, WorkspaceDiscovery, WorkspacePackage};

use crate::candidate_nodes::{ElementCandidate, SuggestedRelation};
use crate::candidate_text::{humanize, slugify, unique_strings};
use crate::repository_files::{join, Probe, RepositoryFiles, SkipLog};
use crate::scan_limits::{
    GO_PACKAGE_ELEMENT_LIMIT, IMPLEMENTATION_SOURCE_ELEMENT_LIMIT, PYTHON_IMPORT_ELEMENT_LIMIT,
    PYTHON_IMPORT_RISK_ELEMENT_LIMIT, WORKSPACE_ELEMENT_LIMIT,
};
use crate::scan_tables::{PYTHON_NON_PRODUCT_PACKAGES, SOURCE_FOLDERS, WORKSPACE_FOLDERS};

/// A dependency between two implementation candidates the scan observed.
#[derive(Debug, Clone)]
pub struct ObservedRelation {
    pub from: String,
    pub to: String,
    pub product_value_count: usize,
    /// The `(from, to)` of each import that shows it.
    pub evidence: Vec<(String, String)>,
}

pub type DomainFor<'a> = &'a dyn Fn(&str) -> Option<String>;

pub struct GoPackageAdmission {
    pub elements: Vec<ElementCandidate>,
    pub package_paths: BTreeSet<String>,
}

struct GoCandidate {
    path: String,
    count: usize,
    product_value_count: usize,
}

pub fn materialize_go_package_elements(
    evidence: Option<&GoPackageEvidence>,
    existing: &[ElementCandidate],
    skipped: &mut SkipLog,
) -> GoPackageAdmission {
    let mut by_path: Vec<GoCandidate> = Vec::new();
    if let Some(evidence) = evidence {
        for edge in &evidence.module_edges {
            for path in [&edge.from_package, &edge.to_package] {
                let slot = match by_path.iter().position(|row| row.path == *path) {
                    Some(index) => index,
                    None => {
                        by_path.push(GoCandidate {
                            path: path.clone(),
                            count: 0,
                            product_value_count: 0,
                        });
                        by_path.len() - 1
                    }
                };
                if let Some(row) = by_path.get_mut(slot) {
                    row.count += edge.stats.count;
                    row.product_value_count += edge.stats.product_value_count;
                }
            }
        }
    }
    by_path.sort_by(|left, right| {
        right
            .product_value_count
            .cmp(&left.product_value_count)
            .then(right.count.cmp(&left.count))
            .then_with(|| compare_text(&left.path, &right.path))
    });
    let admitted: Vec<&GoCandidate> = by_path.iter().take(GO_PACKAGE_ELEMENT_LIMIT).collect();
    if by_path.len() > admitted.len() {
        skipped.push(
            "go.mod",
            format!(
                "go-package-element-limit: omitted {} lower-priority package directories",
                by_path.len() - admitted.len()
            ),
        );
    }
    let package_paths: BTreeSet<String> = admitted.iter().map(|row| row.path.clone()).collect();
    let mut claimed: BTreeSet<String> = existing.iter().map(|row| row.slug.clone()).collect();
    let existing_paths: BTreeSet<&str> = existing.iter().map(|row| row.path.as_str()).collect();
    let fresh: Vec<&str> = admitted
        .iter()
        .map(|row| row.path.as_str())
        .filter(|path| !existing_paths.contains(path))
        .collect();
    let mut elements = Vec::new();
    for (path, name) in resolve_go_package_names(&fresh, &claimed) {
        let slug = format!("elements/{name}");
        claimed.insert(slug.clone());
        elements.push(ElementCandidate::at(slug, humanize(&name), None, &path));
    }
    GoPackageAdmission {
        elements,
        package_paths,
    }
}

struct NamedRow {
    path: String,
    segments: Vec<String>,
    depth: usize,
}

fn resolve_go_package_names(paths: &[&str], claimed: &BTreeSet<String>) -> Vec<(String, String)> {
    let mut rows: Vec<NamedRow> = paths
        .iter()
        .map(|path| NamedRow {
            path: (*path).to_string(),
            segments: if *path == "." {
                vec!["root".to_string()]
            } else {
                path.split('/').map(str::to_string).collect::<Vec<_>>()
            }
            .iter()
            .map(|segment| slugify(segment))
            .filter(|segment| !segment.is_empty())
            .collect(),
            depth: 1,
        })
        .filter(|row| !row.segments.is_empty())
        .collect();
    loop {
        let names: Vec<String> = rows
            .iter()
            .map(|row| {
                let from = row.segments.len().saturating_sub(row.depth);
                row.segments.get(from..).unwrap_or_default().join("-")
            })
            .collect();
        let mut counts: BTreeMap<String, usize> = BTreeMap::new();
        for name in &names {
            *counts.entry(format!("elements/{name}")).or_insert(0) += 1;
        }
        let conflicts: Vec<usize> = names
            .iter()
            .enumerate()
            .filter(|(_, name)| {
                let slug = format!("elements/{name}");
                claimed.contains(&slug) || counts.get(&slug).copied().unwrap_or(0) > 1
            })
            .map(|(index, _)| index)
            .collect();
        if conflicts.is_empty() {
            return rows
                .iter()
                .zip(names)
                .map(|(row, name)| (row.path.clone(), name))
                .collect();
        }
        let mut advanced = false;
        for index in conflicts {
            if let Some(row) = rows.get_mut(index) {
                if row.depth < row.segments.len() {
                    row.depth += 1;
                    advanced = true;
                }
            }
        }
        if advanced {
            continue;
        }
        let mut assigned: BTreeSet<String> = claimed.clone();
        return rows
            .iter()
            .zip(names)
            .map(|(row, base)| {
                let mut name = base.clone();
                let mut suffix = 2;
                while assigned.contains(&format!("elements/{name}")) {
                    name = format!("{base}-{suffix}");
                    suffix += 1;
                }
                assigned.insert(format!("elements/{name}"));
                (row.path.clone(), name)
            })
            .collect();
    }
}

pub fn map_go_dependency_relations(
    evidence: Option<&GoPackageEvidence>,
    elements: &[&ElementCandidate],
) -> Vec<ObservedRelation> {
    let mut by_path: BTreeMap<&str, &str> = BTreeMap::new();
    for element in elements {
        by_path.insert(element.path.as_str(), element.slug.as_str());
    }
    let Some(evidence) = evidence else {
        return Vec::new();
    };
    evidence
        .module_edges
        .iter()
        .filter_map(|edge| {
            let from = by_path.get(edge.from_package.as_str())?;
            let to = by_path.get(edge.to_package.as_str())?;
            (from != to).then(|| ObservedRelation {
                from: (*from).to_string(),
                to: (*to).to_string(),
                product_value_count: edge.stats.product_value_count,
                evidence: edge
                    .stats
                    .evidence
                    .iter()
                    .map(|receipt| (receipt.from_file.clone(), receipt.to_package.clone()))
                    .collect(),
            })
        })
        .collect()
}

pub fn go_import_receipts(evidence: Option<&GoPackageEvidence>) -> Vec<(String, String)> {
    evidence
        .map(|evidence| {
            evidence
                .package_imports
                .iter()
                .map(|receipt| (receipt.from_file.clone(), receipt.to_package.clone()))
                .collect()
        })
        .unwrap_or_default()
}

/// The observed relations between the implementation candidates, as proposals a person reviews.
pub fn build_suggested_dependency_relations(
    relations: &[ObservedRelation],
    implementation_slugs: &BTreeSet<&str>,
) -> Vec<SuggestedRelation> {
    let mut rows: Vec<&ObservedRelation> = relations
        .iter()
        .filter(|edge| {
            edge.product_value_count > 0
                && implementation_slugs.contains(edge.from.as_str())
                && implementation_slugs.contains(edge.to.as_str())
        })
        .collect();
    rows.sort_by(|left, right| {
        compare_text(&left.from, &right.from).then_with(|| compare_text(&left.to, &right.to))
    });
    rows.into_iter()
        .take(24)
        .map(|edge| SuggestedRelation {
            from: edge.from.clone(),
            to: edge.to.clone(),
            relation_type: "depends_on",
            why: Some("proposal-only: bounded production value-import evidence; runtime impact is not asserted"),
            evidence: Some(
                unique_strings(
                    edge.evidence
                        .iter()
                        .flat_map(|(from, to)| [from.as_str(), to.as_str()]),
                )
                .into_iter()
                .take(4)
                .collect(),
            ),
            confidence: Some(0.5),
            uncertainty: Some("static import evidence requires semantic impact review before relation admission"),
        })
        .collect()
}

/// The module edges an import scan found, as relations between candidates.
pub fn module_edge_relations(scan: &ImportScan) -> Vec<ObservedRelation> {
    scan.module_edges
        .iter()
        .map(|edge| ObservedRelation {
            from: edge.from.clone(),
            to: edge.to.clone(),
            product_value_count: edge.stats.product_value_count,
            evidence: edge
                .stats
                .evidence
                .iter()
                .map(|row| (row.from.clone(), row.to.clone()))
                .collect(),
        })
        .collect()
}

fn base_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

pub fn discover_source_python_package_paths(
    files: &RepositoryFiles<'_>,
    src_dir: Option<&str>,
    ignore: &BTreeSet<String>,
    skipped: &mut SkipLog,
) -> Vec<String> {
    let Some(src_dir) = src_dir else {
        return Vec::new();
    };
    if !["src", "source"].contains(&base_name(src_dir)) {
        return Vec::new();
    }
    let mut paths = Vec::new();
    for (entry, probe) in files.entries(src_dir) {
        if ignore.contains(&entry)
            || PYTHON_NON_PRODUCT_PACKAGES.contains(&entry.to_lowercase().as_str())
            || entry.starts_with('.')
        {
            continue;
        }
        let package_path = join(src_dir, &entry);
        let package_entry = join(&package_path, "__init__.py");
        let entry_probe = files.probe(&package_entry);
        if probe == Probe::Missing || entry_probe == Probe::Missing {
            continue;
        }
        if probe == Probe::OutsideRoot || entry_probe == Probe::OutsideRoot {
            skipped.push_once(
                files.display(&package_path),
                "python-package-skip: path resolves outside repository root",
            );
            continue;
        }
        if probe == Probe::Folder {
            paths.push(package_path);
        }
    }
    paths
}

pub fn materialize_python_package_elements(
    paths: &[String],
    domain_for: DomainFor<'_>,
    existing: &[ElementCandidate],
) -> Vec<ElementCandidate> {
    let mut claimed: BTreeSet<String> = existing.iter().map(|row| row.slug.clone()).collect();
    let mut sorted: Vec<&String> = paths.iter().collect();
    answer_format::utf16::sort(&mut sorted);
    let mut out = Vec::new();
    for path in sorted {
        let flat_name = slugify(&base_name(path).replace('_', "-"));
        if flat_name.is_empty() || claimed.contains(&format!("elements/{flat_name}")) {
            continue;
        }
        let slug = format!("elements/{flat_name}");
        claimed.insert(slug.clone());
        out.push(ElementCandidate::at(
            slug,
            humanize(&flat_name),
            domain_for(&flat_name),
            path,
        ));
    }
    out
}

pub fn materialize_implementation_only_source_elements(
    files: &RepositoryFiles<'_>,
    source_dir: &str,
    ignore: &BTreeSet<String>,
    domain_for: DomainFor<'_>,
    existing: &[ElementCandidate],
    skipped: &mut SkipLog,
) -> Vec<ElementCandidate> {
    let mut claimed: BTreeSet<String> = existing.iter().map(|row| row.slug.clone()).collect();
    let mut out = Vec::new();
    let mut admitted = 0;
    let mut limit_recorded = false;
    for (entry, probe) in files.entries(source_dir) {
        let path = join(source_dir, &entry);
        if ignore.contains(&entry) || entry.starts_with('.') {
            skipped.push(files.display(&path), "dotfile/ignore");
            continue;
        }
        if probe != Probe::Folder {
            continue;
        }
        if admitted >= IMPLEMENTATION_SOURCE_ELEMENT_LIMIT {
            if !limit_recorded {
                skipped.push(
                    files.display(source_dir),
                    format!(
                        "implementation-source-element-limit: omitted direct internal entries after {IMPLEMENTATION_SOURCE_ELEMENT_LIMIT}"
                    ),
                );
                limit_recorded = true;
            }
            continue;
        }
        let name = slugify(&entry);
        if name.is_empty() || claimed.contains(&format!("elements/{name}")) {
            continue;
        }
        let slug = format!("elements/{name}");
        out.push(ElementCandidate::at(
            slug.clone(),
            humanize(&name),
            domain_for(&name),
            &path,
        ));
        claimed.insert(slug);
        admitted += 1;
    }
    out
}

/// Top-level standalone packages (a folder with its own `package.json` directly under the root,
/// such as `mcp/` and `cli/`), so the vault's reach is not limited to `src/`.
pub fn detect_root_packages(
    files: &RepositoryFiles<'_>,
    ignore: &BTreeSet<String>,
    domain_for: DomainFor<'_>,
    existing: &[ElementCandidate],
) -> Vec<ElementCandidate> {
    let mut claimed: BTreeSet<String> = existing.iter().map(|row| row.slug.clone()).collect();
    let mut out = Vec::new();
    for (entry, probe) in files.entries("") {
        if ignore.contains(&entry) || entry.starts_with('.') {
            continue;
        }
        if SOURCE_FOLDERS.contains(&entry.as_str()) || WORKSPACE_FOLDERS.contains(&entry.as_str()) {
            continue;
        }
        if probe != Probe::Folder {
            continue;
        }
        if files.probe(&join(&entry, "package.json")) == Probe::Missing {
            continue;
        }
        let flat_name = if claimed.contains(&format!("elements/{entry}")) {
            format!("{entry}-package")
        } else {
            entry.clone()
        };
        let slug = format!("elements/{flat_name}");
        claimed.insert(slug.clone());
        out.push(ElementCandidate::at(
            slug,
            humanize(&entry),
            domain_for(&entry),
            &entry,
        ));
    }
    out
}

pub fn detect_root_python_packages(
    files: &RepositoryFiles<'_>,
    ignore: &BTreeSet<String>,
    domain_for: DomainFor<'_>,
    existing: &[ElementCandidate],
    skipped: &mut SkipLog,
) -> Vec<ElementCandidate> {
    let mut claimed: BTreeSet<String> = existing.iter().map(|row| row.slug.clone()).collect();
    let mut out = Vec::new();
    for (entry, probe) in files.entries("") {
        if ignore.contains(&entry)
            || PYTHON_NON_PRODUCT_PACKAGES.contains(&entry.to_lowercase().as_str())
            || entry.starts_with('.')
            || SOURCE_FOLDERS.contains(&entry.as_str())
            || WORKSPACE_FOLDERS.contains(&entry.as_str())
        {
            continue;
        }
        if !matches!(probe, Probe::Folder | Probe::OutsideRoot) {
            continue;
        }
        let package_entry = join(&entry, "__init__.py");
        let entry_probe = files.probe(&package_entry);
        if entry_probe == Probe::Missing {
            continue;
        }
        if probe == Probe::OutsideRoot || entry_probe == Probe::OutsideRoot {
            skipped.push_once(
                files.display(&entry),
                "python-package-skip: path resolves outside repository root",
            );
            continue;
        }
        let flat_name = slugify(&entry.replace('_', "-"));
        if flat_name.is_empty() || claimed.contains(&format!("elements/{flat_name}")) {
            continue;
        }
        let slug = format!("elements/{flat_name}");
        claimed.insert(slug.clone());
        out.push(ElementCandidate::at(
            slug,
            humanize(&entry),
            domain_for(&entry),
            &entry,
        ));
    }
    out
}

fn python_risk_endpoint_priority(file_name: &str) -> u32 {
    let normalized: String = file_name
        .chars()
        .filter(|character| *character != '_' && *character != '-')
        .collect::<String>()
        .to_lowercase();
    if normalized.contains("security") {
        100
    } else if normalized.contains("authorization") || normalized.contains("authentication") {
        90
    } else if normalized.contains("permission") || normalized.contains("credential") {
        80
    } else if normalized.contains("policy") || normalized.contains("encryption") {
        70
    } else {
        0
    }
}

static CAMEL_BOUNDARY: LazyLock<Regex> = LazyLock::new(|| js_regex(r"([a-z0-9])([A-Z])"));

struct RiskPath {
    path: String,
    priority: u32,
}

pub fn detect_python_import_boundary_elements(
    files: &RepositoryFiles<'_>,
    ignore: &BTreeSet<String>,
    domain_for: DomainFor<'_>,
    existing: &[ElementCandidate],
    python_packages: &[&ElementCandidate],
    imports: &ImportScan,
    skipped: &mut SkipLog,
) -> Vec<ElementCandidate> {
    if python_packages.is_empty() {
        return Vec::new();
    }
    let mut scores: BTreeMap<String, usize> = BTreeMap::new();
    let mut neighbors: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for edge in &imports.module_edges {
        if !edge.from.starts_with("elements/") || !edge.to.starts_with("elements/") {
            continue;
        }
        for (slug, neighbor) in [(&edge.from, &edge.to), (&edge.to, &edge.from)] {
            *scores.entry(slug.clone()).or_insert(0) += edge.stats.count;
            neighbors
                .entry(slug.clone())
                .or_default()
                .insert(neighbor.clone());
        }
    }

    let mut path_candidates: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for package in python_packages {
        for (entry, probe) in files.entries(&package.path) {
            if entry == "__init__.py" || ignore.contains(&entry) || entry.starts_with('.') {
                continue;
            }
            let path = join(&package.path, &entry);
            let is_boundary = match probe {
                Probe::File => entry.ends_with(".py"),
                Probe::Folder => files.is_file(&join(&path, "__init__.py")),
                _ => false,
            };
            if !is_boundary {
                continue;
            }
            let name = entry.strip_suffix(".py").unwrap_or(&entry);
            let flat_name = slugify(&name.replace('_', "-"));
            if flat_name.is_empty() {
                continue;
            }
            path_candidates
                .entry(format!("elements/{flat_name}"))
                .or_default()
                .push(path);
        }
    }

    let mut claimed: BTreeSet<String> = existing.iter().map(|row| row.slug.clone()).collect();
    let mut risk_paths: BTreeMap<String, Vec<RiskPath>> = BTreeMap::new();
    let mut seen_sources: BTreeSet<&str> = BTreeSet::new();
    for edge in &imports.edges {
        for source in [edge.from.as_str(), edge.to.as_str()] {
            if !seen_sources.insert(source) {
                continue;
            }
            if !source.ends_with(".py") || source.ends_with("/__init__.py") {
                continue;
            }
            if !python_packages
                .iter()
                .any(|row| source.starts_with(&format!("{}/", row.path)))
            {
                continue;
            }
            let parts: Vec<&str> = source.split('/').collect();
            if parts.len() < 3 {
                continue;
            }
            let last = parts.last().copied().unwrap_or_default();
            let file_name = last.get(..last.len() - 3).unwrap_or(last);
            let priority = python_risk_endpoint_priority(file_name);
            if priority == 0 {
                continue;
            }
            let spaced = CAMEL_BOUNDARY.replace_all(file_name, "$1-$2");
            let flat_name = slugify(&spaced.replace('_', "-"));
            if flat_name.is_empty() {
                continue;
            }
            risk_paths
                .entry(format!("elements/{flat_name}"))
                .or_default()
                .push(RiskPath {
                    path: source.to_string(),
                    priority,
                });
        }
    }

    let mut ranked: Vec<&String> = scores.keys().filter(|slug| !claimed.contains(*slug)).collect();
    ranked.sort_by(|left, right| {
        let degree = |slug: &String| neighbors.get(slug).map_or(0, BTreeSet::len);
        degree(right)
            .cmp(&degree(left))
            .then_with(|| {
                scores
                    .get(*right)
                    .copied()
                    .unwrap_or(0)
                    .cmp(&scores.get(*left).copied().unwrap_or(0))
            })
            .then_with(|| compare_text(left, right))
    });
    let mut admissible: Vec<&String> = Vec::new();
    for slug in ranked {
        let paths = path_candidates.get(slug).map_or(0, Vec::len);
        if paths == 1 {
            admissible.push(slug);
        } else if paths > 1 {
            skipped.push_once(
                path_candidates
                    .get(slug)
                    .map(|rows| rows.join(", "))
                    .unwrap_or_default(),
                format!("python-import-element-skip: ambiguous module slug {slug}"),
            );
        }
    }
    struct Risk<'a> {
        slug: &'a String,
        path: &'a str,
        priority: u32,
    }
    let mut risk_admissible: Vec<Risk<'_>> = Vec::new();
    for (slug, paths) in &risk_paths {
        if claimed.contains(slug) {
            continue;
        }
        let direct = path_candidates.get(slug);
        if paths.len() == 1 && direct.is_none_or(Vec::is_empty) {
            if let Some(first) = paths.first() {
                risk_admissible.push(Risk {
                    slug,
                    path: first.path.as_str(),
                    priority: first.priority,
                });
            }
            continue;
        }
        let joined: Vec<&str> = direct
            .into_iter()
            .flatten()
            .map(String::as_str)
            .chain(paths.iter().map(|row| row.path.as_str()))
            .collect();
        skipped.push_once(
            joined.join(", "),
            format!("python-import-element-skip: ambiguous module slug {slug}"),
        );
    }
    risk_admissible.sort_by(|left, right| {
        right
            .priority
            .cmp(&left.priority)
            .then_with(|| compare_text(left.slug, right.slug))
    });
    let selected_risk: Vec<&Risk<'_>> = risk_admissible
        .iter()
        .take(PYTHON_IMPORT_RISK_ELEMENT_LIMIT)
        .collect();
    let selected_risk_slugs: BTreeSet<&String> = selected_risk.iter().map(|row| row.slug).collect();
    let mut selected: Vec<(String, String)> = selected_risk
        .iter()
        .map(|row| (row.slug.clone(), row.path.to_string()))
        .collect();
    for slug in admissible
        .iter()
        .filter(|slug| !selected_risk_slugs.contains(**slug))
        .take(PYTHON_IMPORT_ELEMENT_LIMIT - selected_risk.len())
    {
        if let Some(path) = path_candidates.get(*slug).and_then(|rows| rows.first()) {
            selected.push(((*slug).clone(), path.clone()));
        }
    }
    let candidate_count = risk_admissible
        .iter()
        .map(|row| row.slug)
        .chain(admissible.iter().copied())
        .collect::<BTreeSet<_>>()
        .len();
    let omitted = candidate_count.saturating_sub(selected.len());
    if omitted > 0 {
        skipped.push_once(
            files.label().to_string(),
            format!("python-import-element-limit: omitted {omitted} lower-ranked boundaries"),
        );
    }
    selected
        .into_iter()
        .map(|(slug, path)| {
            let name = slug.strip_prefix("elements/").unwrap_or(&slug).to_string();
            claimed.insert(slug.clone());
            ElementCandidate::at(slug, humanize(&name), domain_for(&name), &path)
        })
        .collect()
}

pub struct WorkspaceAdmission {
    pub elements: Vec<ElementCandidate>,
    /// The declared packages that became elements; `None` when the repository declares none.
    pub packages: Option<Vec<WorkspacePackage>>,
}

pub fn detect_workspace_elements(
    files: &RepositoryFiles<'_>,
    ignore: &BTreeSet<String>,
    domain_for: DomainFor<'_>,
    skipped: &mut SkipLog,
    discovery: &WorkspaceDiscovery,
    existing: &[ElementCandidate],
) -> WorkspaceAdmission {
    if discovery.has_declaration {
        let mut elements: Vec<ElementCandidate> = Vec::new();
        let mut admitted_packages = Vec::new();
        let mut claimed: BTreeSet<String> = existing.iter().map(|row| row.slug.clone()).collect();
        let omitted = discovery.packages.len().saturating_sub(WORKSPACE_ELEMENT_LIMIT);
        if omitted > 0 {
            skipped.push_once(
                ".",
                format!("workspace-element-limit: omitted {omitted} declared package elements"),
            );
        }
        for package in discovery.packages.iter().take(WORKSPACE_ELEMENT_LIMIT) {
            let slug = format!("elements/{}", package.slug);
            if claimed.contains(&slug) {
                skipped.push_once(
                    package.path.clone(),
                    format!("workspace-element-skip: duplicate implementation slug {slug}"),
                );
                continue;
            }
            claimed.insert(slug.clone());
            elements.push(ElementCandidate::at(
                slug,
                humanize(&package.slug),
                None,
                &package.path,
            ));
            admitted_packages.push(package.clone());
        }
        return WorkspaceAdmission {
            elements,
            packages: Some(admitted_packages),
        };
    }
    let mut elements: Vec<ElementCandidate> = Vec::new();
    for folder in WORKSPACE_FOLDERS {
        let probe = files.probe(folder);
        if ignore.contains(folder) {
            if probe != Probe::Missing {
                skipped.push(files.display(folder), "dotfile/ignore");
            }
            continue;
        }
        if probe != Probe::Folder {
            continue;
        }
        for (entry, entry_probe) in files.entries(folder) {
            let member = join(folder, &entry);
            if ignore.contains(&entry) || entry.starts_with('.') {
                skipped.push(files.display(&member), "dotfile/ignore");
                continue;
            }
            if entry_probe != Probe::Folder {
                continue;
            }
            if files.probe(&join(&member, "package.json")) == Probe::Missing {
                continue;
            }
            let flat_name = if elements
                .iter()
                .any(|element| element.slug == format!("elements/{entry}"))
            {
                format!("{folder}-{entry}")
            } else {
                entry.clone()
            };
            elements.push(ElementCandidate::at(
                format!("elements/{flat_name}"),
                humanize(&entry),
                domain_for(&entry),
                &member,
            ));
        }
    }
    WorkspaceAdmission {
        elements,
        packages: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn go_packages_that_end_alike_take_more_of_their_path_until_names_differ() {
        let names = resolve_go_package_names(&["internal/a/store", "internal/b/store"], &BTreeSet::new());
        assert_eq!(
            names,
            [
                ("internal/a/store".to_string(), "a-store".to_string()),
                ("internal/b/store".to_string(), "b-store".to_string()),
            ]
        );
    }

    #[test]
    fn a_name_that_is_already_taken_gets_a_number_when_paths_cannot_tell_them_apart() {
        let claimed: BTreeSet<String> = ["elements/store".to_string()].into();
        let names = resolve_go_package_names(&["store"], &claimed);
        assert_eq!(names, [("store".to_string(), "store-2".to_string())]);
    }

    #[test]
    fn a_risk_file_name_ranks_by_what_it_guards() {
        assert_eq!(python_risk_endpoint_priority("api_security"), 100);
        assert_eq!(python_risk_endpoint_priority("Policy"), 70);
        assert_eq!(python_risk_endpoint_priority("views"), 0);
    }
}
