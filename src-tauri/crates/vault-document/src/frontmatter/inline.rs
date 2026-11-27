//! Splitting the inside of `[a, b]` and `{ k: v, k2: v2 }` at the commas that are not inside quotes.

/// The parts of `input` between `separator`s outside quotes. A separator inside quotes is data:
/// `{ ko: "map, search" }` is one member. For `mapping` text a `:` ends the key, and inside a
/// single-quoted key a backslash is a plain character and `''` is one quote.
pub(super) fn split_top_level(input: &str, separator: char, mapping: bool) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut part_start = 0;
    let mut quote: Option<char> = None;
    let mut in_key = mapping;
    let mut characters = input.char_indices().peekable();
    while let Some((index, character)) = characters.next() {
        if let Some(open) = quote {
            if character == '\\' && !(in_key && open == '\'') && characters.peek().is_some() {
                characters.next();
                continue;
            }
            if character == open {
                if in_key && open == '\'' && matches!(characters.peek(), Some((_, '\''))) {
                    characters.next();
                } else {
                    quote = None;
                }
            }
            continue;
        }
        if character == '"' || character == '\'' {
            quote = Some(character);
        } else if character == ':' && mapping {
            in_key = false;
        } else if character == separator {
            parts.push(input.get(part_start..index).unwrap_or_default());
            part_start = index + character.len_utf8();
            in_key = mapping;
        }
    }
    parts.push(input.get(part_start..).unwrap_or_default());
    parts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_comma_inside_quotes_is_data() {
        assert_eq!(
            split_top_level("a, \"b, c\", d", ',', false),
            ["a", " \"b, c\"", " d"]
        );
        assert_eq!(
            split_top_level("ko: \"map, search\", en: x", ',', true),
            ["ko: \"map, search\"", " en: x"]
        );
    }

    #[test]
    fn a_single_quoted_key_doubles_its_quote_and_has_no_backslash_escape() {
        assert_eq!(
            split_top_level("'it''s, x': 1, b: 2", ',', true),
            ["'it''s, x': 1", " b: 2"]
        );
        assert_eq!(
            split_top_level("'a\\': 1, b: 2", ',', true),
            ["'a\\': 1", " b: 2"]
        );
    }
}
