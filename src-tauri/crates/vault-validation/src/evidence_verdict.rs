//! Does one concept still stand on the code it cites? The four-word answer the screen and the
//! server share: `current`, `stale`, `missing` or `unknown`, from the dates of the cited paths
//! against the date of the concept's document.

use std::collections::HashSet;

use answer_format::iso_time::parse_iso;

/// What the history and the working tree say of one path.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PathChange {
    pub exists: bool,
    pub is_dir: bool,
    pub last_changed_at: Option<String>,
    pub last_commit: Option<String>,
}

/// A cited path and what is known of it; `None` when the walk was not asked about it.
pub struct CitedEntry<'a> {
    pub path: &'a str,
    pub change: Option<&'a PathChange>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MovedPath {
    pub path: String,
    pub changed_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    Current,
    Stale,
    Missing,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Judgement {
    pub verdict: Verdict,
    /// Why the verdict is unknown.
    pub reason: Option<&'static str>,
    pub moved: Vec<MovedPath>,
    pub folders: Vec<MovedPath>,
    pub gone: Vec<String>,
}

/// One (document commit, cited file) pair.
pub type EvidencePair = (String, String);

/// Judges a concept from the commit that dates its document, the date of that commit, and each
/// cited path. A gone path beats a moved file, which beats anything undated; a moved folder is
/// never `stale`, since a folder changes on almost any commit. A file the dates call moved is not
/// moved when `unchanged` holds it at `doc_commit`: only comments, imports or layout changed.
pub fn judge_evidence(
    doc_changed_at: Option<&str>,
    doc_commit: Option<&str>,
    unchanged: Option<&HashSet<EvidencePair>>,
    entries: &[CitedEntry<'_>],
) -> Judgement {
    let mut judgement = Judgement {
        verdict: Verdict::Unknown,
        reason: None,
        moved: Vec::new(),
        folders: Vec::new(),
        gone: Vec::new(),
    };
    if entries.is_empty() {
        judgement.reason = Some("no-evidence");
        return judgement;
    }
    let doc_ms = doc_changed_at.and_then(parse_iso);
    let (mut unwalked, mut undated) = (false, false);
    for entry in entries {
        let Some(change) = entry.change else {
            unwalked = true;
            continue;
        };
        if !change.exists {
            judgement.gone.push(entry.path.to_string());
            continue;
        }
        let (Some(doc_ms), Some(changed_at)) = (doc_ms, change.last_changed_at.as_deref()) else {
            undated = true;
            continue;
        };
        let Some(change_ms) = parse_iso(changed_at) else {
            continue;
        };
        if change_ms <= doc_ms {
            continue;
        }
        let row = MovedPath {
            path: entry.path.to_string(),
            changed_at: changed_at.to_string(),
        };
        if change.is_dir {
            judgement.folders.push(row);
        } else {
            let only_cosmetic = doc_commit.is_some_and(|commit| {
                unchanged.is_some_and(|pairs| {
                    pairs.contains(&(commit.to_string(), entry.path.to_string()))
                })
            });
            if !only_cosmetic {
                judgement.moved.push(row);
            }
        }
    }
    let (verdict, reason) = if !judgement.gone.is_empty() {
        (Verdict::Missing, None)
    } else if !judgement.moved.is_empty() {
        (Verdict::Stale, None)
    } else if unwalked {
        (Verdict::Unknown, Some("path-not-walked"))
    } else if undated {
        let reason = if doc_ms.is_none() {
            "document-time-unknown"
        } else {
            "path-time-unknown"
        };
        (Verdict::Unknown, Some(reason))
    } else if !judgement.folders.is_empty() {
        (Verdict::Unknown, Some("folder-only"))
    } else {
        (Verdict::Current, None)
    };
    judgement.verdict = verdict;
    judgement.reason = reason;
    judgement
}

#[cfg(test)]
mod tests {
    use super::*;

    fn change(exists: bool, is_dir: bool, at: Option<&str>) -> PathChange {
        PathChange {
            exists,
            is_dir,
            last_changed_at: at.map(ToString::to_string),
            last_commit: None,
        }
    }

    #[test]
    fn a_gone_path_beats_a_moved_file_and_a_moved_folder_is_never_stale() {
        let doc = Some("2026-01-10T00:00:00+00:00");
        let moved = change(true, false, Some("2026-02-01T00:00:00+00:00"));
        let gone = change(false, false, None);
        let folder = change(true, true, Some("2026-02-01T00:00:00+00:00"));
        let entry = |path, change| CitedEntry { path, change };
        let both = judge_evidence(doc, None, None, &[entry("a", Some(&moved)), entry("b", Some(&gone))]);
        assert_eq!(both.verdict, Verdict::Missing);
        let only_folder = judge_evidence(doc, None, None, &[entry("dir", Some(&folder))]);
        assert_eq!((only_folder.verdict, only_folder.reason), (Verdict::Unknown, Some("folder-only")));
        let unseen = judge_evidence(doc, None, None, &[entry("a", None)]);
        assert_eq!(unseen.reason, Some("path-not-walked"));
    }

    #[test]
    fn a_moved_file_with_only_cosmetic_changes_stays_current() {
        let moved = change(true, false, Some("2026-02-01T00:00:00+00:00"));
        let entries = [CitedEntry { path: "a.ts", change: Some(&moved) }];
        let doc = Some("2026-01-10T00:00:00+00:00");
        let cosmetic: HashSet<EvidencePair> = [("c1".to_string(), "a.ts".to_string())].into();
        assert_eq!(judge_evidence(doc, Some("c1"), Some(&cosmetic), &entries).verdict, Verdict::Current);
        assert_eq!(judge_evidence(doc, Some("c1"), None, &entries).verdict, Verdict::Stale);
    }
}
