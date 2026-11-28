//! Which characters JavaScript calls whitespace and line terminators. They are not Rust's.

/// The characters `String.prototype.trim` and `\s` treat as whitespace: the white-space characters
/// of ECMAScript (tab, vertical tab, form feed, space, no-break space, byte-order mark and the
/// Unicode `Zs` category) and its line terminators. It is not `char::is_whitespace`, which counts
/// U+0085 and leaves out U+FEFF.
pub fn is_whitespace(character: char) -> bool {
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
pub fn trim(text: &str) -> &str {
    text.trim_matches(is_whitespace)
}

/// `text.replace(/\s+/g, ' ').trim()`: every run of whitespace is one space and neither end has any.
pub fn collapse_whitespace(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut in_gap = false;
    for character in text.chars() {
        if is_whitespace(character) {
            in_gap = true;
        } else {
            if in_gap && !out.is_empty() {
                out.push(' ');
            }
            in_gap = false;
            out.push(character);
        }
    }
    out
}

/// The line terminators a JavaScript `.` does not match.
pub fn is_line_terminator(character: char) -> bool {
    matches!(character, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_run_of_whitespace_is_one_space_and_the_ends_have_none() {
        assert_eq!(
            collapse_whitespace("\u{feff} a \t\n b\u{a0}\u{a0}c  "),
            "a b c"
        );
        assert_eq!(collapse_whitespace(" \u{85} "), "\u{85}");
        assert_eq!(collapse_whitespace(""), "");
    }

    #[test]
    fn trim_uses_the_ecmascript_whitespace_set() {
        assert_eq!(trim("\u{feff} x \u{a0}\u{3000}\n"), "x");
        // U+0085 is whitespace to Rust and not to JavaScript.
        assert_eq!(trim("\u{85}x\u{85}"), "\u{85}x\u{85}");
        // U+180E is no longer whitespace in either.
        assert_eq!(trim("\u{180e}x"), "\u{180e}x");
        assert_eq!(trim("  "), "");
    }

    #[test]
    fn a_line_terminator_is_one_of_four() {
        for terminator in ['\n', '\r', '\u{2028}', '\u{2029}'] {
            assert!(is_line_terminator(terminator));
        }
        assert!(!is_line_terminator('\u{85}'));
        assert!(!is_line_terminator(' '));
    }
}
