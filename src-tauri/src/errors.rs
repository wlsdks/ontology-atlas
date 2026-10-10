//! Commands fail as `<code>` or `<code>: <detail>`; the screen localizes the code
//! through `nativeErrors` because Rust cannot know the reader's locale. `code` is
//! kebab-case ASCII and `detail` is machine fact (OS error, stderr), never prose,
//! or it becomes a sentence nobody can translate (`src/shared/lib/native-error.ts`).

use std::fmt;

/// Whitespace in the detail is squeezed so multi-line stderr stays one line.
pub(crate) fn coded(code: &str, detail: impl fmt::Display) -> String {
    let squeezed = squeeze(&detail.to_string());
    if squeezed.is_empty() {
        code.to_string()
    } else {
        format!("{code}: {squeezed}")
    }
}

pub(crate) fn squeeze(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_detail_rides_behind_the_code() {
        assert_eq!(
            coded("keychain-unavailable", "No such keychain"),
            "keychain-unavailable: No such keychain"
        );
    }

    #[test]
    fn no_detail_leaves_the_code_alone() {
        // A bare code stays bare: a trailing `": "` would show an empty parenthesis.
        assert_eq!(coded("secret-empty", ""), "secret-empty");
        assert_eq!(coded("secret-empty", "   \n"), "secret-empty");
    }

    #[test]
    fn a_multi_line_detail_arrives_as_one_line() {
        assert_eq!(
            coded("git-command-failed", "fatal: bad thing\n  hint: try this\n"),
            "git-command-failed: fatal: bad thing hint: try this"
        );
    }

    #[test]
    fn any_displayable_detail_is_accepted() {
        let io = std::io::Error::other("broken pipe");
        assert_eq!(coded("request-failed", io), "request-failed: broken pipe");
        assert_eq!(coded("model-invalid", 42), "model-invalid: 42");
    }

    #[test]
    fn every_code_this_crate_mints_is_kebab_case() {
        // The screen matches codes literally; a space, capital or colon silently
        // breaks the lookup.
        let sources = [
            include_str!("errors.rs"),
            include_str!("git/document.rs"),
            include_str!("git/remote.rs"),
            include_str!("git/repo.rs"),
            include_str!("git/runner.rs"),
            include_str!("git/setup.rs"),
            include_str!("git/snapshot.rs"),
            include_str!("llm/chat.rs"),
            include_str!("llm/chat/request.rs"),
            include_str!("llm/curl.rs"),
            include_str!("llm/local_endpoint.rs"),
            include_str!("llm/verify.rs"),
            include_str!("llm_audit.rs"),
            include_str!("secrets.rs"),
        ];
        let mut checked = 0usize;
        for source in sources {
            for tail in source.split("coded(\"").skip(1) {
                let Some(code) = tail.split('"').next() else {
                    continue;
                };
                checked += 1;
                assert!(
                    !code.is_empty()
                        && code
                            .chars()
                            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
                        && !code.starts_with('-')
                        && !code.ends_with('-'),
                    "not a kebab-case code: {code:?}"
                );
            }
        }
        assert!(checked > 20, "the scan found only {checked} codes");
    }
}
