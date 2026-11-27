//! Where a TypeScript or JavaScript specifier leads: a file of the repository, a package that
//! lives outside it, or nowhere.
//!
//! Relative specifiers are tried against the extensions TypeScript tries (and a `.js` specifier
//! finds the `.ts` source beside it, as NodeNext writes them); `tsconfig.json` `paths`, the
//! `@/` convention and the repository's declared workspace packages come next; anything else is
//! a package. Each distinct specifier is resolved once per scan.

use std::cell::RefCell;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::config_json::Json;
use crate::import_edges::{Findings, UnresolvedReason};
use crate::path_facts::{resolve_below, PathFacts};
use crate::script_imports::ScriptImport;
use crate::source_walk::IgnoredNames;
use crate::workspace_packages::WorkspacePackage;

const RESOLVE_EXTENSIONS: [&str; 8] =
    [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs", ".cjs", ".cts"];

/// One `compilerOptions.paths` entry of the root `tsconfig.json`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PathAlias {
    pattern: String,
    prefix: String,
    suffix: String,
    wildcard: bool,
    targets: Vec<String>,
    base_url: String,
}

/// The aliases of `<root>/tsconfig.json`, longest prefix first; none when the file is absent or
/// is not readable.
pub fn read_tsconfig_aliases(facts: &PathFacts<'_>) -> Vec<PathAlias> {
    let path = facts.root().join("tsconfig.json");
    if facts.kind(&path).is_none() {
        return Vec::new();
    }
    let Some(config) = facts
        .files()
        .read_text(&path)
        .ok()
        .and_then(|text| Json::parse_with_comments(&text))
    else {
        return Vec::new();
    };
    let options = config.get("compilerOptions");
    let base_url = options
        .and_then(|options| options.get("baseUrl"))
        .and_then(Json::as_text)
        .filter(|text| text.trim() == *text)
        .unwrap_or(".")
        .to_string();
    let Some(paths) = options
        .and_then(|options| options.get("paths"))
        .and_then(Json::as_object)
    else {
        return Vec::new();
    };
    let mut aliases: Vec<PathAlias> = paths
        .iter()
        .filter_map(|(pattern, targets)| {
            let targets = targets.as_list()?;
            let star = pattern.find('*');
            Some(PathAlias {
                pattern: pattern.clone(),
                prefix: star
                    .map_or(pattern.as_str(), |index| &pattern[..index])
                    .to_string(),
                suffix: star.map_or("", |index| &pattern[index + 1..]).to_string(),
                wildcard: star.is_some(),
                targets: targets
                    .iter()
                    .filter_map(|target| target.as_text().map(str::to_string))
                    .collect(),
                base_url: base_url.clone(),
            })
        })
        .collect();
    aliases.sort_by(|left, right| {
        right
            .prefix
            .len()
            .cmp(&left.prefix.len())
            .then_with(|| answer_format::collation::compare_text(&left.pattern, &right.pattern))
    });
    aliases
}

/// The place a specifier leads.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Placement {
    /// A file of the repository.
    File(PathBuf),
    /// Not this kind of specifier.
    NotMine,
    /// Named a local place that holds nothing, or one the root will not show.
    Missing,
    /// A package that is not in the repository.
    Package,
}

pub struct ScriptResolver<'facts, 'files> {
    facts: &'facts PathFacts<'files>,
    aliases: Vec<PathAlias>,
    workspace: Vec<WorkspacePackage>,
    relative: RefCell<HashMap<(PathBuf, String), Option<PathBuf>>>,
    named: RefCell<HashMap<String, Placement>>,
}

impl<'facts, 'files> ScriptResolver<'facts, 'files> {
    pub fn new(
        facts: &'facts PathFacts<'files>,
        aliases: Vec<PathAlias>,
        workspace: Vec<WorkspacePackage>,
    ) -> Self {
        Self {
            facts,
            aliases,
            workspace,
            relative: RefCell::default(),
            named: RefCell::default(),
        }
    }

    /// Records what `import` of `file` leads to in `findings`. An edge into a folder the scan
    /// ignores is dropped without a word.
    pub fn place(
        &self,
        findings: &mut Findings,
        ignore: &IgnoredNames,
        file: &Path,
        from: &str,
        import: &ScriptImport,
    ) {
        let spec = import.specifier.as_str();
        if spec.is_empty() {
            findings.could_not_place(from, spec, UnresolvedReason::Empty);
            return;
        }
        if spec.starts_with('.') || is_absolute_specifier(spec) {
            let directory = file.parent().unwrap_or(self.facts.root());
            match self.relative_target(spec, directory) {
                Some(target) => self.edge(findings, ignore, from, &target, import),
                None => findings.could_not_place(from, spec, UnresolvedReason::RelativeNotFound),
            }
            return;
        }
        let placement = self.named_placement(spec);
        match placement {
            Placement::File(target) => self.edge(findings, ignore, from, &target, import),
            Placement::Missing => {
                findings.could_not_place(from, spec, UnresolvedReason::AliasNotFound)
            }
            Placement::Package | Placement::NotMine => findings.leads_outside(from, spec),
        }
    }

    fn edge(
        &self,
        findings: &mut Findings,
        ignore: &IgnoredNames,
        from: &str,
        target: &Path,
        import: &ScriptImport,
    ) {
        let Some(to) = self.facts.relative(target) else {
            return;
        };
        if ignore.hides(&to) {
            return;
        }
        findings.edge(from, &to, import.kind, import.usage);
    }

    fn relative_target(&self, spec: &str, directory: &Path) -> Option<PathBuf> {
        let key = (directory.to_path_buf(), spec.to_string());
        if let Some(known) = self.relative.borrow().get(&key) {
            return known.clone();
        }
        let found = resolve_relative(self.facts, spec, directory);
        self.relative.borrow_mut().insert(key, found.clone());
        found
    }

    fn named_placement(&self, spec: &str) -> Placement {
        if let Some(known) = self.named.borrow().get(spec) {
            return known.clone();
        }
        let placement = match self.workspace_placement(spec) {
            Placement::NotMine => self.alias_placement(spec),
            decided => decided,
        };
        self.named
            .borrow_mut()
            .insert(spec.to_string(), placement.clone());
        placement
    }

    /// The workspace package that owns `spec`: the longest name that is the spec or a folder of
    /// it. Its entry points are the manifest's, then the usual source folders.
    fn workspace_placement(&self, spec: &str) -> Placement {
        let owner = self
            .workspace
            .iter()
            .filter_map(|package| {
                let name = package.name.as_deref().filter(|name| !name.is_empty())?;
                (spec == name
                    || spec
                        .strip_prefix(name)
                        .is_some_and(|rest| rest.starts_with('/')))
                .then_some((package, name))
            })
            .min_by(|left, right| {
                right.1.len().cmp(&left.1.len()).then_with(|| {
                    answer_format::collation::compare_text(&left.0.path, &right.0.path)
                })
            });
        let Some((package, name)) = owner else {
            return Placement::NotMine;
        };
        let root = self.facts.root();
        let package_root = if package.path == "." {
            root.to_path_buf()
        } else {
            resolve_below(root, &package.path)
        };
        if self.facts.kind(&package_root).is_none() {
            return Placement::Missing;
        }
        let subpath = spec[name.len()..].trim_start_matches('/');
        let candidates = if subpath.is_empty() {
            self.entry_candidates(&package_root, "")
        } else {
            let mut found = self.entry_candidates(&package_root, subpath);
            for folder in ["", "src", "source", "lib"] {
                found.push(resolve_below(&package_root, &join_name(folder, subpath)));
            }
            found
        };
        let mut denied = false;
        for candidate in candidates {
            let Some(resolved) = resolve_candidate(self.facts, &candidate) else {
                continue;
            };
            if resolved.starts_with(&package_root) {
                return Placement::File(resolved);
            }
            denied = true;
        }
        if denied {
            Placement::Missing
        } else {
            Placement::Package
        }
    }

    fn entry_candidates(&self, package_root: &Path, subpath: &str) -> Vec<PathBuf> {
        let mut candidates: Vec<PathBuf> = Vec::new();
        let manifest = self
            .facts
            .files()
            .read_text(&package_root.join("package.json"))
            .ok()
            .and_then(|text| Json::parse(&text));
        if let Some(manifest) = &manifest {
            if subpath.is_empty() {
                for field in ["source", "module", "main", "types"] {
                    if let Some(entry) = manifest.get(field).and_then(Json::as_text) {
                        candidates.push(resolve_below(package_root, entry));
                    }
                }
            }
            for entry in export_entries(manifest.get("exports"), subpath) {
                candidates.push(resolve_below(package_root, &entry));
            }
        }
        if subpath.is_empty() {
            for folder in ["src", "source", "lib", ""] {
                candidates.push(resolve_below(package_root, &join_name(folder, "index")));
            }
        }
        let mut seen = std::collections::HashSet::new();
        candidates.retain(|candidate| seen.insert(candidate.clone()));
        candidates
    }

    /// `tsconfig.json` `paths` (the first alias that matches decides), then the `@/` convention.
    fn alias_placement(&self, spec: &str) -> Placement {
        for alias in &self.aliases {
            let Some(wildcard_value) = alias.match_value(spec) else {
                continue;
            };
            for target in &alias.targets {
                let mapped = match target.find('*') {
                    Some(star) => {
                        format!("{}{wildcard_value}{}", &target[..star], &target[star + 1..])
                    }
                    None => target.clone(),
                };
                let base =
                    resolve_below(&resolve_below(self.facts.root(), &alias.base_url), &mapped);
                if let Some(resolved) = resolve_candidate(self.facts, &base) {
                    return Placement::File(resolved);
                }
            }
            return Placement::Missing;
        }
        let Some(sub_path) = spec.strip_prefix("@/") else {
            return Placement::NotMine;
        };
        for folder in ["src", "lib", "app"] {
            let base = resolve_below(self.facts.root(), &join_name(folder, sub_path));
            if let Some(resolved) = resolve_candidate(self.facts, &base) {
                return Placement::File(resolved);
            }
        }
        Placement::Missing
    }
}

impl PathAlias {
    /// What the `*` stands for in `spec`, or `None` when the alias does not apply. An alias
    /// without a star applies to its own pattern only.
    fn match_value(&self, spec: &str) -> Option<String> {
        if !self.wildcard {
            return (spec == self.pattern).then(String::new);
        }
        let middle = spec
            .strip_prefix(self.prefix.as_str())?
            .strip_suffix(self.suffix.as_str())?;
        Some(middle.to_string())
    }
}

fn join_name(folder: &str, name: &str) -> String {
    if folder.is_empty() {
        name.to_string()
    } else {
        format!("{folder}/{name}")
    }
}

/// `/x`, `\x` and `C:\x`: a path of its own, on every platform, as the specifier was written.
fn is_absolute_specifier(spec: &str) -> bool {
    spec.starts_with('/')
        || spec.starts_with('\\')
        || Path::new(spec).is_absolute()
        || (spec.len() >= 3
            && spec.as_bytes().get(1) == Some(&b':')
            && matches!(spec.as_bytes().get(2), Some(b'/' | b'\\'))
            && spec.as_bytes().first().is_some_and(u8::is_ascii_alphabetic))
}

/// The file `base` names: itself, with an extension, or the index of the folder it names.
fn resolve_candidate(facts: &PathFacts<'_>, base: &Path) -> Option<PathBuf> {
    if facts.is_file(base) {
        return Some(base.to_path_buf());
    }
    for extension in RESOLVE_EXTENSIONS {
        let candidate = with_suffix(base, extension);
        if facts.is_file(&candidate) {
            return Some(candidate);
        }
    }
    index_of_folder(facts, base)
}

fn index_of_folder(facts: &PathFacts<'_>, folder: &Path) -> Option<PathBuf> {
    if !facts.is_directory(folder) {
        return None;
    }
    RESOLVE_EXTENSIONS
        .iter()
        .map(|extension| folder.join(format!("index{extension}")))
        .find(|candidate| facts.is_file(candidate))
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut text = path.as_os_str().to_os_string();
    text.push(suffix);
    PathBuf::from(text)
}

/// A relative specifier. A `.js` specifier also finds the `.ts` source beside it, since
/// TypeScript's NodeNext writes the runtime name in the source.
fn resolve_relative(facts: &PathFacts<'_>, spec: &str, directory: &Path) -> Option<PathBuf> {
    let base = resolve_below(directory, spec);
    if facts.is_file(&base) {
        return Some(base);
    }
    let source_base = strip_runtime_extension(&base);
    for extension in RESOLVE_EXTENSIONS {
        let candidate = with_suffix(&source_base, extension);
        if facts.is_file(&candidate) {
            return Some(candidate);
        }
    }
    index_of_folder(facts, &base)
}

fn strip_runtime_extension(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    let lowered = text.to_lowercase();
    for extension in [".mjs", ".cjs", ".jsx", ".js"] {
        if lowered.ends_with(extension) {
            return PathBuf::from(&text[..text.len() - extension.len()]);
        }
    }
    path.to_path_buf()
}

/// The strings an `exports` field names for `subpath` (`.` when empty), in the order written.
fn export_entries(exports: Option<&Json>, subpath: &str) -> Vec<String> {
    let mut entries = Vec::new();
    match exports {
        Some(Json::Text(text)) if subpath.is_empty() => entries.push(text.clone()),
        Some(Json::Object(members)) => {
            let target = if subpath.is_empty() {
                members.get(".").or(exports)
            } else {
                members.get(&format!("./{subpath}"))
            };
            if let Some(target) = target {
                collect_export_strings(target, &mut entries);
            }
        }
        _ => {}
    }
    entries
}

/// Every string below `value`, nested conditions included, found without recursion.
fn collect_export_strings(value: &Json, entries: &mut Vec<String>) {
    let mut pending = vec![value];
    while let Some(next) = pending.pop() {
        match next {
            Json::Text(text) => entries.push(text.clone()),
            Json::Object(members) => pending.extend(members.values().rev()),
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::import_edges::{ImportKind, ImportUsage};
    use crate::planted_tree::PlantedTree;
    use crate::source_walk::IgnoredNames;

    fn repo(files: &[(&str, &str)]) -> PlantedTree {
        PlantedTree::new(files)
    }

    fn resolve(repo: &PlantedTree, from: &str, spec: &str) -> Findings {
        let source = repo.source();
        let facts = PathFacts::new(&source);
        let aliases = read_tsconfig_aliases(&facts);
        let resolver = ScriptResolver::new(&facts, aliases, Vec::new());
        let mut findings = Findings::default();
        let import = ScriptImport {
            specifier: spec.to_string(),
            kind: ImportKind::Static,
            usage: ImportUsage::Value,
        };
        resolver.place(
            &mut findings,
            &IgnoredNames::defaults(),
            &repo.root().join(from),
            from,
            &import,
        );
        findings
    }

    fn target(findings: &Findings) -> Option<&str> {
        findings.edges.first().map(|edge| edge.to.as_str())
    }

    #[test]
    fn a_relative_specifier_finds_a_file_an_index_or_the_source_beside_a_js_name() {
        let repo = repo(&[
            ("src/a.ts", ""),
            ("src/b.ts", ""),
            ("src/util/index.tsx", ""),
            ("src/c.ts", ""),
        ]);
        assert_eq!(target(&resolve(&repo, "src/a.ts", "./b")), Some("src/b.ts"));
        assert_eq!(
            target(&resolve(&repo, "src/a.ts", "./util")),
            Some("src/util/index.tsx")
        );
        assert_eq!(
            target(&resolve(&repo, "src/a.ts", "./c.js")),
            Some("src/c.ts")
        );
        let missing = resolve(&repo, "src/a.ts", "./nope");
        assert_eq!(
            missing.unresolved[0].reason,
            UnresolvedReason::RelativeNotFound
        );
    }

    #[test]
    fn a_specifier_that_climbs_out_of_the_repository_is_not_found_not_an_edge() {
        let repo = repo(&[("src/a.ts", "")]);
        let climbing = resolve(&repo, "src/a.ts", "../../../../../../etc/hosts");
        assert!(climbing.edges.is_empty());
        assert_eq!(
            climbing.unresolved[0].reason,
            UnresolvedReason::RelativeNotFound
        );
    }

    #[test]
    fn tsconfig_paths_with_comments_and_trailing_commas_and_the_at_slash_convention_resolve() {
        let repo = repo(&[
            (
                "tsconfig.json",
                "{ // paths\n \"compilerOptions\": { \"paths\": { \"~/*\": [\"lib/*\",], }, }, }",
            ),
            ("lib/x.ts", ""),
            ("src/y.ts", ""),
            ("src/a.ts", ""),
        ]);
        assert_eq!(target(&resolve(&repo, "src/a.ts", "~/x")), Some("lib/x.ts"));
        assert_eq!(target(&resolve(&repo, "src/a.ts", "@/y")), Some("src/y.ts"));
        let unknown = resolve(&repo, "src/a.ts", "@/nope");
        assert_eq!(
            unknown.unresolved[0].reason,
            UnresolvedReason::AliasNotFound
        );
        let package = resolve(&repo, "src/a.ts", "left-pad");
        assert_eq!(package.external[0].spec, "left-pad");
    }

    #[test]
    fn a_wildcard_alias_does_not_match_a_specifier_shorter_than_its_prefix_and_suffix() {
        let alias = PathAlias {
            pattern: "a*a".into(),
            prefix: "a".into(),
            suffix: "a".into(),
            wildcard: true,
            targets: Vec::new(),
            base_url: ".".into(),
        };
        assert_eq!(alias.match_value("a"), None);
        assert_eq!(alias.match_value("aba").as_deref(), Some("b"));
    }
}
