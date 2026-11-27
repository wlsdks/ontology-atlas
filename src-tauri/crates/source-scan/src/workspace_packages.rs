//! The packages a repository declares as one workspace (`pnpm-workspace.yaml`, the `workspaces`
//! of `package.json`), as evidence of where source lives and which names are local packages.
//! Package names and manifests decide which roots and aliases are safe to read, never what
//! anything means.

use std::collections::BTreeSet;
use std::path::Path;

use confined_files::SourceFiles;

use crate::config_json::Json;
use crate::path_facts::{resolve_below, PathFacts};
use crate::source_walk::{list_sorted, IgnoredNames};

const DISCOVERY_MAX_ENTRIES: usize = 10_000;
const PACKAGE_LIMIT: usize = 500;
const MANIFEST_MAX_BYTES: usize = 256 * 1024;
const PATTERN_LIMIT: usize = 64;
const PATTERN_MAX_SEGMENTS: usize = 24;
const PATTERN_MAX_GLOBSTARS: usize = 2;
const PATTERN_MAX_WILDCARDS: usize = 16;
const PATTERN_MATCH_STATE_LIMIT: usize = 250_000;
/// No repository nests packages this deep; the cap keeps the walk's stack small.
const DISCOVERY_MAX_DEPTH: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspacePackage {
    /// Below the repository root, `/`-separated; `.` for the root itself.
    pub path: String,
    pub name: Option<String>,
    /// The name an ontology element for this package would carry.
    pub slug: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WorkspaceDiscovery {
    /// Whether the repository declares a workspace at all, even one that matches no package.
    pub has_declaration: bool,
    pub packages: Vec<WorkspacePackage>,
}

#[derive(Debug, Clone)]
struct Pattern {
    text: String,
    exclude: bool,
}

pub fn discover_workspace_packages(facts: &PathFacts<'_>, ignore: &IgnoredNames) -> WorkspaceDiscovery {
    let (has_declaration, patterns) = read_declarations(facts);
    if patterns.is_empty() {
        return WorkspaceDiscovery {
            has_declaration,
            packages: Vec::new(),
        };
    }
    let (included, excluded): (Vec<&Pattern>, Vec<&Pattern>) =
        patterns.iter().partition(|pattern| !pattern.exclude);
    let mut candidates = package_directories(facts, ignore);
    for declaration in &included {
        if let Some(literal) = declared_literal_package(facts, ignore, &declaration.text) {
            if !candidates.iter().any(|candidate| candidate.path == literal.path) {
                candidates.push(literal);
            }
        }
    }
    let mut budget = MatchBudget::of(PATTERN_MATCH_STATE_LIMIT);
    let mut packages: Vec<Candidate> = Vec::new();
    'candidates: for candidate in candidates {
        let mut matches_an_include = false;
        for declaration in &included {
            if pattern_matches(&declaration.text, &candidate.path, &mut budget) {
                matches_an_include = true;
            }
            if budget.exhausted {
                break 'candidates;
            }
        }
        if !matches_an_include {
            continue;
        }
        let mut is_excluded = false;
        for declaration in &excluded {
            if pattern_matches(&declaration.text, &candidate.path, &mut budget) {
                is_excluded = true;
            }
            if budget.exhausted {
                break 'candidates;
            }
            if is_excluded {
                break;
            }
        }
        if !is_excluded {
            packages.push(candidate);
        }
    }
    packages.sort_by(|left, right| answer_format::collation::compare_text(&left.path, &right.path));
    packages.truncate(PACKAGE_LIMIT);
    WorkspaceDiscovery {
        has_declaration: true,
        packages: assign_slugs(packages),
    }
}

#[derive(Debug, Clone)]
struct Candidate {
    path: String,
    name: Option<String>,
}

/// `(declared at all, the normalized patterns)`.
fn read_declarations(facts: &PathFacts<'_>) -> (bool, Vec<Pattern>) {
    let mut raw: Vec<String> = Vec::new();
    let mut has_declaration = false;
    let pnpm = facts.root().join("pnpm-workspace.yaml");
    if facts.kind(&pnpm).is_some() {
        has_declaration = true;
        raw.extend(read_pnpm_patterns(facts.files(), &pnpm));
    }
    let package = facts.root().join("package.json");
    if facts.kind(&package).is_some() {
        if let Some(patterns) = read_node_patterns(facts.files(), &package) {
            has_declaration = true;
            raw.extend(patterns);
        }
    }
    if raw.len() > PATTERN_LIMIT {
        // Past the budget a later exclusion could be dropped and a prefix could re-admit a
        // package it removes, so discovery fails closed.
        return (has_declaration, Vec::new());
    }
    let patterns = raw
        .into_iter()
        .filter_map(|text| {
            let (text, exclude) = normalize_pattern(&text)?;
            Some(Pattern { text, exclude })
        })
        .collect();
    (has_declaration, patterns)
}

fn read_manifest_text(files: &dyn SourceFiles, path: &Path) -> Option<String> {
    let text = files.read_text(path).ok()?;
    (text.len() <= MANIFEST_MAX_BYTES).then(|| text.into_owned())
}

fn read_pnpm_patterns(files: &dyn SourceFiles, path: &Path) -> Vec<String> {
    let Some(text) = read_manifest_text(files, path) else {
        return Vec::new();
    };
    let mut patterns = Vec::new();
    let mut in_packages = false;
    for line in text.lines() {
        if is_key_line(line, Some("packages")) {
            in_packages = true;
            continue;
        }
        if !in_packages {
            continue;
        }
        if is_key_line(line, None) {
            break;
        }
        let Some(item) = line.trim_start().strip_prefix('-') else {
            continue;
        };
        let value = unquote(strip_comment(item.trim()));
        if !value.is_empty() {
            patterns.push(value.to_string());
        }
    }
    patterns
}

/// A line that starts a top-level YAML key: `packages:` when `only` names it, any `key:` when not.
fn is_key_line(line: &str, only: Option<&str>) -> bool {
    if line.starts_with(|character: char| character.is_whitespace()) || line.is_empty() {
        return false;
    }
    let content = strip_comment(line).trim_end();
    let Some(key) = content.strip_suffix(':') else {
        return false;
    };
    match only {
        Some(name) => key == name,
        None => !key.contains(':'),
    }
}

/// The text before the first `#`.
fn strip_comment(text: &str) -> &str {
    text.split('#').next().unwrap_or(text)
}

fn unquote(value: &str) -> &str {
    let trimmed = value.trim();
    for quote in ['\'', '"'] {
        if trimmed.len() >= 2 && trimmed.starts_with(quote) && trimmed.ends_with(quote) {
            return &trimmed[1..trimmed.len() - 1];
        }
    }
    trimmed
}

/// The `workspaces` of a `package.json`, `None` when it has none or the file is not an object.
fn read_node_patterns(files: &dyn SourceFiles, path: &Path) -> Option<Vec<String>> {
    let manifest = Json::parse(&read_manifest_text(files, path)?)?;
    let workspaces = manifest.get("workspaces")?;
    let list = match workspaces {
        Json::List(items) => Some(items.as_slice()),
        other => other.get("packages").and_then(Json::as_list),
    };
    let strings: Option<Vec<String>> = list.and_then(|items| {
        items
            .iter()
            .map(|item| item.as_text().map(str::to_string))
            .collect()
    });
    Some(strings.unwrap_or_default())
}

/// `(pattern, is an exclusion)`; `None` for a pattern that is unsafe or over a limit.
fn normalize_pattern(value: &str) -> Option<(String, bool)> {
    let raw = value.trim();
    let exclude = raw.starts_with('!');
    let body = raw.strip_prefix('!').unwrap_or(raw).replace('\\', "/");
    let drive = body.len() >= 3
        && body.as_bytes().get(1) == Some(&b':')
        && body.as_bytes().get(2) == Some(&b'/')
        && body.as_bytes().first().is_some_and(u8::is_ascii_alphabetic);
    if body.is_empty() || body.starts_with('/') || drive {
        return None;
    }
    let segments: Vec<&str> = body.split('/').collect();
    if segments
        .iter()
        .any(|segment| *segment == ".." || segment.contains('\0'))
    {
        return None;
    }
    let kept: Vec<&str> = segments
        .into_iter()
        .filter(|segment| !segment.is_empty() && *segment != ".")
        .collect();
    let globstars = kept.iter().filter(|segment| **segment == "**").count();
    let wildcards: usize = kept
        .iter()
        .map(|segment| segment.chars().filter(|character| *character == '*').count())
        .sum();
    if kept.len() > PATTERN_MAX_SEGMENTS
        || globstars > PATTERN_MAX_GLOBSTARS
        || wildcards > PATTERN_MAX_WILDCARDS
    {
        return None;
    }
    let text = if kept.is_empty() {
        ".".to_string()
    } else {
        kept.join("/")
    };
    Some((text, exclude))
}

/// Every folder below the root holding a `package.json`, found in a bounded walk.
fn package_directories(facts: &PathFacts<'_>, ignore: &IgnoredNames) -> Vec<Candidate> {
    let mut candidates = Vec::new();
    let mut seen = 0usize;
    visit_folder(facts, ignore, facts.root(), 0, &mut seen, &mut candidates);
    candidates
}

fn visit_folder(
    facts: &PathFacts<'_>,
    ignore: &IgnoredNames,
    directory: &Path,
    depth: usize,
    seen: &mut usize,
    candidates: &mut Vec<Candidate>,
) -> bool {
    let manifest = directory.join("package.json");
    if facts.is_file(&manifest) {
        candidates.push(Candidate {
            path: facts.relative(directory).unwrap_or_default(),
            name: read_package_name(facts, &manifest),
        });
    }
    if depth >= DISCOVERY_MAX_DEPTH {
        return true;
    }
    for (name, kind) in list_sorted(facts.files(), directory) {
        *seen += 1;
        if *seen > DISCOVERY_MAX_ENTRIES {
            return false;
        }
        if ignore.has(&name) || name.starts_with('.') {
            continue;
        }
        if kind == confined_files::EntryKind::Directory
            && !visit_folder(facts, ignore, &directory.join(&name), depth + 1, seen, candidates)
        {
            return false;
        }
    }
    true
}

fn declared_literal_package(
    facts: &PathFacts<'_>,
    ignore: &IgnoredNames,
    pattern: &str,
) -> Option<Candidate> {
    if pattern.contains('*') {
        return None;
    }
    let segments: Vec<&str> = if pattern == "." {
        Vec::new()
    } else {
        pattern.split('/').collect()
    };
    if segments.iter().any(|segment| ignore.has(segment)) {
        return None;
    }
    let package_root = if pattern == "." {
        facts.root().to_path_buf()
    } else {
        resolve_below(facts.root(), pattern)
    };
    if !facts.is_own_directory(&package_root) && package_root != facts.root() {
        return None;
    }
    let manifest = package_root.join("package.json");
    facts.kind(&manifest)?;
    Some(Candidate {
        path: pattern.to_string(),
        name: read_package_name(facts, &manifest),
    })
}

fn read_package_name(facts: &PathFacts<'_>, manifest: &Path) -> Option<String> {
    let text = facts.files().read_text(manifest).ok()?;
    let json = Json::parse(&text)?;
    let name = json.get("name")?.as_text()?;
    (name.trim() == name).then(|| name.to_string())
}

fn assign_slugs(packages: Vec<Candidate>) -> Vec<WorkspacePackage> {
    let bases: Vec<String> = packages.iter().map(base_slug).collect();
    packages
        .into_iter()
        .enumerate()
        .map(|(index, package)| {
            let base = bases.get(index).cloned().unwrap_or_default();
            let shared = bases.iter().filter(|other| **other == base).count() > 1;
            WorkspacePackage {
                slug: if shared { path_slug(&package.path) } else { base },
                path: package.path,
                name: package.name,
            }
        })
        .collect()
}

fn base_slug(package: &Candidate) -> String {
    let from_name = package.name.as_deref().map(without_scope).unwrap_or("");
    let source = if from_name.is_empty() {
        package.path.rsplit('/').next().unwrap_or("")
    } else {
        from_name
    };
    let slug = path_slug(source);
    if slug.is_empty() {
        "workspace-package".to_string()
    } else {
        slug
    }
}

/// `@scope/name` as `name`.
fn without_scope(name: &str) -> &str {
    match name.strip_prefix('@').and_then(|rest| rest.split_once('/')) {
        Some((_, rest)) => rest,
        None => name,
    }
}

/// Runs of anything but ASCII letters and digits become one `-`; the ends are trimmed.
fn path_slug(value: &str) -> String {
    let mut slug = String::new();
    let mut pending_dash = false;
    for character in value.replace('\\', "/").chars() {
        if character.is_ascii_alphanumeric() {
            if pending_dash && !slug.is_empty() {
                slug.push('-');
            }
            pending_dash = false;
            slug.push(character.to_ascii_lowercase());
        } else {
            pending_dash = true;
        }
    }
    slug
}

/// How many steps a pattern match may still take.
struct MatchBudget {
    remaining: usize,
    exhausted: bool,
}

impl MatchBudget {
    fn of(limit: usize) -> Self {
        Self {
            remaining: limit,
            exhausted: false,
        }
    }
}

/// Whether `candidate` (a `/`-separated path) matches `pattern`, with `**` for any number of
/// folders and `*` inside one name. Stops, saying so in `budget`, after too many steps.
fn pattern_matches(pattern: &str, candidate: &str, budget: &mut MatchBudget) -> bool {
    let pattern_segments: Vec<&str> = if pattern == "." {
        Vec::new()
    } else {
        pattern.split('/').collect()
    };
    let path_segments: Vec<&str> = if candidate == "." {
        Vec::new()
    } else {
        candidate.split('/').collect()
    };
    let mut states = close_globstars(BTreeSet::from([0]), &pattern_segments);
    for path_segment in path_segments {
        let mut next = BTreeSet::new();
        for index in &states {
            if budget.remaining == 0 {
                budget.exhausted = true;
                return false;
            }
            budget.remaining -= 1;
            match pattern_segments.get(*index) {
                Some(&"**") => {
                    next.insert(*index);
                }
                Some(segment) if segment_matches(segment, path_segment) => {
                    next.insert(index + 1);
                }
                _ => {}
            }
        }
        states = close_globstars(next, &pattern_segments);
        if states.is_empty() {
            return false;
        }
    }
    states.contains(&pattern_segments.len())
}

fn close_globstars(mut states: BTreeSet<usize>, pattern_segments: &[&str]) -> BTreeSet<usize> {
    for (index, segment) in pattern_segments.iter().enumerate() {
        if *segment == "**" && states.contains(&index) {
            states.insert(index + 1);
        }
    }
    states
}

/// One name against one pattern segment, `*` standing for any run of characters.
fn segment_matches(pattern: &str, value: &str) -> bool {
    if !pattern.contains('*') {
        return pattern == value;
    }
    let mut cursor = 0usize;
    let mut saw_fragment = false;
    let mut final_end = 0usize;
    for fragment in pattern.split('*') {
        if fragment.is_empty() {
            continue;
        }
        let Some(found) = value.get(cursor..).and_then(|rest| rest.find(fragment)) else {
            return false;
        };
        let found = cursor + found;
        if !saw_fragment && !pattern.starts_with('*') && found != 0 {
            return false;
        }
        saw_fragment = true;
        cursor = found + fragment.len();
        final_end = cursor;
    }
    pattern.ends_with('*')
        || if saw_fragment {
            final_end == value.len()
        } else {
            value.is_empty()
        }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn matches(pattern: &str, candidate: &str) -> bool {
        let mut budget = MatchBudget::of(1000);
        pattern_matches(pattern, candidate, &mut budget)
    }

    #[test]
    fn a_pattern_stands_for_names_and_for_any_depth() {
        assert!(matches("packages/*", "packages/ui"));
        assert!(!matches("packages/*", "packages/ui/src"));
        assert!(matches("packages/**", "packages/ui/src"));
        assert!(matches("apps/web-*", "apps/web-admin"));
        assert!(!matches("apps/web-*", "apps/api"));
        assert!(matches(".", "."));
        assert!(matches("**/pkg", "pkg"));
    }

    #[test]
    fn a_pattern_that_escapes_or_is_too_wide_is_not_read() {
        assert_eq!(normalize_pattern("../x"), None);
        assert_eq!(normalize_pattern("/abs"), None);
        assert_eq!(normalize_pattern("C:/abs"), None);
        assert_eq!(normalize_pattern("a/**/b/**/c/**/d"), None);
        assert_eq!(
            normalize_pattern("!./apps\\legacy/"),
            Some(("apps/legacy".to_string(), true))
        );
    }

    #[test]
    fn a_slug_is_the_unscoped_name_unless_two_packages_share_it() {
        let slugs = assign_slugs(vec![
            Candidate {
                path: "packages/ui".into(),
                name: Some("@acme/ui".into()),
            },
            Candidate {
                path: "apps/ui".into(),
                name: None,
            },
            Candidate {
                path: "tools/cli".into(),
                name: Some("@acme/Cli Tool".into()),
            },
        ]);
        let named: Vec<_> = slugs.iter().map(|package| package.slug.as_str()).collect();
        assert_eq!(named, ["packages-ui", "apps-ui", "cli-tool"]);
    }
}
