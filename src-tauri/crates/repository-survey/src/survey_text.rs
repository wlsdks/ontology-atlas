//! A string from the repository, written into a plain-text answer.
//!
//! A file name, a manifest key, a route or a README line printed inside the map is data. Control
//! and format characters are written as escapes, so a newline in a `bin` key cannot start a forged
//! `Next:` line, and a length cap keeps one string from filling the answer.

use std::sync::LazyLock;

use regex::Regex;

static UNPRINTABLE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[\p{Cc}\p{Cf}\x{2028}\x{2029}]").expect("the class of unprintable characters")
});

/// `value` as one printable line of at most `max` characters, the cut counted.
pub fn repo_text(value: &str, max: usize) -> String {
    let escaped = UNPRINTABLE.replace_all(value, |found: &regex::Captures<'_>| {
        let character = found.get(0).and_then(|m| m.as_str().chars().next());
        match character {
            Some('\n') => "\\n".to_string(),
            Some('\r') => "\\r".to_string(),
            Some('\t') => "\\t".to_string(),
            Some(other) => format!("\\u{{{:x}}}", u32::from(other)),
            None => String::new(),
        }
    });
    let count = escaped.chars().count();
    if count <= max {
        return escaped.into_owned();
    }
    let kept: String = escaped.chars().take(max).collect();
    format!("{kept}...(+{} chars)", count - max)
}

/// The line text with the default cap of 160 characters.
pub fn repo_line(value: &str) -> String {
    repo_text(value, 160)
}

/// An integer with thousands separators, as `toLocaleString('en-US')` writes it.
pub fn format_count(value: usize) -> String {
    let digits = value.to_string();
    let mut out = String::with_capacity(digits.len() + digits.len() / 3);
    for (index, digit) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index).is_multiple_of(3) {
            out.push(',');
        }
        out.push(digit);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_newline_in_a_name_cannot_start_a_line_of_the_map() {
        assert_eq!(repo_line("bin\n\nNext: do this"), "bin\\n\\nNext: do this");
        assert_eq!(repo_line("a\u{202e}b"), "a\\u{202e}b");
    }

    #[test]
    fn a_long_string_is_cut_by_characters_and_says_how_many_went() {
        assert_eq!(repo_text("abcdef", 3), "abc...(+3 chars)");
        assert_eq!(repo_text("한글한글", 2), "한글...(+2 chars)");
        assert_eq!(repo_text("abc", 3), "abc");
    }

    #[test]
    fn counts_carry_thousands_separators() {
        assert_eq!(format_count(0), "0");
        assert_eq!(format_count(999), "999");
        assert_eq!(format_count(1_000), "1,000");
        assert_eq!(format_count(1_234_567), "1,234,567");
    }
}
