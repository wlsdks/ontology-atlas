//! What one `git status` run says about a working tree: where `HEAD` is, and which files differ.
//! Both come from the same run, so a commit made while the answer is built cannot leave the head
//! and the rows disagreeing, which a head read in one process and the rows in another allow.

use crate::repository::{CommitId, GitReadError};

/// Where `HEAD` points.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HeadState {
    /// On a branch that has no commit yet.
    Unborn {
        branch: String,
    },
    Branch {
        branch: String,
        commit: CommitId,
    },
    Detached {
        commit: CommitId,
    },
}

impl HeadState {
    pub fn commit(&self) -> Option<&CommitId> {
        match self {
            Self::Unborn { .. } => None,
            Self::Branch { commit, .. } | Self::Detached { commit } => Some(commit),
        }
    }

    pub fn branch(&self) -> Option<&str> {
        match self {
            Self::Unborn { branch } | Self::Branch { branch, .. } => Some(branch),
            Self::Detached { .. } => None,
        }
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

/// One changed path. A rename is two rows, the old path deleted and the new one added or
/// untracked, whatever `status.renames` or `diff.renames` the person configured.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusRow {
    /// As git printed it, with bytes that are not UTF-8 read as U+FFFD.
    pub path: String,
    /// The two status letters of `git status --short`; a space is unchanged.
    pub index: char,
    pub worktree: char,
    pub kind: ChangeKind,
    pub staged: bool,
    pub unstaged: bool,
}

impl StatusRow {
    fn new(path: String, index: char, worktree: char) -> Self {
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
        Self {
            path,
            index,
            worktree,
            kind,
            staged: !untracked && index != ' ',
            unstaged: untracked || worktree != ' ',
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkingTree {
    pub head: HeadState,
    pub rows: Vec<StatusRow>,
}

fn unreadable(message: &str) -> GitReadError {
    GitReadError::Failed {
        subcommand: "status".to_string(),
        message: message.to_string(),
    }
}

/// The text of `git status --porcelain=v2 -z --branch`. Fields of a row are separated by one
/// space and the path is the rest, so a path may hold spaces; records end at a NUL, so it may
/// hold anything but a NUL.
pub(crate) fn parse_working_tree(text: &str) -> Result<WorkingTree, GitReadError> {
    let mut oid: Option<&str> = None;
    let mut branch: Option<&str> = None;
    let mut rows = Vec::new();
    let mut records = text.split('\0').filter(|record| !record.is_empty());
    while let Some(record) = records.next() {
        if let Some(header) = record.strip_prefix("# ") {
            match header.split_once(' ') {
                Some(("branch.oid", value)) => oid = Some(value),
                Some(("branch.head", value)) => branch = Some(value),
                _ => {}
            }
            continue;
        }
        let (fixed_fields, record_kind) = match record.chars().next() {
            Some('?') => {
                let path = record.get(2..).unwrap_or_default();
                rows.push(StatusRow::new(path.to_string(), '?', '?'));
                continue;
            }
            Some('1') => (9, '1'),
            Some('2') => (10, '2'),
            Some('u') => (11, 'u'),
            _ => continue,
        };
        let fields: Vec<&str> = record.splitn(fixed_fields, ' ').collect();
        let (Some(letters), Some(path)) = (fields.get(1), fields.get(fixed_fields - 1)) else {
            return Err(unreadable("a row with fewer fields than its kind has"));
        };
        let mut letters = letters
            .chars()
            .map(|letter| if letter == '.' { ' ' } else { letter });
        let index = letters.next().unwrap_or(' ');
        let worktree = letters.next().unwrap_or(' ');
        rows.push(StatusRow::new(path.to_string(), index, worktree));
        if record_kind == '2' {
            // A rename row names the old path in the next record; `--no-renames` never asks
            // for one, but a git that ignored it must not make the old path a row of its own.
            records.next();
        }
    }
    let branch = branch.ok_or_else(|| unreadable("no branch.head header"))?;
    let head = match (oid, branch) {
        (Some("(initial)"), name) => HeadState::Unborn {
            branch: name.to_string(),
        },
        (Some(id), "(detached)") => HeadState::Detached {
            commit: CommitId::new(id)
                .ok_or_else(|| unreadable("a branch.oid that is no commit"))?,
        },
        (Some(id), name) => HeadState::Branch {
            branch: name.to_string(),
            commit: CommitId::new(id)
                .ok_or_else(|| unreadable("a branch.oid that is no commit"))?,
        },
        (None, _) => return Err(unreadable("no branch.oid header")),
    };
    Ok(WorkingTree { head, rows })
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "0123456789abcdef0123456789abcdef01234567";

    fn summary(tree: &WorkingTree) -> Vec<(&str, ChangeKind, bool, bool)> {
        tree.rows
            .iter()
            .map(|row| (row.path.as_str(), row.kind, row.staged, row.unstaged))
            .collect()
    }

    #[test]
    fn a_row_follows_its_two_letters_and_keeps_a_path_with_spaces_whole() {
        let text = format!(
            "# branch.oid {ID}\0# branch.head main\0\
             1 .M N... 100644 100644 100644 {ID} {ID} changed file.md\0\
             1 A. N... 000000 100644 100644 {ID} {ID} added.md\0\
             1 D. N... 100644 000000 000000 {ID} {ID} gone.md\0\
             1 .D N... 100644 100644 000000 {ID} {ID} gone-too.md\0\
             1 MM N... 100644 100644 100644 {ID} {ID} both.md\0\
             u UU N... 100644 100644 100644 100644 {ID} {ID} {ID} clash.md\0\
             ? new file.md\0"
        );
        let tree = parse_working_tree(&text).expect("parsed");
        assert_eq!(
            summary(&tree),
            [
                ("changed file.md", ChangeKind::Modified, false, true),
                ("added.md", ChangeKind::Added, true, false),
                ("gone.md", ChangeKind::Deleted, true, false),
                ("gone-too.md", ChangeKind::Deleted, false, true),
                ("both.md", ChangeKind::Modified, true, true),
                ("clash.md", ChangeKind::Modified, true, true),
                ("new file.md", ChangeKind::Untracked, false, true),
            ]
        );
        let letters: Vec<(char, char)> = tree.rows.iter().map(|r| (r.index, r.worktree)).collect();
        assert_eq!(
            letters[0],
            (' ', 'M'),
            "an unchanged side reads as a space, as in --short"
        );
    }

    #[test]
    fn the_headers_tell_a_branch_a_detached_head_and_a_branch_before_its_first_commit() {
        let on_branch = parse_working_tree(&format!("# branch.oid {ID}\0# branch.head topic\0"));
        assert_eq!(
            on_branch.expect("parsed").head,
            HeadState::Branch {
                branch: "topic".into(),
                commit: CommitId::new(ID).expect("id")
            }
        );
        let detached =
            parse_working_tree(&format!("# branch.oid {ID}\0# branch.head (detached)\0"));
        assert_eq!(detached.expect("parsed").head.branch(), None);
        let unborn = parse_working_tree("# branch.oid (initial)\0# branch.head main\0");
        let unborn = unborn.expect("parsed").head;
        assert_eq!((unborn.commit(), unborn.branch()), (None, Some("main")));
        assert!(parse_working_tree("").is_err(), "no headers is no answer");
    }
}
