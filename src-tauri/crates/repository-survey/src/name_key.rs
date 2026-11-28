//! The comparable form of a name: `signed-streams`, `SignedStreams` and `signed_streams` agree.

use std::sync::LazyLock;

use regex::Regex;

use crate::js_pattern::js_regex;

static LOWER_THEN_UPPER: LazyLock<Regex> = LazyLock::new(|| js_regex(r"([a-z0-9])([A-Z])"));
static ACRONYM_THEN_WORD: LazyLock<Regex> = LazyLock::new(|| js_regex(r"([A-Z]+)([A-Z][a-z])"));

/// `metricsCLIFlags`, `add_train_arguments` and `SignedStreams` as lower-case words.
pub fn words_of(name: &str) -> Vec<String> {
    let spaced = LOWER_THEN_UPPER.replace_all(name, "$1 $2");
    let spaced = ACRONYM_THEN_WORD.replace_all(&spaced, "$1 $2");
    spaced
        .split(|character: char| !character.is_ascii_alphanumeric())
        .filter(|word| !word.is_empty())
        .map(str::to_ascii_lowercase)
        .collect()
}

/// The words of `name` with a plural `s` dropped from each, joined.
pub fn name_key(name: &str) -> String {
    words_of(name)
        .iter()
        .map(|word| word.strip_suffix('s').unwrap_or(word))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spelling_in_any_case_or_separator_gives_one_key() {
        assert_eq!(name_key("signed-streams"), "signedstream");
        assert_eq!(name_key("SignedStreams"), "signedstream");
        assert_eq!(name_key("signed_streams"), "signedstream");
        assert_eq!(words_of("metricsCLIFlags"), ["metrics", "cli", "flags"]);
    }
}
