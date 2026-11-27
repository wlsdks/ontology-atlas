//! Text from an agent as the consent card shows it.

use std::sync::OnceLock;

use regex::Regex;

/// A control, invisible-format or line-separating character, which would break or hide a line.
fn hidden_character() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    #[allow(
        clippy::expect_used,
        reason = "the pattern is a constant, checked by the tests of this module"
    )]
    PATTERN.get_or_init(|| {
        Regex::new(r"[\p{Cc}\p{Cf}\u{2028}\u{2029}]")
            .expect("the hidden-character pattern is valid")
    })
}

/// `value` as the card shows it: a line break or invisible character is spelled out as
/// `\u{<hex>}`, never obeyed, so an agent cannot make a card say something its words do not.
pub fn shown(value: &str) -> String {
    hidden_character()
        .replace_all(value, |found: &regex::Captures<'_>| {
            found
                .get(0)
                .and_then(|text| text.as_str().chars().next())
                .map(|character| format!("\\u{{{:x}}}", u32::from(character)))
                .unwrap_or_default()
        })
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_line_break_or_an_invisible_character_is_spelled_out_and_plain_text_is_kept() {
        assert_eq!(shown("a\nb"), "a\\u{a}b");
        assert_eq!(shown("x\u{2028}y\u{2029}"), "x\\u{2028}y\\u{2029}");
        assert_eq!(shown("a\u{202e}b\u{200b}"), "a\\u{202e}b\\u{200b}");
        assert_eq!(shown("\u{7}\u{9f}"), "\\u{7}\\u{9f}");
        assert_eq!(
            shown("elements/\u{d55c}\u{ae00} \u{1f600}"),
            "elements/\u{d55c}\u{ae00} \u{1f600}"
        );
    }
}
