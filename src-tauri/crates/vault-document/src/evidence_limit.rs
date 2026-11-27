//! Does an exclusion state an evidence limit ("not mentioned in this scan") rather than a product
//! boundary? A reader handed only the vault repeats the first as the second, so the body checks
//! report it.
//!
//! Each clause stays tied to a reading verb ("inspect", "read", "trace", "carried as a node") so an
//! ordinary boundary such as "flags, which are options rather than positional arguments" does not
//! match. The text is folded before it is tested (whitespace runs are one space, lowercase), and a
//! word boundary is the ASCII one, as it is in the app's own check.

use std::sync::OnceLock;

use regex::{RegexSet, RegexSetBuilder};

const PATTERNS: [&str; 10] = [
    r"\bnot +(?:established|asserted|proven|verified|measured|observed|known|confirmed)\b",
    r"\bremain(?:s|ed)? +outside +(?:this|the) +(?:bounded +)?(?:scan|evidence)\b",
    r"\bnot +(?:named|listed|mentioned|included|covered|present) +in +(?:this|the) +(?:bounded +)?(?:semantic +)?(?:excerpt|evidence|scan|packet)\b",
    r"\b(?:this|the|our) +(?:survey|scan|pass|packet|excerpt|read|analysis|review|session) +did +not +(?:inspect|read|trace|scan|cover|open|look +at|examine|visit)\b",
    r"\b(?:was|were) +not +(?:read|inspected|traced|scanned|covered|opened|examined|visited|analysed|analyzed|reviewed)\b",
    r"\bnot +(?:yet +)?(?:carried|represented|modelled|modeled|captured) +(?:as|in)\b",
    r"\b(?:unread|uninspected|untraced|unscanned)\b",
    r"\bnot +(?:yet +)?(?:inspected|read|traced) +in +this +(?:first +)?(?:pass|survey|scan|round)\b",
    r"\b(?:did +not|didn't|could +not|couldn't) +(?:get +to|reach|cover|read)\b",
    r"\boutside +(?:what|the +files) +(?:this|the) +(?:survey|scan|pass) +(?:read|covered|inspected)\b",
];

fn patterns() -> Option<&'static RegexSet> {
    static SET: OnceLock<Option<RegexSet>> = OnceLock::new();
    SET.get_or_init(|| RegexSetBuilder::new(PATTERNS).unicode(false).build().ok())
        .as_ref()
}

/// Whether the folded `text` states an evidence limit.
pub(crate) fn matches(text: &str) -> bool {
    patterns().is_some_and(|set| set.is_match(text))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_limit_of_what_was_read_is_told_from_a_product_boundary() {
        for limit in [
            "not mentioned in this scan",
            "the survey did not inspect the billing module",
            "unread callers",
            "which was not read",
            "retries are not yet carried as a node",
            "we couldn't reach the worker",
        ] {
            assert!(matches(limit), "{limit}");
        }
        for boundary in [
            "flags, which are options rather than positional arguments",
            "charging the card",
            "a node that is not a concept",
        ] {
            assert!(!matches(boundary), "{boundary}");
        }
    }
}
