//! One shape for every failure a `#[tauri::command]` hands back to the WebView.
//!
//! ## Why this exists
//!
//! Commands used to answer with a finished Korean sentence. The WebView printed
//! it verbatim, so an English-locale reader met Korean and a Korean reader met
//! whatever wording Rust happened to hold. Rust cannot know the reader's
//! language: the locale lives in the frontend router, not in the process.
//!
//! So Rust stops writing sentences and writes a **code**, following the two
//! prefixes this crate already minted (`vault-root-rejected:` in `lib.rs`,
//! `audit-blocked:` and `timed-out:` in `llm.rs`). The screen owns the sentence
//! and looks it up in `messages/<locale>.json` under `nativeErrors`.
//!
//! ## The wire shape
//!
//! ```text
//! <code>                 e.g. "secret-empty"
//! <code>: <detail>       e.g. "keychain-unavailable: No such keychain"
//! ```
//!
//! `code` is kebab-case ASCII. `detail` is **machine-supplied fact only** — an
//! OS error, git's own stderr, a provider or model name the user typed. Never
//! prose, because prose in the detail is a second sentence nobody can translate,
//! which is the defect this module exists to remove. The frontend
//! (`src/shared/lib/native-error.ts`) shows the localized sentence and appends
//! the detail in parentheses when there is one; an unknown code degrades to the
//! English detail rather than to nothing.

use std::fmt;

/// `code` alone, or `code: detail` when the detail carries something.
///
/// Whitespace inside the detail is squeezed to single spaces so that a
/// multi-line `git` stderr still arrives as one line the screen can print.
pub(crate) fn coded(code: &str, detail: impl fmt::Display) -> String {
    let squeezed = squeeze(&detail.to_string());
    if squeezed.is_empty() {
        code.to_string()
    } else {
        format!("{code}: {squeezed}")
    }
}

/// Collapse every run of whitespace into one space and trim the ends.
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
        // A bare code must stay bare: a trailing `": "` would reach the screen as
        // an empty parenthesis after the localized sentence.
        assert_eq!(coded("secret-empty", ""), "secret-empty");
        assert_eq!(coded("secret-empty", "   \n"), "secret-empty");
    }

    #[test]
    fn a_multi_line_detail_arrives_as_one_line() {
        // git writes several lines to stderr; the screen prints one.
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
        // The screen matches these literally. A code with a space, a capital, or a
        // colon in it silently stops matching and the reader gets the raw English
        // detail forever — a failure no compiler on either side can see.
        let sources = [
            include_str!("errors.rs"),
            include_str!("git.rs"),
            include_str!("llm.rs"),
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
