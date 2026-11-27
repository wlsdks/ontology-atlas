//! Text as `find_evidence` compares it: in lower case and in one Unicode form, so a Korean title
//! typed on one machine (NFC) is found in a note pasted from another (macOS file names are NFD).

use std::borrow::Cow;

use icu_normalizer::ComposingNormalizerBorrowed;

/// `text` in lower case and NFC. ASCII text with no capital is returned as it is.
pub(crate) fn folded(text: &str) -> Cow<'_, str> {
    if text.is_ascii() && !text.bytes().any(|byte| byte.is_ascii_uppercase()) {
        return Cow::Borrowed(text);
    }
    let lowered = text.to_lowercase();
    match ComposingNormalizerBorrowed::new_nfc().normalize(&lowered) {
        Cow::Borrowed(_) => Cow::Owned(lowered),
        Cow::Owned(normalized) => Cow::Owned(normalized),
    }
}

/// The words of folded text: runs of letters and digits of any script.
pub(crate) fn words(folded: &str) -> impl Iterator<Item = &str> {
    folded
        .split(|character: char| !character.is_alphanumeric())
        .filter(|word| !word.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn composed_and_decomposed_text_fold_to_the_same_text() {
        // U+C8FC is U+110C U+116E decomposed; U+00C9 is E and a combining acute.
        assert_eq!(folded("\u{c8fc}\u{bb38}"), folded("\u{110c}\u{116e}\u{1106}\u{116e}\u{11ab}"));
        assert_eq!(folded("E\u{301}clair"), folded("\u{c9}clair"));
        assert_eq!(folded("\u{c9}CLAIR"), "\u{e9}clair");
    }

    #[test]
    fn words_are_letters_and_digits_of_any_script() {
        let text = folded("\u{c8fc}\u{bb38} \u{CDE8}\u{c18c}-v2, Order");
        assert_eq!(
            words(&text).collect::<Vec<_>>(),
            ["\u{c8fc}\u{bb38}", "\u{CDE8}\u{c18c}", "v2", "order"]
        );
    }
}
