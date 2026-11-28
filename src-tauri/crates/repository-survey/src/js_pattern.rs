//! ECMAScript pattern text read by the `regex` crate.
//!
//! The survey's patterns were written for JavaScript, whose `\s`, `\w`, `\d` and `\b` mean
//! something narrower or different from the same letters in `regex` (which is Unicode-wide by
//! default): `\w` is ASCII only, `\s` is the ECMAScript white space and line terminators, and `\b`
//! is the ASCII word boundary. [`js_regex`] rewrites those four so one pattern text means in Rust
//! what it meant before. Case folding is the one thing left to the caller: `(?i)` folds Unicode,
//! and no pattern here has a letter that folds across the ASCII boundary.

use regex::Regex;

/// ECMAScript `WhiteSpace` and `LineTerminator`, as a class body.
const SPACE: &str =
    "\\t\\n\\x0B\\x0C\\r \\x{A0}\\x{1680}\\x{2000}-\\x{200A}\\x{2028}\\x{2029}\\x{202F}\\x{205F}\\x{3000}\\x{FEFF}";
const WORD: &str = "A-Za-z0-9_";

/// `pattern` with `\s`, `\S`, `\w`, `\W`, `\d`, `\D` and `\b` read as ECMAScript reads them. Every
/// pattern is a literal of this crate, so one that does not compile is a defect the first test that
/// uses it finds.
pub fn js_regex(pattern: &str) -> Regex {
    Regex::new(&translate(pattern)).expect("a pattern written in this crate compiles")
}

fn translate(pattern: &str) -> String {
    let mut out = String::with_capacity(pattern.len() + 32);
    let mut in_class = false;
    let mut characters = pattern.chars();
    while let Some(character) = characters.next() {
        match character {
            '\\' => {
                let Some(escaped) = characters.next() else {
                    out.push('\\');
                    break;
                };
                match (escaped, in_class) {
                    ('s', false) => {
                        out.push('[');
                        out.push_str(SPACE);
                        out.push(']');
                    }
                    ('s', true) => out.push_str(SPACE),
                    ('S', false) => {
                        out.push_str("[^");
                        out.push_str(SPACE);
                        out.push(']');
                    }
                    ('w', false) => {
                        out.push('[');
                        out.push_str(WORD);
                        out.push(']');
                    }
                    ('w', true) => out.push_str(WORD),
                    ('W', false) => {
                        out.push_str("[^");
                        out.push_str(WORD);
                        out.push(']');
                    }
                    ('d', false) => out.push_str("[0-9]"),
                    ('d', true) => out.push_str("0-9"),
                    ('D', false) => out.push_str("[^0-9]"),
                    ('b', false) => out.push_str("(?-u:\\b)"),
                    (other, _) => {
                        out.push('\\');
                        out.push(other);
                    }
                }
            }
            '[' if !in_class => {
                in_class = true;
                out.push('[');
            }
            ']' if in_class => {
                in_class = false;
                out.push(']');
            }
            other => out.push(other),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_word_is_ascii_and_a_space_is_what_ecmascript_calls_one() {
        let word = js_regex(r"^\w+$");
        assert!(word.is_match("order_2"));
        assert!(
            !word.is_match("주문"),
            "\\w never matched a Hangul letter in JavaScript"
        );
        let space = js_regex(r"a\sb");
        assert!(
            space.is_match("a\u{FEFF}b"),
            "a byte-order mark is white space in ECMAScript"
        );
        assert!(
            !space.is_match("a\u{85}b"),
            "U+0085 is not white space in ECMAScript"
        );
        assert!(space.is_match("a\u{2028}b"));
    }

    #[test]
    fn a_class_keeps_its_shorthands_and_a_boundary_is_ascii() {
        let name = js_regex(r"^[\w$]+$");
        assert!(name.is_match("a$b_1"));
        assert!(!name.is_match("é"));
        let boundary = js_regex(r"main\b");
        assert!(boundary.is_match("main()"));
        assert!(
            boundary.is_match("mainé"),
            "é is not an ASCII word character, so main ends there"
        );
        assert!(!boundary.is_match("maine"));
    }
}
