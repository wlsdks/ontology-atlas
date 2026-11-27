//! Which files each commit touched, newest commit first, for the paths a caller asks about. It is
//! the raw material of dating a file by its history; the rules of dating belong to the caller.

use crate::repository::CommitId;

/// One path a commit touched and the blob it left there (all zeros for a deletion).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Touch {
    pub blob: String,
    pub path: String,
}

/// A commit and the paths it touched among those asked about.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TouchedCommit {
    pub commit: CommitId,
    /// The commit time, `%cI`.
    pub committed_at: String,
    pub touches: Vec<Touch>,
}

const RECORD_START: char = '\u{1e}';

/// The text of `git log -z --format=%x1e%H %cI --raw --no-abbrev --no-renames`. A commit starts
/// at a record separator; each of its raw lines is a `:` token and then the path as the next
/// token, so a path is read whole whatever it holds (a tab, a quote, non-ASCII letters) and
/// never needs git's C-style quoting undone. A path token is taken as a path before it is asked
/// whether it starts a commit, so a name that begins with the separator stays a name.
pub(crate) fn parse_touch_history(text: &str) -> Vec<TouchedCommit> {
    let mut commits: Vec<TouchedCommit> = Vec::new();
    let mut skipping = false;
    let mut tokens = text.split('\0');
    while let Some(token) = tokens.next() {
        if let Some(header) = token.strip_prefix(RECORD_START) {
            let parsed = header
                .split_once(' ')
                .and_then(|(hash, at)| Some((CommitId::new(hash)?, at.trim())))
                .filter(|(_, at)| !at.is_empty());
            skipping = parsed.is_none();
            if let Some((commit, at)) = parsed {
                commits.push(TouchedCommit {
                    commit,
                    committed_at: at.to_string(),
                    touches: Vec::new(),
                });
            }
            continue;
        }
        let Some(meta) = token.trim_start_matches('\n').strip_prefix(':') else {
            continue;
        };
        let path = tokens.next();
        let blob = meta.split(' ').nth(3).filter(|blob| !blob.is_empty());
        if let (false, Some(path), Some(blob), Some(current)) =
            (skipping, path, blob, commits.last_mut())
        {
            current.touches.push(Touch {
                blob: blob.to_string(),
                path: path.to_string(),
            });
        }
    }
    commits
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const B: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const BLOB: &str = "1111111111111111111111111111111111111111";
    const ZERO: &str = "0000000000000000000000000000000000000000";

    #[test]
    fn a_path_is_read_whole_and_a_commit_with_no_touch_is_kept() {
        let text = format!(
            "\u{1e}{A} 2026-01-02T00:00:00+09:00\0\n:100644 100644 {BLOB} {BLOB} M\0d/a b\tc.md\0\
             :100644 000000 {BLOB} {ZERO} D\0\u{1e}gone.md\0\
             \u{1e}{B} 2026-01-01T00:00:00+09:00\0"
        );
        let commits = parse_touch_history(&text);
        assert_eq!(commits.len(), 2);
        let first: Vec<(&str, &str)> = commits
            .first()
            .map(|commit| {
                commit
                    .touches
                    .iter()
                    .map(|touch| (touch.path.as_str(), touch.blob.as_str()))
                    .collect()
            })
            .unwrap_or_default();
        assert_eq!(
            first,
            [("d/a b\tc.md", BLOB), ("\u{1e}gone.md", ZERO)],
            "a tab stays a tab and a name that starts with the separator stays a name"
        );
        assert_eq!(commits.get(1).map(|c| c.touches.len()), Some(0));
    }

    #[test]
    fn a_header_that_is_no_commit_drops_the_touches_that_follow_it() {
        let text = format!(
            "\u{1e}not-a-commit 2026\0\n:100644 100644 {BLOB} {BLOB} M\0stray.md\0\
             \u{1e}{A} 2026-01-02T00:00:00Z\0\n:100644 100644 {BLOB} {BLOB} M\0kept.md\0"
        );
        let commits = parse_touch_history(&text);
        assert_eq!(commits.len(), 1);
        assert_eq!(
            commits.first().map(|c| c.touches.len()),
            Some(1),
            "only the real commit's touch is kept"
        );
    }
}
