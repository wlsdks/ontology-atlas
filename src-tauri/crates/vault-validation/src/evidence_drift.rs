//! Does the meaning still stand on the code it cites? One Git walk dates every cited `path:` and
//! every concept document, and each concept is judged by whether the code moved after the meaning
//! was last touched. `checked: false` names why nothing was measured: it never means nothing moved.

use std::collections::{HashMap, HashSet};
use std::path::Path;

use answer_format::collation::compare_text;
use confined_files::{names_hidden_or_credential_file, DiskSource, SourceFiles};
use hardened_git::{RepoPath, Repository};
use serde::Serialize;
use source_scan::{
    comparable_code, date_paths, read_evidence_pairs, Dating, EvidenceRequest, WantedPath,
    DATING_WINDOW_COMMITS, MAX_DATED_PATHS, MAX_EVIDENCE_PAIRS,
};
use vault_document::LoadedDocument;

use crate::evidence_verdict::{
    judge_evidence, CitedEntry, EvidencePair, PathChange, Verdict,
};

const CONCEPT_KINDS: [&str; 3] = ["domain", "capability", "element"];
const ONTOLOGY_SLUG_PREFIXES: [&str; 4] = ["capabilities/", "domains/", "elements/", "documents/"];
const ROW_LIMIT: usize = 50;

/// A concept and the code it cites.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EvidenceConcept {
    pub slug: String,
    pub kind: String,
    pub doc_path: String,
    pub evidence_paths: Vec<String>,
}

fn named(value: Option<&str>) -> Option<&str> {
    value
        .map(answer_format::whitespace::trim)
        .filter(|text| !text.is_empty())
}

/// Each concept's own `path:` plus the `path:` of every element it lists (or the element entry
/// itself when it names a path).
pub fn evidence_concepts(documents: &[LoadedDocument]) -> Vec<EvidenceConcept> {
    let slug_of = |document: &LoadedDocument| -> String {
        named(document.frontmatter().text("slug")).map_or_else(|| document.slug().to_string(), ToString::to_string)
    };
    let mut path_by_slug: HashMap<String, String> = HashMap::new();
    for document in documents {
        if let Some(path) = named(document.frontmatter().text("path")) {
            path_by_slug.insert(slug_of(document), path.to_string());
        }
    }
    let mut concepts = Vec::new();
    for document in documents {
        let Some(kind) = named(document.frontmatter().text("kind")) else {
            continue;
        };
        if !CONCEPT_KINDS.contains(&kind) {
            continue;
        }
        let slug = slug_of(document);
        let mut paths: Vec<String> = Vec::new();
        let mut add = |path: &str| {
            if !paths.iter().any(|known| known == path) {
                paths.push(path.to_string());
            }
        };
        if let Some(own) = path_by_slug.get(&slug) {
            add(own);
        }
        for element in document.frontmatter().list("elements").unwrap_or_default() {
            let Some(reference) = named(Some(element)) else {
                continue;
            };
            if let Some(element_path) = path_by_slug.get(reference) {
                add(element_path);
            } else if !ONTOLOGY_SLUG_PREFIXES.iter().any(|prefix| reference.starts_with(prefix))
                && reference.contains('/')
            {
                add(reference);
            }
        }
        concepts.push(EvidenceConcept {
            doc_path: format!("{}.md", document.slug()),
            slug,
            kind: kind.to_string(),
            evidence_paths: paths,
        });
    }
    concepts
}

/// Where the history is read from.
pub struct EvidenceHistory<'a> {
    pub repository: &'a Repository,
    /// Where the vault lies below the top of the repository.
    pub vault_scope: &'a RepoPath,
    /// Where the repository root the cited paths are relative to lies below the top.
    pub repo_scope: &'a RepoPath,
    pub repo_files: &'a DiskSource,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct EvidenceCounts {
    pub current: usize,
    pub stale: usize,
    pub missing: usize,
    pub unknown: usize,
    #[serde(rename = "folderOnly")]
    pub folder_only: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MovedFile {
    pub path: String,
    #[serde(rename = "changedAt")]
    pub changed_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StaleConcept {
    pub slug: String,
    pub kind: String,
    #[serde(rename = "docChangedAt")]
    pub doc_changed_at: Option<String>,
    pub moved: Vec<MovedFile>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MissingConcept {
    pub slug: String,
    pub kind: String,
    pub gone: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FolderOnlyConcept {
    pub slug: String,
    pub kind: String,
    #[serde(rename = "docChangedAt")]
    pub doc_changed_at: Option<String>,
    pub folders: Vec<MovedFile>,
}

/// The answer's `evidenceDrift`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct EvidenceDrift {
    pub checked: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(rename = "repoRoot", skip_serializing_if = "Option::is_none")]
    pub repo_root: Option<String>,
    pub counts: EvidenceCounts,
    pub stale: Vec<StaleConcept>,
    pub missing: Vec<MissingConcept>,
    #[serde(rename = "folderOnly")]
    pub folder_only: Vec<FolderOnlyConcept>,
    pub hint: String,
}

fn unmeasured(reason: &str, hint: &str) -> EvidenceDrift {
    EvidenceDrift {
        checked: false,
        reason: Some(reason.to_string()),
        repo_root: None,
        counts: EvidenceCounts {
            current: 0,
            stale: 0,
            missing: 0,
            unknown: 0,
            folder_only: 0,
        },
        stale: Vec::new(),
        missing: Vec::new(),
        folder_only: Vec::new(),
        hint: hint.to_string(),
    }
}

fn change_of(
    history: &EvidenceHistory<'_>,
    path: &str,
    is_document: bool,
    dated: Option<&source_scan::DatingCommit>,
) -> PathChange {
    let (exists, is_dir) = if is_document {
        (true, false)
    } else {
        match history.repo_files.kind(Path::new(path)) {
            Ok(Some(kind)) => (true, kind == confined_files::EntryKind::Directory),
            Ok(None) => (false, false),
            // A name the reader refuses to look at was not looked at, so it is not called gone.
            Err(_) => (true, false),
        }
    };
    PathChange {
        exists,
        is_dir,
        last_changed_at: dated.map(|commit| commit.committed_at.clone()),
        last_commit: dated.map(|commit| commit.commit.as_str().to_string()),
    }
}

/// The date of every concept document and of every path they cite, by the key the caller knows it
/// by. Documents come first: the cap is shared, and cited code must not starve a document of a
/// date.
fn walk_changes(
    history: &EvidenceHistory<'_>,
    concepts: &[EvidenceConcept],
    repo_paths: &[String],
) -> HashMap<String, PathChange> {
    let mut wanted: Vec<(WantedPath, bool)> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut push = |key: &str, resolved: Option<RepoPath>, dating: Dating, is_document: bool| {
        if wanted.len() >= MAX_DATED_PATHS || !seen.insert(key.to_string()) {
            return;
        }
        if let Some(resolved) = resolved {
            wanted.push((
                WantedPath {
                    key: key.to_string(),
                    resolved,
                    dating,
                },
                is_document,
            ));
        }
    };
    for concept in concepts {
        let resolved = RepoPath::new(&concept.doc_path).map(|path| history.vault_scope.join(&path));
        push(&concept.doc_path, resolved, Dating::FirstCommitWithPresentBytes, true);
    }
    for path in repo_paths {
        let resolved = RepoPath::new(path).map(|clean| history.repo_scope.join(&clean));
        push(path, resolved, Dating::NewestCommit, false);
    }
    let asked: Vec<WantedPath> = wanted.iter().map(|(path, _)| path.clone()).collect();
    let dated = date_paths(history.repository, &asked, DATING_WINDOW_COMMITS).unwrap_or_default();
    wanted
        .iter()
        .enumerate()
        .map(|(position, (path, is_document))| {
            let commit = dated.get(position).and_then(Option::as_ref);
            (
                path.key.clone(),
                change_of(history, &path.key, *is_document, commit),
            )
        })
        .collect()
}

/// The moved files with the commit that dates their document, hidden and credential names left
/// out, each pair once, by path and then by commit.
fn moved_pairs(
    concepts: &[EvidenceConcept],
    changes: &HashMap<String, PathChange>,
) -> Vec<EvidencePair> {
    let mut pairs: Vec<EvidencePair> = Vec::new();
    for concept in concepts {
        let Some(document) = changes.get(&concept.doc_path) else {
            continue;
        };
        let Some(commit) = document.last_commit.as_deref() else {
            continue;
        };
        let entries: Vec<CitedEntry<'_>> = concept
            .evidence_paths
            .iter()
            .map(|path| CitedEntry {
                path,
                change: changes.get(path),
            })
            .collect();
        let judged = judge_evidence(document.last_changed_at.as_deref(), None, None, &entries);
        for moved in judged.moved {
            if names_hidden_or_credential_file(&moved.path) {
                continue;
            }
            let pair = (commit.to_string(), moved.path);
            if !pairs.contains(&pair) {
                pairs.push(pair);
            }
        }
    }
    pairs.sort_by(|left, right| {
        compare_text(&left.1, &right.1).then_with(|| compare_text(&left.0, &right.0))
    });
    pairs
}

/// The moved files whose only change since their concept's document is in comments, imports or
/// layout, read chunk by chunk until every pair is judged.
fn cosmetic_pairs(
    history: &EvidenceHistory<'_>,
    concepts: &[EvidenceConcept],
    changes: &HashMap<String, PathChange>,
) -> Option<HashSet<EvidencePair>> {
    let pairs = moved_pairs(concepts, changes);
    if pairs.is_empty() {
        return None;
    }
    let mut unchanged = HashSet::new();
    for chunk in pairs.chunks(MAX_EVIDENCE_PAIRS) {
        let requests: Vec<EvidenceRequest<'_>> = chunk
            .iter()
            .map(|(commit, path)| EvidenceRequest { path, commit })
            .collect();
        let readings = read_evidence_pairs(
            history.repository,
            history.repo_scope,
            history.repo_files,
            &requests,
        );
        for ((commit, path), reading) in chunk.iter().zip(readings) {
            let (Some(before), Some(after)) = (reading.before, reading.after) else {
                continue;
            };
            if comparable_code(&before, path) == comparable_code(&after, path) {
                unchanged.insert((commit.clone(), path.clone()));
            }
        }
    }
    Some(unchanged)
}

/// Why evidence was not dated, or the dating itself. `place` is where the history is read from,
/// `Err(None)` when no repository root is known, or `Err(Some(reason))` for the reason Git cannot
/// be read.
pub fn evidence_drift(
    documents: &[LoadedDocument],
    place: Result<EvidenceHistory<'_>, Option<&str>>,
    repo_root_label: &str,
) -> EvidenceDrift {
    let concepts = evidence_concepts(documents);
    let mut repo_paths: Vec<String> = Vec::new();
    for concept in &concepts {
        for path in &concept.evidence_paths {
            if !repo_paths.contains(path) {
                repo_paths.push(path.clone());
            }
        }
    }
    if matches!(place, Err(None)) {
        return unmeasured(
            "no-repo-root",
            "Evidence was NOT dated: no repository root. Pass repoRoot to validate_vault.",
        );
    }
    if repo_paths.is_empty() {
        return unmeasured(
            "no-evidence-paths",
            "No concept cites an implementation path, so there is nothing to date against Git.",
        );
    }
    let history = match place {
        Ok(history) => history,
        Err(reason) => {
            return unmeasured(
                reason.unwrap_or("git-unavailable"),
                "Evidence was NOT dated: the vault is not inside a Git repository this process can read, so no concept is called current here.",
            )
        }
    };
    let changes = walk_changes(&history, &concepts, &repo_paths);
    let unchanged = cosmetic_pairs(&history, &concepts, &changes);
    let (mut current, mut unknown) = (0, 0);
    let (mut stale, mut missing, mut folder_only) = (Vec::new(), Vec::new(), Vec::new());
    for concept in &concepts {
        let document = changes.get(&concept.doc_path);
        let entries: Vec<CitedEntry<'_>> = concept
            .evidence_paths
            .iter()
            .map(|path| CitedEntry {
                path,
                change: changes.get(path),
            })
            .collect();
        let judged = judge_evidence(
            document.and_then(|change| change.last_changed_at.as_deref()),
            document.and_then(|change| change.last_commit.as_deref()),
            unchanged.as_ref(),
            &entries,
        );
        let doc_changed_at = document.and_then(|change| change.last_changed_at.clone());
        let moved_files = |rows: Vec<crate::evidence_verdict::MovedPath>| -> Vec<MovedFile> {
            rows.into_iter()
                .map(|row| MovedFile {
                    path: row.path,
                    changed_at: row.changed_at,
                })
                .collect()
        };
        match judged.verdict {
            Verdict::Stale => stale.push(StaleConcept {
                slug: concept.slug.clone(),
                kind: concept.kind.clone(),
                doc_changed_at,
                moved: moved_files(judged.moved),
            }),
            Verdict::Missing => missing.push(MissingConcept {
                slug: concept.slug.clone(),
                kind: concept.kind.clone(),
                gone: judged.gone,
            }),
            Verdict::Unknown => {
                unknown += 1;
                if judged.reason == Some("folder-only") {
                    folder_only.push(FolderOnlyConcept {
                        slug: concept.slug.clone(),
                        kind: concept.kind.clone(),
                        doc_changed_at,
                        folders: moved_files(judged.folders),
                    });
                }
            }
            Verdict::Current => current += 1,
        }
    }
    stale.sort_by(|left, right| compare_text(&left.slug, &right.slug));
    missing.sort_by(|left, right| compare_text(&left.slug, &right.slug));
    folder_only.sort_by(|left, right| compare_text(&left.slug, &right.slug));
    let counts = EvidenceCounts {
        current,
        stale: stale.len(),
        missing: missing.len(),
        unknown,
        folder_only: folder_only.len(),
    };
    let hint = if counts.stale + counts.missing > 0 {
        format!("{} concept(s) have a cited file that changed after their document was last touched and {} cite a path that is gone: read those files before trusting the recorded meaning, then update the document (patch_concept) or the path. {} more cite only a folder that changed underneath (unknown, not stale): name a file in path: to make them checkable.", counts.stale, counts.missing, counts.folder_only)
    } else if counts.current > 0 {
        format!("all {} dated concept(s) still stand on unchanged code; {} could not be dated (no evidence path, or no commit in the walk window).", counts.current, counts.unknown)
    } else {
        format!("no concept could be dated ({} unknown): commits may be missing or older than the walk window.", counts.unknown)
    };
    stale.truncate(ROW_LIMIT);
    missing.truncate(ROW_LIMIT);
    folder_only.truncate(ROW_LIMIT);
    EvidenceDrift {
        checked: true,
        reason: None,
        repo_root: Some(repo_root_label.to_string()),
        counts,
        stale,
        missing,
        folder_only,
        hint,
    }
}
