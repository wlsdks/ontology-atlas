//! Go imports as package evidence. A Go import names a package (a folder), not a file, so the
//! scan reports which package of the module imports which, with the files that say so.
//!
//! Only the repository's own module is followed: an import is local when it starts with the
//! module path of the root `go.mod`. Nested modules, `vendor`, `testdata` and folders that start
//! with `_` or `.` are not scanned, and a file past the byte limit or the import limit is named
//! in `skipped` instead of being half read.

use std::cell::RefCell;
use std::cmp::Ordering;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tree_sitter::Node;

use answer_format::collation::compare_text;
use confined_files::{EntryKind, Refusal, SourceReadError};

use crate::bounded_parse::{parse_bounded, ParseLimits, ParsedSource};
use crate::import_edges::{ImportKind, ImportUsage, SourceRole};
use crate::import_rollup::{evidence_priority, EdgeStats, EvidenceRow};
use crate::path_facts::{resolve_below, PathFacts};
use crate::source_language::{extension_of, SourceLanguage};
use crate::source_walk::{list_sorted, IgnoredNames, GO_EXTENSION};

pub const GO_FILE_MAX_BYTES: usize = 256 * 1024;
pub const GO_IMPORTS_PER_FILE_LIMIT: usize = 256;
/// No module nests packages this deep; the cap keeps a hostile tree from being walked forever.
const GO_WALK_MAX_DEPTH: usize = 128;

/// One import as written: its path, and whether it is a blank (`_`) import kept for its effect.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GoImport {
    pub path: String,
    pub blank: bool,
}

/// The imports of a parsed Go file in source order, at most [`GO_IMPORTS_PER_FILE_LIMIT`], and
/// whether the limit cut the list.
pub fn read_go_imports(parsed: &ParsedSource<'_>) -> (Vec<GoImport>, bool) {
    let mut imports = Vec::new();
    let root = parsed.root();
    let mut cursor = root.walk();
    let declarations: Vec<Node<'_>> = root
        .children(&mut cursor)
        .filter(|node| node.kind() == "import_declaration")
        .collect();
    for declaration in declarations {
        let mut specs: Vec<Node<'_>> = Vec::new();
        let mut inner = declaration.walk();
        for child in declaration.children(&mut inner) {
            match child.kind() {
                "import_spec" => specs.push(child),
                "import_spec_list" => {
                    let mut list = child.walk();
                    specs.extend(
                        child
                            .children(&mut list)
                            .filter(|node| node.kind() == "import_spec"),
                    );
                }
                _ => {}
            }
        }
        for spec in specs {
            let Some(path) = spec
                .child_by_field_name("path")
                .and_then(|node| literal_path(parsed.text_of(node)))
            else {
                continue;
            };
            if imports.len() >= GO_IMPORTS_PER_FILE_LIMIT {
                return (imports, true);
            }
            let blank = spec
                .child_by_field_name("name")
                .is_some_and(|name| parsed.text_of(name) == "_");
            imports.push(GoImport { path, blank });
        }
    }
    (imports, false)
}

/// The path inside an interpreted (`"a/b"`) or raw (`` `a/b` ``) literal; a path with an escape
/// or a line break is not a plain package path.
fn literal_path(literal: &str) -> Option<String> {
    let inner = literal
        .strip_prefix('"')
        .and_then(|rest| rest.strip_suffix('"'))
        .map(|inner| (inner, true))
        .or_else(|| {
            literal
                .strip_prefix('`')
                .and_then(|rest| rest.strip_suffix('`'))
                .map(|inner| (inner, false))
        })?;
    let (text, interpreted) = inner;
    let forbidden: &[char] = if interpreted {
        &['"', '\\', '\r', '\n']
    } else {
        &['\r', '\n']
    };
    (!text.is_empty() && !text.contains(forbidden)).then(|| text.to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoPackageImport {
    pub from_file: String,
    pub from_package: String,
    pub to_package: String,
    pub import_spec: String,
    pub kind: ImportKind,
    pub source_role: SourceRole,
    pub import_usage: ImportUsage,
}

impl EvidenceRow for GoPackageImport {
    fn kind(&self) -> ImportKind {
        self.kind
    }
    fn role(&self) -> SourceRole {
        self.source_role
    }
    fn usage(&self) -> ImportUsage {
        self.import_usage
    }
    fn compare(&self, other: &Self) -> Ordering {
        evidence_priority(self.source_role, self.import_usage)
            .cmp(&evidence_priority(other.source_role, other.import_usage))
            .then_with(|| compare_text(&self.from_file, &other.from_file))
            .then_with(|| compare_text(&self.to_package, &other.to_package))
            .then_with(|| compare_text(&self.import_spec, &other.import_spec))
            .then_with(|| compare_text(self.kind.word(), other.kind.word()))
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct GoSkippedFile {
    pub file: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoModuleEdge {
    pub from_package: String,
    pub to_package: String,
    #[serde(flatten)]
    pub stats: EdgeStats<GoPackageImport>,
}

/// The `packageImportEvidence` an import scan returns for a module with a root `go.mod`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoPackageEvidence {
    pub contract: &'static str,
    pub module_path: String,
    pub source_qualification: &'static str,
    pub write_allowed: bool,
    pub files_scanned: usize,
    pub file_scan_limited: bool,
    pub per_file_byte_limit: usize,
    pub per_file_import_limit: usize,
    pub skipped: Vec<GoSkippedFile>,
    pub limitations: [&'static str; 3],
    pub package_imports: Vec<GoPackageImport>,
    pub module_edges: Vec<GoModuleEdge>,
}

/// The module path of the root `go.mod`, or `None` for no usable one.
fn read_root_module(facts: &PathFacts<'_>) -> Option<String> {
    let path = facts.root().join("go.mod");
    if !facts.is_own_file(&path) {
        return None;
    }
    let text = facts.files().read_text(&path).ok()?;
    if text.len() > GO_FILE_MAX_BYTES {
        return None;
    }
    let module_path = text
        .split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .map(|line| match line.find("//") {
            Some(at) => line[..at].trim_end(),
            None => line,
        })
        .find_map(|line| {
            let mut words = line.split_whitespace();
            (words.next() == Some("module")).then(|| (words.next(), words.next()))
        })
        .and_then(|(name, extra)| if extra.is_none() { name } else { None })?;
    is_safe_module_path(module_path).then(|| module_path.to_string())
}

fn is_safe_module_path(module_path: &str) -> bool {
    !module_path.is_empty()
        && !module_path.starts_with('/')
        && !module_path.contains('\\')
        && module_path.split('/').all(|segment| {
            !segment.is_empty() && segment != "." && segment != ".." && !segment.contains('\0')
        })
}

struct GoLayout<'facts, 'files> {
    facts: &'facts PathFacts<'files>,
    nested_module: RefCell<HashMap<PathBuf, bool>>,
}

impl GoLayout<'_, '_> {
    /// Whether `directory` or a folder above it, below the root, holds its own `go.mod`.
    fn in_nested_module(&self, directory: &Path) -> bool {
        if let Some(known) = self.nested_module.borrow().get(directory) {
            return *known;
        }
        let Some(relative) = self.facts.relative(directory) else {
            return true;
        };
        let answer = relative != "."
            && (self.facts.link_kind(&directory.join("go.mod")).is_some()
                || directory
                    .parent()
                    .is_none_or(|parent| self.in_nested_module(parent)));
        self.nested_module
            .borrow_mut()
            .insert(directory.to_path_buf(), answer);
        answer
    }

    /// The `/`-separated package folder of a real folder of this module: `.` for the root.
    fn package_path(&self, directory: &Path) -> Option<String> {
        let relative = self.facts.relative(directory)?;
        if relative == "." {
            return Some(relative);
        }
        (self.facts.is_own_directory(directory) && !self.in_nested_module(directory))
            .then_some(relative)
    }

    fn has_production_source(&self, directory: &Path) -> bool {
        list_sorted(self.facts.files(), directory)
            .into_iter()
            .any(|(name, kind)| {
                extension_of(&name) == Some(GO_EXTENSION)
                    && !name.ends_with("_test.go")
                    && kind == EntryKind::File
                    && self.facts.is_own_file(&directory.join(&name))
            })
    }

    /// The folder a module-local import path names, when it is a real folder of this module.
    fn local_package_directory(&self, module_path: &str, spec: &str) -> Option<PathBuf> {
        if spec != module_path && !spec.starts_with(&format!("{module_path}/")) {
            return None;
        }
        let suffix = if spec == module_path {
            ""
        } else {
            &spec[module_path.len() + 1..]
        };
        let segments: Vec<&str> = if suffix.is_empty() {
            Vec::new()
        } else {
            suffix.split('/').collect()
        };
        if segments
            .iter()
            .any(|segment| segment.is_empty() || *segment == "." || *segment == "..")
        {
            return None;
        }
        let directory = resolve_below(self.facts.root(), suffix);
        self.package_path(&directory).map(|_| directory)
    }
}

enum Pending {
    Folder(PathBuf, usize),
    File(PathBuf),
}

/// The Go files of the module in name order, a folder's files where its name falls, and whether
/// more than `max_files` were found. A stack stands in for recursion, so a folder tree thousands
/// deep cannot overflow, and folders deeper than [`GO_WALK_MAX_DEPTH`] are not entered.
fn list_go_files(
    layout: &GoLayout<'_, '_>,
    ignore: &IgnoredNames,
    max_files: usize,
) -> (Vec<PathBuf>, bool) {
    let detection_limit = max_files + 1;
    let mut files: Vec<PathBuf> = Vec::new();
    let mut stack = vec![Pending::Folder(layout.facts.root().to_path_buf(), 0)];
    while let Some(next) = stack.pop() {
        match next {
            Pending::File(path) => {
                files.push(path);
                if files.len() >= detection_limit {
                    break;
                }
            }
            Pending::Folder(directory, depth) => {
                let mut in_order: Vec<Pending> = Vec::new();
                for (name, kind) in list_sorted(layout.facts.files(), &directory) {
                    if ignore.has(&name)
                        || name.starts_with('.')
                        || name.starts_with('_')
                        || name == "vendor"
                        || name == "testdata"
                    {
                        continue;
                    }
                    let path = directory.join(&name);
                    match kind {
                        EntryKind::Directory
                            if depth < GO_WALK_MAX_DEPTH && !layout.in_nested_module(&path) =>
                        {
                            in_order.push(Pending::Folder(path, depth + 1));
                        }
                        EntryKind::Directory => {}
                        EntryKind::File if extension_of(&name) == Some(GO_EXTENSION) => {
                            in_order.push(Pending::File(path));
                        }
                        _ => {}
                    }
                }
                stack.extend(in_order.into_iter().rev());
            }
        }
    }
    let limited = files.len() > max_files;
    files.truncate(max_files);
    (files, limited)
}

pub fn scan_go_packages(
    facts: &PathFacts<'_>,
    ignore: &IgnoredNames,
    max_files: usize,
) -> Option<GoPackageEvidence> {
    let module_path = read_root_module(facts)?;
    let mut evidence = GoPackageEvidence {
        contract: "goPackageImports:v1",
        module_path: module_path.clone(),
        source_qualification: "observed_bounded_go_package_imports_not_runtime_or_semantic_impact",
        write_allowed: false,
        files_scanned: 0,
        file_scan_limited: false,
        per_file_byte_limit: GO_FILE_MAX_BYTES,
        per_file_import_limit: GO_IMPORTS_PER_FILE_LIMIT,
        skipped: Vec::new(),
        limitations: [
            "External Go modules are not included in local package import evidence.",
            "Nested Go modules and go.work workspaces are not scanned.",
            "Observed imports are bounded static source evidence, not runtime execution or semantic depends_on approval.",
        ],
        package_imports: Vec::new(),
        module_edges: Vec::new(),
    };
    if max_files == 0 {
        evidence.file_scan_limited = true;
        return Some(evidence);
    }
    let layout = GoLayout {
        facts,
        nested_module: RefCell::default(),
    };
    let (files, limited) = list_go_files(&layout, ignore, max_files);
    evidence.files_scanned = files.len();
    evidence.file_scan_limited = limited;
    let mut targets: HashMap<String, Option<String>> = HashMap::new();
    for file in &files {
        let Some(from_file) = facts.relative(file) else {
            continue;
        };
        let text = match facts.files().read_text(file) {
            Ok(text) if text.len() <= GO_FILE_MAX_BYTES => text,
            Ok(_) | Err(SourceReadError::Refused(Refusal::FileOverSizeLimit)) => {
                evidence.skipped.push(GoSkippedFile {
                    file: from_file,
                    reason: format!("go-import-skip: exceeds {GO_FILE_MAX_BYTES} byte limit"),
                });
                continue;
            }
            Err(_) => {
                evidence.skipped.push(GoSkippedFile {
                    file: from_file,
                    reason: "go-import-skip: unreadable source file".to_string(),
                });
                continue;
            }
        };
        let Some(from_package) = file
            .parent()
            .and_then(|directory| layout.package_path(directory))
        else {
            continue;
        };
        let (imports, limited_imports) = match parse_bounded(
            SourceLanguage::Go,
            &text,
            ParseLimits::for_imports(GO_FILE_MAX_BYTES),
        ) {
            Ok(parsed) => read_go_imports(&parsed),
            Err(_) => {
                evidence.skipped.push(GoSkippedFile {
                    file: from_file,
                    reason: "go-import-skip: source not parsed".to_string(),
                });
                continue;
            }
        };
        if limited_imports {
            evidence.skipped.push(GoSkippedFile {
                file: from_file.clone(),
                reason: format!("go-import-skip: import limit {GO_IMPORTS_PER_FILE_LIMIT} reached"),
            });
        }
        for import in imports {
            let to_package = targets
                .entry(import.path.clone())
                .or_insert_with(|| {
                    let directory = layout.local_package_directory(&module_path, &import.path)?;
                    let package = layout.package_path(&directory)?;
                    layout.has_production_source(&directory).then_some(package)
                })
                .clone();
            let Some(to_package) = to_package else {
                continue;
            };
            evidence.package_imports.push(GoPackageImport {
                from_file: from_file.clone(),
                from_package: from_package.clone(),
                to_package,
                import_spec: import.path,
                kind: if import.blank {
                    ImportKind::Side
                } else {
                    ImportKind::Static
                },
                source_role: if from_file.ends_with("_test.go") {
                    SourceRole::Test
                } else {
                    SourceRole::Production
                },
                import_usage: ImportUsage::Value,
            });
        }
    }
    evidence.skipped.sort_by(|left, right| {
        compare_text(&left.file, &right.file)
            .then_with(|| compare_text(&left.reason, &right.reason))
    });
    evidence
        .package_imports
        .sort_by(|left, right| left.compare(right));
    evidence.module_edges = collapse(&evidence.package_imports);
    Some(evidence)
}

fn collapse(imports: &[GoPackageImport]) -> Vec<GoModuleEdge> {
    let mut edges: Vec<GoModuleEdge> = Vec::new();
    let mut index: HashMap<(String, String), usize> = HashMap::new();
    for import in imports {
        let key = (import.from_package.clone(), import.to_package.clone());
        let at = *index.entry(key).or_insert_with(|| {
            edges.push(GoModuleEdge {
                from_package: import.from_package.clone(),
                to_package: import.to_package.clone(),
                stats: EdgeStats::default(),
            });
            edges.len() - 1
        });
        if let Some(edge) = edges.get_mut(at) {
            edge.stats.add(import.clone());
        }
    }
    edges.sort_by(|left, right| {
        right
            .stats
            .count
            .cmp(&left.stats.count)
            .then_with(|| compare_text(&left.from_package, &right.from_package))
            .then_with(|| compare_text(&left.to_package, &right.to_package))
    });
    edges
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::planted_tree::PlantedTree;

    fn scan(files: &[(&str, &str)], max_files: usize) -> GoPackageEvidence {
        let tree = PlantedTree::new(files);
        let source = tree.source();
        scan_go_packages(
            &PathFacts::new(&source),
            &IgnoredNames::defaults(),
            max_files,
        )
        .expect("a module")
    }

    #[test]
    fn imports_in_every_form_are_read_and_only_plain_paths_count() {
        let parsed = parse_bounded(
            SourceLanguage::Go,
            "package a\n\nimport \"one\"\nimport _ \"two\"\nimport (\n\tx \"three\"\n\t. \"four\"\n\t\"five\\n\"\n\t`six`\n)\n// import \"seven\"\n",
            ParseLimits::for_imports(1 << 20),
        )
        .expect("parses");
        let (imports, limited) = read_go_imports(&parsed);
        let found: Vec<(&str, bool)> = imports.iter().map(|i| (i.path.as_str(), i.blank)).collect();
        assert_eq!(
            found,
            [
                ("one", false),
                ("two", true),
                ("three", false),
                ("four", false),
                ("six", false)
            ]
        );
        assert!(!limited);
    }

    #[test]
    fn a_local_package_import_becomes_package_evidence_and_a_nested_module_is_not_scanned() {
        let files = [
            ("go.mod", "module example.com/app // comment\n\ngo 1.22\n"),
            ("main.go", "package main\nimport (\n\t\"example.com/app/store\"\n\t_ \"example.com/app/store\"\n\t\"fmt\"\n)\n"),
            ("store/store.go", "package store\n"),
            ("store/store_test.go", "package store\nimport \"example.com/app\"\n"),
            ("tools/go.mod", "module example.com/tools\n"),
            ("tools/main.go", "package main\nimport \"example.com/app/store\"\n"),
            ("vendor/x/x.go", "package x\nimport \"example.com/app/store\"\n"),
        ];
        let evidence = scan(&files, 100);
        assert_eq!(evidence.files_scanned, 3);
        let imports: Vec<(&str, &str, &str)> = evidence
            .package_imports
            .iter()
            .map(|row| {
                (
                    row.from_file.as_str(),
                    row.to_package.as_str(),
                    row.kind.word(),
                )
            })
            .collect();
        assert_eq!(
            imports,
            [
                ("main.go", "store", "side"),
                ("main.go", "store", "static"),
                ("store/store_test.go", ".", "static"),
            ]
        );
        assert_eq!(evidence.module_edges[0].stats.count, 2);
    }

    #[test]
    fn a_file_over_the_byte_limit_is_named_and_the_file_cap_is_reported() {
        let big = format!("package a\n// {}\n", "x".repeat(GO_FILE_MAX_BYTES));
        let files = [
            ("go.mod", "module m\n"),
            ("a/a.go", big.as_str()),
            ("b/b.go", "package b\n"),
            ("c/c.go", "package c\n"),
        ];
        let evidence = scan(&files, 2);
        assert!(evidence.file_scan_limited);
        assert_eq!(evidence.files_scanned, 2);
        assert_eq!(evidence.skipped.len(), 1);
        assert!(evidence.skipped[0]
            .reason
            .contains("exceeds 262144 byte limit"));
    }
}
