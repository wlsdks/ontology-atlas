//! The order `Intl.Collator('en')` gives two strings: the one fixed order every list uses, whatever
//! language the process or the person's terminal is set to.

use std::cmp::Ordering;
use std::sync::OnceLock;

use icu_collator::options::CollatorOptions;
use icu_collator::{CollatorBorrowed, CollatorPreferences};
use icu_locale_core::locale;

fn english() -> &'static CollatorBorrowed<'static> {
    static COLLATOR: OnceLock<CollatorBorrowed<'static>> = OnceLock::new();
    COLLATOR.get_or_init(|| {
        CollatorBorrowed::try_new(
            CollatorPreferences::from(&locale!("en")),
            CollatorOptions::default(),
        )
        .unwrap_or_else(|_| missing_data())
    })
}

#[allow(
    clippy::panic,
    reason = "the collation tables are compiled in, so building the collator cannot fail"
)]
fn missing_data() -> CollatorBorrowed<'static> {
    panic!("the English collation tables are linked into this program")
}

/// `compareText` of the JavaScript server: `new Intl.Collator('en').compare(left, right)`.
pub fn compare_text(left: &str, right: &str) -> Ordering {
    english().compare(left, right)
}

/// Sorts by [`compare_text`]; strings that compare equal keep their order.
pub fn sort_text<S: AsRef<str>>(items: &mut [S]) {
    items.sort_by(|left, right| compare_text(left.as_ref(), right.as_ref()));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn latin_orders_before_hangul_and_lower_case_before_upper() {
        assert_eq!(compare_text("zeta", "가"), Ordering::Less);
        assert_eq!(compare_text("a", "A"), Ordering::Less);
        assert_eq!(compare_text("a-b", "ab"), Ordering::Less);
        assert_eq!(compare_text("x", "x"), Ordering::Equal);
    }
}
