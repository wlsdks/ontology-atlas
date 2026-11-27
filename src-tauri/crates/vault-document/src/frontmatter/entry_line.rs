//! One `key: value` line: where the key ends and what is left of the line as the value.

use answer_format::whitespace::{is_whitespace, trim};

use super::quoting::decode_double_quoted;

/// A line read as `key: value`; the value is the rest of the line, trimmed and not yet typed.
pub(super) struct EntryLine {
    pub key: String,
    pub value: String,
}

/// The key and value of a line, or `None` when the line is no entry: no colon, a comment, a quoted
/// key that does not close before its colon, or an empty key.
pub(super) fn read_entry(line: &str) -> Option<EntryLine> {
    let text = trim(line);
    let (key, rest) = match text.chars().next()? {
        '"' => {
            let (inner, rest) = split_double_quoted_key(text)?;
            (decode_double_quoted(inner), rest)
        }
        '\'' => {
            let (inner, rest) = split_single_quoted_key(text)?;
            (inner.replace("''", "'"), rest)
        }
        '#' => return None,
        _ => {
            let (key, rest) = text.split_once(':')?;
            (trim(key).to_string(), rest)
        }
    };
    if key.is_empty() {
        return None;
    }
    Some(EntryLine {
        key,
        value: trim(rest).to_string(),
    })
}

/// `"key" :` at the start of `text`: the text between the quotes (escapes undecoded) and what
/// follows the colon. Inside the quotes a backslash must pair with `"`, `\`, `n` or `t`.
fn split_double_quoted_key(text: &str) -> Option<(&str, &str)> {
    let body = text.strip_prefix('"')?;
    let mut characters = body.char_indices();
    while let Some((index, character)) = characters.next() {
        match character {
            '"' => {
                let inner = body.get(..index)?;
                return after_colon(body.get(index + 1..)?).map(|rest| (inner, rest));
            }
            '\\' => match characters.next() {
                Some((_, '"' | '\\' | 'n' | 't')) => {}
                _ => return None,
            },
            _ => {}
        }
    }
    None
}

/// `'key' :` at the start of `text`: a doubled quote inside is one quote.
fn split_single_quoted_key(text: &str) -> Option<(&str, &str)> {
    let body = text.strip_prefix('\'')?;
    let mut characters = body.char_indices().peekable();
    while let Some((index, character)) = characters.next() {
        if character == '\'' {
            if matches!(characters.peek(), Some((_, '\''))) {
                characters.next();
                continue;
            }
            let inner = body.get(..index)?;
            return after_colon(body.get(index + 1..)?).map(|rest| (inner, rest));
        }
    }
    None
}

/// The text after optional whitespace and one colon.
fn after_colon(text: &str) -> Option<&str> {
    text.trim_start_matches(is_whitespace).strip_prefix(':')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read(line: &str) -> Option<(String, String)> {
        read_entry(line).map(|entry| (entry.key, entry.value))
    }

    #[test]
    fn a_plain_key_ends_at_the_first_colon_and_its_value_keeps_later_ones() {
        assert_eq!(
            read("  kind: capability "),
            Some(("kind".into(), "capability".into()))
        );
        assert_eq!(
            read("url: http://x"),
            Some(("url".into(), "http://x".into()))
        );
        assert_eq!(read("empty:"), Some(("empty".into(), String::new())));
    }

    #[test]
    fn a_quoted_key_may_hold_a_colon_and_must_close_before_its_own() {
        assert_eq!(read(r#""a: b": 1"#), Some(("a: b".into(), "1".into())));
        assert_eq!(read("'it''s' : x"), Some(("it's".into(), "x".into())));
        assert_eq!(read(r#""open: 1"#), None);
        assert_eq!(read(r#""bad\q": 1"#), None);
    }

    #[test]
    fn a_comment_a_bare_value_and_an_empty_key_are_no_entry() {
        assert_eq!(read("# note: x"), None);
        assert_eq!(read("just words"), None);
        assert_eq!(read(": value"), None);
        assert_eq!(read(r#""": x"#), None);
    }
}
