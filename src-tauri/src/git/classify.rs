use super::runner::GitRun;
use crate::errors::coded;

#[cfg(test)]
mod tests;

/// A code the screen localizes through `nativeErrors`, plus git's own first line
/// as detail, because only git knows what went wrong (see `errors.rs`).
pub(super) struct GitErrorInfo {
    /// Also the prefix of the `Err(String)` payload.
    code: &'static str,
    /// Machine detail, never prose.
    note: Option<String>,
    /// Untranslated: it is typed verbatim into a shell.
    pub(super) guidance: Option<String>,
}

pub(super) fn classify_git_error(raw: &str, operation: &str) -> GitErrorInfo {
    let text = raw.to_lowercase();
    let first_line = first_nonempty_line(raw);

    if text.contains("non-fast-forward")
        || text.contains("updates were rejected")
        || (text.contains("[rejected]") && text.contains("fetch first"))
    {
        return GitErrorInfo {
            code: "push-non-fast-forward",
            note: first_line,
            guidance: Some("git pull".into()),
        };
    }

    if text.contains("gpg failed to sign")
        || text.contains("signing failed")
        || (text.contains("gpg") && text.contains("sign"))
    {
        return GitErrorInfo {
            code: "gpg-sign-failed",
            note: first_line,
            guidance: Some("git config commit.gpgsign false".into()),
        };
    }

    if text.contains("cannot do a partial commit") {
        return GitErrorInfo {
            code: "merge-in-progress",
            note: first_line,
            guidance: Some("git status".into()),
        };
    }

    if text.contains("conflict") || text.contains("automatic merge failed") {
        return GitErrorInfo {
            code: "pull-conflict",
            note: first_line,
            guidance: Some("git status".into()),
        };
    }

    if text.contains("would be overwritten") || text.contains("overwritten by merge") {
        return GitErrorInfo {
            code: "local-changes",
            note: first_line,
            guidance: None,
        };
    }

    if text.contains("no tracking information")
        || text.contains("couldn't find remote ref")
        || text.contains("no such remote")
    {
        return GitErrorInfo {
            code: "no-upstream",
            note: first_line,
            guidance: Some("git push -u origin <branch>".into()),
        };
    }

    if text.contains("repository not found")
        || text.contains("could not read from remote")
        || text.contains("does not appear to be a git repository")
    {
        return GitErrorInfo {
            code: "remote-unreachable",
            note: first_line,
            guidance: Some("git remote -v".into()),
        };
    }

    if text.contains("authentication failed")
        || text.contains("permission denied")
        || text.contains("could not read username")
    {
        return GitErrorInfo {
            code: "remote-auth",
            note: first_line,
            guidance: None,
        };
    }

    if text.contains("pre-commit") || text.contains("commit-msg") || text.contains("hook") {
        return GitErrorInfo {
            code: "pre-commit-hook",
            note: first_line,
            guidance: None,
        };
    }

    if operation == "commit" {
        return GitErrorInfo {
            code: "commit-rejected",
            note: first_line,
            guidance: None,
        };
    }
    GitErrorInfo {
        code: "git-command-failed",
        // Which command failed rides with the note instead of eleven translated sentences.
        note: Some(match first_line {
            Some(line) => format!("git {operation}: {line}"),
            None => format!("git {operation}"),
        }),
        guidance: None,
    }
}

/// `<code>: <git's words>`.
pub(super) fn classified_error_string(info: &GitErrorInfo) -> String {
    coded(info.code, info.note.clone().unwrap_or_default())
}

pub(super) fn git_error_text(run: &GitRun) -> String {
    let mut parts = Vec::new();
    if !run.stderr.trim().is_empty() {
        parts.push(run.stderr.clone());
    }
    if !run.stdout.trim().is_empty() {
        parts.push(run.stdout.clone());
    }
    parts.join("\n")
}

pub(super) fn first_nonempty_line(text: &str) -> Option<String> {
    text.lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty())
        .map(|l| l.to_string())
}
