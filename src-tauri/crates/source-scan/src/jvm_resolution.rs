//! Where Java and Kotlin imports lead, and which files of a package name each other without an
//! import.
//!
//! `import a.b.C;` resolves to the file declaring that type under a source root the repository
//! has; a static or nested import resolves through its longest type prefix; a wildcard resolves
//! to that type, else to the package folder. A name that resolves in no source root is external.
//! A type used in a file of its own package needs no import, so it is matched by name in the
//! file's own module and nothing wider. Names are matched, not compiled: no scope resolution.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use crate::import_edges::{Findings, ImportKind, ImportUsage};
use crate::jvm_declarations::{JvmFile, JvmImport};
use crate::path_facts::{resolve_below, PathFacts};
use crate::source_walk::{list_sorted, IgnoredNames, JVM_EXTENSIONS};

/// No real package is this deep; a longer import is external without a probe.
const MAX_IMPORT_SEGMENTS: usize = 64;
/// Module folders are looked for this many levels below the root (`core/`, `server/api/`).
const MODULE_DEPTH: usize = 2;
const SOURCE_SET_LANGUAGES: [&str; 2] = ["java", "kotlin"];

/// A parsed JVM file with the root-relative path it was found at.
pub struct JvmSource {
    pub path: String,
    pub file: JvmFile,
}

struct SourceSet {
    module: String,
    set: String,
}

/// The module folder and source set of a file under `<module>/src/<set>/`.
fn source_set_of(path: &str) -> Option<SourceSet> {
    let parts: Vec<&str> = path.split('/').collect();
    let src = parts.iter().rposition(|part| *part == "src")?;
    if src + 1 >= parts.len() - 1 {
        return None;
    }
    Some(SourceSet {
        module: parts.get(..src)?.join("/"),
        set: (*parts.get(src + 1)?).to_string(),
    })
}

/// The source root a file's package places it under (`.../src/main/java`), as a root-relative
/// path (`.` for the root itself); `None` when its folder does not spell the package.
fn source_root_of(path: &str, package: Option<&str>) -> Option<String> {
    let package = package?;
    let package_path = package.replace('.', "/");
    let folder = path.rsplit_once('/').map_or(".", |(folder, _)| folder);
    if folder == package_path {
        return Some(".".to_string());
    }
    folder
        .strip_suffix(&format!("/{package_path}"))
        .map(str::to_string)
}

fn is_test_set(set: &str) -> bool {
    set.to_lowercase().contains("test")
}

/// `src/<set>/java` and `src/<set>/kotlin` folders of the root and of module folders up to two
/// levels below it.
fn discover_source_roots(facts: &PathFacts<'_>, ignore: &IgnoredNames) -> Vec<PathBuf> {
    if facts.files().answers_from_census() {
        return Vec::new();
    }
    let mut modules: Vec<PathBuf> = vec![facts.root().to_path_buf()];
    let mut frontier: Vec<PathBuf> = vec![facts.root().to_path_buf()];
    for _ in 0..MODULE_DEPTH {
        let mut next: Vec<PathBuf> = Vec::new();
        for folder in &frontier {
            for (name, _) in list_sorted(facts.files(), folder) {
                if name.starts_with('.') || ignore.has(&name) || name == "src" {
                    continue;
                }
                let child = folder.join(&name);
                if facts.is_own_directory(&child) {
                    next.push(child);
                }
            }
        }
        modules.extend(next.iter().cloned());
        frontier = next;
    }
    let mut roots = Vec::new();
    for folder in modules {
        let src = folder.join("src");
        if !facts.is_own_directory(&src) {
            continue;
        }
        for (set, _) in list_sorted(facts.files(), &src) {
            if set.starts_with('.') || ignore.has(&set) {
                continue;
            }
            for language in SOURCE_SET_LANGUAGES {
                let set_folder = src.join(&set);
                let root = set_folder.join(language);
                if facts.is_own_directory(&set_folder) && facts.is_own_directory(&root) {
                    roots.push(root);
                }
            }
        }
    }
    roots
}

/// Records the file edges and external imports of `sources` in `findings`.
pub fn place_jvm_imports(
    facts: &PathFacts<'_>,
    ignore: &IgnoredNames,
    sources: &[JvmSource],
    findings: &mut Findings,
) {
    if sources.is_empty() {
        return;
    }
    let root = facts.root();
    let absolute = |path: &str| -> PathBuf { resolve_below(root, path) };
    let mut declared_in: HashMap<String, Vec<PathBuf>> = HashMap::new();
    let mut types_by_package: HashMap<&str, HashMap<&str, Vec<PathBuf>>> = HashMap::new();
    let mut source_sets: HashMap<PathBuf, Option<SourceSet>> = HashMap::new();
    let mut roots: HashSet<PathBuf> = HashSet::new();
    for source in sources {
        let package = source.file.package.as_deref();
        if let Some(found) = source_root_of(&source.path, package) {
            roots.insert(if found == "." {
                root.to_path_buf()
            } else {
                absolute(&found)
            });
        }
        source_sets.insert(absolute(&source.path), source_set_of(&source.path));
        for name in &source.file.declarations {
            let qualified = match package {
                Some(package) => format!("{package}.{name}"),
                None => name.clone(),
            };
            declared_in
                .entry(qualified)
                .or_default()
                .push(absolute(&source.path));
        }
        let Some(package) = package else {
            continue;
        };
        let by_name = types_by_package.entry(package).or_default();
        for name in &source.file.types {
            by_name
                .entry(name)
                .or_default()
                .push(absolute(&source.path));
        }
    }
    roots.extend(discover_source_roots(facts, ignore));
    let mut source_roots: Vec<PathBuf> = roots.into_iter().collect();
    source_roots.sort_by(|left, right| {
        answer_format::utf16::compare(&left.to_string_lossy(), &right.to_string_lossy())
    });

    let mut roots_holding: HashMap<String, Vec<PathBuf>> = HashMap::new();
    roots_holding.insert(String::new(), source_roots.clone());
    let mut resolved: HashMap<String, Vec<PathBuf>> = HashMap::new();
    let mut seen: HashSet<(String, String)> = HashSet::new();

    let mut resolver = TypeResolver {
        facts,
        declared_in: &declared_in,
        source_roots: &source_roots,
        roots_holding: &mut roots_holding,
        narrow_by_folder: !facts.files().answers_from_census(),
    };
    for source in sources {
        let from = &source.path;
        for import in &source.file.imports {
            let key = format!("{}{}", if import.wildcard { "*" } else { "" }, import.spec);
            let targets = resolved
                .entry(key)
                .or_insert_with(|| resolver.targets_of(import));
            if targets.is_empty() {
                findings.leads_outside(
                    from,
                    &if import.wildcard {
                        format!("{}.*", import.spec)
                    } else {
                        import.spec.clone()
                    },
                );
                continue;
            }
            for target in targets {
                add_edge(facts, ignore, findings, &mut seen, from, target);
            }
        }
        let same_package = same_package_targets(
            &source.file,
            &absolute(&source.path),
            &types_by_package,
            &source_sets,
        );
        for target in same_package {
            add_edge(facts, ignore, findings, &mut seen, from, &target);
        }
    }
}

fn add_edge(
    facts: &PathFacts<'_>,
    ignore: &IgnoredNames,
    findings: &mut Findings,
    seen: &mut HashSet<(String, String)>,
    from: &str,
    target: &Path,
) {
    let Some(to) = facts.relative(target) else {
        return;
    };
    if to == from || ignore.hides(&to) {
        return;
    }
    if seen.insert((from.to_string(), to.clone())) {
        findings.edge(from, &to, ImportKind::Static, ImportUsage::Value);
    }
}

struct TypeResolver<'a, 'facts, 'files> {
    facts: &'facts PathFacts<'files>,
    declared_in: &'a HashMap<String, Vec<PathBuf>>,
    source_roots: &'a [PathBuf],
    roots_holding: &'a mut HashMap<String, Vec<PathBuf>>,
    /// A census is never asked about a folder the walk did not reach, so a type file is looked
    /// for under every source root instead of under the roots that hold its package folder.
    narrow_by_folder: bool,
}

impl TypeResolver<'_, '_, '_> {
    fn targets_of(&mut self, import: &JvmImport) -> Vec<PathBuf> {
        let parts: Vec<&str> = import.spec.split('.').collect();
        if parts.len() > MAX_IMPORT_SEGMENTS || parts.iter().any(|part| !is_plain_part(part)) {
            return Vec::new();
        }
        let mut targets = self.type_files(&parts);
        if targets.is_empty() && import.wildcard {
            targets = self.package_folders(&parts);
        }
        targets
    }

    /// The roots that hold the folder `segments` names, narrowed one segment at a time and
    /// remembered, so a library import costs one folder probe per root.
    fn roots_with_folder(&mut self, segments: &[&str]) -> Vec<PathBuf> {
        let key = segments.join("/");
        if let Some(held) = self.roots_holding.get(&key) {
            return held.clone();
        }
        let Some((_, parent_segments)) = segments.split_last() else {
            return Vec::new();
        };
        let parent = self.roots_with_folder(parent_segments);
        let held: Vec<PathBuf> = parent
            .into_iter()
            .filter(|root| {
                let mut path = root.clone();
                for segment in segments {
                    path.push(segment);
                }
                self.facts.is_directory(&path)
            })
            .collect();
        self.roots_holding.insert(key, held.clone());
        held
    }

    fn type_files(&mut self, parts: &[&str]) -> Vec<PathBuf> {
        for length in (2..=parts.len()).rev() {
            let named = parts.get(..length).unwrap_or_default();
            if let Some(declared) = self.declared_in.get(&named.join(".")) {
                return declared.clone();
            }
            let folder = parts.get(..length - 1).unwrap_or_default();
            let roots = if self.narrow_by_folder {
                self.roots_with_folder(folder)
            } else {
                self.source_roots.to_vec()
            };
            for root in roots {
                for extension in JVM_EXTENSIONS {
                    let mut file = root.clone();
                    for part in named {
                        file.push(part);
                    }
                    let mut name = file.into_os_string();
                    name.push(extension);
                    let file = PathBuf::from(name);
                    if self.facts.is_own_file(&file) {
                        return vec![file];
                    }
                }
            }
        }
        Vec::new()
    }

    fn package_folders(&self, parts: &[&str]) -> Vec<PathBuf> {
        self.source_roots
            .iter()
            .map(|root| {
                let mut path = root.clone();
                for part in parts {
                    path.push(part);
                }
                path
            })
            .filter(|folder| self.facts.is_own_directory(folder))
            .collect()
    }
}

/// A name a path may hold: not empty, not a way up, no separator or NUL (a Kotlin name in
/// backticks may spell anything).
fn is_plain_part(part: &str) -> bool {
    !part.is_empty() && part != "." && part != ".." && !part.contains(['/', '\\', '\0'])
}

/// Files of the same package declaring a type this file names without importing it, matched by
/// name. Only the file's own module is searched, since another module's copy of the package may
/// not be on its class path; there a twin in the file's own source set wins, and code outside
/// tests never reaches a test set.
fn same_package_targets(
    file: &JvmFile,
    absolute_path: &Path,
    types_by_package: &HashMap<&str, HashMap<&str, Vec<PathBuf>>>,
    source_sets: &HashMap<PathBuf, Option<SourceSet>>,
) -> Vec<PathBuf> {
    let Some(package_types) = file
        .package
        .as_deref()
        .and_then(|package| types_by_package.get(package))
    else {
        return Vec::new();
    };
    let imported: HashSet<&str> = file
        .imports
        .iter()
        .filter(|import| !import.wildcard)
        .map(|import| {
            import
                .alias
                .as_deref()
                .unwrap_or_else(|| import.spec.rsplit('.').next().unwrap_or(&import.spec))
        })
        .collect();
    let set_of = |path: &Path| source_sets.get(path).and_then(Option::as_ref);
    let own = set_of(absolute_path);
    let mut targets = Vec::new();
    for name in &file.type_references {
        if imported.contains(name.as_str()) {
            continue;
        }
        let Some(candidates) = package_types.get(name.as_str()) else {
            continue;
        };
        let declaring: Vec<&PathBuf> = candidates
            .iter()
            .filter(|candidate| candidate.as_path() != absolute_path)
            .filter(|candidate| visible(own, set_of(candidate)))
            .collect();
        let same_set: Vec<&PathBuf> = declaring
            .iter()
            .copied()
            .filter(|candidate| match (own, set_of(candidate)) {
                (Some(own), Some(other)) => own.set == other.set,
                (None, None) => true,
                _ => false,
            })
            .collect();
        let chosen = if same_set.is_empty() {
            declaring
        } else {
            same_set
        };
        targets.extend(chosen.into_iter().cloned());
    }
    targets
}

fn visible(own: Option<&SourceSet>, other: Option<&SourceSet>) -> bool {
    match (own, other) {
        (Some(own), Some(other)) => {
            other.module == own.module && (is_test_set(&own.set) || !is_test_set(&other.set))
        }
        (None, None) => true,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bounded_parse::{parse_bounded, ParseLimits};
    use crate::jvm_declarations::read_jvm_source;
    use crate::planted_tree::PlantedTree;
    use crate::source_language::SourceLanguage;

    fn scan(files: &[(&str, &str)]) -> Findings {
        let tree = PlantedTree::new(files);
        let source = tree.source();
        let facts = PathFacts::new(&source);
        let sources: Vec<JvmSource> = files
            .iter()
            .map(|(name, text)| {
                let kotlin = name.ends_with(".kt");
                let language = if kotlin {
                    SourceLanguage::Kotlin
                } else {
                    SourceLanguage::Java
                };
                let parsed = parse_bounded(language, text, ParseLimits::for_imports(1 << 20))
                    .expect("parses");
                let base = name.rsplit('/').next().expect("name");
                JvmSource {
                    path: (*name).to_string(),
                    file: read_jvm_source(&parsed, base, kotlin).expect("in time"),
                }
            })
            .collect();
        let mut findings = Findings::default();
        place_jvm_imports(&facts, &IgnoredNames::defaults(), &sources, &mut findings);
        findings
    }

    #[test]
    fn imports_resolve_to_declaring_files_and_a_library_is_external() {
        let findings = scan(&[
            ("app/src/main/java/com/acme/A.java", "package com.acme;\nimport com.acme.util.Helper;\nimport java.util.List;\nimport com.acme.util.*;\nclass A { B b; }\n"),
            ("app/src/main/java/com/acme/B.java", "package com.acme;\nclass B {}\n"),
            ("app/src/main/java/com/acme/util/Helper.java", "package com.acme.util;\nclass Helper {}\n"),
        ]);
        let edges: Vec<_> = findings
            .edges
            .iter()
            .map(|e| (e.from.as_str(), e.to.as_str()))
            .collect();
        assert_eq!(
            edges,
            [
                ("app/src/main/java/com/acme/A.java", "app/src/main/java/com/acme/util/Helper.java"),
                ("app/src/main/java/com/acme/A.java", "app/src/main/java/com/acme/util"),
                ("app/src/main/java/com/acme/A.java", "app/src/main/java/com/acme/B.java"),
            ],
            "the explicit import, the wildcard's package folder, then B by name in the same package"
        );
        assert_eq!(findings.external[0].spec, "java.util.List");
    }

    #[test]
    fn a_test_source_set_reaches_main_but_main_never_reaches_a_test_twin() {
        let findings = scan(&[
            (
                "m/src/main/java/p/Main.java",
                "package p;\nclass Main { Helper h; }\n",
            ),
            (
                "m/src/main/java/p/Helper.java",
                "package p;\nclass Helper {}\n",
            ),
            (
                "m/src/test/java/p/Helper.java",
                "package p;\nclass Helper {}\n",
            ),
            (
                "m/src/test/java/p/MainTest.java",
                "package p;\nclass MainTest { Main m; Helper h; }\n",
            ),
        ]);
        let edges: Vec<_> = findings
            .edges
            .iter()
            .map(|e| (e.from.as_str(), e.to.as_str()))
            .collect();
        assert!(edges.contains(&(
            "m/src/main/java/p/Main.java",
            "m/src/main/java/p/Helper.java"
        )));
        assert!(!edges.contains(&(
            "m/src/main/java/p/Main.java",
            "m/src/test/java/p/Helper.java"
        )));
        assert!(edges.contains(&(
            "m/src/test/java/p/MainTest.java",
            "m/src/test/java/p/Helper.java"
        )));
        assert!(!edges.contains(&(
            "m/src/test/java/p/MainTest.java",
            "m/src/main/java/p/Helper.java"
        )));
    }
}
