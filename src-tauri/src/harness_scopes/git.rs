//! What Git says about the connected folder: whether it is a linked worktree, and whether Git
//! tracks or ignores the Local settings file. Read through the runner's hardened base command.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

const LOCAL_SETTINGS_PATHSPEC: &str = ".claude/settings.local.json";

#[derive(Debug, PartialEq)]
pub(super) struct WorktreeLayout {
    pub linked: bool,
    /// The main checkout's folder matching the connected one; `None` beside a bare repository.
    pub main_checkout: Option<PathBuf>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalFileGit {
    pub tracked: bool,
    pub ignored: bool,
}

fn git(cwd: &Path, args: &[&str]) -> Option<Output> {
    git_command(cwd, args).output().ok()
}

fn git_command(cwd: &Path, args: &[&str]) -> Command {
    let mut command = crate::git::hardened_base_command();
    command
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_COMMON_DIR")
        .env("GIT_NO_LAZY_FETCH", "1")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("LC_ALL", "C")
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::null());
    command
}

/// `None` when the folder is not inside a Git work tree or Git cannot answer.
pub(super) fn worktree_layout(folder: &Path) -> Option<WorktreeLayout> {
    let output = git(
        folder,
        &[
            "rev-parse",
            "--path-format=absolute",
            "--git-dir",
            "--git-common-dir",
            "--show-toplevel",
        ],
    )?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8(output.stdout).ok()?;
    let mut lines = text.lines().map(PathBuf::from);
    let (git_dir, common_dir, top_level) = (lines.next()?, lines.next()?, lines.next()?);
    let canonical = |path: &Path| std::fs::canonicalize(path).ok();
    let common_dir = canonical(&common_dir)?;
    if canonical(&git_dir)? == common_dir {
        return Some(WorktreeLayout {
            linked: false,
            main_checkout: None,
        });
    }
    let inside = canonical(folder)?
        .strip_prefix(canonical(&top_level)?)
        .ok()?
        .to_path_buf();
    let main_checkout = common_dir
        .parent()
        .filter(|_| common_dir.file_name().is_some_and(|name| name == ".git"))
        .map(|main_top_level| main_top_level.join(inside));
    Some(WorktreeLayout {
        linked: true,
        main_checkout,
    })
}

/// Asked in the folder whose Local file Claude Code reads.
pub(super) fn local_file_git(local_checkout: &Path) -> Option<LocalFileGit> {
    let listed = git(local_checkout, &["ls-files", "--", LOCAL_SETTINGS_PATHSPEC])?;
    if !listed.status.success() {
        return None;
    }
    // `check-ignore` refuses literal pathspecs; the one path it gets is a constant with no glob.
    let ignore = git_command(
        local_checkout,
        &[
            "check-ignore",
            "-q",
            "--no-index",
            "--",
            LOCAL_SETTINGS_PATHSPEC,
        ],
    )
    .env_remove("GIT_LITERAL_PATHSPECS")
    .output()
    .ok()?;
    let ignored = match ignore.status.code() {
        Some(0) => true,
        Some(1) => false,
        _ => return None,
    };
    Some(LocalFileGit {
        tracked: !listed.stdout.is_empty(),
        ignored,
    })
}
