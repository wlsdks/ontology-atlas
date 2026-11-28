//! The repository as units: every source file classed (product, test, example, benchmark,
//! generated, vendored, docs, tooling, migration), and the product files grouped into units, each
//! a top-level package, workspace member or module folder, split one level further when large.
//! The survey lists these units, and the coverage line every write reports is measured against
//! them, so both speak of the same thing.
//!
//! The files are read once, on the global pool, and each product file gives everything the map
//! asks of its text in that one read ([`ProductReading`]); the walk and the grouping that decide
//! what is read and how it is grouped stay one sequence, so the answer is the same as reading one
//! file after another.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use confined_files::{EntryKind, Refusal, SourceFiles, SourceReadError};
use rayon::prelude::*;
use source_scan::{
    declared_workspace_members, extension_of, outline_text, walk_sorted, Declaration,
    DeclaredMember, Entry, Flow, SourceLanguage, WalkLimits,
};

use crate::ability_row::AbilityRow;
use crate::dispatched_operations::dispatched_operations;
use crate::entry_signals::{read_entry_signals, EntrySignals};
use crate::folder_tree::{FolderTree, TreeFile, ROOT};
use crate::git_ignored_paths::nfc;
use crate::source_class::{class_of, SourceClass};
use crate::survey_files::SurveyFiles;

/// The walk stops after this many source files.
pub const MAX_FILES: usize = 8000;
/// How much of a product file the entry and dispatch readers look at, in UTF-16 units.
const SCAN_UNITS: usize = 256 * 1024;
/// A file larger than this has no declarations in the index.
const MAX_INDEXED_BYTES: usize = 256 * 1024;
/// A unit holding more product files than this is split into its subfolders.
const UNIT_SPLIT_FILES: usize = 25;
/// A file this long in a split folder is a module of its own (not Go: a Go folder is one package).
const MODULE_UNIT_LINES: usize = 300;

const SOURCE_EXTENSIONS: [&str; 31] = [
    ".c", ".cc", ".cjs", ".cpp", ".cs", ".cts", ".dart", ".ex", ".exs", ".go", ".h", ".hpp",
    ".java", ".js", ".jsx", ".kt", ".kts", ".lua", ".mjs", ".mts", ".php", ".py", ".rb", ".rs",
    ".scala", ".svelte", ".swift", ".ts", ".tsx", ".vue", ".zig",
];

/// Folders that hold what a build made or a tool cached, never what a person wrote.
pub const SURVEY_IGNORE: [&str; 16] = [
    "node_modules",
    ".git",
    "out",
    "dist",
    "build",
    ".next",
    ".expo",
    ".turbo",
    ".cache",
    ".idea",
    ".vscode",
    "coverage",
    "__pycache__",
    ".pytest_cache",
    ".venv",
    "venv",
];

/// A folder whose children are the units, never a unit itself.
const CONTAINER_FOLDERS: [&str; 12] = [
    "apps", "cmd", "crates", "internal", "lib", "libs", "modules", "packages", "pkg", "plugins",
    "source", "src",
];

/// What the map asks of a product file's text, taken in the one read.
#[derive(Debug, Clone, Default)]
pub struct ProductReading {
    pub signals: EntrySignals,
    pub declarations: Vec<Declaration>,
    pub dispatched: Vec<AbilityRow>,
}

#[derive(Debug, Clone)]
pub struct SurveyedFile {
    /// Below the root, `/`-separated.
    pub path: String,
    pub class: SourceClass,
    pub lines: usize,
    pub reading: Option<ProductReading>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UnitScope {
    /// Everything below a folder.
    Tree,
    /// The files directly in a folder.
    Files,
    /// One long file that is a module of its own.
    File,
}

#[derive(Debug, Clone)]
pub struct Unit {
    pub path: String,
    pub scope: UnitScope,
    pub files: Vec<TreeFile>,
    pub lines: usize,
}

/// What the map left out of one class of file under one top-level folder.
#[derive(Debug, Clone)]
pub struct Excluded {
    pub class: SourceClass,
    pub files: usize,
    pub lines: usize,
}

#[derive(Debug)]
pub struct Collection {
    pub files: Vec<SurveyedFile>,
    pub units: Vec<Unit>,
    /// The unit of each product file with lines, by path: an index into `units`.
    pub unit_of_file: HashMap<String, usize>,
    pub members: Vec<DeclaredMember>,
    /// Sorted by lines, largest first.
    pub excluded: Vec<Excluded>,
    pub product_files: usize,
    pub product_lines: usize,
    /// The walk stopped at its file limit.
    pub truncated: bool,
}

impl Collection {
    pub fn product_files_listed(&self) -> impl Iterator<Item = &SurveyedFile> {
        self.files
            .iter()
            .filter(|file| file.class == SourceClass::Product)
    }
}

pub struct CollectOptions<'a> {
    /// Folder names to skip besides [`SURVEY_IGNORE`].
    pub ignore: &'a [String],
    /// A folder below the root, `/`-separated, whose files are the map being built and are
    /// left out: the vault when it lies inside the repository.
    pub vault_exclusion: Option<String>,
    /// Paths Git ignores below the root, in NFC.
    pub git_ignored: &'a HashSet<String>,
}

fn count_lines(text: &str) -> usize {
    if text.is_empty() {
        return 0;
    }
    let breaks = text.bytes().filter(|byte| *byte == b'\n').count();
    if text.ends_with('\n') {
        breaks
    } else {
        breaks + 1
    }
}

fn relative_below(root: &Path, path: &Path) -> Option<String> {
    let below = path.strip_prefix(root).ok()?;
    Some(
        below
            .components()
            .map(|part| part.as_os_str().to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join("/"),
    )
}

fn has_source_extension(name: &str) -> bool {
    extension_of(name).is_some_and(|extension| {
        SOURCE_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
    })
}

/// The source files under the root, in name order with a folder's files where its name falls,
/// never following a link; at most [`MAX_FILES`], and whether the walk stopped there.
fn walk_source_files(
    source: &dyn SourceFiles,
    options: &CollectOptions<'_>,
) -> (Vec<(String, PathBuf)>, bool) {
    let root = source.root().to_path_buf();
    let ignored: HashSet<&str> = SURVEY_IGNORE
        .iter()
        .copied()
        .chain(options.ignore.iter().map(String::as_str))
        .collect();
    let excluded = options.vault_exclusion.as_deref();
    let admit = |entry: &Entry<'_>| {
        if ignored.contains(entry.name) || entry.name.starts_with('.') {
            return false;
        }
        if entry.kind == EntryKind::File && !has_source_extension(entry.name) {
            return false;
        }
        let Some(relative) = relative_below(&root, entry.path) else {
            return false;
        };
        if options.git_ignored.contains(&nfc(&relative)) {
            return false;
        }
        !excluded.is_some_and(|prefix| {
            relative == prefix
                || relative
                    .strip_prefix(prefix)
                    .is_some_and(|rest| rest.starts_with('/'))
        })
    };
    let mut found: Vec<(String, PathBuf)> = Vec::new();
    let mut visit = |entry: &Entry<'_>| {
        if found.len() >= MAX_FILES {
            return Flow::Stop;
        }
        if entry.kind == EntryKind::File {
            if let Some(relative) = relative_below(&root, entry.path) {
                found.push((relative, entry.path.to_path_buf()));
            }
            if found.len() >= MAX_FILES {
                return Flow::Stop;
            }
        }
        Flow::Continue
    };
    walk_sorted(
        source,
        &root,
        WalkLimits::UNBOUNDED_NAMES,
        &admit,
        &mut visit,
    );
    let truncated = found.len() >= MAX_FILES;
    (found, truncated)
}

fn read_product(path: &str, text: &str) -> ProductReading {
    let scanned = answer_format::utf16::prefix(text, SCAN_UNITS);
    let declarations = if text.len() <= MAX_INDEXED_BYTES {
        extension_of(path)
            .and_then(|extension| SourceLanguage::of_extension(&extension.to_ascii_lowercase()))
            .and_then(|language| outline_text(language, text).ok())
            .map(|outline| outline.declarations)
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    ProductReading {
        signals: read_entry_signals(path, scanned),
        declarations,
        dispatched: dispatched_operations(path, scanned),
    }
}

/// One file's class, lines and (for a product file) readings, from one read of it.
fn survey_file(source: &(dyn SourceFiles + Sync), path: String, absolute: &Path) -> SurveyedFile {
    let text = match source.read_text(absolute) {
        Ok(text) => text.into_owned(),
        Err(SourceReadError::Refused(Refusal::FileOverSizeLimit)) => {
            return SurveyedFile {
                path,
                class: SourceClass::Generated,
                lines: 0,
                reading: None,
            };
        }
        Err(_) => String::new(),
    };
    let class = class_of(&path, &text);
    let lines = count_lines(&text);
    let reading = (class == SourceClass::Product).then(|| read_product(&path, &text));
    SurveyedFile {
        path,
        class,
        lines,
        reading,
    }
}

/// Every source file with its class and line count, and the product units.
pub fn collect_source_units(files: &SurveyFiles<'_>, options: &CollectOptions<'_>) -> Collection {
    let source = files.source();
    let (walked, truncated) = walk_source_files(source, options);
    let surveyed: Vec<SurveyedFile> = walked
        .into_par_iter()
        .map(|(path, absolute)| survey_file(source, path, &absolute))
        .collect();
    let extra_ignore: Vec<String> = SURVEY_IGNORE
        .iter()
        .map(|name| (*name).to_string())
        .chain(options.ignore.iter().cloned())
        .collect();
    let members = declared_workspace_members(source, &extra_ignore);
    let product: Vec<TreeFile> = surveyed
        .iter()
        .filter(|file| file.class == SourceClass::Product && file.lines > 0)
        .map(|file| TreeFile {
            path: file.path.clone(),
            lines: file.lines,
        })
        .collect();
    let mut units = group_units(&product, &members);
    for unit in &mut units {
        unit.lines = unit.files.iter().map(|file| file.lines).sum();
    }
    units.sort_by(|left, right| answer_format::collation::compare_text(&left.path, &right.path));
    let mut unit_of_file = HashMap::new();
    for (index, unit) in units.iter().enumerate() {
        for file in &unit.files {
            unit_of_file.insert(file.path.clone(), index);
        }
    }
    let excluded = excluded_of(&surveyed);
    let product_lines = product.iter().map(|file| file.lines).sum();
    Collection {
        product_files: product.len(),
        product_lines,
        files: surveyed,
        units,
        unit_of_file,
        members,
        excluded,
        truncated,
    }
}

fn excluded_of(files: &[SurveyedFile]) -> Vec<Excluded> {
    let mut by_key: HashMap<(SourceClass, String), usize> = HashMap::new();
    let mut rows: Vec<Excluded> = Vec::new();
    for file in files
        .iter()
        .filter(|file| file.class != SourceClass::Product)
    {
        let top = file
            .path
            .split_once('/')
            .map_or(".", |(top, _)| top)
            .to_string();
        let slot = *by_key.entry((file.class, top)).or_insert_with(|| {
            rows.push(Excluded {
                class: file.class,
                files: 0,
                lines: 0,
            });
            rows.len() - 1
        });
        if let Some(row) = rows.get_mut(slot) {
            row.files += 1;
            row.lines += file.lines;
        }
    }
    rows.sort_by_key(|row| std::cmp::Reverse(row.lines));
    rows
}

fn file_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

fn is_go(path: &str) -> bool {
    path.rsplit_once('.')
        .is_some_and(|(_, extension)| extension.eq_ignore_ascii_case("go"))
}

/// Product files into units. A container folder (`src`, `packages`, `plugins` ...) or a folder
/// over the split size hands its subfolders on as units; its own files form one unit, except a
/// long file outside a Go package, which is a module of its own.
fn group_units(product: &[TreeFile], members: &[DeclaredMember]) -> Vec<Unit> {
    let member_paths: HashSet<&str> = members.iter().map(|member| member.path.as_str()).collect();
    let tree = FolderTree::of(product);
    let mut units: Vec<Unit> = Vec::new();
    let mut push = |path: &str, scope: UnitScope, files: Vec<TreeFile>| {
        if files.is_empty() {
            return;
        }
        units.push(Unit {
            path: if path.is_empty() {
                ".".to_string()
            } else {
                path.to_string()
            },
            scope,
            files,
            lines: 0,
        });
    };
    let mut stack: Vec<(usize, bool)> = vec![(ROOT, true)];
    while let Some((at, force_split)) = stack.pop() {
        let Some(folder) = tree.get(at) else {
            continue;
        };
        if folder.total == 0 {
            continue;
        }
        let name = file_name(&folder.path).to_lowercase();
        let is_member = member_paths.contains(folder.path.as_str());
        let files = tree.files_beneath(at);
        let go_package = files.iter().all(|file| is_go(&file.path));
        let below = format!("{}/", folder.path);
        let split = force_split
            || (!is_member && CONTAINER_FOLDERS.contains(&name.as_str()))
            || (folder.total > UNIT_SPLIT_FILES && !folder.children.is_empty())
            || member_paths.iter().any(|member| member.starts_with(&below));
        if !split {
            push(&folder.path, UnitScope::Tree, files);
            continue;
        }
        let mut loose: Vec<TreeFile> = Vec::new();
        for file in &folder.files {
            if !go_package && file.lines >= MODULE_UNIT_LINES && folder.files.len() > 1 {
                push(&file.path, UnitScope::File, vec![file.clone()]);
            } else {
                loose.push(file.clone());
            }
        }
        push(&folder.path, UnitScope::Files, loose);
        stack.extend(folder.children.iter().rev().map(|child| (*child, false)));
    }
    units
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tree_file(path: &str, lines: usize) -> TreeFile {
        TreeFile {
            path: path.to_string(),
            lines,
        }
    }

    fn unit_paths(units: &[Unit]) -> Vec<(&str, UnitScope, usize)> {
        units
            .iter()
            .map(|unit| (unit.path.as_str(), unit.scope, unit.files.len()))
            .collect()
    }

    #[test]
    fn a_container_folder_hands_its_subfolders_on_as_units() {
        let product = [
            tree_file("src/order/place.ts", 10),
            tree_file("src/order/cancel.ts", 10),
            tree_file("src/payment/charge.ts", 10),
            tree_file("src/main.ts", 10),
        ];
        assert_eq!(
            unit_paths(&group_units(&product, &[])),
            [
                ("src", UnitScope::Files, 1),
                ("src/order", UnitScope::Tree, 2),
                ("src/payment", UnitScope::Tree, 1),
            ]
        );
    }

    #[test]
    fn a_long_file_beside_others_is_a_module_but_a_go_folder_stays_one_package() {
        let product = [
            tree_file("src/big.ts", 400),
            tree_file("src/small.ts", 10),
            tree_file("src/go/a.go", 400),
            tree_file("src/go/b.go", 10),
        ];
        assert_eq!(
            unit_paths(&group_units(&product, &[])),
            [
                ("src/big.ts", UnitScope::File, 1),
                ("src", UnitScope::Files, 1),
                ("src/go", UnitScope::Tree, 2),
            ]
        );
    }

    #[test]
    fn a_folder_holding_workspace_members_never_becomes_one_unit_over_them() {
        let members = [DeclaredMember {
            path: "tools/cli".to_string(),
            name: None,
        }];
        let product = [
            tree_file("tools/cli/main.go", 5),
            tree_file("tools/x.go", 5),
        ];
        assert_eq!(
            unit_paths(&group_units(&product, &members)),
            [
                ("tools", UnitScope::Files, 1),
                ("tools/cli", UnitScope::Tree, 1)
            ]
        );
    }

    #[test]
    fn lines_are_the_newlines_plus_an_unfinished_last_line() {
        assert_eq!(count_lines(""), 0);
        assert_eq!(count_lines("a\nb\n"), 2);
        assert_eq!(count_lines("a\nb"), 2);
        assert_eq!(count_lines("\n"), 1);
    }
}
