//! The repository-relative file paths a relation's note names: a `/` and an extension, backticked
//! or not, with the quotes, brackets and punctuation of a sentence taken off and the `:42` or
//! `#L42` an editor copies taken off the end.

use std::collections::BTreeSet;
use std::sync::LazyLock;

use answer_format::utf16;
use answer_format::whitespace::is_whitespace;
use regex::Regex;

const OPENERS: [char; 8] = ['(', '[', '{', '"', '\'', '`', '\u{201c}', '\u{2018}'];
const CLOSERS: [char; 14] = [
    ')', ']', '}', '"', '\'', '`', '\u{201d}', '\u{2019}', '.', ',', ';', ':', '!', '?',
];
const MAX_TOKEN_UNITS: usize = 1024;

static LINE_SUFFIX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?:(?::[0-9]+(?:[-\u{2013}][0-9]+)?(?::[0-9]+)?)|#L[0-9]+(?:-L?[0-9]+)?)$")
        .unwrap_or_else(|_| unreachable!("line suffix pattern"))
});
static EXTENSION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\.[A-Za-z][A-Za-z0-9]{0,9}$").unwrap_or_else(|_| unreachable!("extension pattern"))
});

fn trim_edges(token: &str) -> &str {
    token
        .trim_start_matches(|character| OPENERS.contains(&character))
        .trim_end_matches(|character| CLOSERS.contains(&character))
}

/// The paths `text` names, each once.
pub fn path_tokens_in(text: &str) -> BTreeSet<String> {
    let mut tokens = BTreeSet::new();
    for raw in text.split(is_whitespace).filter(|part| !part.is_empty()) {
        if utf16::len(raw) > MAX_TOKEN_UNITS {
            continue;
        }
        let mut token = raw.to_string();
        loop {
            let trimmed = trim_edges(&token);
            let stripped = LINE_SUFFIX.replace(trimmed, "").into_owned();
            if stripped == token {
                break;
            }
            token = stripped;
        }
        if token.is_empty()
            || token.starts_with("http://")
            || token.starts_with("https://")
            || !token.contains('/')
            || !EXTENSION.is_match(&token)
        {
            continue;
        }
        tokens.insert(token);
    }
    tokens
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_path_in_a_sentence_loses_its_punctuation_and_its_line_suffix() {
        let found = path_tokens_in("Wired by `src/bridge.ts`:12, see (docs/a.md#L3-L9) and https://x.dev/a.js, not nav.");
        let names: Vec<&str> = found.iter().map(String::as_str).collect();
        assert_eq!(names, ["docs/a.md", "src/bridge.ts"]);
    }
}
