//! The first line of a file that names an ability: the name in quotes, or after `class`, `def`,
//! `function` or `func`. Plain substring tests, not a pattern built from the name, because a name
//! comes from the repository and a 200,000-byte route would not compile as a pattern.

use crate::js_pattern::is_js_space;

const KEYWORDS: [&str; 4] = ["class", "def", "function", "func"];
const QUOTES: [u8; 3] = [b'"', b'\'', b'`'];

/// The 1-based line of the first line of `text` that names `name`, or 1 when none does.
pub fn declaring_line(text: &str, name: &str) -> usize {
    text.split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .position(|line| line.contains(name) && names(line, name))
        .map_or(1, |at| at + 1)
}

fn names(line: &str, name: &str) -> bool {
    let bytes = line.as_bytes();
    let mut after_keyword = None;
    line.match_indices(name).any(|(start, _)| {
        let end = start + name.len();
        let quoted = start
            .checked_sub(1)
            .and_then(|before| bytes.get(before))
            .is_some_and(|byte| QUOTES.contains(byte))
            && bytes.get(end).is_some_and(|byte| QUOTES.contains(byte));
        quoted
            || (ends_at_word_boundary(bytes, end)
                && after_keyword
                    .get_or_insert_with(|| keyword_then_space(line))
                    .get(start)
                    .copied()
                    .unwrap_or(false))
    })
}

fn ends_at_word_boundary(bytes: &[u8], at: usize) -> bool {
    let before = at
        .checked_sub(1)
        .and_then(|before| bytes.get(before))
        .is_some_and(|byte| is_word(*byte));
    let after = bytes.get(at).is_some_and(|byte| is_word(*byte));
    before != after
}

fn is_word(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

/// For each byte offset, whether the text before it ends in a keyword, itself not the end of a
/// longer word, and then at least one white space character. One pass, so a line of white space
/// costs no more than its length.
fn keyword_then_space(line: &str) -> Vec<bool> {
    let bytes = line.as_bytes();
    let mut spaced = vec![false; line.len() + 1];
    let mut chained = false;
    for (at, character) in line.char_indices() {
        chained = chained || ends_with_keyword(line, bytes, at);
        let next = at + character.len_utf8();
        chained = chained && is_js_space(character);
        if let Some(slot) = spaced.get_mut(next) {
            *slot = chained;
        }
    }
    spaced
}

fn ends_with_keyword(line: &str, bytes: &[u8], at: usize) -> bool {
    KEYWORDS.iter().any(|keyword| {
        line[..at].ends_with(keyword)
            && !at
                .checked_sub(keyword.len() + 1)
                .and_then(|before| bytes.get(before))
                .is_some_and(|byte| is_word(*byte))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn a_quoted_name_and_a_declared_name_are_found_and_a_longer_word_is_not() {
        let text = "x\r\nrun(\"deploy\")\nclass Deploy2 {}\nfunc  Deploy {}\n";
        assert_eq!(declaring_line(text, "deploy"), 2);
        assert_eq!(declaring_line(text, "Deploy"), 4, "Deploy2 is another word");
        assert_eq!(declaring_line(text, "absent"), 1);
        assert_eq!(declaring_line("x\nsubclass Deploy", "Deploy"), 1);
        assert_eq!(declaring_line("x\ndef\u{3000}Deploy():", "Deploy"), 2);
    }

    #[test]
    fn a_name_of_two_hundred_thousand_bytes_is_a_line_scan_not_a_pattern_that_fails() {
        let name = "r".repeat(200_000);
        let text = format!("first\nclass {name}\n");
        let started = Instant::now();
        assert_eq!(declaring_line(&text, &name), 2);
        assert_eq!(declaring_line("first\nsecond", &name), 1);
        let spaces = format!("a\ndef{}x", " ".repeat(200_000));
        assert_eq!(declaring_line(&spaces, "  "), 2);
        assert!(started.elapsed().as_millis() < 500);
    }
}
