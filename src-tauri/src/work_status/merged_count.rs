//! How many changes the base branch took in since a moment: commits on its first-parent line, a
//! merged branch and a squashed commit alike counting one. The page says today's count and leaves
//! the changes themselves to Changes.

#[cfg(test)]
mod tests;

use std::path::Path;

use super::fingerprint::common_dir;
use super::git_read::{base_reference, git_read};

/// A branch name spelled only as a name: no revision syntax (`^`, `~`, `@{`, `..`, `:`) can ride in.
fn is_branch_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with(['-', '/', '.'])
        && !name.ends_with(['/', '.'])
        && !name.contains("..")
        && !name.contains("//")
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '/'))
}

/// Changes on the base branch's first-parent line committed at or after `since_epoch_s`, read only
/// from the repository whose own `.git` sits in `root`. One `git rev-list --count`.
pub(super) fn read_merged_count(root: &Path, base_branch: &str, since_epoch_s: i64) -> Option<u32> {
    if !is_branch_name(base_branch) || since_epoch_s < 0 {
        return None;
    }
    common_dir(root)?;
    let reference = base_reference(root, base_branch)?;
    // With its zone Git reads `@N` as epoch seconds; without one a small N is read as a date.
    let since = format!("--since=@{since_epoch_s} +0000");
    git_read(
        root,
        &[
            "rev-list",
            "--count",
            "--first-parent",
            &since,
            &reference,
            "--",
        ],
    )
    .ok()?
    .trim()
    .parse()
    .ok()
}
