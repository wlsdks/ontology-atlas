//! Reading a repository through the hardened runner. Every method builds its arguments from typed
//! values and hands them to [`run_git`], so the guard (no repository-supplied program, literal
//! paths, no hooks, no fetch) is applied to every read and a family crate has no way to spawn
//! `git` without it. A name from an agent or a page (a revision, a path) is a value that was
//! checked when it was built and goes after `--` or as one argument, never as an option.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::repo_path::RepoPath;
use crate::runner::{run_git, GitInvocation, GitOutput, GitRunError};
use crate::touch_history::{parse_touch_history, TouchedCommit};
use crate::working_tree::{parse_working_tree, HeadState, WorkingTree};

/// One read's bound per stream.
const MAX_READ_OUTPUT: usize = 4 * 1024 * 1024;
/// Bound for a batch of object reads.
const MAX_BATCH_OUTPUT: usize = 64 * 1024 * 1024;
/// Bound for the walk over history that dates files; a commit that touched a folder lists every
/// file below it.
const MAX_TOUCH_HISTORY_OUTPUT: usize = 64 * 1024 * 1024;
/// A read that has not finished by now is killed.
const READ_TIMEOUT: Duration = Duration::from_secs(120);
/// The list of ignored paths decides only which files a survey leaves out, so a repository too big
/// to list in this time or space is surveyed as if nothing were ignored rather than waited for.
const IGNORED_PATHS_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_IGNORED_PATHS_OUTPUT: usize = 16 * 1024 * 1024;
/// Paths named in one `status`, so a command line stays under Windows's 32,767 characters.
const STATUS_PATHS_PER_RUN: usize = 256;

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

/// What one `rev-parse` says about the repository a folder is in.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepositoryFacts {
    /// The top of the working tree as git prints it: on Windows with `/` separators, and on macOS
    /// possibly through a link. A caller that compares it with a folder resolves both first.
    pub top_level: PathBuf,
    /// Whether the history is cut short (a shallow clone).
    pub shallow: bool,
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

    /// Runs `git` with this `PATH`, and the rest of the process's environment, so a program
    /// started from a launcher with a minimal `PATH` still finds the person's `git`. The
    /// hardening is applied on top and does not depend on it.
    #[must_use]
    pub fn with_search_path(mut self, path: OsString) -> Self {
        let mut environment = self
            .environment
            .take()
            .unwrap_or_else(|| std::env::vars_os().collect());
        environment.retain(|(name, _)| !is_search_path_name(name));
        environment.push((OsString::from("PATH"), path));
        self.environment = Some(environment);
        self
    }

    pub fn folder(&self) -> &Path {
        &self.folder
    }

    fn run(
        &self,
        args: &[String],
        max_output: usize,
        timeout: Duration,
    ) -> Result<GitOutput, GitReadError> {
        let mut invocation = GitInvocation::new(&self.folder, args);
        invocation.max_output = max_output;
        invocation.timeout = Some(timeout);
        invocation.environment = self.environment.clone();
        Ok(run_git(invocation)?)
    }

    fn read(&self, args: &[&str]) -> Result<GitOutput, GitReadError> {
        let owned: Vec<String> = args.iter().map(|arg| (*arg).to_string()).collect();
        self.run(&owned, MAX_READ_OUTPUT, READ_TIMEOUT)
    }

    /// [`Self::succeeded`] for arguments written as literals.
    pub(crate) fn succeeded_read(&self, args: &[&str]) -> Result<GitOutput, GitReadError> {
        let owned: Vec<String> = args.iter().map(|arg| (*arg).to_string()).collect();
        self.succeeded(&owned)
    }

    /// Output that must have succeeded.
    fn succeeded(&self, args: &[String]) -> Result<GitOutput, GitReadError> {
        self.succeeded_within(args, MAX_READ_OUTPUT, READ_TIMEOUT)
    }

    fn succeeded_within(
        &self,
        args: &[String],
        max_output: usize,
        timeout: Duration,
    ) -> Result<GitOutput, GitReadError> {
        let output = self.run(args, max_output, timeout)?;
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

    /// The top of the working tree and whether history is shallow, from one run, or `None` when
    /// the folder is not in a working tree.
    pub fn facts(&self) -> Result<Option<RepositoryFacts>, GitReadError> {
        let output = self.read(&["rev-parse", "--is-shallow-repository", "--show-toplevel"])?;
        if !output.success() {
            return Ok(None);
        }
        let text = output.stdout_text();
        let mut lines = text.trim_end_matches('\n').split('\n');
        let (Some(shallow), Some(top), None) = (lines.next(), lines.next(), lines.next()) else {
            return Err(GitReadError::Failed {
                subcommand: "rev-parse".to_string(),
                message: "the top of the repository is not one line".to_string(),
            });
        };
        Ok(Some(RepositoryFacts {
            top_level: PathBuf::from(top),
            shallow: shallow == "true",
        }))
    }

    /// The commit `HEAD` names, or `None` before the first commit.
    pub fn head(&self) -> Result<Option<CommitId>, GitReadError> {
        let output = self.read(&["rev-parse", "HEAD"])?;
        Ok(output
            .success()
            .then(|| CommitId::new(&output.stdout_text()))
            .flatten())
    }

    /// Where `HEAD` points, without reading the working tree: two cheap runs, for a caller that
    /// needs the head and not the changed files.
    pub fn head_state(&self) -> Result<HeadState, GitReadError> {
        let commit = self.head()?;
        let output = self.read(&["symbolic-ref", "--quiet", "--short", "HEAD"])?;
        let text = output.stdout_text();
        let branch = (output.success() && !text.trim().is_empty()).then(|| text.trim().to_string());
        match (commit, branch) {
            (Some(commit), Some(branch)) => Ok(HeadState::Branch { branch, commit }),
            (Some(commit), None) => Ok(HeadState::Detached { commit }),
            (None, Some(branch)) => Ok(HeadState::Unborn { branch }),
            (None, None) => Err(GitReadError::Failed {
                subcommand: "symbolic-ref".to_string(),
                message: "HEAD names neither a branch nor a commit".to_string(),
            }),
        }
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

    /// `HEAD` and the changed paths from one `git status`, below `paths` (the whole repository
    /// when empty). Untracked files are listed one by one, renames are two rows, and ahead and
    /// behind are not counted, which walks history for nothing the rows use. More than
    /// [`STATUS_PATHS_PER_RUN`] paths are asked in runs of that many.
    pub fn working_tree(&self, paths: &[RepoPath]) -> Result<WorkingTree, GitReadError> {
        let chunks: Vec<&[RepoPath]> = if paths.is_empty() {
            vec![paths]
        } else {
            paths.chunks(STATUS_PATHS_PER_RUN).collect()
        };
        let mut merged: Option<WorkingTree> = None;
        for chunk in chunks {
            let mut args: Vec<String> = [
                "status",
                "--porcelain=v2",
                "-z",
                "--branch",
                "--no-ahead-behind",
                "--no-renames",
                "--untracked-files=all",
            ]
            .iter()
            .map(|arg| (*arg).to_string())
            .collect();
            if !chunk.is_empty() {
                args.push("--".to_string());
                args.extend(chunk.iter().map(|path| path.as_str().to_string()));
            }
            let tree = parse_working_tree(&self.succeeded(&args)?.stdout_text())?;
            match merged.as_mut() {
                None => merged = Some(tree),
                Some(so_far) => so_far.rows.extend(tree.rows),
            }
        }
        merged.ok_or_else(|| GitReadError::Failed {
            subcommand: "status".to_string(),
            message: "no run".to_string(),
        })
    }

    /// The newest `limit` commits that touched `scope`, newest first. The caller asks only
    /// when `HEAD` names a commit: a failure is an error, never an empty history that reads as
    /// a complete one.
    pub fn history(
        &self,
        scope: &RepoPath,
        limit: usize,
    ) -> Result<Vec<CommitSummary>, GitReadError> {
        let args = [
            "log".to_string(),
            "-z".to_string(),
            format!("--max-count={limit}"),
            "--format=%H%x1f%h%x1f%aI%x1f%s".to_string(),
            "--".to_string(),
            scope.as_str().to_string(),
        ];
        Ok(parse_history(&self.succeeded(&args)?.stdout_text()))
    }

    /// The commits, newest first up to `max_commits`, that touched any of `paths`, each with the
    /// touched paths among them (a folder matches the files below it). Renames are not followed,
    /// so a rename is a deletion and an addition. The paths go to `git log --stdin` after a `--`
    /// line, so their number and length cannot reach the command-line limit of a platform (32,767
    /// characters on Windows). Before the first commit git refuses, and the answer is a
    /// [`GitReadError::Failed`]; a caller asks only when `HEAD` names a commit.
    pub fn touch_history(
        &self,
        paths: &[RepoPath],
        max_commits: usize,
    ) -> Result<Vec<TouchedCommit>, GitReadError> {
        let args: Vec<String> = [
            "log",
            "--stdin",
            "-z",
            "--format=%x1e%H %cI",
            "--raw",
            "--no-abbrev",
            "--no-renames",
        ]
        .iter()
        .map(|arg| (*arg).to_string())
        .chain(std::iter::once(format!("--max-count={max_commits}")))
        .collect();
        let mut input = String::from("--\n");
        for path in paths {
            input.push_str(path.as_str());
            input.push('\n');
        }
        let mut invocation = GitInvocation::new(&self.folder, &args);
        invocation.max_output = MAX_TOUCH_HISTORY_OUTPUT;
        invocation.timeout = Some(READ_TIMEOUT);
        invocation.stdin = Some(input.as_bytes());
        invocation.environment = self.environment.clone();
        let output = run_git(invocation)?;
        if !output.success() {
            return Err(GitReadError::Failed {
                subcommand: "log".to_string(),
                message: output.stderr_text().trim().to_string(),
            });
        }
        Ok(parse_touch_history(&output.stdout_text()))
    }

    /// The newest `limit` commits that touched `path`, as commit and author time, newest first.
    /// Git refusing (no commit yet, a damaged repository) is an error, never an empty history.
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
        let output = self.succeeded(&args)?;
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

    /// `git show <commit>:<path>`: the committed bytes, or `None` when git cannot show them: the
    /// commit has no such file, or the commit or the repository cannot be read. Output past the
    /// read bound is an error.
    pub fn show_blob(&self, blob: &BlobAt) -> Result<Option<Vec<u8>>, GitReadError> {
        let args = ["show".to_string(), blob.spec()];
        let output = self.run(&args, MAX_READ_OUTPUT, READ_TIMEOUT)?;
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

    /// The untracked paths git ignores below this folder, relative to it with `/` separators; a
    /// folder ignored whole is one entry, with its trailing `/` kept so a caller can tell it from
    /// a file (`ls-files --others --ignored --exclude-standard --directory -z`). A tracked file is
    /// not listed even where a pattern would ignore it.
    pub fn ignored_paths(&self) -> Result<Vec<String>, GitReadError> {
        self.ignored_paths_within(MAX_IGNORED_PATHS_OUTPUT, IGNORED_PATHS_TIMEOUT)
    }

    /// [`Self::ignored_paths`] with its own bound: the list, or an error when it is longer than
    /// `max_output` bytes or `git` takes longer than `timeout`. [`Self::ignored_paths`] allows 5
    /// seconds and 16 MiB, far less than another read, because a survey can do without the list.
    pub fn ignored_paths_within(
        &self,
        max_output: usize,
        timeout: Duration,
    ) -> Result<Vec<String>, GitReadError> {
        let args = [
            "ls-files".to_string(),
            "--others".to_string(),
            "--ignored".to_string(),
            "--exclude-standard".to_string(),
            "--directory".to_string(),
            "-z".to_string(),
        ];
        let output = self.succeeded_within(&args, max_output, timeout)?;
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
    /// missing object; a reply that does not parse ends the list early with `None`s, which a
    /// caller treats as unread.
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

fn is_search_path_name(name: &std::ffi::OsStr) -> bool {
    if cfg!(windows) {
        name.to_string_lossy().eq_ignore_ascii_case("PATH")
    } else {
        name == "PATH"
    }
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
