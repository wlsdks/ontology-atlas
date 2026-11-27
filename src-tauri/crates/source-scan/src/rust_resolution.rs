//! Where a Rust module path leads: the file of this repository that holds `crate::a::b`,
//! `self::`, `super::`, the package's own crate name, or a bare first segment that is a module
//! next to the source root. A path that is none of these names a crate outside the repository.
//!
//! Resolution is by file layout (`a.rs` or `a/mod.rs`), never by compiling: macro expansion,
//! `cfg` evaluation and symbol resolution are not inferred.

use std::path::{Path, PathBuf};

use crate::import_edges::{Findings, ImportKind, ImportUsage, UnresolvedReason};
use crate::path_facts::{resolve_below, PathFacts};
use crate::rust_dependencies::{RustDependency, UsePath, MAX_DEPENDENCIES_PER_FILE};
use crate::source_walk::IgnoredNames;

/// Crates the compiler ships; importing one is not a dependency worth listing.
const BUILTIN_CRATE_ROOTS: [&str; 5] = ["alloc", "core", "proc_macro", "std", "test"];

/// The package's own crate name from `<root>/Cargo.toml`, as the code spells it elsewhere (a
/// `-` is `_`), so `use my_crate::x` inside the package is local.
pub fn read_root_package_name(facts: &PathFacts<'_>, max_bytes: usize) -> Option<String> {
    let path = facts.root().join("Cargo.toml");
    if !facts.is_own_file(&path) {
        return None;
    }
    let text = facts.files().read_text(&path).ok()?;
    if text.len() > max_bytes {
        return None;
    }
    let mut in_package = false;
    for line in text.split('\n') {
        let line = line.strip_suffix('\r').unwrap_or(line);
        let trimmed = line.trim();
        if let Some(table) = table_name(trimmed) {
            in_package = table == "package";
            continue;
        }
        if !in_package {
            continue;
        }
        if let Some(name) = string_assignment(trimmed, "name") {
            if !name.is_empty()
                && name.chars().all(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '_' | '-')
                })
            {
                return Some(name.to_string());
            }
        }
    }
    None
}

fn table_name(line: &str) -> Option<&str> {
    let rest = line.strip_prefix('[')?;
    let close = rest.find(']')?;
    let after = rest[close + 1..].trim();
    (close > 0 && (after.is_empty() || after.starts_with('#'))).then(|| &rest[..close])
}

fn string_assignment<'line>(line: &'line str, key: &str) -> Option<&'line str> {
    let rest = line
        .strip_prefix(key)?
        .trim_start()
        .strip_prefix('=')?
        .trim_start();
    let rest = rest.strip_prefix('"')?;
    let close = rest.find('"')?;
    let after = rest[close + 1..].trim();
    (after.is_empty() || after.starts_with('#')).then(|| &rest[..close])
}

pub struct RustResolver<'facts, 'files> {
    facts: &'facts PathFacts<'files>,
    package_name: Option<String>,
}

enum UsePlacement {
    Local(PathBuf),
    External(String),
    Unresolved(UnresolvedReason),
}

impl<'facts, 'files> RustResolver<'facts, 'files> {
    pub fn new(facts: &'facts PathFacts<'files>, package_name: Option<String>) -> Self {
        Self {
            facts,
            package_name,
        }
    }

    pub fn place(
        &self,
        findings: &mut Findings,
        ignore: &IgnoredNames,
        file: &Path,
        from: &str,
        dependencies: &[RustDependency],
    ) {
        let admitted = dependencies
            .get(..MAX_DEPENDENCIES_PER_FILE)
            .unwrap_or(dependencies);
        if dependencies.len() > admitted.len() {
            findings.could_not_place(
                from,
                "<rust-statement-limit>",
                UnresolvedReason::UnsupportedStaticForm,
            );
        }
        for dependency in admitted {
            match dependency {
                RustDependency::Module {
                    name,
                    path_attribute,
                    statement,
                    conditional,
                } => {
                    if *conditional {
                        findings.could_not_place(
                            from,
                            statement,
                            UnresolvedReason::UnsupportedStaticForm,
                        );
                        continue;
                    }
                    let target = match path_attribute {
                        Some(literal) => self.literal_path(file, literal),
                        None => self.module_declaration(file, name),
                    };
                    self.edge_or_missing(findings, ignore, from, target, statement);
                }
                RustDependency::Include { literal, statement } => match literal {
                    None => findings.could_not_place(
                        from,
                        statement,
                        UnresolvedReason::UnsupportedStaticForm,
                    ),
                    Some(literal) => {
                        let target = self.literal_path(file, literal);
                        self.edge_or_missing(findings, ignore, from, target, statement);
                    }
                },
                RustDependency::Use { paths, statement } => {
                    if paths.is_empty() {
                        findings.could_not_place(
                            from,
                            statement,
                            UnresolvedReason::UnsupportedStaticForm,
                        );
                        continue;
                    }
                    let mut external_seen: Vec<String> = Vec::new();
                    for path in paths {
                        let (spec, placement) = match path {
                            UsePath::Unsupported(text) => (
                                text.clone(),
                                UsePlacement::Unresolved(UnresolvedReason::UnsupportedStaticForm),
                            ),
                            UsePath::Segments(segments) => {
                                (segments.join("::"), self.use_path(file, segments))
                            }
                        };
                        match placement {
                            UsePlacement::Local(target) => {
                                self.edge(findings, ignore, from, &target);
                            }
                            UsePlacement::External(name) => {
                                if !BUILTIN_CRATE_ROOTS.contains(&name.as_str())
                                    && !external_seen.contains(&name)
                                {
                                    findings.leads_outside(from, &name);
                                    external_seen.push(name);
                                }
                            }
                            UsePlacement::Unresolved(reason) => {
                                findings.could_not_place(from, &spec, reason);
                            }
                        }
                    }
                }
            }
        }
    }

    fn edge_or_missing(
        &self,
        findings: &mut Findings,
        ignore: &IgnoredNames,
        from: &str,
        target: Option<PathBuf>,
        statement: &str,
    ) {
        match target {
            Some(target) => self.edge(findings, ignore, from, &target),
            None => findings.could_not_place(from, statement, UnresolvedReason::RelativeNotFound),
        }
    }

    fn edge(&self, findings: &mut Findings, ignore: &IgnoredNames, from: &str, target: &Path) {
        let Some(to) = self.facts.relative(target) else {
            return;
        };
        if from == to || ignore.hides(&to) {
            return;
        }
        findings.edge(from, &to, ImportKind::Static, ImportUsage::Value);
    }

    fn use_path(&self, file: &Path, segments: &[String]) -> UsePlacement {
        let valid = |segment: &String| {
            segment == "*"
                || segment.chars().enumerate().all(|(index, character)| {
                    character == '_'
                        || character.is_ascii_alphabetic()
                        || (index > 0 && character.is_ascii_digit())
                }) && !segment.is_empty()
        };
        let Some(prefix) = segments.first() else {
            return UsePlacement::Unresolved(UnresolvedReason::UnsupportedStaticForm);
        };
        if !segments.iter().all(valid) {
            return UsePlacement::Unresolved(UnresolvedReason::UnsupportedStaticForm);
        }
        let source_root = self.source_root(file);
        let crate_root = self.crate_root_file(&source_root, file);
        let found = |target: Option<PathBuf>| match target {
            Some(target) => UsePlacement::Local(target),
            None => UsePlacement::Unresolved(UnresolvedReason::AliasNotFound),
        };
        match prefix.as_str() {
            "crate" => found(self.module_segments(
                &source_root,
                segments.get(1..).unwrap_or_default(),
                Some(&crate_root),
            )),
            "self" => found(self.module_segments(
                &child_module_directory(file),
                segments.get(1..).unwrap_or_default(),
                Some(file),
            )),
            "super" => {
                let levels = segments
                    .iter()
                    .take_while(|segment| *segment == "super")
                    .count();
                let Some(parent) = self.ancestor_module_file(file, levels) else {
                    return UsePlacement::Unresolved(UnresolvedReason::AliasNotFound);
                };
                found(self.module_segments(
                    &child_module_directory(&parent),
                    segments.get(levels..).unwrap_or_default(),
                    Some(&parent),
                ))
            }
            own if self
                .package_name
                .as_ref()
                .is_some_and(|name| own == name.replace('-', "_")) =>
            {
                found(self.module_segments(
                    &source_root,
                    segments.get(1..).unwrap_or_default(),
                    Some(&crate_root),
                ))
            }
            _ => match self.module_segments(&source_root, segments, None) {
                Some(target) => UsePlacement::Local(target),
                None => UsePlacement::External(prefix.clone()),
            },
        }
    }

    fn module_declaration(&self, file: &Path, name: &str) -> Option<PathBuf> {
        let base = child_module_directory(file);
        self.first_file(&[
            resolve_below(&base, &format!("{name}.rs")),
            resolve_below(&base, &format!("{name}/mod.rs")),
        ])
    }

    fn module_segments(
        &self,
        base: &Path,
        segments: &[String],
        fallback: Option<&Path>,
    ) -> Option<PathBuf> {
        let clean: Vec<&String> = segments
            .iter()
            .filter(|segment| segment.as_str() != "*" && segment.as_str() != "self")
            .collect();
        for length in (1..=clean.len()).rev() {
            let joined = clean
                .iter()
                .take(length)
                .map(|segment| segment.as_str())
                .collect::<Vec<_>>()
                .join("/");
            let path = resolve_below(base, &joined);
            if let Some(target) = self.first_file(&[
                resolve_below(base, &format!("{joined}.rs")),
                resolve_below(&path, "mod.rs"),
            ]) {
                return Some(target);
            }
        }
        match fallback {
            Some(fallback) if clean.len() <= 1 && self.facts.is_own_file(fallback) => {
                Some(fallback.to_path_buf())
            }
            _ => None,
        }
    }

    fn source_root(&self, file: &Path) -> PathBuf {
        let under_src = self
            .facts
            .relative(file)
            .is_some_and(|relative| relative.starts_with("src/"));
        if under_src {
            self.facts.root().join("src")
        } else {
            file.parent().unwrap_or(self.facts.root()).to_path_buf()
        }
    }

    fn crate_root_file(&self, source_root: &Path, file: &Path) -> PathBuf {
        for name in ["lib.rs", "main.rs"] {
            let candidate = source_root.join(name);
            if self.facts.kind(&candidate).is_some() {
                return candidate;
            }
        }
        file.to_path_buf()
    }

    fn ancestor_module_file(&self, file: &Path, levels: usize) -> Option<PathBuf> {
        let mut current = file.to_path_buf();
        for _ in 0..levels {
            let parent_directory = current.parent()?.to_path_buf();
            let file_name = current.file_name()?.to_string_lossy().into_owned();
            let candidates: Vec<PathBuf> =
                if matches!(file_name.as_str(), "lib.rs" | "main.rs" | "mod.rs") {
                    let directory_name = parent_directory
                        .file_name()
                        .map(|name| name.to_string_lossy().into_owned())
                        .unwrap_or_default();
                    let grandparent = parent_directory
                        .parent()
                        .unwrap_or(&parent_directory)
                        .to_path_buf();
                    vec![
                        with_suffix(&parent_directory, ".rs"),
                        grandparent.join(format!("{directory_name}.rs")),
                        grandparent.join("mod.rs"),
                        grandparent.join("lib.rs"),
                        grandparent.join("main.rs"),
                    ]
                } else {
                    vec![
                        parent_directory.join("mod.rs"),
                        parent_directory.join("lib.rs"),
                        parent_directory.join("main.rs"),
                    ]
                };
            current = self.first_file(&candidates)?;
        }
        Some(current)
    }

    /// A literal `#[path]` or `include!` argument, taken relative to the file's folder; an
    /// absolute path or one with a NUL is not followed.
    fn literal_path(&self, file: &Path, literal: &str) -> Option<PathBuf> {
        if literal.is_empty() || literal.contains('\0') || is_absolute_literal(literal) {
            return None;
        }
        let candidate = resolve_below(file.parent().unwrap_or(self.facts.root()), literal);
        self.facts.is_own_file(&candidate).then_some(candidate)
    }

    fn first_file(&self, candidates: &[PathBuf]) -> Option<PathBuf> {
        candidates
            .iter()
            .find(|candidate| self.facts.is_own_file(candidate))
            .cloned()
    }
}

fn is_absolute_literal(literal: &str) -> bool {
    literal.starts_with('/')
        || literal.starts_with('\\')
        || Path::new(literal).is_absolute()
        || matches!(
            literal.as_bytes(),
            [drive, b':', b'/' | b'\\', ..] if drive.is_ascii_alphabetic()
        )
}

/// The folder a file's child modules live in: its own for `mod.rs`, `lib.rs` and `main.rs`, else
/// a folder named like the file.
fn child_module_directory(file: &Path) -> PathBuf {
    let name = file
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let parent = file.parent().unwrap_or(file);
    if matches!(name.as_str(), "mod.rs" | "lib.rs" | "main.rs") {
        parent.to_path_buf()
    } else {
        parent.join(name.strip_suffix(".rs").unwrap_or(&name))
    }
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut text = path.as_os_str().to_os_string();
    text.push(suffix);
    PathBuf::from(text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bounded_parse::{parse_bounded, ParseLimits};
    use crate::planted_tree::PlantedTree;
    use crate::rust_dependencies::read_rust_dependencies;
    use crate::source_language::SourceLanguage;

    fn scan(files: &[(&str, &str)], from: &str, cargo: Option<&str>) -> Findings {
        let mut planted = files.to_vec();
        planted.extend(cargo.map(|manifest| ("Cargo.toml", manifest)));
        let tree = PlantedTree::new(&planted);
        let root = tree.root().to_path_buf();
        let source = tree.source();
        let facts = PathFacts::new(&source);
        let package = read_root_package_name(&facts, 256 * 1024);
        let resolver = RustResolver::new(&facts, package);
        let text = files
            .iter()
            .find(|(name, _)| *name == from)
            .map(|(_, text)| *text)
            .expect("source");
        let parsed = parse_bounded(
            SourceLanguage::Rust,
            text,
            ParseLimits::for_imports(256 * 1024),
        )
        .expect("parses");
        let mut findings = Findings::default();
        resolver.place(
            &mut findings,
            &IgnoredNames::defaults(),
            &root.join(from),
            from,
            &read_rust_dependencies(&parsed),
        );
        findings
    }

    #[test]
    fn crate_self_super_the_package_name_and_a_sibling_module_resolve_by_file_layout() {
        let files = [
            ("src/lib.rs", "mod a;\nuse crate::a::item;\nuse my_pkg::a;\nuse serde::Serialize;\nuse std::fs;\n"),
            ("src/a.rs", "pub mod b;\nuse super::a;\nuse self::b::x;\n"),
            ("src/a/b.rs", ""),
        ];
        let lib = scan(&files, "src/lib.rs", Some("[package]\nname = \"my-pkg\"\n"));
        let edges: Vec<_> = lib.edges.iter().map(|edge| edge.to.as_str()).collect();
        assert_eq!(edges, ["src/a.rs", "src/a.rs", "src/a.rs"]);
        assert_eq!(
            lib.external
                .iter()
                .map(|e| e.spec.as_str())
                .collect::<Vec<_>>(),
            ["serde"]
        );
        let inner = scan(&files, "src/a.rs", None);
        let targets: Vec<_> = inner.edges.iter().map(|edge| edge.to.as_str()).collect();
        assert_eq!(
            targets,
            ["src/a/b.rs", "src/a/b.rs"],
            "`super::a` is the file itself, not an edge"
        );
    }

    #[test]
    fn a_missing_module_and_a_conditional_one_are_reported_not_guessed() {
        let files = [(
            "src/lib.rs",
            "mod gone;\n#[cfg(test)] mod tests;\nuse crate::nope::x;\n",
        )];
        let lib = scan(&files, "src/lib.rs", None);
        let reasons: Vec<_> = lib.unresolved.iter().map(|row| row.reason).collect();
        assert_eq!(
            reasons,
            [
                UnresolvedReason::RelativeNotFound,
                UnresolvedReason::UnsupportedStaticForm,
                UnresolvedReason::AliasNotFound,
            ]
        );
        assert!(lib.edges.is_empty());
    }
}
