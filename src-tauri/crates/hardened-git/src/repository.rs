//! Reading a repository through the hardened runner. Every method builds its arguments from typed
//! values and hands them to [`run_git`], so the guard (no repository-supplied program, literal
//! paths, no hooks, no fetch) is applied to every read and a family crate has no way to spawn
//! `git` without it. A name from an agent or a page (a revision, a path) is a value that was
//! checked when it was built and goes after `--` or as one argument, never as an option.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::runner::{run_git, GitInvocation, GitOutput, GitRunError};

/// One read's bound per stream.
const MAX_READ_OUTPUT: usize = 4 * 1024 * 1024;
/// Bound for a batch of object reads.
const MAX_BATCH_OUTPUT: usize = 64 * 1024 * 1024;
/// A read that has not finished by now is killed.
const READ_TIMEOUT: Duration = Duration::from_secs(120);

/// Why a read produced no answer.
#[derive(Debug, thiserror::Error)]
pub enum GitReadError {
    /// `git` was not run or did not finish: not installed, hardening failed, too much output,
    /// timed out.
    #[error(transparent)]
    Run(#[from] GitRunError),
    /// `git` ran and failed; the text is what it printed.
    #[error("git {subcommand} failed: {message}")]
    Failed { subcommand: String, message: String },
}

/// A path inside a repository, `/`-separated, never absolute, never climbing, never an option and
/// never a pathspec word: what a vault, a page or an agent may name in a `git` question. `.` is the
/// repository root.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct RepoPath(String);

impl RepoPath {
    /// Trailing slashes are dropped. `None` for an empty path, an absolute one, one that starts
    /// with `-`, one with a backslash, a NUL, a newline or a `..` part.
    pub fn new(raw: &str) -> Option<Self> {
        let trimmed = raw.trim().trim_end_matches('/');
        let refused = trimmed.is_empty()
            || trimmed.starts_with('/')
            || trimmed.starts_with('-')
            || trimmed.contains(['\\', '\0', '\n', '\r'])
            || trimmed.split('/').any(|part| part == "..");
        (!refused).then(|| Self(trimmed.to_string()))
    }

    /// The repository root as a path.
    pub fn root() -> Self {
        Self(".".to_string())
    }

    /// A path below the repository as the platform writes it, with `/` separators. `None` when it
    /// is not a valid [`RepoPath`] (for example it climbs).
    pub fn from_path(relative: &Path) -> Option<Self> {
        if relative.as_os_str().is_empty() {
            return Some(Self::root());
        }
        let text: Vec<String> = relative
            .components()
            .map(|part| part.as_os_str().to_string_lossy().into_owned())
            .collect();
        Self::new(&text.join("/"))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// A commit id: 40 hex digits, or 64 for a SHA-256 repository, lower-cased.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CommitId(String);

impl CommitId {
    pub fn new(raw: &str) -> Option<Self> {
        let text = raw.trim().to_ascii_lowercase();
        let valid_length = text.len() == 40 || text.len() == 64;
        (valid_length && text.bytes().all(|byte| byte.is_ascii_hexdigit())).then_some(Self(text))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// A file as it was at a commit: `git show <commit>:<path>`.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct BlobAt {
    pub commit: CommitId,
    pub path: RepoPath,
}

impl BlobAt {
    fn spec(&self) -> String {
        format!("{}:{}", self.commit.as_str(), self.path.as_str())
    }
}

/// How a file differs from the last commit, as the working tree and the index tell it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChangeKind {
    Untracked,
    Deleted,
    Added,
    Modified,
}

/// One row of `git status --porcelain=v1 -z`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusRow {
    pub path: String,
    pub index: char,
    pub worktree: char,
    pub kind: ChangeKind,
    pub staged: bool,
    pub unstaged: bool,
}

/// One commit of a history list.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitSummary {
    pub hash: String,
    pub short_hash: String,
    pub authored_at: String,
    pub subject: String,
}

/// A merge, cherry-pick, revert or rebase that is not finished.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OperationInProgress {
    Merge,
    CherryPick,
    Revert,
    Rebase,
}

impl OperationInProgress {
    pub fn name(self) -> &'static str {
        match self {
            Self::Merge => "merge",
            Self::CherryPick => "cherry-pick",
            Self::Revert => "revert",
            Self::Rebase => "rebase",
        }
    }
}

/// What untracked files a status lists.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UntrackedFiles {
    /// Each file (`--untracked-files=all`).
    All,
    /// A new folder as one row (`--untracked-files=normal`).
    Normal,
}

/// A repository, read through the hardened runner.
#[derive(Debug, Clone)]
pub struct Repository {
    folder: PathBuf,
    environment: Option<Vec<(OsString, OsString)>>,
}

impl Repository {
    /// The repository `git -C <folder>` finds. Nothing is run until a read.
    pub fn at(folder: impl Into<PathBuf>) -> Self {
        Self {
            folder: folder.into(),
            environment: None,
        }
    }

    /// Starts every run from this environment instead of the process's own, for a test that must
    /// not depend on what the machine configured. The hardening still applies on top. Only a
    /// test build has it, so no program can swap the environment the hardening starts from.
    #[cfg(feature = "test-hooks")]
    #[must_use]
    pub fn with_environment(mut self, environment: Vec<(OsString, OsString)>) -> Self {
        self.environment = Some(environment);
        self
    }

    pub fn folder(&self) -> &Path {
        &self.folder
    }

    fn run(&self, args: &[String], max_output: usize) -> Result<GitOutput, GitReadError> {
        let mut invocation = GitInvocation::new(&self.folder, args);
        invocation.max_output = max_output;
        invocation.timeout = Some(READ_TIMEOUT);
        invocation.environment = self.environment.clone();
        Ok(run_git(invocation)?)
    }

    fn read(&self, args: &[&str]) -> Result<GitOutput, GitReadError> {
        let owned: Vec<String> = args.iter().map(|arg| (*arg).to_string()).collect();
        self.run(&owned, MAX_READ_OUTPUT)
    }

    /// Output that must have succeeded.
    fn succeeded(&self, args: &[String]) -> Result<GitOutput, GitReadError> {
        let output = self.run(args, MAX_READ_OUTPUT)?;
        if output.success() {
            return Ok(output);
        }
        let text = output.stderr_text();
        let text = if text.trim().is_empty() {
            output.stdout_text()
        } else {
            text
        };
        Err(GitReadError::Failed {
            subcommand: crate::argv::subcommand_of(args).unwrap_or("").to_string(),
            message: if text.trim().is_empty() {
                format!("exit {}", output.code.unwrap_or(-1))
            } else {
                text.trim().to_string()
            },
        })
    }

    /// The top of the working tree (`rev-parse --show-toplevel`), or `None` when the folder is
    /// not in a repository.
    pub fn top_level(&self) -> Result<Option<PathBuf>, GitReadError> {
        let output = self.read(&["rev-parse", "--show-toplevel"])?;
        let text = output.stdout_text();
        Ok((output.success() && !text.trim().is_empty()).then(|| PathBuf::from(text.trim())))
    }

    /// The commit `HEAD` names, or `None` before the first commit.
    pub fn head(&self) -> Result<Option<CommitId>, GitReadError> {
        let output = self.read(&["rev-parse", "HEAD"])?;
        Ok(output
            .success()
            .then(|| CommitId::new(&output.stdout_text()))
            .flatten())
    }

    /// The branch `HEAD` is on, or `None` for a detached `HEAD`.
    pub fn branch(&self) -> Result<Option<String>, GitReadError> {
        let output = self.read(&["symbolic-ref", "--quiet", "--short", "HEAD"])?;
        let text = output.stdout_text();
        Ok((output.success() && !text.trim().is_empty()).then(|| text.trim().to_string()))
    }

    /// Whether the history is cut short (a shallow clone).
    pub fn is_shallow(&self) -> Result<bool, GitReadError> {
        let output = self.read(&["rev-parse", "--is-shallow-repository"])?;
        Ok(output.success() && output.stdout_text().trim() == "true")
    }

    /// The merge, cherry-pick, revert or rebase in progress, from the marker files `git` leaves
    /// in its own folder.
    pub fn operation_in_progress(&self) -> Result<Option<OperationInProgress>, GitReadError> {
        let output = self.succeeded(&["rev-parse".to_string(), "--git-dir".to_string()])?;
        let git_dir = self.folder.join(output.stdout_text().trim());
        let marked = |name: &str| git_dir.join(name).exists();
        Ok(if marked("MERGE_HEAD") {
            Some(OperationInProgress::Merge)
        } else if marked("CHERRY_PICK_HEAD") {
            Some(OperationInProgress::CherryPick)
        } else if marked("REVERT_HEAD") {
            Some(OperationInProgress::Revert)
        } else if marked("rebase-merge") || marked("rebase-apply") {
            Some(OperationInProgress::Rebase)
        } else {
            None
        })
    }

    /// `git status --porcelain=v1 -z` for `scope` (the whole repository when `None`), one row per
    /// path. A rename or copy row is the destination.
    pub fn status(
        &self,
        scope: Option<&RepoPath>,
        untracked: UntrackedFiles,
    ) -> Result<Vec<StatusRow>, GitReadError> {
        let mut args = vec![
            "status".to_string(),
            "--porcelain=v1".to_string(),
            "-z".to_string(),
            match untracked {
                UntrackedFiles::All => "--untracked-files=all".to_string(),
                UntrackedFiles::Normal => "--untracked-files=normal".to_string(),
            },
        ];
        if let Some(path) = scope {
            args.push("--".to_string());
            args.push(path.as_str().to_string());
        }
        Ok(parse_status(&self.succeeded(&args)?.stdout_text()))
    }

    /// The newest `limit` commits that touched `scope`, newest first. A repository with no commits
    /// has none.
    pub fn log(&self, scope: &RepoPath, limit: usize) -> Result<Vec<CommitSummary>, GitReadError> {
        let args = [
            "log".to_string(),
            "-z".to_string(),
            format!("--max-count={limit}"),
            "--format=%H%x1f%h%x1f%aI%x1f%s".to_string(),
            "--".to_string(),
            scope.as_str().to_string(),
        ];
        let output = self.run(&args, MAX_READ_OUTPUT)?;
        Ok(if output.success() {
            parse_history(&output.stdout_text())
        } else {
            Vec::new()
        })
    }

    /// The newest `limit` commits that touched `path`, as commit and author time, newest first.
    pub fn file_commits(
        &self,
        path: &RepoPath,
        limit: usize,
    ) -> Result<Vec<(CommitId, String)>, GitReadError> {
        let args = [
            "log".to_string(),
            format!("--max-count={limit}"),
            "--format=%H%x1f%aI".to_string(),
            "--no-renames".to_string(),
            "--".to_string(),
            path.as_str().to_string(),
        ];
        let output = self.run(&args, MAX_READ_OUTPUT)?;
        if !output.success() {
            return Ok(Vec::new());
        }
        Ok(output
            .stdout_text()
            .lines()
            .filter_map(|line| {
                let (hash, authored_at) = line.trim().split_once('\u{1f}')?;
                let commit = CommitId::new(hash)?;
                let authored_at = authored_at.trim();
                (!authored_at.is_empty()).then(|| (commit, authored_at.to_string()))
            })
            .collect())
    }

    /// `git show <commit>:<path>`: the committed bytes, or `None` when the commit has no such file.
    pub fn show_blob(&self, blob: &BlobAt) -> Result<Option<Vec<u8>>, GitReadError> {
        let args = ["show".to_string(), blob.spec()];
        let output = self.run(&args, MAX_READ_OUTPUT)?;
        Ok(output.success().then_some(output.stdout))
    }

    /// The names of the files that differ between `HEAD` and the working tree, `--name-only`,
    /// renames not followed, below `scope`.
    pub fn changed_names_since_head(&self, scope: &RepoPath) -> Result<Vec<String>, GitReadError> {
        let args = [
            "diff".to_string(),
            "--name-only".to_string(),
            "--no-renames".to_string(),
            "-z".to_string(),
            "HEAD".to_string(),
            "--".to_string(),
            scope.as_str().to_string(),
        ];
        let output = self.succeeded(&args)?;
        Ok(output
            .stdout_text()
            .split('\0')
            .filter(|name| !name.is_empty())
            .map(str::to_string)
            .collect())
    }

    /// Files that are tracked or untracked and not ignored (`ls-files --cached --others
    /// --exclude-standard -z`) below `scope`.
    pub fn listed_files(&self, scope: &RepoPath) -> Result<Vec<String>, GitReadError> {
        let args = [
            "ls-files".to_string(),
            "--cached".to_string(),
            "--others".to_string(),
            "--exclude-standard".to_string(),
            "-z".to_string(),
            "--".to_string(),
            scope.as_str().to_string(),
        ];
        let output = self.succeeded(&args)?;
        Ok(output
            .stdout_text()
            .split('\0')
            .filter(|name| !name.is_empty())
            .map(str::to_string)
            .collect())
    }

    /// The size of each blob (`cat-file --batch-check`), in the order asked. `None` for an object
    /// that is missing or is not a blob.
    pub fn blob_sizes(&self, blobs: &[BlobAt]) -> Result<Vec<Option<u64>>, GitReadError> {
        if blobs.is_empty() {
            return Ok(Vec::new());
        }
        let specs: Vec<String> = blobs.iter().map(BlobAt::spec).collect();
        let output = self.batch(&["cat-file", "--batch-check"], &specs)?;
        let text = String::from_utf8_lossy(&output).into_owned();
        let mut lines = text.split('\n');
        Ok(specs
            .iter()
            .map(|_| {
                let parts: Vec<&str> = lines.next().unwrap_or("").split(' ').collect();
                match parts.as_slice() {
                    [id, "blob", size]
                        if !id.is_empty() && id.bytes().all(|byte| byte.is_ascii_hexdigit()) =>
                    {
                        size.parse::<u64>().ok()
                    }
                    _ => None,
                }
            })
            .collect())
    }

    /// The bytes of each blob through one `cat-file --batch`, in the order asked. `None` for a
    /// missing object; a reply that does not parse ends the list early with `None`s, and the
    /// caller reads those one at a time with [`Self::show_blob`].
    pub fn blobs(&self, blobs: &[BlobAt]) -> Result<Vec<Option<Vec<u8>>>, GitReadError> {
        if blobs.is_empty() {
            return Ok(Vec::new());
        }
        let specs: Vec<String> = blobs.iter().map(BlobAt::spec).collect();
        let output = self.batch(&["cat-file", "--batch"], &specs)?;
        Ok(parse_batch(&output, specs.len()))
    }

    fn batch(&self, args: &[&str], specs: &[String]) -> Result<Vec<u8>, GitReadError> {
        let owned: Vec<String> = args.iter().map(|arg| (*arg).to_string()).collect();
        let input = format!("{}\n", specs.join("\n"));
        let mut invocation = GitInvocation::new(&self.folder, &owned);
        invocation.max_output = MAX_BATCH_OUTPUT;
        invocation.timeout = Some(READ_TIMEOUT);
        invocation.stdin = Some(input.as_bytes());
        invocation.environment = self.environment.clone();
        let output = run_git(invocation)?;
        if output.success() {
            Ok(output.stdout)
        } else {
            Err(GitReadError::Failed {
                subcommand: "cat-file".to_string(),
                message: output.stderr_text().trim().to_string(),
            })
        }
    }
}

/// The rows of `git status --porcelain=v1 -z`.
pub fn parse_status(text: &str) -> Vec<StatusRow> {
    let records: Vec<&str> = text.split('\0').collect();
    let mut rows = Vec::new();
    let mut position = 0;
    while let Some(record) = records.get(position) {
        position += 1;
        if record.is_empty() {
            continue;
        }
        let mut characters = record.chars();
        let index = characters.next().unwrap_or(' ');
        let worktree = characters.next().unwrap_or(' ');
        let path: String = record.chars().skip(3).collect();
        // A rename or copy record holds the destination first and the source in the next record;
        // agents use the destination.
        if matches!(index, 'R' | 'C') || matches!(worktree, 'R' | 'C') {
            position += 1;
        }
        let untracked = index == '?' && worktree == '?';
        let kind = if untracked {
            ChangeKind::Untracked
        } else if index == 'D' || worktree == 'D' {
            ChangeKind::Deleted
        } else if index == 'A' {
            ChangeKind::Added
        } else {
            ChangeKind::Modified
        };
        rows.push(StatusRow {
            path,
            index,
            worktree,
            kind,
            staged: !untracked && index != ' ',
            unstaged: untracked || worktree != ' ',
        });
    }
    rows
}

/// The commits of `git log -z --format=%H%x1f%h%x1f%aI%x1f%s`.
pub fn parse_history(text: &str) -> Vec<CommitSummary> {
    text.split('\0')
        .map(str::trim)
        .filter(|record| !record.is_empty())
        .map(|record| {
            let mut parts = record.split('\u{1f}');
            let hash = parts.next().unwrap_or("").to_string();
            let short_hash = parts.next().unwrap_or("").to_string();
            let authored_at = parts.next().unwrap_or("").to_string();
            let subject = parts.collect::<Vec<_>>().join("\u{1f}");
            CommitSummary {
                hash,
                short_hash,
                authored_at,
                subject,
            }
        })
        .collect()
}

/// The replies of `git cat-file --batch` for `count` requests. A missing object is `None`; the
/// first reply that is not a blob header and not `missing` ends the parse, and the rest stay
/// `None` for the caller to read another way.
fn parse_batch(output: &[u8], count: usize) -> Vec<Option<Vec<u8>>> {
    let mut found: Vec<Option<Vec<u8>>> = vec![None; count];
    let mut offset = 0;
    for slot in &mut found {
        let Some(rest) = output.get(offset..) else {
            break;
        };
        let Some(header_end) = rest.iter().position(|byte| *byte == b'\n') else {
            break;
        };
        let header = String::from_utf8_lossy(rest.get(..header_end).unwrap_or(&[])).into_owned();
        offset += header_end + 1;
        if header.ends_with(" missing") {
            continue;
        }
        let parts: Vec<&str> = header.split(' ').collect();
        let [.., kind, size] = parts.as_slice() else {
            break;
        };
        let Some(size) = size.parse::<usize>().ok().filter(|_| *kind == "blob") else {
            break;
        };
        let Some(content) = offset
            .checked_add(size)
            .and_then(|end| output.get(offset..end))
        else {
            break;
        };
        *slot = Some(content.to_vec());
        offset += size;
        if output.get(offset) == Some(&b'\n') {
            offset += 1;
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_repository_path_refuses_every_spelling_that_could_be_an_option_or_an_escape() {
        for refused in [
            "",
            "  ",
            "/etc/passwd",
            "-rf",
            "--output=/tmp/x",
            "a\\b",
            "a\0b",
            "a\nb",
            "../x",
            "a/../b",
            "a/..",
        ] {
            assert_eq!(RepoPath::new(refused), None, "{refused:?}");
        }
        assert_eq!(
            RepoPath::new("docs/ontology/").map(|p| p.0),
            Some("docs/ontology".to_string())
        );
        assert_eq!(
            RepoPath::new(" src/a.ts ").map(|p| p.0),
            Some("src/a.ts".to_string())
        );
        assert_eq!(
            RepoPath::new(":(top)x").map(|p| p.0),
            Some(":(top)x".to_string())
        );
        assert_eq!(RepoPath::new(".").map(|p| p.0), Some(".".to_string()));
        assert_eq!(
            RepoPath::from_path(Path::new("")).map(|p| p.0),
            Some(".".to_string())
        );
        assert_eq!(
            RepoPath::from_path(Path::new("a/b")).map(|p| p.0),
            Some("a/b".to_string())
        );
        assert_eq!(RepoPath::from_path(Path::new("../b")), None);
    }

    #[test]
    fn a_commit_id_cannot_be_read_as_an_option_or_a_path() {
        let commit = "0123456789abcdef0123456789abcdef01234567";
        assert_eq!(CommitId::new(commit).map(|c| c.0), Some(commit.to_string()));
        assert_eq!(
            CommitId::new(&commit.to_uppercase()).map(|c| c.0),
            Some(commit.to_string())
        );
        for refused in [
            "",
            "abc",
            "g123456789abcdef0123456789abcdef01234567",
            "-1234567890abcdef0123456789abcdef0123456",
        ] {
            assert_eq!(CommitId::new(refused), None, "{refused:?}");
        }
        assert!(CommitId::new(&"a".repeat(64)).is_some());
    }

    #[test]
    fn a_status_row_follows_the_two_status_letters_and_a_rename_is_its_destination() {
        let text = "?? new file.md\0 M changed.md\0A  added.md\0D  gone.md\0 D gone-too.md\0R  renamed.md\0old-name.md\0MM both.md\0";
        let rows = parse_status(text);
        let summary: Vec<(&str, ChangeKind, bool, bool)> = rows
            .iter()
            .map(|row| (row.path.as_str(), row.kind, row.staged, row.unstaged))
            .collect();
        assert_eq!(
            summary,
            [
                ("new file.md", ChangeKind::Untracked, false, true),
                ("changed.md", ChangeKind::Modified, false, true),
                ("added.md", ChangeKind::Added, true, false),
                ("gone.md", ChangeKind::Deleted, true, false),
                ("gone-too.md", ChangeKind::Deleted, false, true),
                ("renamed.md", ChangeKind::Modified, true, false),
                ("both.md", ChangeKind::Modified, true, true),
            ]
        );
    }

    #[test]
    fn a_history_record_keeps_a_unit_separator_inside_the_subject() {
        let text = "aaaa\u{1f}aa\u{1f}2026-01-01T00:00:00+09:00\u{1f}fix: a\u{1f}b\0bbbb\u{1f}bb\u{1f}2026-01-02T00:00:00+09:00\u{1f}docs\0";
        let commits = parse_history(text);
        assert_eq!(commits.len(), 2);
        assert_eq!(commits[0].subject, "fix: a\u{1f}b");
        assert_eq!(commits[1].short_hash, "bb");
    }

    #[test]
    fn a_batch_reply_gives_each_blob_marks_a_missing_one_and_stops_at_a_reply_it_cannot_read() {
        let id = "0123456789abcdef0123456789abcdef01234567";
        let reply = format!(
            "{id} blob 5\nhello\nabc:path missing\n{id} blob 2\nhi\n{id} tree 9\nxxxxxxxxx\n"
        );
        let parsed = parse_batch(reply.as_bytes(), 5);
        assert_eq!(parsed[0].as_deref(), Some(b"hello".as_slice()));
        assert_eq!(parsed[1], None);
        assert_eq!(parsed[2].as_deref(), Some(b"hi".as_slice()));
        assert_eq!(parsed[3], None, "a tree is not a blob");
        assert_eq!(parsed[4], None);
        let short = parse_batch(format!("{id} blob 50\nshort").as_bytes(), 1);
        assert_eq!(short, [None], "a size past the output ends the parse");
    }
}
