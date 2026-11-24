//! What the base branch took in: each change on its first-parent line (a merged branch or a
//! squashed commit), newest first, with how much it changed. A worktree is gone once its folder is
//! removed, but its work stays on this line, so the page reads the record of finished work from
//! Git itself and keeps nothing of its own.

#[cfg(test)]
mod tests;

use std::path::Path;

use serde::Serialize;

use super::activity::{clean_subject, CommitLine};
use super::fingerprint::common_dir;
use super::git_read::git_read;

/// The most changes the page lists; a window rarely has room for more.
const LANDED_READ: usize = 30;
/// The most commits and files one change's detail lists; the counts still cover them all.
const DETAIL_LISTED: usize = 40;
/// The most branch commits one detail reads to count; a back-merge of a long line stops here.
const DETAIL_COMMITS_READ: &str = "-1000";
const RECORD: char = '\u{1e}';
const FIELD: char = '\u{1f}';

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LandedChange {
    pub(crate) hash: String,
    /// Plain text, as `CommitLine::subject`.
    pub(crate) subject: String,
    /// Seconds since the epoch.
    pub(crate) at: Option<i64>,
    /// A merge commit: the change brought a branch's own commits.
    pub(crate) merge: bool,
    /// No parent: the first commit, or a shallow clone's boundary.
    #[serde(skip)]
    pub(crate) root: bool,
    /// Against the first parent; `None` when Git printed no stat (an empty change).
    pub(crate) files: Option<u32>,
    pub(crate) insertions: Option<u32>,
    pub(crate) deletions: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LandedFile {
    /// Relative to the repository, in Git's `/` spelling.
    pub(crate) path: String,
    /// `None` for a binary file.
    pub(crate) insertions: Option<u32>,
    pub(crate) deletions: Option<u32>,
}

/// One change opened: the branch commits a merge brought, and the files it changed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LandedDetail {
    pub(crate) hash: String,
    /// Newest first, at most `DETAIL_LISTED`; empty for a squashed commit.
    pub(crate) commits: Vec<CommitLine>,
    pub(crate) commit_count: u32,
    /// Most changed first, at most `DETAIL_LISTED`.
    pub(crate) files: Vec<LandedFile>,
    pub(crate) file_count: u32,
}

/// What the list shows: the newest changes, and how many landed in the last seven days, which may
/// be more than were read.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LandedRead {
    pub(crate) changes: Vec<LandedChange>,
    pub(crate) week_count: Option<u32>,
}

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

/// The newest changes on the base branch's first-parent line, read only from the repository whose
/// own `.git` sits in `root`. One `git log` and one `git rev-list --count`.
pub(super) fn read_landed(root: &Path, base_branch: &str) -> Option<LandedRead> {
    if !is_branch_name(base_branch) {
        return None;
    }
    let shallow = common_dir(root)?.join("shallow").exists();
    let reference = format!("refs/heads/{base_branch}");
    let with_stat = log_landed(root, &reference, true);
    // A partial clone cannot diff without fetching; the list still stands without its stat.
    let text = match with_stat {
        Some(text) => text,
        None => log_landed(root, &reference, false)?,
    };
    let mut changes = parse_landed(&text);
    if shallow {
        // A shallow clone's boundary commit diffs against nothing, so its stat is the whole tree.
        for change in changes.iter_mut().filter(|change| change.root) {
            change.files = None;
            change.insertions = None;
            change.deletions = None;
        }
    }
    let week_count = git_read(
        root,
        &[
            "rev-list",
            "--count",
            "--first-parent",
            "--since=7.days.ago",
            &reference,
            "--",
        ],
    )
    .ok()
    .and_then(|text| text.trim().parse().ok());
    Some(LandedRead {
        changes,
        week_count,
    })
}

fn log_landed(root: &Path, reference: &str, stat: bool) -> Option<String> {
    let count = format!("-{LANDED_READ}");
    let mut args = vec![
        "log",
        &count,
        "--first-parent",
        "--no-color",
        "--format=%x1e%H%x1f%P%x1f%ct%x1f%s",
    ];
    if stat {
        args.extend(["--diff-merges=first-parent", "--shortstat", "--no-renames"]);
    }
    args.extend([reference, "--"]);
    git_read(root, &args).ok()
}

/// One change's branch commits and files. Two `git` reads: the commits beyond the first parent,
/// and the file stat against it.
pub(super) fn read_detail(root: &Path, hash: &str) -> Option<LandedDetail> {
    if !is_object_id(hash) {
        return None;
    }
    let shallow = common_dir(root)?.join("shallow").exists();
    let listed = git_read(root, &["rev-list", "--no-walk", "--parents", hash, "--"]).ok()?;
    let mut ids = listed.split_whitespace();
    // The answer names the commit itself first; anything else (a blob, a tree) is no change.
    if !ids.next()?.starts_with(&hash.to_ascii_lowercase()) {
        return None;
    }
    let parents: Vec<&str> = ids.collect();
    let all_commits = match parents.as_slice() {
        [first_parent, _, ..] => {
            // Every parent's commits the first parent lacks, octopus merges included.
            let range = format!("{first_parent}..{hash}");
            let text = git_read(
                root,
                &[
                    "log",
                    "--no-merges",
                    DETAIL_COMMITS_READ,
                    "--no-color",
                    "-z",
                    "--format=%h%x1f%ct%x1f%s",
                    &range,
                    "--",
                ],
            )
            .ok()?;
            super::activity::parse_all_log(&text)
        }
        _ => Vec::new(),
    };
    let numstat = match parents.first() {
        Some(parent) => git_read(
            root,
            &[
                "diff",
                "--numstat",
                "-z",
                "--no-renames",
                parent,
                hash,
                "--",
            ],
        )
        .ok()?,
        // A shallow boundary has parents Git cannot see; its stat would be the whole tree.
        None if shallow => String::new(),
        None => git_read(
            root,
            &[
                "show",
                "--numstat",
                "-z",
                "--no-renames",
                "--format=",
                hash,
                "--",
            ],
        )
        .ok()?,
    };
    let mut files = parse_numstat(&numstat);
    files.sort_by(|a, b| churn(b).cmp(&churn(a)).then_with(|| a.path.cmp(&b.path)));
    Some(LandedDetail {
        hash: hash.to_string(),
        commit_count: u32::try_from(all_commits.len()).unwrap_or(u32::MAX),
        commits: all_commits.into_iter().take(DETAIL_LISTED).collect(),
        file_count: u32::try_from(files.len()).unwrap_or(u32::MAX),
        files: files.into_iter().take(DETAIL_LISTED).collect(),
    })
}

fn churn(file: &LandedFile) -> u32 {
    file.insertions
        .unwrap_or(0)
        .saturating_add(file.deletions.unwrap_or(0))
}

fn is_object_id(text: &str) -> bool {
    (7..=64).contains(&text.len()) && text.chars().all(|c| c.is_ascii_hexdigit())
}

/// Parses `git log --format=%x1e%H%x1f%P%x1f%ct%x1f%s --shortstat`: each record starts a line with
/// the record separator, its fields on that line and an optional stat line after it. A subject never
/// holds a newline, so a separator inside one cannot start a record.
pub(crate) fn parse_landed(text: &str) -> Vec<LandedChange> {
    let record_start = format!("\n{RECORD}");
    text.strip_prefix(RECORD)
        .unwrap_or(text)
        .split(record_start.as_str())
        .filter_map(|record| {
            let (head, rest) = record.split_once('\n').unwrap_or((record, ""));
            let mut fields = head.splitn(4, FIELD);
            let hash = fields.next()?;
            let parents = fields.next()?;
            let at = fields.next()?;
            let subject = fields.next()?;
            if !is_object_id(hash) {
                return None;
            }
            let (files, insertions, deletions) = rest
                .lines()
                .find(|line| line.contains("changed"))
                .map(parse_shortstat)
                .unwrap_or((None, None, None));
            Some(LandedChange {
                hash: hash.to_string(),
                subject: clean_subject(subject),
                at: at.parse().ok(),
                merge: parents.split_whitespace().count() > 1,
                root: parents.trim().is_empty(),
                files,
                insertions,
                deletions,
            })
        })
        .take(LANDED_READ)
        .collect()
}

/// ` 3 files changed, 10 insertions(+), 2 deletions(-)`; a part Git leaves out is zero.
pub(crate) fn parse_shortstat(line: &str) -> (Option<u32>, Option<u32>, Option<u32>) {
    let mut files = None;
    let mut insertions = Some(0);
    let mut deletions = Some(0);
    for part in line.split(',') {
        let mut words = part.split_whitespace();
        let Some(number) = words.next().and_then(|word| word.parse::<u32>().ok()) else {
            continue;
        };
        match words.next() {
            Some(word) if word.starts_with("file") => files = Some(number),
            Some(word) if word.starts_with("insertion") => insertions = Some(number),
            Some(word) if word.starts_with("deletion") => deletions = Some(number),
            _ => {}
        }
    }
    if files.is_none() {
        return (None, None, None);
    }
    (files, insertions, deletions)
}

/// Parses `git diff --numstat -z --no-renames`: `added\tdeleted\tpath` records ended by NUL, `-`
/// for a binary file's counts.
pub(crate) fn parse_numstat(text: &str) -> Vec<LandedFile> {
    text.split('\0')
        .filter_map(|record| {
            let mut fields = record.trim_start_matches('\n').splitn(3, '\t');
            let added = fields.next()?;
            let deleted = fields.next()?;
            let path = fields.next()?;
            if path.is_empty() {
                return None;
            }
            Some(LandedFile {
                path: clean_subject(path),
                insertions: added.parse().ok(),
                deletions: deleted.parse().ok(),
            })
        })
        .collect()
}
