//! The small part of TOML a manifest's evidence needs, read a line at a time: sections, one-line
//! assignments, quoted values and arrays that may continue over lines. One reader serves
//! `Cargo.toml` and `pyproject.toml` alike.

use answer_format::whitespace::trim;

/// The lines of a text, split at a line feed with a carriage return before it dropped.
pub fn text_lines(text: &str) -> Vec<&str> {
    text.split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .collect()
}

fn is_line_terminator(character: char) -> bool {
    matches!(character, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

/// The line without a `#` comment that is outside quotes.
pub fn strip_comment(line: &str) -> &str {
    let mut quote: Option<char> = None;
    let mut escaped = false;
    for (index, character) in line.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' && quote == Some('"') {
            escaped = true;
            continue;
        }
        if character == '"' || character == '\'' {
            quote = match quote {
                Some(open) if open == character => None,
                Some(open) => Some(open),
                None => Some(character),
            };
            continue;
        }
        if character == '#' && quote.is_none() {
            return line.get(..index).unwrap_or(line);
        }
    }
    line
}

/// The table name of a `[table]` line.
pub fn section_of(line: &str) -> Option<&str> {
    let inner = line.strip_prefix('[')?.strip_suffix(']')?;
    (!inner.is_empty() && !inner.contains(']')).then(|| trim(inner))
}

/// The key and value of a `key = value` line, both trimmed.
pub fn assignment(line: &str) -> Option<(&str, &str)> {
    let (key, value) = line.split_once('=')?;
    let key = trim(key);
    let value = trim(value);
    if key.is_empty() || value.is_empty() || value.chars().any(is_line_terminator) {
        return None;
    }
    Some((key, value))
}

/// A key without the quotes that wrap it.
pub fn normalize_key(value: &str) -> String {
    let trimmed = trim(value);
    for quote in ['"', '\''] {
        if trimmed.len() >= 2 && trimmed.starts_with(quote) && trimmed.ends_with(quote) {
            return trimmed
                .get(1..trimmed.len() - 1)
                .unwrap_or_default()
                .to_string();
        }
    }
    trimmed.to_string()
}

/// The text of a single-line quoted string, `None` for anything else.
pub fn static_string(value: &str) -> Option<String> {
    let trimmed = trim(value);
    let quote = trimmed.chars().next()?;
    if trimmed.len() < 2 || (quote != '"' && quote != '\'') || !trimmed.ends_with(quote) {
        return None;
    }
    let body = trimmed.get(1..trimmed.len() - 1)?;
    (!body.contains(['\r', '\n'])).then(|| body.to_string())
}

/// Whether every bracket and brace opened in the fragment is closed and no quote is left open.
pub fn is_balanced_fragment(value: &str) -> bool {
    let mut stack: Vec<char> = Vec::new();
    let mut quote: Option<char> = None;
    let mut escaped = false;
    for character in value.chars() {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' && quote == Some('"') {
            escaped = true;
            continue;
        }
        if character == '"' || character == '\'' {
            quote = match quote {
                Some(open) if open == character => None,
                Some(open) => Some(open),
                None => Some(character),
            };
            continue;
        }
        if quote.is_some() {
            continue;
        }
        match character {
            '[' | '{' => stack.push(character),
            ']' | '}' => {
                let expected = if character == ']' { '[' } else { '{' };
                if stack.pop() != Some(expected) {
                    return false;
                }
            }
            _ => {}
        }
    }
    quote.is_none() && stack.is_empty()
}

/// Every run of characters between a pair of quotes, `"a", 'b'` giving `a` and `b`.
pub fn quoted_values(value: &str) -> Vec<String> {
    let is_quote = |character: char| character == '"' || character == '\'';
    let mut values = Vec::new();
    let mut at = 0;
    while let Some(open) = value.get(at..).and_then(|rest| rest.find(is_quote)) {
        let start = at + open + 1;
        let Some(length) = value.get(start..).and_then(|rest| rest.find(is_quote)) else {
            break;
        };
        if length == 0 {
            // `""` holds no value; the second quote may open the next one.
            at = start;
            continue;
        }
        if let Some(inside) = value.get(start..start + length) {
            values.push(inside.to_string());
        }
        at = start + length + 1;
    }
    values
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_hash_inside_quotes_is_not_a_comment() {
        assert_eq!(strip_comment("a = \"b#c\" # note"), "a = \"b#c\" ");
        assert_eq!(strip_comment("a = 'x' #y"), "a = 'x' ");
    }

    #[test]
    fn a_feature_list_that_continues_is_unbalanced_until_it_closes() {
        assert!(!is_balanced_fragment("[\"a\","));
        assert!(is_balanced_fragment("[\"a\", \"b\"]"));
        assert_eq!(quoted_values("[\"a\", 'b']"), ["a", "b"]);
    }
}
