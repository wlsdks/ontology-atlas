//! The import scan: which files of a repository import which, read from syntax trees.
//!
//! The scan walks the repository's source folders (or the workspace packages it declares, or the
//! root), reads each file within its byte cap and parse budget, places every import by file layout
//! and returns the file edges, the packages that lead outside, what could not be placed and the
//! edges grouped by module. Go is read by package. Nothing is compiled or run.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::Serialize;

use answer_format::collation::compare_text;
use confined_files::SourceFiles;

use crate::autotools_c::detect_autotools_c;
use crate::batch_reading::{read_in_batches, Batched};
use crate::file_reading::FileReading;
use crate::go_imports::{scan_go_packages, GoPackageEvidence, GO_FILE_MAX_BYTES};
use crate::import_coverage::ImportCoverage;
use crate::import_edges::{ExternalImport, Findings, ImportEdge, UnresolvedImport};
use crate::import_rollup::EdgeStats;
use crate::jvm_resolution::{place_jvm_imports, JvmSource};
use crate::module_grouping::module_of;
use crate::path_facts::{join_below, PathFacts};
use crate::python_resolution::{discover_root_packages, PythonResolver};
use crate::rust_resolution::{read_root_package_name, RustResolver};
use crate::script_resolution::{read_tsconfig_aliases, ScriptResolver};
use crate::source_language::extension_of_file;
use crate::source_walk::{is_scanned_extension, list_source_files, IgnoredNames, RUST_EXTENSION};
use crate::workspace_packages::{
    discover_workspace_packages, WorkspaceDiscovery, WorkspacePackage,
};

/// The most a script, Python or JVM file may weigh and still be read.
pub const SOURCE_FILE_MAX_BYTES: usize = 2 * 1024 * 1024;
/// Rust files are read at the Go limit: a larger one is mostly generated tables.
pub const RUST_FILE_MAX_BYTES: usize = GO_FILE_MAX_BYTES;
pub const DEFAULT_MAX_FILES: usize = 5000;
pub const MAX_MAX_FILES: usize = 50_000;
pub const DEFAULT_SOURCE_FOLDERS: [&str; 6] = ["src", "source", "lib", "app", "apps", "packages"];

/// What the caller asked of a scan.
#[derive(Debug, Clone, Default)]
pub struct ImportScanOptions {
    /// Folders to read; `None` for the default list.
    pub source_folders: Option<Vec<String>>,
    /// Folder names to skip, besides the defaults.
    pub ignore: Vec<String>,
    pub max_files: Option<usize>,
}

/// A group of file edges between two modules, summed up.
#[derive(Debug, Clone, Serialize)]
pub struct ModuleEdge {
    pub from: String,
    pub to: String,
    #[serde(flatten)]
    pub stats: EdgeStats<ImportEdge>,
}

/// The answer of an import scan, in the order an agent reads it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportScan {
    pub root_path: String,
    pub files_scanned: usize,
    pub coverage: ImportCoverage,
    pub edges: Vec<ImportEdge>,
    pub external_imports: Vec<ExternalImport>,
    pub unresolved: Vec<UnresolvedImport>,
    pub module_edges: Vec<ModuleEdge>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package_import_evidence: Option<GoPackageEvidence>,
}

/// Reads the repository `files` shows. `root_label` is the root as the caller wrote it, echoed in
/// the answer. The scan is bounded by `max_files`, the byte caps and the parse budget; it never
/// fails on a file it cannot read, it says what it could not.
pub fn scan_imports(
    files: &dyn SourceFiles,
    root_label: &str,
    options: &ImportScanOptions,
) -> ImportScan {
    let facts = PathFacts::new(files);
    let ignore = IgnoredNames::with_defaults(&options.ignore);
    let max_files = options.max_files.unwrap_or(DEFAULT_MAX_FILES);
    let explicit_folders = options.source_folders.is_some();
    let source_folders: Vec<String> = options.source_folders.clone().unwrap_or_else(|| {
        DEFAULT_SOURCE_FOLDERS
            .iter()
            .map(|folder| (*folder).to_string())
            .collect()
    });
    let discovery = discover_workspace_packages(&facts, &ignore);
    let workspace_packages = discovery.packages.clone();
    let scan_folders = folders_to_scan(&source_folders, explicit_folders, &discovery);
    let (roots, configured_root_exists) = scan_roots(&facts, &ignore, &scan_folders, &discovery);

    let mut scan_roots_list = prune_nested_roots(&facts, roots);
    if scan_roots_list.is_empty() && !configured_root_exists {
        let python_roots = discover_root_packages(&facts, &ignore);
        if python_roots.is_empty() {
            scan_roots_list.push(facts.root().to_path_buf());
        } else {
            scan_roots_list.extend(python_roots);
        }
    }

    let mut listed: Vec<PathBuf> = Vec::new();
    let wanted = |extension: &str| is_scanned_extension(extension);
    for root in &scan_roots_list {
        list_source_files(files, root, &ignore, max_files, &wanted, &mut listed);
    }
    let go = scan_go_packages(&facts, &ignore, max_files.saturating_sub(listed.len()));

    let mut findings = Findings::default();
    let python = PythonResolver::new(&facts, &source_folders);
    let script = ScriptResolver::new(
        &facts,
        read_tsconfig_aliases(&facts),
        workspace_packages.clone(),
    );
    let has_rust = listed
        .iter()
        .any(|file| extension_of_file(file) == Some(RUST_EXTENSION));
    let rust = RustResolver::new(
        &facts,
        has_rust
            .then(|| read_root_package_name(&facts, RUST_FILE_MAX_BYTES))
            .flatten(),
    );
    let mut jvm_sources: Vec<JvmSource> = Vec::new();

    read_in_batches(files, &facts, &listed, |batched| {
        let Batched::Read(pending, reading) = batched else {
            return;
        };
        let (file, from) = (&pending.path, &pending.from);
        match reading {
            FileReading::Unreadable(reason) => {
                findings.could_not_place(from, "<source-text>", reason);
            }
            FileReading::Rust(dependencies) => {
                rust.place(&mut findings, &ignore, file, from, &dependencies);
            }
            FileReading::Python(imports) => {
                for import in &imports {
                    python.place(&mut findings, &ignore, file, from, import);
                }
            }
            FileReading::Jvm(read) => jvm_sources.push(JvmSource {
                path: from.clone(),
                file: *read,
            }),
            FileReading::Script(imports) => {
                for import in &imports {
                    script.place(&mut findings, &ignore, file, from, import);
                }
            }
            FileReading::Go(..) => {}
        }
    });
    place_jvm_imports(&facts, &ignore, &jvm_sources, &mut findings);

    let module_edges = group_by_module(
        &facts,
        &findings.edges,
        &source_folders,
        &workspace_packages,
    );
    let has_jvm = !jvm_sources.is_empty();
    ImportScan {
        root_path: root_label.to_string(),
        files_scanned: listed.len() + go.as_ref().map_or(0, |go| go.files_scanned),
        coverage: ImportCoverage::new(detect_autotools_c(&facts), has_jvm),
        edges: findings.edges,
        external_imports: findings.external,
        unresolved: findings.unresolved,
        module_edges,
        package_import_evidence: go,
    }
}

/// `apps` and `packages` are a fallback for undeclared monorepos only: once package roots are
/// declared, scanning them would re-admit the members the declaration excluded.
fn folders_to_scan(
    folders: &[String],
    explicit: bool,
    discovery: &WorkspaceDiscovery,
) -> Vec<String> {
    if !explicit && discovery.has_declaration {
        folders
            .iter()
            .filter(|folder| !matches!(folder.as_str(), "apps" | "packages"))
            .cloned()
            .collect()
    } else {
        folders.to_vec()
    }
}

/// The existing source folders and declared package roots, and whether the repository named any
/// place to read (a configured folder, even an ignored one, or a workspace declaration).
fn scan_roots(
    facts: &PathFacts<'_>,
    ignore: &IgnoredNames,
    folders: &[String],
    discovery: &WorkspaceDiscovery,
) -> (Vec<PathBuf>, bool) {
    let mut roots = Vec::new();
    let mut configured_root_exists = false;
    for folder in folders {
        let path = join_below(facts.root(), folder);
        if !facts.is_own_directory(&path) {
            continue;
        }
        configured_root_exists = true;
        if ignore.has(folder) {
            continue;
        }
        roots.push(path);
    }
    if discovery.has_declaration {
        configured_root_exists = true;
    }
    for package in &discovery.packages {
        let root = join_below(facts.root(), &package.path);
        if facts.is_own_directory(&root) {
            roots.push(root);
        }
    }
    (roots, configured_root_exists)
}

/// The roots with those inside another dropped, shortest path first.
fn prune_nested_roots(facts: &PathFacts<'_>, roots: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut relative: Vec<String> = Vec::new();
    for root in &roots {
        let name = facts.relative(root).unwrap_or_else(|| ".".to_string());
        if !relative.contains(&name) {
            relative.push(name);
        }
    }
    relative.sort_by(|left, right| {
        left.len()
            .cmp(&right.len())
            .then_with(|| compare_text(left, right))
    });
    let mut retained: Vec<String> = Vec::new();
    for candidate in relative {
        let nested = retained.iter().any(|parent| {
            parent == "." || *parent == candidate || candidate.starts_with(&format!("{parent}/"))
        });
        if !nested {
            retained.push(candidate);
        }
    }
    retained
        .into_iter()
        .map(|path| {
            if path == "." {
                facts.root().to_path_buf()
            } else {
                join_below(facts.root(), &path)
            }
        })
        .collect()
}

fn group_by_module(
    facts: &PathFacts<'_>,
    edges: &[ImportEdge],
    source_folders: &[String],
    workspace_packages: &[WorkspacePackage],
) -> Vec<ModuleEdge> {
    let mut modules: HashMap<String, Option<String>> = HashMap::new();
    let mut module_of_path = |path: &str| -> Option<String> {
        if let Some(known) = modules.get(path) {
            return known.clone();
        }
        let module = module_of(facts, path, source_folders, workspace_packages);
        modules.insert(path.to_string(), module.clone());
        module
    };
    let mut groups: Vec<ModuleEdge> = Vec::new();
    let mut index: HashMap<(String, String), usize> = HashMap::new();
    for edge in edges {
        let (Some(from), Some(to)) = (module_of_path(&edge.from), module_of_path(&edge.to)) else {
            continue;
        };
        if from == to {
            continue;
        }
        let at = *index.entry((from.clone(), to.clone())).or_insert_with(|| {
            groups.push(ModuleEdge {
                from,
                to,
                stats: EdgeStats::default(),
            });
            groups.len() - 1
        });
        if let Some(group) = groups.get_mut(at) {
            group.stats.add(edge.clone());
        }
    }
    groups.sort_by_key(|group| std::cmp::Reverse(group.stats.count));
    groups
}
