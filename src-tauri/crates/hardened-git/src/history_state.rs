//! What decides the answer of a read of history. Two equal states mean `git log` over any paths
//! answers the same: the commit `HEAD` names, the commits a shallow clone cuts off, the grafts and
//! the replacement refs that rewrite what a commit's parents are. A new commit, a fetch that
//! deepens a shallow clone and a replacement ref each change it; a change in the working tree
//! does not, because history never reads the working tree.

use std::path::Path;

use crate::repository::{CommitId, GitReadError, Repository};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct HistoryState {
    head: CommitId,
    shallow: Option<Vec<u8>>,
    grafts: Option<Vec<u8>>,
    replaced: String,
}

fn file_or_none(path: &Path) -> Result<Option<Vec<u8>>, GitReadError> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(GitReadError::Failed {
            subcommand: "rev-parse".to_string(),
            message: format!("{}: {error}", path.display()),
        }),
    }
}

impl Repository {
    /// The state of the history this repository can read, from two runs and two small files.
    /// Before the first commit `HEAD` names nothing and the answer is an error: no history was
    /// read, so none may be kept.
    pub fn history_state(&self) -> Result<HistoryState, GitReadError> {
        let located = self.succeeded_read(&[
            "rev-parse",
            "HEAD",
            "--git-path",
            "shallow",
            "--git-path",
            "info/grafts",
        ])?;
        let text = located.stdout_text();
        let mut lines = text.trim_end_matches('\n').split('\n');
        let (Some(head), Some(shallow), Some(grafts), None) =
            (lines.next(), lines.next(), lines.next(), lines.next())
        else {
            return Err(GitReadError::Failed {
                subcommand: "rev-parse".to_string(),
                message: "the history files are not three lines".to_string(),
            });
        };
        let head = CommitId::new(head).ok_or_else(|| GitReadError::Failed {
            subcommand: "rev-parse".to_string(),
            message: "HEAD is not a commit id".to_string(),
        })?;
        let replaced = self
            .succeeded_read(&[
                "for-each-ref",
                "--format=%(refname) %(objectname)",
                "refs/replace",
            ])?
            .stdout_text();
        Ok(HistoryState {
            head,
            shallow: file_or_none(&self.folder().join(shallow))?,
            grafts: file_or_none(&self.folder().join(grafts))?,
            replaced,
        })
    }
}
