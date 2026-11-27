//! Quotes around a value: taking them off, the escapes inside them, and the value that opens a
//! quote it never closes.

use answer_format::whitespace::{is_whitespace, trim};

use super::javascript_number::to_number;
use super::value::Scalar;

/// `\"`, `\\`, `\n` and `\t` inside double quotes; any other backslash stays a backslash.
pub(super) fn decode_double_quoted(text: &str) -> String {
    let mut decoded = String::with_capacity(text.len());
    let mut characters = text.chars().peekable();
    while let Some(character) = characters.next() {
        if character == '\\' {
            let replacement = match characters.peek() {
                Some('"') => Some('"'),
                Some('\\') => Some('\\'),
                Some('n') => Some('\n'),
                Some('t') => Some('\t'),
                _ => None,
            };
            if let Some(replacement) = replacement {
                characters.next();
                decoded.push(replacement);
                continue;
            }
        }
        decoded.push(character);
    }
    decoded
}

fn is_quote(character: char) -> bool {
    character == '"' || character == '\''
}

/// `\'` and `\\` inside single quotes. The writer never writes single quotes, so this serves files a
/// person wrote.
fn decode_single_quoted(text: &str) -> String {
    let mut decoded = String::with_capacity(text.len());
    let mut characters = text.chars().peekable();
    while let Some(character) = characters.next() {
        if character == '\\' && matches!(characters.peek(), Some('\'' | '\\')) {
            if let Some(escaped) = characters.next() {
                decoded.push(escaped);
            }
            continue;
        }
        decoded.push(character);
    }
    decoded
}

/// Takes off a wrapping pair of quotes and reverses its escapes. Text with no wrapping pair is
/// literal, not escape syntax: only a stray quote at either end goes.
pub(super) fn unquote(text: &str) -> String {
    let trimmed = trim(text);
    let mut characters = trimmed.chars();
    if let (Some(first), Some(last)) = (characters.next(), trimmed.chars().next_back()) {
        if is_quote(first) && first == last && trimmed.chars().count() >= 2 {
            let inner = trimmed
                .get(first.len_utf8()..trimmed.len() - last.len_utf8())
                .unwrap_or_default();
            return if first == '"' {
                decode_double_quoted(inner)
            } else {
                decode_single_quoted(inner)
            };
        }
    }
    let without_first = text.strip_prefix(is_quote).unwrap_or(text);
    without_first
        .strip_suffix(is_quote)
        .unwrap_or(without_first)
        .to_string()
}

/// A mapping member's value: a quoted pair is text whatever it holds, a bare `true` or `false` is
/// a boolean, and text `Number()` reads as a number is one.
pub(super) fn parse_scalar(text: &str) -> Scalar {
    let trimmed = trim(text);
    let mut characters = trimmed.chars();
    if let (Some(first), Some(last)) = (characters.next(), trimmed.chars().next_back()) {
        if is_quote(first) && first == last && trimmed.chars().count() >= 2 {
            return Scalar::Text(unquote(text));
        }
    }
    let value = unquote(text);
    if value == "true" {
        return Scalar::Bool(true);
    }
    if value == "false" {
        return Scalar::Bool(false);
    }
    if !value.is_empty() {
        if let Some(number) = to_number(&value) {
            return Scalar::Number(number);
        }
    }
    Scalar::Text(value)
}

/// How a top-level value fails to close the quote it opens.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum QuoteFault {
    /// The quote closes early and text follows it: `"Agents" destination`.
    ClosesEarly,
    /// The quote never closes.
    NeverCloses,
}

/// Whether the last character closes the opening quote rather than being escaped by an odd run of
/// backslashes before it.
fn closes_with_quote(characters: &[char], quote: char) -> bool {
    if characters.len() < 2 || characters.last() != Some(&quote) {
        return false;
    }
    let backslashes = characters
        .iter()
        .rev()
        .skip(1)
        .take_while(|character| **character == '\\')
        .count();
    backslashes % 2 == 0
}

/// A value that opens a quote it does not close as its last character: readers render the rest as
/// literal text while the node loads cleanly.
pub(super) fn quote_fault(value: &str) -> Option<QuoteFault> {
    let trimmed: Vec<char> = trim(value).chars().collect();
    let quote = *trimmed.first()?;
    if !is_quote(quote) || closes_with_quote(&trimmed, quote) {
        return None;
    }
    let mut index = 1;
    while index < trimmed.len() {
        let character = trimmed.get(index).copied().unwrap_or_default();
        if character == '\\' && index + 1 < trimmed.len() {
            index += 2;
            continue;
        }
        if character == quote {
            return Some(QuoteFault::ClosesEarly);
        }
        index += 1;
    }
    Some(QuoteFault::NeverCloses)
}

/// The value with its quote characters removed and its whitespace collapsed: what the person most
/// likely meant, offered in the repair.
pub(super) fn suggested_value(value: &str) -> String {
    let trimmed = trim(value);
    let quote = trimmed.chars().next().unwrap_or('"');
    let without_quotes: String = trimmed
        .chars()
        .filter(|character| *character != quote)
        .collect();
    let mut collapsed = String::with_capacity(without_quotes.len());
    let mut in_whitespace = false;
    for character in without_quotes.chars() {
        if is_whitespace(character) {
            if !in_whitespace {
                collapsed.push(' ');
            }
            in_whitespace = true;
        } else {
            collapsed.push(character);
            in_whitespace = false;
        }
    }
    trim(&collapsed).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_wrapping_pair_is_taken_off_and_its_escapes_reversed() {
        assert_eq!(unquote(r#""a \"b\" \\ c\n""#), "a \"b\" \\ c\n");
        assert_eq!(unquote(r"'it\'s'"), "it's");
        assert_eq!(unquote("'it''s'"), "it''s");
        assert_eq!(unquote(r"a\nb"), r"a\nb");
        assert_eq!(unquote(r#""abc"#), "abc");
        assert_eq!(unquote("'"), "");
    }

    #[test]
    fn a_quoted_pair_is_text_and_a_bare_word_is_typed() {
        assert_eq!(parse_scalar("\"12\""), Scalar::Text("12".into()));
        assert_eq!(parse_scalar("12"), Scalar::Number(12.0));
        assert_eq!(parse_scalar("true"), Scalar::Bool(true));
        assert_eq!(parse_scalar("5px"), Scalar::Text("5px".into()));
    }

    #[test]
    fn a_quote_that_does_not_close_at_the_end_is_a_fault() {
        assert!(quote_fault("\"Agents\"").is_none());
        assert!(quote_fault("'Ann's guide'").is_none());
        assert!(quote_fault("plain").is_none());
        assert!(quote_fault("\"Agents\" destination") == Some(QuoteFault::ClosesEarly));
        assert!(quote_fault("\"open") == Some(QuoteFault::NeverCloses));
        assert!(quote_fault("\"ends escaped\\\"") == Some(QuoteFault::NeverCloses));
        assert_eq!(
            suggested_value("\"Agents\"   destination"),
            "Agents destination"
        );
    }
}
