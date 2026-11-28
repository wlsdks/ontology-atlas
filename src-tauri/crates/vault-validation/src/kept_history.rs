//! What `validate_vault` learned from Git, kept for the next call until it can have changed.
//!
//! Dating the evidence is `git log` over every cited path (more than a second on a repository of a
//! few thousand commits), and dating the summaries is one `git log` per node. Both read committed
//! history only, so their answers hold while the history is what it was: the cache asks Git for
//! [`HistoryState`] (two cheap runs) and keeps an answer under it. Nothing about the working tree
//! is part of the key, because history never reads it.
//!
//! The one thing that does read the working tree is whether a moved file differs only in comments,
//! imports or layout. That verdict is kept under the file's stamp, and a file written within two
//! seconds is not kept (see [`confined_files::FileStamp::is_settled_at`]), so an edit is never
//! missed.
//! A verdict that was not reached (a side unreadable or over budget) is never kept: another call
//! may read it.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use confined_files::FileStamp;
use hardened_git::{GitReadError, HistoryState, RepoPath, Repository};
use source_scan::{date_paths, DatingCommit, WantedPath};

use crate::node_revisions::{node_revisions, NodeRevisions};

/// Answers kept per kind, the last few asked: a session asks about one or two repositories.
const SLOTS: usize = 4;
/// Revisions one kept answer may hold; a vault with more is read again each call, so memory is
/// bounded by this and never by the vault.
const MAX_KEPT_REVISIONS: usize = 100_000;
/// Verdicts kept on whether a moved file changed only cosmetically.
const MAX_KEPT_VERDICTS: usize = 8192;

type Revisions = Arc<NodeRevisions>;

struct DatingSlot {
    folder: PathBuf,
    state: HistoryState,
    max_commits: usize,
    wanted: Vec<(RepoPath, source_scan::Dating)>,
    dated: Arc<Vec<Option<DatingCommit>>>,
}

struct RevisionSlot {
    folder: PathBuf,
    state: HistoryState,
    scope: RepoPath,
    slugs: Vec<String>,
    revisions: Revisions,
}

/// Where a moved file is compared: the folder the working files are rooted at, the commit that
/// dates the concept, and the cited name.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct VerdictKey {
    root: PathBuf,
    commit: String,
    path: String,
}

#[derive(Default)]
struct Kept {
    dating: Vec<DatingSlot>,
    revisions: Vec<RevisionSlot>,
    verdicts: HashMap<VerdictKey, (FileStamp, bool)>,
}

/// The kept answers of one session.
#[derive(Default)]
pub struct KeptHistory {
    kept: Mutex<Kept>,
}

fn locked(kept: &Mutex<Kept>) -> MutexGuard<'_, Kept> {
    kept.lock().unwrap_or_else(PoisonError::into_inner)
}

fn push_slot<T>(slots: &mut Vec<T>, slot: T) {
    if slots.len() >= SLOTS {
        slots.remove(0);
    }
    slots.push(slot);
}

impl KeptHistory {
    /// [`date_paths`], kept under the history state. Asked again, with the same repository, paths
    /// and window, it is answered without running `git log`.
    pub fn dating(
        &self,
        repository: &Repository,
        wanted: &[WantedPath],
        max_commits: usize,
    ) -> Result<Arc<Vec<Option<DatingCommit>>>, GitReadError> {
        let asked: Vec<(RepoPath, source_scan::Dating)> = wanted
            .iter()
            .map(|path| (path.resolved.clone(), path.dating))
            .collect();
        let state = repository.history_state().ok();
        if let Some(state) = &state {
            let kept = locked(&self.kept);
            if let Some(slot) = kept.dating.iter().find(|slot| {
                slot.folder == repository.folder()
                    && slot.state == *state
                    && slot.max_commits == max_commits
                    && slot.wanted == asked
            }) {
                return Ok(Arc::clone(&slot.dated));
            }
        }
        let dated = Arc::new(date_paths(repository, wanted, max_commits)?);
        // History that moved while it was read is not what the state names: keep nothing.
        if let Some(state) =
            state.filter(|state| repository.history_state().ok().as_ref() == Some(state))
        {
            let mut kept = locked(&self.kept);
            push_slot(
                &mut kept.dating,
                DatingSlot {
                    folder: repository.folder().to_path_buf(),
                    state,
                    max_commits,
                    wanted: asked,
                    dated: Arc::clone(&dated),
                },
            );
        }
        Ok(dated)
    }

    /// [`node_revisions`], kept under the history state when every node was read: a run that
    /// failed once may succeed the next time, so an answer with a gap is never the one kept.
    pub fn node_revisions(
        &self,
        repository: &Repository,
        scope: &RepoPath,
        slugs: &[&str],
    ) -> Revisions {
        let state = repository.history_state().ok();
        if let Some(state) = &state {
            let kept = locked(&self.kept);
            if let Some(slot) = kept.revisions.iter().find(|slot| {
                slot.folder == repository.folder()
                    && slot.state == *state
                    && slot.scope == *scope
                    && slot
                        .slugs
                        .iter()
                        .map(String::as_str)
                        .eq(slugs.iter().copied())
            }) {
                return Arc::clone(&slot.revisions);
            }
        }
        let revisions = Arc::new(node_revisions(repository, scope, slugs));
        let held: usize = revisions.by_slug.values().map(Vec::len).sum();
        if let Some(state) = state.filter(|state| {
            revisions.is_complete()
                && held <= MAX_KEPT_REVISIONS
                && repository.history_state().ok().as_ref() == Some(state)
        }) {
            let mut kept = locked(&self.kept);
            push_slot(
                &mut kept.revisions,
                RevisionSlot {
                    folder: repository.folder().to_path_buf(),
                    state,
                    scope: scope.clone(),
                    slugs: slugs.iter().map(ToString::to_string).collect(),
                    revisions: Arc::clone(&revisions),
                },
            );
        }
        revisions
    }

    /// The verdict kept for this file at `stamp`, when the same file with the same stamp was judged.
    pub fn cosmetic_verdict(
        &self,
        root: &Path,
        commit: &str,
        path: &str,
        stamp: FileStamp,
    ) -> Option<bool> {
        let key = VerdictKey {
            root: root.to_path_buf(),
            commit: commit.to_string(),
            path: path.to_string(),
        };
        let kept = locked(&self.kept);
        kept.verdicts
            .get(&key)
            .filter(|(held, _)| *held == stamp)
            .map(|(_, unchanged)| *unchanged)
    }

    /// Keeps a verdict reached from both sides, under a stamp the caller took after the file had
    /// settled.
    pub fn keep_cosmetic_verdict(
        &self,
        root: &Path,
        commit: &str,
        path: &str,
        stamp: FileStamp,
        unchanged: bool,
    ) {
        let key = VerdictKey {
            root: root.to_path_buf(),
            commit: commit.to_string(),
            path: path.to_string(),
        };
        let mut kept = locked(&self.kept);
        if kept.verdicts.len() >= MAX_KEPT_VERDICTS {
            kept.verdicts.clear();
        }
        kept.verdicts.insert(key, (stamp, unchanged));
    }
}
