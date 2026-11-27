//! Where a Python module leads: the file of this repository that `a.b` names (`a/b.py`, else
//! `a/b/__init__.py`), searched in the root and in each source folder's first segment, or a
//! library outside it.

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use crate::import_edges::{Findings, ImportKind, UnresolvedReason};
use crate::path_facts::PathFacts;
use crate::python_imports::PythonImport;
use crate::source_walk::{list_sorted, IgnoredNames};

/// Packages at the root of a repository that has no source folder: folders with an
/// `__init__.py`, other than tests and anything hidden or ignored.
pub fn discover_root_packages(facts: &PathFacts<'_>, ignore: &IgnoredNames) -> Vec<PathBuf> {
    list_sorted(facts.files(), facts.root())
        .into_iter()
        .filter(|(name, _)| {
            !ignore.has(name)
                && !matches!(name.to_lowercase().as_str(), "test" | "tests")
                && !name.starts_with('.')
        })
        .map(|(name, _)| facts.root().join(name))
        .filter(|path| facts.is_own_directory(path) && facts.is_own_file(&path.join("__init__.py")))
        .collect()
}

pub struct PythonResolver<'facts, 'files> {
    facts: &'facts PathFacts<'files>,
    search_roots: Vec<PathBuf>,
    memo: RefCell<HashMap<String, Option<String>>>,
    seen_edges: RefCell<HashSet<(String, String)>>,
}

impl<'facts, 'files> PythonResolver<'facts, 'files> {
    pub fn new(facts: &'facts PathFacts<'files>, source_folders: &[String]) -> Self {
        let mut first_segments: Vec<&str> = Vec::new();
        for folder in source_folders {
            if let Some(first) = folder.split(['/', '\\']).find(|part| !part.is_empty()) {
                if !first_segments.contains(&first) {
                    first_segments.push(first);
                }
            }
        }
        let mut search_roots = vec![facts.root().to_path_buf()];
        search_roots.extend(
            first_segments
                .into_iter()
                .map(|segment| facts.root().join(segment)),
        );
        Self {
            facts,
            search_roots,
            memo: RefCell::default(),
            seen_edges: RefCell::default(),
        }
    }

    /// The root-relative file a dotted module names; `None` for an empty or relative one.
    fn module_file(&self, module: &str) -> Option<String> {
        if module.is_empty() || module.starts_with('.') {
            return None;
        }
        if let Some(known) = self.memo.borrow().get(module) {
            return known.clone();
        }
        let parts: Vec<&str> = module.split('.').collect();
        let mut found = None;
        for search_root in &self.search_roots {
            let base = parts
                .iter()
                .fold(search_root.clone(), |path, part| path.join(part));
            let file = with_suffix(&base, ".py");
            let entry = base.join("__init__.py");
            let hit = if self.facts.is_own_file(&file) {
                Some(file)
            } else if self.facts.is_own_file(&entry) {
                Some(entry)
            } else {
                None
            };
            if let Some(hit) = hit {
                found = self.facts.relative(&hit);
                break;
            }
        }
        self.memo
            .borrow_mut()
            .insert(module.to_string(), found.clone());
        found
    }

    pub fn place(
        &self,
        findings: &mut Findings,
        ignore: &IgnoredNames,
        file: &Path,
        from: &str,
        import: &PythonImport,
    ) {
        let Some(module) = self.absolute_module(&import.module, file) else {
            findings.could_not_place(from, &import.module, UnresolvedReason::RelativeNotFound);
            return;
        };
        let base = self.module_file(&module);
        let targets: Vec<String> = if import.names.is_empty() {
            base.into_iter().collect()
        } else {
            import
                .names
                .iter()
                .filter_map(|name| {
                    self.module_file(&format!("{module}.{name}"))
                        .or_else(|| base.clone())
                })
                .collect()
        };
        if !targets.is_empty() {
            for target in targets {
                if ignore.hides(&target) {
                    continue;
                }
                if self
                    .seen_edges
                    .borrow_mut()
                    .insert((from.to_string(), target.clone()))
                {
                    findings.edge(from, &target, ImportKind::Static, import.usage);
                }
            }
            return;
        }
        let top_level = module.split('.').next().unwrap_or("");
        if self.module_file(top_level).is_some() {
            findings.could_not_place(from, &import.module, UnresolvedReason::AliasNotFound);
        } else {
            findings.leads_outside(from, &import.module);
        }
    }

    /// `module` with its leading dots resolved against the folder of `file` (one dot is that
    /// folder, each more goes one up); `None` when the dots climb out of the repository.
    fn absolute_module(&self, module: &str, file: &Path) -> Option<String> {
        if !module.starts_with('.') {
            return Some(module.to_string());
        }
        let dots = module
            .chars()
            .take_while(|character| *character == '.')
            .count();
        let suffix = &module[dots..];
        let folder = file.parent().unwrap_or(self.facts.root());
        let relative = self.facts.relative(folder)?;
        let mut parts: Vec<&str> = if relative == "." {
            Vec::new()
        } else {
            relative.split('/').collect()
        };
        let climb = dots.saturating_sub(1);
        if climb > parts.len() {
            return None;
        }
        parts.truncate(parts.len() - climb);
        parts.extend(suffix.split('.').filter(|part| !part.is_empty()));
        Some(parts.join("."))
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
    use crate::import_edges::ImportUsage;
    use crate::planted_tree::PlantedTree;
    use crate::python_imports::PythonImport;

    fn place(files: &[(&str, &str)], from: &str, module: &str, names: &[&str]) -> Findings {
        let tree = PlantedTree::new(files);
        let root = tree.root().to_path_buf();
        let source = tree.source();
        let facts = PathFacts::new(&source);
        let resolver = PythonResolver::new(&facts, &["src".to_string()]);
        let mut findings = Findings::default();
        resolver.place(
            &mut findings,
            &IgnoredNames::defaults(),
            &root.join(from),
            from,
            &PythonImport {
                module: module.to_string(),
                names: names.iter().map(|name| (*name).to_string()).collect(),
                usage: ImportUsage::Value,
            },
        );
        findings
    }

    #[test]
    fn a_module_a_name_taken_from_it_and_a_relative_one_find_their_files() {
        let files = [
            ("pkg/__init__.py", ""),
            ("pkg/a.py", ""),
            ("pkg/sub/__init__.py", ""),
            ("pkg/sub/b.py", ""),
            ("src/lib/__init__.py", ""),
        ];
        let by_name = place(&files, "pkg/a.py", "pkg.sub", &["b", "missing"]);
        let targets: Vec<_> = by_name.edges.iter().map(|edge| edge.to.as_str()).collect();
        assert_eq!(targets, ["pkg/sub/b.py", "pkg/sub/__init__.py"]);
        let relative = place(&files, "pkg/sub/b.py", "..a", &[]);
        assert_eq!(relative.edges[0].to, "pkg/a.py");
        let in_source_folder = place(&files, "pkg/a.py", "lib", &[]);
        assert_eq!(in_source_folder.edges[0].to, "src/lib/__init__.py");
    }

    #[test]
    fn a_library_is_external_and_a_missing_part_of_a_local_package_is_not_found() {
        let files = [("pkg/__init__.py", ""), ("pkg/a.py", "")];
        assert_eq!(place(&files, "pkg/a.py", "os", &[]).external[0].spec, "os");
        let gone = place(&files, "pkg/a.py", "pkg.gone", &[]);
        assert_eq!(gone.unresolved[0].reason, UnresolvedReason::AliasNotFound);
        let too_high = place(&files, "pkg/a.py", "....x", &[]);
        assert_eq!(
            too_high.unresolved[0].reason,
            UnresolvedReason::RelativeNotFound
        );
    }
}
