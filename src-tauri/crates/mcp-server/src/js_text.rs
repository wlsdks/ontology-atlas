//! Text rules where JavaScript and Rust differ: which characters are whitespace, how strings sort,
//! and how long a string is. The server keeps JavaScript's meaning because agents saw it.

use std::cmp::Ordering;

/// The characters `String.prototype.trim` and `\s` treat as whitespace: the white-space characters
/// of ECMAScript (tab, vertical tab, form feed, space, no-break space, byte-order mark and the
/// Unicode `Zs` category) and its line terminators. It is not Rust's `char::is_whitespace`, which
/// counts U+0085 and leaves out U+FEFF.
pub fn is_js_whitespace(character: char) -> bool {
    matches!(
        character,
        '\u{9}'..='\u{d}'
            | ' '
            | '\u{a0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200a}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202f}'
            | '\u{205f}'
            | '\u{3000}'
            | '\u{feff}'
    )
}

/// `String.prototype.trim`.
pub fn js_trim(text: &str) -> &str {
    text.trim_matches(is_js_whitespace)
}

/// The line terminators `.` does not match in a JavaScript pattern.
pub fn is_js_line_terminator(character: char) -> bool {
    matches!(character, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

/// The default `Array.prototype.sort` order of strings: by UTF-16 code unit, which is not code
/// point order for characters beyond the Basic Multilingual Plane.
pub fn compare_utf16(left: &str, right: &str) -> Ordering {
    left.encode_utf16().cmp(right.encode_utf16())
}

/// `string.length`.
pub fn utf16_length(text: &str) -> usize {
    text.encode_utf16().count()
}

/// Sorts as `Array.prototype.sort()` does.
pub fn sort_utf16(items: &mut [String]) {
    items.sort_by(|left, right| compare_utf16(left, right));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trim_uses_the_ecmascript_whitespace_set() {
        assert_eq!(js_trim("\u{feff} x \u{a0}\u{3000}\n"), "x");
        // U+0085 is whitespace to Rust and not to JavaScript.
        assert_eq!(js_trim("\u{85}x\u{85}"), "\u{85}x\u{85}");
        // U+180E is no longer whitespace in either.
        assert_eq!(js_trim("\u{180e}x"), "\u{180e}x");
        assert_eq!(js_trim("  "), "");
    }

    #[test]
    fn utf16_order_puts_an_astral_character_before_a_late_bmp_one() {
        // U+10000 is the surrogate pair D800 DC00; U+FF5E is a single unit above it.
        assert_eq!(compare_utf16("\u{10000}", "\u{ff5e}"), Ordering::Less);
        assert!("\u{10000}" > "\u{ff5e}");
        let mut items = vec![
            "b".to_string(),
            "\u{ff5e}".to_string(),
            "\u{10000}".to_string(),
            "a".to_string(),
        ];
        sort_utf16(&mut items);
        assert_eq!(items, ["a", "b", "\u{10000}", "\u{ff5e}"]);
    }

    #[test]
    fn length_counts_utf16_units() {
        assert_eq!(utf16_length("a😀한"), 4);
    }
}
