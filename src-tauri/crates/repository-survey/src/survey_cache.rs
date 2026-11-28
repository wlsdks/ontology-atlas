//! The survey of a repository, kept between calls until the repository changes.
//!
//! A survey reads every source file, so a build that asks for it on every `validate_vault` and
//! every write pays seconds for a repository nobody touched. The cache asks Git one question per
//! call, `status`, which says the commit and every file that differs from it, and stats only
//! those files. When the commit, the list and the stamps of the listed files are the ones the
//! survey was built from, nothing it read can have changed. A folder without Git is asked by one
//! walk that stamps every file, because nothing else says what changed.
//!
//! A repository that did change is surveyed again; the files that did not change are not read
//! again by the walk of source files, which is where most of the reading is.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use confined_files::{EntryKind, FileStamp, SourceFiles, SourceRoot};
use hardened_git::{RepoPath, Repository, StatusRow};
use source_scan::{place_folder, walk_sorted, Entry, Flow, WalkLimits, DEFAULT_IGNORE};

use crate::breadth_map::{build_breadth_map, Survey, SurveyRequest};
use crate::git_ignored_paths::{ignored_paths_listing, nfc};
use crate::survey_files::SurveyFiles;
use crate::unit_collection::SurveyedFile;

const SLOTS: usize = 4;
/// A folder without Git with more files than this is not kept: it is read again each call.
const FOLDER_FILE_LIMIT: usize = 20_000;

/// What is asked of a survey: the same repository asked differently is another survey.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SurveyAsked {
    /// The folder the survey reads, as its text names it.
    pub label: String,
    pub ignore: Vec<String>,
    /// A folder below the root, `/`-separated, left out because it is the map being built.
    pub vault_exclusion: Option<String>,
}

/// A file that differs from the commit, with the stamp it had when the survey was built.
#[derive(Debug, Clone, PartialEq, Eq)]
struct ChangedFile {
    path: String,
    status: (char, char),
    stamp: Option<FileStamp>,
    /// What lies below a row that names a folder: a repository inside this one is listed as one
    /// row, `vendor/lib/`, and a submodule as its folder, whatever changes in them. Empty for a
    /// file.
    inside: Vec<(String, Option<FileStamp>)>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum RepositoryState {
    Git {
        head: Option<String>,
        /// Where the surveyed folder lies below the top of the repository, `/`-separated and in
        /// NFC; empty when it is the top.
        prefix: String,
        changed: Vec<ChangedFile>,
    },
    Folder {
        files: Vec<(String, Option<FileStamp>)>,
    },
}

struct Slot {
    asked: SurveyAsked,
    root: PathBuf,
    state: RepositoryState,
    survey: Arc<Survey>,
}

/// The surveys of the repositories a session has asked about, the last few of them.
#[derive(Default)]
pub struct SurveyCache {
    slots: Mutex<Vec<Slot>>,
}

fn locked(slots: &Mutex<Vec<Slot>>) -> MutexGuard<'_, Vec<Slot>> {
    slots.lock().unwrap_or_else(PoisonError::into_inner)
}

fn parts_of(path: &str) -> Vec<&str> {
    path.split('/').collect()
}

fn below_prefix<'a>(path: &'a str, prefix: &str) -> Option<&'a str> {
    if prefix.is_empty() {
        return Some(path);
    }
    path.strip_prefix(prefix)?.strip_prefix('/')
}

fn is_below(path: &str, folder: &str) -> bool {
    path == folder
        || path
            .strip_prefix(folder)
            .is_some_and(|rest| rest.starts_with('/'))
}

/// The rows of the changed files below the surveyed folder, each with its stamp. A `.gitignore`
/// edit needs no row of its own: it changes what is ignored, which shows as untracked files that
/// appear or vanish from the rows. Git prints names precomposed (NFC) on macOS while the disk may keep them
/// decomposed, and the survey's own paths are NFC, so a row's path is compared in NFC. The stamp
/// is taken at the path as Git printed it when that lies below the prefix as written, else at
/// the NFC path, which a disk that ignores the form of a name finds as well. A row below
/// `vault_exclusion` is left out: the survey does not read those files, so a vault write is not
/// a change of what it read.
fn changed_files(
    source: &dyn SourceFiles,
    root: &SourceRoot,
    prefix: &str,
    vault_exclusion: Option<&str>,
    rows: &[StatusRow],
) -> Option<Vec<ChangedFile>> {
    let excluded = vault_exclusion.map(nfc);
    let mut stamped_below = 0usize;
    let mut changed: Vec<ChangedFile> = Vec::new();
    for row in rows {
        let normalized = nfc(&row.path);
        let Some(path) = below_prefix(&normalized, prefix) else {
            continue;
        };
        if excluded
            .as_deref()
            .is_some_and(|folder| is_below(path.trim_end_matches('/'), folder))
        {
            continue;
        }
        let as_printed = below_prefix(&row.path, prefix)
            .unwrap_or(path)
            .trim_end_matches('/');
        let stamp = root.repository_file_stamp(&parts_of(as_printed));
        let inside = if stamp.is_some() {
            Vec::new()
        } else {
            let folder = parts_of(as_printed)
                .iter()
                .fold(root.as_path().to_path_buf(), |joined, part| {
                    joined.join(part)
                });
            let files = stamped_files_below(
                source,
                root,
                &folder,
                FOLDER_FILE_LIMIT.saturating_sub(stamped_below),
            )?;
            stamped_below += files.len();
            files
        };
        changed.push(ChangedFile {
            path: path.trim_end_matches('/').to_string(),
            status: (row.index, row.worktree),
            stamp,
            inside,
        });
    }
    changed.sort_by(|left, right| left.path.cmp(&right.path));
    Some(changed)
}

/// The state of a folder Git tracks, from one `status` that asks about the folder only; `None`
/// when Git cannot say.
fn git_state(
    source: &dyn SourceFiles,
    root: &SourceRoot,
    prefix: &str,
    vault_exclusion: Option<&str>,
) -> Option<RepositoryState> {
    // The folder is where `git` runs, and a pathspec is relative to that: `.` is this folder
    // alone, where no pathspec lists the whole repository.
    let pathspecs: Vec<RepoPath> = if prefix.is_empty() {
        Vec::new()
    } else {
        vec![RepoPath::root()]
    };
    let tree = Repository::at(root.as_path())
        .working_tree(&pathspecs)
        .ok()?;
    Some(RepositoryState::Git {
        head: tree.head.commit().map(|commit| commit.as_str().to_string()),
        prefix: prefix.to_string(),
        changed: changed_files(source, root, prefix, vault_exclusion, &tree.rows)?,
    })
}

/// Where the folder lies below the top of its repository, or `None` when Git has no work tree
/// there.
fn placed_prefix(root: &Path) -> Option<String> {
    let facts = Repository::at(root).facts().ok()??;
    let placed = place_folder(&facts.top_level, root).ok()?;
    let place = placed.path.as_str();
    Some(if place == "." {
        String::new()
    } else {
        nfc(place)
    })
}

/// Every file below `folder` with its stamp, named from the survey's root and in name order;
/// `None` past `limit` files.
fn stamped_files_below(
    source: &dyn SourceFiles,
    root: &SourceRoot,
    folder: &Path,
    limit: usize,
) -> Option<Vec<(String, Option<FileStamp>)>> {
    let base = root.as_path().to_path_buf();
    let mut files: Vec<(String, Option<FileStamp>)> = Vec::new();
    let mut over = false;
    let admit = |entry: &Entry<'_>| {
        !DEFAULT_IGNORE.contains(&entry.name) && !entry.name.starts_with('.')
    };
    let mut visit = |entry: &Entry<'_>| {
        if entry.kind != EntryKind::File {
            return Flow::Continue;
        }
        if files.len() >= limit {
            over = true;
            return Flow::Stop;
        }
        let Ok(below) = entry.path.strip_prefix(&base) else {
            return Flow::Continue;
        };
        let parts: Vec<String> = below
            .components()
            .map(|part| part.as_os_str().to_string_lossy().into_owned())
            .collect();
        let borrowed: Vec<&str> = parts.iter().map(String::as_str).collect();
        files.push((nfc(&parts.join("/")), root.repository_file_stamp(&borrowed)));
        Flow::Continue
    };
    walk_sorted(source, folder, WalkLimits::UNBOUNDED_NAMES, &admit, &mut visit);
    (!over).then_some(files)
}

/// Every file of a folder without Git with its stamp, in name order; `None` past the limit.
fn folder_state(source: &dyn SourceFiles, root: &SourceRoot) -> Option<RepositoryState> {
    let files = stamped_files_below(source, root, root.as_path(), FOLDER_FILE_LIMIT)?;
    Some(RepositoryState::Folder { files })
}

/// The files whose readings a rebuilt survey may not reuse: those that differed from the commit
/// when the old survey was built or differ now. Only when the commit is the same, because a new
/// commit may have changed any file.
fn files_to_read_again(old: &RepositoryState, new: &RepositoryState) -> Option<HashSet<String>> {
    match (old, new) {
        (
            RepositoryState::Git {
                head: old_head,
                changed: old_changed,
                ..
            },
            RepositoryState::Git {
                head: new_head,
                changed: new_changed,
                ..
            },
        ) if old_head == new_head => Some(
            old_changed
                .iter()
                .chain(new_changed)
                .flat_map(|file| {
                    std::iter::once(file.path.clone())
                        .chain(file.inside.iter().map(|(path, _)| path.clone()))
                })
                .collect(),
        ),
        _ => None,
    }
}

impl SurveyCache {
    /// The survey of `source`'s folder: the one kept when the repository is as it was, else a new
    /// one that reads again only the source files that changed.
    pub fn survey(
        &self,
        root: &SourceRoot,
        files: &SurveyFiles<'_>,
        asked: &SurveyAsked,
    ) -> Arc<Survey> {
        self.survey_with(root, files, asked, &ignored_paths_listing)
    }

    /// [`Self::survey`] with the listing of ignored paths given: a survey built while the listing
    /// is unknown (`None`) is returned and not kept.
    fn survey_with(
        &self,
        root: &SourceRoot,
        files: &SurveyFiles<'_>,
        asked: &SurveyAsked,
        listing: &dyn Fn(&Path) -> Option<HashSet<String>>,
    ) -> Arc<Survey> {
        let kept = {
            let slots = locked(&self.slots);
            slots
                .iter()
                .find(|slot| slot.asked == *asked && slot.root == root.as_path())
                .map(|slot| (slot.state.clone(), Arc::clone(&slot.survey)))
        };
        let source = files.source();
        let exclusion = asked.vault_exclusion.as_deref();
        let now = match &kept {
            Some((RepositoryState::Git { prefix, .. }, _)) => {
                git_state(source, root, prefix, exclusion)
            }
            // A folder that was none may be one now, and a repository's state is one cheap
            // `status` where a folder's is a walk that stamps every file.
            Some((RepositoryState::Folder { .. }, _)) | None => placed_prefix(root.as_path())
                .and_then(|prefix| git_state(source, root, &prefix, exclusion))
                .or_else(|| folder_state(source, root)),
        };
        if let (Some((before, survey)), Some(now)) = (&kept, &now) {
            if before == now {
                return Arc::clone(survey);
            }
        }
        let reuse = match (&kept, &now) {
            (Some((before, survey)), Some(now)) => files_to_read_again(before, now)
                .map(|changed| (Arc::clone(survey), changed)),
            _ => None,
        };
        let ignored = listing(root.as_path());
        let complete = ignored.is_some();
        let survey = Arc::new(build(files, asked, reuse, &ignored.unwrap_or_default()));
        if let Some(now) = now.filter(|_| complete) {
            let mut slots = locked(&self.slots);
            slots.retain(|slot| !(slot.asked == *asked && slot.root == root.as_path()));
            if slots.len() >= SLOTS {
                slots.remove(0);
            }
            slots.push(Slot {
                asked: asked.clone(),
                root: root.as_path().to_path_buf(),
                state: now,
                survey: Arc::clone(&survey),
            });
        }
        survey
    }
}

fn build(
    files: &SurveyFiles<'_>,
    asked: &SurveyAsked,
    reuse: Option<(Arc<Survey>, HashSet<String>)>,
    git_ignored: &HashSet<String>,
) -> Survey {
    let kept: HashMap<&str, &SurveyedFile> = reuse
        .as_ref()
        .map(|(survey, changed)| {
            survey
                .collection
                .files
                .iter()
                .filter(|file| !changed.contains(&file.path))
                .map(|file| (file.path.as_str(), file))
                .collect()
        })
        .unwrap_or_default();
    build_breadth_map(
        files,
        &SurveyRequest {
            root_path: &asked.label,
            ignore: &asked.ignore,
            vault_exclusion: asked.vault_exclusion.clone(),
            git_ignored,
            kept_files: &kept,
        },
    )
}

#[cfg(test)]
mod tests {
    #![allow(
        clippy::disallowed_methods,
        reason = "a test plants the files a survey reads, which the crate never writes"
    )]

    use confined_files::{DiskSource, ScanRoots};

    use super::*;

    #[test]
    fn a_survey_built_while_git_could_not_list_ignored_paths_is_not_kept() {
        let base = tempfile::tempdir().expect("temp dir");
        let real = std::fs::canonicalize(base.path()).expect("real");
        std::fs::write(real.join("a.ts"), "export const a = 1;\n").expect("file");
        let root = ScanRoots::new(real.clone(), real.clone())
            .expect("roots")
            .allow(&real, "rootPath")
            .expect("allowed");
        let source = DiskSource::new(&root, 1024 * 1024);
        let files = SurveyFiles::new(&source);
        let asked = SurveyAsked {
            label: "repo".to_string(),
            ignore: Vec::new(),
            vault_exclusion: None,
        };
        let unknown = |_: &Path| None;
        let known = |_: &Path| Some(HashSet::new());
        let cache = SurveyCache::default();

        let first = cache.survey_with(&root, &files, &asked, &unknown);
        let second = cache.survey_with(&root, &files, &asked, &unknown);
        assert!(!Arc::ptr_eq(&first, &second), "nothing was kept");

        let third = cache.survey_with(&root, &files, &asked, &known);
        assert!(Arc::ptr_eq(&third, &cache.survey_with(&root, &files, &asked, &known)));
    }
}
