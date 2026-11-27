//! The order `a.localeCompare(b, 'en')` gives: the Unicode collation algorithm with the English
//! tailoring (the root one), at the default tertiary strength. Every list the server sorts for a
//! person uses it, so two machines list the same names in the same order.

use std::cmp::Ordering;
use std::sync::OnceLock;

use icu_collator::options::CollatorOptions;
use icu_collator::{Collator, CollatorBorrowed, CollatorPreferences};
use icu_locale_core::locale;

fn english() -> Option<&'static CollatorBorrowed<'static>> {
    static COLLATOR: OnceLock<Option<CollatorBorrowed<'static>>> = OnceLock::new();
    COLLATOR
        .get_or_init(|| {
            let preferences = CollatorPreferences::from(&locale!("en"));
            Collator::try_new(preferences, CollatorOptions::default()).ok()
        })
        .as_ref()
}

/// `left.localeCompare(right, 'en')`. Should the collation data be unreadable (it is compiled
/// in), strings compare by UTF-16 code unit, which still orders every list the same way twice.
pub fn compare(left: &str, right: &str) -> Ordering {
    match english() {
        Some(collator) => collator.compare(left, right),
        None => crate::utf16::compare(left, right),
    }
}

/// Sorts as `items.sort((a, b) => a.localeCompare(b, 'en'))` does; equal items keep their order.
pub fn sort<S: AsRef<str>>(items: &mut [S]) {
    items.sort_by(|left, right| compare(left.as_ref(), right.as_ref()));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collation_data_is_present() {
        assert!(english().is_some());
    }

    #[test]
    fn letters_sort_by_alphabet_before_case_and_lowercase_comes_first_on_a_tie() {
        let mut items = ["b", "B", "a", "A", "ab", "Ab"];
        sort(&mut items);
        assert_eq!(items, ["a", "A", "ab", "Ab", "b", "B"]);
    }

    #[test]
    fn accents_follow_their_base_letter() {
        let mut items = ["z", "é", "e", "f", "E"];
        sort(&mut items);
        assert_eq!(items, ["e", "E", "é", "f", "z"]);
    }

    #[test]
    fn punctuation_and_digits_sort_before_letters_and_hangul_after_latin() {
        let mut items = ["가", "b", "_a", "1", "a", "나", "😀"];
        sort(&mut items);
        assert_eq!(items, ["_a", "😀", "1", "a", "b", "가", "나"]);
    }

    #[test]
    fn decomposed_and_composed_hangul_compare_equal() {
        assert_eq!(compare("\u{ac00}", "\u{1100}\u{1161}"), Ordering::Equal);
    }
}
