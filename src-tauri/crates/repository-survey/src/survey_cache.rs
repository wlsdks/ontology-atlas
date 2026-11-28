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
use hardened_git::{Repository, StatusRow};
use source_scan::{place_folder, walk_sorted, Entry, Flow, WalkLimits, DEFAULT_IGNORE};

use crate::breadth_map::{build_breadth_map, Survey, SurveyRequest};
use crate::git_ignored_paths::git_ignored_paths;
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
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum RepositoryState {
    Git {
        head: Option<String>,
        /// Where the surveyed folder lies below the top of the repository, `/`-separated; empty
        /// when it is the top.
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

fn changed_files(root: &SourceRoot, prefix: &str, rows: &[StatusRow]) -> Vec<ChangedFile> {
    let mut changed: Vec<ChangedFile> = rows
        .iter()
        .filter_map(|row| {
            let path = below_prefix(&row.path, prefix)?;
            Some(ChangedFile {
                path: path.to_string(),
                status: (row.index, row.worktree),
                stamp: root.repository_file_stamp(&parts_of(path)),
            })
        })
        .collect();
    changed.sort_by(|left, right| left.path.cmp(&right.path));
    changed
}

/// The state of a folder Git tracks, from one `status`; `None` when Git cannot say. `prefix` is
/// known once the folder was placed in its repository.
fn git_state(root: &SourceRoot, prefix: &str) -> Option<RepositoryState> {
    let tree = Repository::at(root.as_path()).working_tree(&[]).ok()?;
    Some(RepositoryState::Git {
        head: tree.head.commit().map(|commit| commit.as_str().to_string()),
        prefix: prefix.to_string(),
        changed: changed_files(root, prefix, &tree.rows),
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
        place.to_string()
    })
}

/// Every file of a folder without Git with its stamp, in name order; `None` past the limit.
fn folder_state(source: &dyn SourceFiles, root: &SourceRoot) -> Option<RepositoryState> {
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
        if files.len() >= FOLDER_FILE_LIMIT {
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
        files.push((parts.join("/"), root.repository_file_stamp(&borrowed)));
        Flow::Continue
    };
    walk_sorted(source, &base, WalkLimits::UNBOUNDED_NAMES, &admit, &mut visit);
    (!over).then_some(RepositoryState::Folder { files })
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
                .map(|file| file.path.clone())
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
        let kept = {
            let slots = locked(&self.slots);
            slots
                .iter()
                .find(|slot| slot.asked == *asked && slot.root == root.as_path())
                .map(|slot| (slot.state.clone(), Arc::clone(&slot.survey)))
        };
        let now = match &kept {
            Some((RepositoryState::Git { prefix, .. }, _)) => git_state(root, prefix),
            Some((RepositoryState::Folder { .. }, _)) => folder_state(files.source(), root),
            None => placed_prefix(root.as_path())
                .and_then(|prefix| git_state(root, &prefix))
                .or_else(|| folder_state(files.source(), root)),
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
        let survey = Arc::new(self.build(root, files, asked, reuse));
        if let Some(now) = now {
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

    fn build(
        &self,
        root: &SourceRoot,
        files: &SurveyFiles<'_>,
        asked: &SurveyAsked,
        reuse: Option<(Arc<Survey>, HashSet<String>)>,
    ) -> Survey {
        let git_ignored = git_ignored_paths(root.as_path());
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
                git_ignored: &git_ignored,
                kept_files: &kept,
            },
        )
    }
}
