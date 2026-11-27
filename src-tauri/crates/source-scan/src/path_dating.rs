//! When a cited path last changed, from the history of the repository that holds it.
//!
//! A cited file is dated by the newest commit that touched it. A concept document is dated by its
//! bytes: the first commit at which it held the bytes it holds now, so a commit that only puts
//! earlier bytes back (an undo, a revert) returns the earlier date instead of a new one.

use std::collections::HashMap;

use hardened_git::{CommitId, GitReadError, RepoPath, Repository, TouchedCommit};

/// Paths one call dates at most. A screen paint asks about this many; concept documents are
/// asked first, so cited code cannot starve them of a date.
pub const MAX_DATED_PATHS: usize = 512;
/// How far back the walk reads.
pub const DATING_WINDOW_COMMITS: usize = 3000;

/// What a path's date means.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Dating {
    /// A cited file: the newest commit that touched it.
    NewestCommit,
    /// A concept document: the first commit that left it with the bytes it has now.
    FirstCommitWithPresentBytes,
}

/// A path to date, under the name its caller knows it by.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WantedPath {
    pub key: String,
    pub resolved: RepoPath,
    pub dating: Dating,
}

/// The commit that dates a path.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DatingCommit {
    pub commit: CommitId,
    /// The commit time, `%cI`, as git wrote it.
    pub committed_at: String,
}

/// Dates each wanted path, in the order given. A path nothing in the window touched, a path
/// with no history, and a repository with no commit are `None`: no history dates nothing.
/// A folder is touched by any file below it.
pub fn date_paths(
    repository: &Repository,
    wanted: &[WantedPath],
    max_commits: usize,
) -> Result<Vec<Option<DatingCommit>>, GitReadError> {
    if wanted.is_empty() {
        return Ok(Vec::new());
    }
    let paths: Vec<RepoPath> = wanted.iter().map(|path| path.resolved.clone()).collect();
    match repository.touch_history(&paths, max_commits) {
        Ok(commits) => Ok(fold_dating(wanted, &commits)),
        Err(GitReadError::Failed { .. }) => Ok(vec![None; wanted.len()]),
        Err(other) => Err(other),
    }
}

/// What is known about one wanted path while the commits are read newest first.
#[derive(Default)]
struct Reading {
    /// The blob its newest touch left, which later commits are compared with.
    present_blob: Option<String>,
    dated_by: Option<usize>,
}

/// The rule of [`date_paths`] over the commits git listed, newest first. Each touched path is
/// looked up as itself and as each folder above it, so the work is the lines of the log times
/// their depth, not times the number of wanted paths.
fn fold_dating(wanted: &[WantedPath], commits: &[TouchedCommit]) -> Vec<Option<DatingCommit>> {
    let mut by_place: HashMap<&str, Vec<usize>> = HashMap::new();
    for (position, path) in wanted.iter().enumerate() {
        by_place
            .entry(path.resolved.as_str())
            .or_default()
            .push(position);
    }
    let mut readings: Vec<Reading> = wanted.iter().map(|_| Reading::default()).collect();
    for (commit_position, commit) in commits.iter().enumerate() {
        for touch in &commit.touches {
            let mut note = |places: Option<&Vec<usize>>, exact: bool| {
                for position in places.into_iter().flatten() {
                    if let (Some(reading), Some(path)) =
                        (readings.get_mut(*position), wanted.get(*position))
                    {
                        reading.touched(path.dating, &touch.blob, exact, commit_position);
                    }
                }
            };
            note(by_place.get(touch.path.as_str()), true);
            note(by_place.get("."), false);
            for (slash, _) in touch.path.match_indices('/') {
                note(
                    by_place.get(touch.path.get(..slash).unwrap_or_default()),
                    false,
                );
            }
        }
    }
    readings
        .iter()
        .map(|reading| {
            let commit = commits.get(reading.dated_by?)?;
            Some(DatingCommit {
                commit: commit.commit.clone(),
                committed_at: commit.committed_at.clone(),
            })
        })
        .collect()
}

impl Reading {
    fn touched(&mut self, dating: Dating, blob: &str, exact: bool, commit_position: usize) {
        match (&self.present_blob, dating, exact) {
            (None, _, _) => {
                self.present_blob = Some(blob.to_string());
                self.dated_by = Some(commit_position);
            }
            (Some(present), Dating::FirstCommitWithPresentBytes, true) if present == blob => {
                self.dated_by = Some(commit_position);
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use hardened_git::Touch;

    fn commit(letter: char, at: &str, touches: &[(&str, &str)]) -> TouchedCommit {
        TouchedCommit {
            commit: CommitId::new(&letter.to_string().repeat(40)).expect("id"),
            committed_at: at.to_string(),
            touches: touches
                .iter()
                .map(|(path, blob)| Touch {
                    blob: (*blob).to_string(),
                    path: (*path).to_string(),
                })
                .collect(),
        }
    }

    fn wanted(key: &str, dating: Dating) -> WantedPath {
        WantedPath {
            key: key.to_string(),
            resolved: RepoPath::new(key).expect("path"),
            dating,
        }
    }

    fn at(dated: &[Option<DatingCommit>], position: usize) -> Option<&str> {
        dated
            .get(position)?
            .as_ref()
            .map(|dating| dating.committed_at.as_str())
    }

    #[test]
    fn a_document_is_dated_by_its_bytes_and_a_cited_file_or_folder_by_its_newest_commit() {
        // Newest first: c puts back the bytes a wrote (an undo), b changed them in between.
        let history = [
            commit(
                'c',
                "2026-03",
                &[("docs/note.md", "aaa"), ("src/app.ts", "s3")],
            ),
            commit(
                'b',
                "2026-02",
                &[("docs/note.md", "bbb"), ("src/lib/x.ts", "x2")],
            ),
            commit(
                'a',
                "2026-01",
                &[("docs/note.md", "aaa"), ("src/app.ts", "s1")],
            ),
        ];
        let asked = [
            wanted("docs/note.md", Dating::FirstCommitWithPresentBytes),
            wanted("docs/note.md", Dating::NewestCommit),
            wanted("src/app.ts", Dating::NewestCommit),
            wanted("src/lib", Dating::NewestCommit),
            wanted("src/never.ts", Dating::NewestCommit),
        ];
        let dated = fold_dating(&asked, &history);
        assert_eq!(
            at(&dated, 0),
            Some("2026-01"),
            "an undo returns the date of the bytes it put back"
        );
        assert_eq!(at(&dated, 1), Some("2026-03"));
        assert_eq!(at(&dated, 2), Some("2026-03"));
        assert_eq!(
            at(&dated, 3),
            Some("2026-02"),
            "a folder is touched by a file below it"
        );
        assert_eq!(at(&dated, 4), None);
    }
}
