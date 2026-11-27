//! Which module a source file belongs to, named as the ontology names it: `elements/<flat-name>`
//! or `capabilities/<name>`, the same slugs `analyze_repo_structure` gives, so import evidence
//! lines up with the concepts a vault already holds.
//!
//! The first segment decides: a workspace package, a Python package at the root or under a source
//! folder, or a source folder whose next segment names the module (`features/x` is a capability,
//! `entities/x` an element, a support layer such as `utils/` is the file's own name).

use crate::path_facts::PathFacts;
use crate::source_walk::{is_module_extension, MODULE_EXTENSIONS, RUST_EXTENSION};
use crate::workspace_packages::WorkspacePackage;
use answer_format::collation::compare_text;

const SUPPORT_ELEMENT_BUCKETS: [&str; 20] = [
    "app",
    "apps",
    "domain",
    "domains",
    "helper",
    "helpers",
    "integration",
    "integrations",
    "infra",
    "infrastructure",
    "lib",
    "libs",
    "report",
    "reports",
    "shared",
    "storage",
    "store",
    "stores",
    "util",
    "utils",
];

/// The module of a root-relative file, or `None` for a file that is no module of a module graph.
pub fn module_of(
    facts: &PathFacts<'_>,
    file_path: &str,
    source_folders: &[String],
    workspace_packages: &[WorkspacePackage],
) -> Option<String> {
    let parts: Vec<&str> = file_path.split(['/', '\\']).collect();
    let last = *parts.last()?;
    let extension = extname(last);
    if !is_module_extension(extension) {
        return None;
    }
    if let Some(package) = workspace_package_for_file(file_path, workspace_packages) {
        return Some(format!("elements/{}", package.slug));
    }
    let exists = |segments: &[&str]| {
        let mut path = facts.root().to_path_buf();
        for segment in segments {
            path.push(segment);
        }
        facts.kind(&path).is_some()
    };
    let first = parts.first().copied().unwrap_or("");
    let second = parts.get(1).copied();
    let third = parts.get(2).copied();
    if let (Some(second), Some(third)) = (second, third) {
        if source_folder_starts_at(first, source_folders) && exists(&[first, second, "__init__.py"])
        {
            let raw_name = if third == "__init__.py" {
                second
            } else {
                strip_source_extension(third)
            };
            return non_empty(flat_python_name(raw_name)).map(|name| format!("elements/{name}"));
        }
    }
    if let Some(second) = second {
        if exists(&[first, "__init__.py"]) {
            let raw_name = if second == "__init__.py" {
                first
            } else {
                strip_source_extension(second)
            };
            return non_empty(flat_python_name(raw_name)).map(|name| format!("elements/{name}"));
        }
    }
    let next = second.filter(|_| source_folder_starts_at(first, source_folders))?;
    let folder = first;
    if extension == RUST_EXTENSION {
        return non_empty(ontology_source_name(next)).map(|name| format!("elements/{name}"));
    }
    if (folder == "apps" || folder == "packages") && exists(&[folder, next, "package.json"]) {
        let collides = folder == "packages" && exists(&["apps", next, "package.json"]);
        return Some(format!(
            "elements/{}",
            if collides {
                format!("packages-{next}")
            } else {
                next.to_string()
            }
        ));
    }
    let named_third = third.filter(|name| !name.is_empty());
    if let (true, Some(third)) = (next == "features", named_third) {
        return Some(format!("capabilities/{}", ontology_source_name(third)));
    }
    const ELEMENT_BUCKETS: [&str; 3] = ["entities", "widgets", "views"];
    if let (true, Some(third)) = (ELEMENT_BUCKETS.contains(&next), named_third) {
        let name = ontology_source_name(third);
        let collides = ELEMENT_BUCKETS
            .iter()
            .filter(|bucket| exists(&[folder, bucket, &name]))
            .count()
            > 1;
        let singular = if let Some(stem) = next.strip_suffix("ies") {
            format!("{stem}y")
        } else {
            next.strip_suffix('s').unwrap_or(next).to_string()
        };
        return Some(format!(
            "elements/{}",
            if collides {
                format!("{name}-{singular}")
            } else {
                name
            }
        ));
    }
    if SUPPORT_ELEMENT_BUCKETS.contains(&next) && named_third.is_some() {
        return Some(format!("elements/{}", ontology_source_name(last)));
    }
    if is_module_extension(extname(next)) {
        return non_empty(ontology_source_name(next)).map(|name| format!("elements/{name}"));
    }
    if folder == "lib" {
        return non_empty(ontology_source_name(next)).map(|name| format!("elements/{name}"));
    }
    Some(format!("capabilities/{next}"))
}

fn non_empty(name: String) -> Option<String> {
    (!name.is_empty()).then_some(name)
}

/// `.ts` of `a.test.ts`; empty for a name with no dot (and for one whose only dot leads).
fn extname(name: &str) -> &str {
    match name.rfind('.') {
        Some(dot) if dot > 0 => &name[dot..],
        _ => "",
    }
}

fn workspace_package_for_file<'a>(
    file_path: &str,
    packages: &'a [WorkspacePackage],
) -> Option<&'a WorkspacePackage> {
    packages
        .iter()
        .filter(|package| {
            file_path == package.path
                || file_path
                    .strip_prefix(package.path.as_str())
                    .is_some_and(|rest| rest.starts_with('/'))
        })
        .min_by(|left, right| {
            right
                .path
                .len()
                .cmp(&left.path.len())
                .then_with(|| compare_text(&left.path, &right.path))
        })
}

fn source_folder_starts_at(segment: &str, source_folders: &[String]) -> bool {
    source_folders.iter().any(|folder| {
        folder
            .split(['/', '\\'])
            .find(|part| !part.is_empty())
            .is_some_and(|first| first == segment)
    })
}

fn strip_source_extension(segment: &str) -> &str {
    for extension in MODULE_EXTENSIONS.iter().chain([&RUST_EXTENSION]) {
        if let Some(stem) = segment.strip_suffix(extension) {
            return stem;
        }
    }
    segment
}

fn flat_python_name(raw: &str) -> String {
    raw.replace('_', "-")
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || *character == '-')
        .collect::<String>()
        .to_ascii_lowercase()
}

fn ontology_source_name(segment: &str) -> String {
    let stem = strip_source_extension(segment);
    let lowered = stem.to_lowercase();
    let stem = if lowered.ends_with(".test") || lowered.ends_with(".spec") {
        &stem[..stem.len() - ".test".len()]
    } else {
        stem
    };
    let mut flat = String::new();
    let mut in_separator = false;
    for character in stem.chars() {
        if character == '_' || character == '.' || character.is_whitespace() {
            if !in_separator {
                flat.push('-');
            }
            in_separator = true;
        } else {
            flat.push(character);
            in_separator = false;
        }
    }
    flat.chars()
        .filter(|character| character.is_ascii_alphanumeric() || *character == '-')
        .collect::<String>()
        .to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::planted_tree::PlantedTree;

    fn module(files: &[&str], path: &str, packages: &[WorkspacePackage]) -> Option<String> {
        let planted: Vec<(&str, &str)> = files.iter().map(|name| (*name, "")).collect();
        let tree = PlantedTree::new(&planted);
        let source = tree.source();
        let folders: Vec<String> = ["src", "lib", "apps", "packages"]
            .iter()
            .map(|folder| (*folder).to_string())
            .collect();
        module_of(&PathFacts::new(&source), path, &folders, packages)
    }

    #[test]
    fn a_layer_folder_names_its_module_the_way_the_ontology_does() {
        let files = ["src/entities/user/a.ts", "src/widgets/user/b.ts"];
        assert_eq!(
            module(&files, "src/features/Check_In/x.ts", &[]).as_deref(),
            Some("capabilities/check-in")
        );
        assert_eq!(
            module(&files, "src/entities/user/a.ts", &[]).as_deref(),
            Some("elements/user-entity")
        );
        assert_eq!(
            module(&files, "src/utils/deep/string_tools.test.ts", &[]).as_deref(),
            Some("elements/string-tools")
        );
        assert_eq!(
            module(&files, "src/billing/x.ts", &[]).as_deref(),
            Some("capabilities/billing")
        );
        assert_eq!(
            module(&files, "lib/net/x.ts", &[]).as_deref(),
            Some("elements/net")
        );
        assert_eq!(module(&files, "README.md", &[]), None);
        assert_eq!(module(&files, "scripts/x.ts", &[]), None);
    }

    #[test]
    fn a_workspace_package_and_a_python_package_win_over_the_folder_rule() {
        let package = WorkspacePackage {
            path: "packages/core".into(),
            name: Some("@acme/core".into()),
            slug: "core".into(),
        };
        assert_eq!(
            module(&[], "packages/core/src/x.ts", &[package]).as_deref(),
            Some("elements/core")
        );
        assert_eq!(
            module(&["pkg/__init__.py"], "pkg/data_loader.py", &[]).as_deref(),
            Some("elements/data-loader")
        );
    }
}
