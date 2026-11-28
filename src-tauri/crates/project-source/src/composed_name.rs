//! A path as one spelling: composed (NFC), the form a Windows, macOS and Linux checkout of one tree
//! share, so a fingerprint does not depend on which of them wrote the name.

use icu_normalizer::ComposingNormalizerBorrowed;

pub(crate) fn composed(text: &str) -> String {
    if text.is_ascii() {
        return text.to_string();
    }
    ComposingNormalizerBorrowed::new_nfc()
        .normalize(text)
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_decomposed_name_becomes_the_composed_one() {
        assert_eq!(composed("e\u{301}.ts"), "\u{e9}.ts");
        assert_eq!(composed("a.ts"), "a.ts");
    }
}
