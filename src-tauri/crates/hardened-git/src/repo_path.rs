//! The name of a place inside a repository: what a vault, a page or an agent may say in a `git`
//! question, checked when it is built so no later code has to check it again.

/// A path inside a repository, `/`-separated, never absolute, never climbing, and never holding a
/// line break, because `cat-file --batch` and `log --stdin` read one name per line. `.` is the
/// repository root.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct RepoPath(String);

impl RepoPath {
    /// A name an agent or a page wrote: trailing slashes are dropped, and an empty name, an
    /// absolute one, one that starts with `-`, one with a backslash, a NUL, a line break or a
    /// `..` part is refused.
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

    /// A place built from the real names of the folders on the way, which may start with `-` or a
    /// space and may hold a backslash on a platform where that is a letter of a name: a folder the
    /// person made is never refused for its spelling, because every path goes to `git` after
    /// `--` and as a literal. `.` parts are skipped and no parts is the root. `None` for an empty
    /// part, a `..` part, or a part with a `/`, a NUL or a line break.
    pub fn from_parts<'a>(parts: impl IntoIterator<Item = &'a str>) -> Option<Self> {
        let mut kept: Vec<&str> = Vec::new();
        for part in parts {
            let refused = part.is_empty() || part == ".." || part.contains(['/', '\0', '\n', '\r']);
            if refused {
                return None;
            }
            if part != "." {
                kept.push(part);
            }
        }
        Some(if kept.is_empty() {
            Self::root()
        } else {
            Self(kept.join("/"))
        })
    }

    /// `below` placed under this place. `below` was already checked, so the result is too.
    #[must_use]
    pub fn join(&self, below: &Self) -> Self {
        match (self.0.as_str(), below.0.as_str()) {
            (".", _) => below.clone(),
            (_, ".") => self.clone(),
            (top, rest) => Self(format!("{top}/{rest}")),
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Whether `candidate`, a path git printed, is this place or lies under it.
    pub fn holds(&self, candidate: &str) -> bool {
        self.0 == "."
            || candidate == self.0
            || candidate
                .strip_prefix(self.0.as_str())
                .is_some_and(|rest| rest.starts_with('/'))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_name_an_agent_wrote_refuses_every_spelling_that_could_be_an_option_or_an_escape() {
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
        for (raw, kept) in [
            ("docs/ontology/", "docs/ontology"),
            (" src/a.ts ", "src/a.ts"),
            (":(top)x", ":(top)x"),
            (".", "."),
        ] {
            assert_eq!(
                RepoPath::new(raw).as_ref().map(RepoPath::as_str),
                Some(kept)
            );
        }
    }

    #[test]
    fn a_folder_the_person_made_is_never_refused_for_how_it_is_spelled() {
        for (parts, kept) in [
            (vec![], "."),
            (vec!["."], "."),
            (vec!["docs", "ontology"], "docs/ontology"),
            (vec![" notes"], " notes"),
            (vec!["-drafts", "a b"], "-drafts/a b"),
            (vec!["notes "], "notes "),
            (vec![":(top)"], ":(top)"),
        ] {
            assert_eq!(
                RepoPath::from_parts(parts.clone())
                    .as_ref()
                    .map(RepoPath::as_str),
                Some(kept),
                "{parts:?}"
            );
        }
        for refused in [
            vec![".."],
            vec!["a", ""],
            vec!["a/b"],
            vec!["a\nb"],
            vec!["a\0b"],
        ] {
            assert_eq!(RepoPath::from_parts(refused.clone()), None, "{refused:?}");
        }
    }

    #[test]
    fn a_checked_name_is_placed_under_a_folder_without_being_checked_again() {
        let vault = RepoPath::from_parts(["-drafts"]).expect("vault");
        let page = RepoPath::new("capabilities/pay.md").expect("page");
        assert_eq!(vault.join(&page).as_str(), "-drafts/capabilities/pay.md");
        assert_eq!(RepoPath::root().join(&page), page);
        assert_eq!(vault.join(&RepoPath::root()), vault);
    }

    #[test]
    fn a_place_holds_itself_and_what_is_below_it_by_whole_parts() {
        let docs = RepoPath::new("docs").expect("path");
        assert!(docs.holds("docs"));
        assert!(docs.holds("docs/a.md"));
        assert!(!docs.holds("docs-old/a.md"));
        assert!(!docs.holds("a/docs"));
        assert!(RepoPath::root().holds("anything/at/all"));
    }
}
