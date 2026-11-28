//! Vault-to-code path drift: a `path:` or a path-shaped `elements:` entry whose file is no longer
//! in the repository the vault describes. A drifted path is usually a move, so one that has exactly
//! one same-named file elsewhere is offered with it.

use std::collections::HashMap;
use std::path::Path;

use answer_format::collation::compare_text;
use confined_files::SourceFiles;
use serde::Serialize;
use source_scan::{is_module_extension, list_source_files, IgnoredNames};
use vault_document::LoadedDocument;

const ONTOLOGY_SLUG_PREFIXES: [&str; 4] = ["capabilities/", "domains/", "elements/", "documents/"];
const CODE_EXTENSIONS: [&str; 5] = [".ts", ".js", ".mjs", ".tsx", ".json"];
const SUGGESTION_WALK_FILES: usize = 4000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Drift {
    pub slug: String,
    pub kind: String,
    pub key: &'static str,
    #[serde(rename = "missingPath")]
    pub missing_path: String,
    #[serde(rename = "suggestedPath", skip_serializing_if = "Option::is_none")]
    pub suggested_path: Option<String>,
}

/// The answer's `pathDrift`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PathDrift {
    #[serde(rename = "repoRoot")]
    pub repo_root: String,
    pub checked: bool,
    #[serde(rename = "nodesScanned")]
    pub nodes_scanned: usize,
    #[serde(rename = "pathsChecked")]
    pub paths_checked: usize,
    pub drifts: Vec<Drift>,
    pub hint: String,
}

fn looks_like_path(entry: &str) -> bool {
    entry.contains('/') || CODE_EXTENSIONS.iter().any(|extension| entry.ends_with(extension))
}

fn base_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// What is not measured when no repository is known: not looking is not zero.
pub fn path_drift_unchecked(repo_root: String) -> PathDrift {
    PathDrift {
        repo_root,
        checked: false,
        nodes_scanned: 0,
        paths_checked: 0,
        drifts: Vec::new(),
        hint: "Source paths were NOT checked. This vault is not inside a git repository and no repoRoot was given, so the repository it describes is unknown \u{2014} anything measured against the process working directory would be noise, not drift. Pass repoRoot to validate_vault (or set OATLAS_REPO_ROOT) to check implementation paths.".to_string(),
    }
}

/// Whether something is at `path`. A name the reader refuses to look at (a hidden file, a
/// credential name) is taken as present: it was not looked at, so it is not called missing.
fn is_present(source: &dyn SourceFiles, path: &str) -> bool {
    source.kind(Path::new(path)).map_or(true, |kind| kind.is_some())
}

/// The drift of `documents` against the repository `source` reads, which the answer names
/// `repo_root_label`.
pub fn path_drift(
    documents: &[LoadedDocument],
    source: &dyn SourceFiles,
    repo_root_label: &str,
) -> PathDrift {
    let mut drifts: Vec<Drift> = Vec::new();
    let (mut nodes_scanned, mut paths_checked) = (0, 0);
    for document in documents {
        let frontmatter = document.frontmatter();
        let Some(kind) = frontmatter
            .text("kind")
            .map(answer_format::whitespace::trim)
            .filter(|kind| !kind.is_empty())
        else {
            continue;
        };
        let slug = frontmatter
            .text("slug")
            .map(answer_format::whitespace::trim)
            .filter(|slug| !slug.is_empty())
            .unwrap_or_else(|| document.slug());
        nodes_scanned += 1;
        if let Some(path) = frontmatter
            .text("path")
            .filter(|path| !answer_format::whitespace::trim(path).is_empty())
        {
            paths_checked += 1;
            if !is_present(source, answer_format::whitespace::trim(path)) {
                drifts.push(Drift {
                    slug: slug.to_string(),
                    kind: kind.to_string(),
                    key: "path",
                    missing_path: path.to_string(),
                    suggested_path: None,
                });
            }
        }
        for element in frontmatter.list("elements").unwrap_or_default() {
            if !looks_like_path(element)
                || ONTOLOGY_SLUG_PREFIXES
                    .iter()
                    .any(|prefix| element.starts_with(prefix))
            {
                continue;
            }
            paths_checked += 1;
            if !is_present(source, element) {
                drifts.push(Drift {
                    slug: slug.to_string(),
                    kind: kind.to_string(),
                    key: "elements[]",
                    missing_path: element.clone(),
                    suggested_path: None,
                });
            }
        }
    }
    drifts.sort_by(|left, right| {
        compare_text(&left.slug, &right.slug)
            .then_with(|| compare_text(left.key, right.key))
            .then_with(|| compare_text(&left.missing_path, &right.missing_path))
    });
    let found = drifts.len();
    suggest_moves(&mut drifts, source);
    let suggested = drifts
        .iter()
        .filter(|drift| drift.suggested_path.is_some())
        .count();
    let hint = if found > 0 {
        let moved = if suggested > 0 {
            format!(" {suggested} have a same-named file elsewhere in the repo (see suggestedPath \u{2014} likely a move).")
        } else {
            String::new()
        };
        format!("{found} frontmatter path(s) point at files missing under repoRoot \u{2014} fix the .md (patch_concept) or remove the stale entry.{moved} If repoRoot is wrong, re-run validate_vault with the correct repoRoot.")
    } else if paths_checked > 0 {
        format!("all {paths_checked} frontmatter source path(s) exist under repoRoot (no code drift).")
    } else {
        "no frontmatter path:/elements: source paths to check.".to_string()
    };
    PathDrift {
        repo_root: repo_root_label.to_string(),
        checked: true,
        nodes_scanned,
        paths_checked,
        drifts,
        hint,
    }
}

/// Adds `suggestedPath` where exactly one source file shares the missing path's name, and never
/// the missing path itself. The repository is walked only when something drifted.
fn suggest_moves(drifts: &mut [Drift], source: &dyn SourceFiles) {
    if drifts.is_empty() {
        return;
    }
    let mut files: Vec<std::path::PathBuf> = Vec::new();
    list_source_files(
        source,
        source.root(),
        &IgnoredNames::with_defaults(&[]),
        SUGGESTION_WALK_FILES,
        &|extension| is_module_extension(extension),
        &mut files,
    );
    let mut by_base: HashMap<String, Vec<String>> = HashMap::new();
    for file in &files {
        let Ok(relative) = file.strip_prefix(source.root()) else {
            continue;
        };
        let relative = relative
            .components()
            .map(|part| part.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/");
        by_base
            .entry(base_name(&relative).to_string())
            .or_default()
            .push(relative);
    }
    for drift in drifts {
        if let Some([only]) = by_base
            .get(base_name(&drift.missing_path))
            .map(Vec::as_slice)
        {
            if *only != drift.missing_path {
                drift.suggested_path = Some(only.clone());
            }
        }
    }
}
