//! The state of the source a measurement saw, as a stamp that travels with it: the commit and
//! whether the working tree had changes. A folder that is not under git has no commit to name;
//! its fingerprint hashes every file's bytes, which this crate does not read (it reads source
//! only through `confined-files`, and that never opens hidden or credential-named files), so such
//! a folder has no stamp rather than one the app's own probe could not reproduce.

use std::path::Path;

use hardened_git::Repository;

use crate::architecture_conformance::{MeasuredSource, MeasuredStamp, MeasuredTool};
use crate::source_scan_error::SourceScanError;

/// The length of the commit id a stamp carries.
const REVISION_LENGTH: usize = 12;

/// The commit `HEAD` names and whether any file differs from it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitSourceState {
    pub revision: String,
    pub dirty: bool,
}

/// The git state of the repository that holds `root`, or `None` when `root` is not in one (or
/// `git` cannot be run, which is the same to the caller: there is nothing to stamp). Read from
/// the top of the working tree, as the whole repository is what a commit names.
pub fn read_git_source_state(root: &Path) -> Result<Option<GitSourceState>, SourceScanError> {
    let Ok(Some(top)) = Repository::at(root).top_level() else {
        return Ok(None);
    };
    let tree = Repository::at(top)
        .working_tree(&[])
        .map_err(SourceScanError::Git)?;
    let commit = tree.head.commit().ok_or(SourceScanError::NoCommit)?;
    Ok(Some(GitSourceState {
        revision: commit.as_str().to_string(),
        dirty: !tree.rows.is_empty(),
    }))
}

impl MeasuredStamp {
    /// The stamp of a measurement made at `at` (an ISO-8601 time) by `tool_version` over `state`.
    pub fn of_git(at: String, tool_version: &str, state: &GitSourceState) -> Self {
        Self {
            at,
            tool: MeasuredTool {
                name: "ontology-atlas",
                version: tool_version.to_string(),
            },
            source: MeasuredSource::Git {
                revision: state.revision.chars().take(REVISION_LENGTH).collect(),
                dirty: state.dirty,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_stamp_carries_twelve_characters_of_the_commit_and_the_dirty_flag() {
        let state = GitSourceState {
            revision: "0123456789abcdef0123456789abcdef01234567".to_string(),
            dirty: true,
        };
        let stamp = MeasuredStamp::of_git("2026-11-28T00:00:00.000Z".to_string(), "1.2.3", &state);
        assert_eq!(
            answer_format::json::to_string(&stamp).expect("writes"),
            r#"{"at":"2026-11-28T00:00:00.000Z","tool":{"name":"ontology-atlas","version":"1.2.3"},"source":{"kind":"git","revision":"0123456789ab","dirty":true}}"#
        );
    }
}
