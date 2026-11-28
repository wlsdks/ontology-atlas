//! The `#[cfg(...)]`, `#![cfg(...)]` and `cfg_attr` attributes in a Rust source file that name a
//! Cargo feature, each with its line. Read as text, not as a syntax tree: a comment, a string, a
//! raw string and a character literal are skipped, and nothing is expanded or evaluated.

use std::sync::LazyLock;

use answer_format::whitespace::collapse_whitespace;
use regex::Regex;
use repository_survey::js_regex;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AttributeForm {
    Cfg,
    CfgAttr,
}

impl AttributeForm {
    pub fn name(self) -> &'static str {
        match self {
            Self::Cfg => "cfg",
            Self::CfgAttr => "cfg_attr",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Polarity {
    Positive,
    Negative,
    Compound,
    Unknown,
}

impl Polarity {
    pub fn name(self) -> &'static str {
        match self {
            Self::Positive => "positive",
            Self::Negative => "negative",
            Self::Compound => "compound",
            Self::Unknown => "unknown",
        }
    }
}

/// One attribute that names a feature, or one that mentions `feature =` without a literal name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FeatureAttribute {
    pub line: usize,
    pub form: AttributeForm,
    pub predicate: String,
    pub polarity: Polarity,
    pub features: Vec<String>,
    /// Set for an attribute whose feature name is not a literal.
    pub unsupported_reason: Option<&'static str>,
}

static ATTRIBUTE_HEAD: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"(?s)^#!?\[\s*(cfg|cfg_attr)\s*\("));
static LITERAL_FEATURE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r#"\bfeature\s*=\s*"([^"\\\r\n]+)""#));
static FEATURE_WORD: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\bfeature\s*="));
static EXACT_POSITIVE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r#"^feature\s*=\s*"([^"\\\r\n]+)"$"#));
static EXACT_NEGATIVE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r#"^not\s*\(\s*feature\s*=\s*"([^"\\\r\n]+)"\s*\)$"#));
static RAW_STRING_HEAD: LazyLock<Regex> = LazyLock::new(|| js_regex(r##"^(?:br|r)(#*)""##));

/// Every attribute of the text that names a feature, in order.
pub fn extract_rust_feature_attributes(text: &str) -> Vec<FeatureAttribute> {
    let bytes = text.as_bytes();
    let mut rows = Vec::new();
    let mut index = 0;
    let mut line = 1;
    while index < bytes.len() {
        if starts_at(bytes, index, b"//") {
            match position_from(bytes, index + 2, b'\n') {
                Some(end) => {
                    index = end;
                    continue;
                }
                None => break,
            }
        }
        if starts_at(bytes, index, b"/*") {
            let consumed = block_comment_end(bytes, index);
            line += newlines(bytes, index, consumed);
            index = consumed;
            continue;
        }
        if let Some(end) = raw_string_end(text, index) {
            line += newlines(bytes, index, end);
            index = end;
            continue;
        }
        if bytes.get(index) == Some(&b'"') {
            let consumed = quoted_end(bytes, index);
            line += newlines(bytes, index, consumed);
            index = consumed;
            continue;
        }
        if bytes.get(index) == Some(&b'\'') {
            if let Some(end) = character_literal_end(text, index) {
                index = end;
                continue;
            }
        }
        if starts_at(bytes, index, b"#[") || starts_at(bytes, index, b"#![") {
            if let Some(end) = attribute_end(text, index) {
                let attribute = text.get(index..end).unwrap_or_default();
                if let Some(parsed) = parse_feature_attribute(attribute, line) {
                    rows.push(parsed);
                }
                line += newlines(bytes, index, end);
                index = end;
                continue;
            }
        }
        if bytes.get(index) == Some(&b'\n') {
            line += 1;
        }
        index += 1;
    }
    rows
}

fn starts_at(bytes: &[u8], index: usize, prefix: &[u8]) -> bool {
    bytes
        .get(index..)
        .is_some_and(|rest| rest.starts_with(prefix))
}

fn position_from(bytes: &[u8], from: usize, wanted: u8) -> Option<usize> {
    bytes
        .get(from..)?
        .iter()
        .position(|byte| *byte == wanted)
        .map(|offset| from + offset)
}

fn newlines(bytes: &[u8], from: usize, to: usize) -> usize {
    bytes
        .get(from..to.min(bytes.len()))
        .map_or(0, |part| part.iter().filter(|byte| **byte == b'\n').count())
}

/// The index after the attribute that starts at `start`, or `None` when it never closes.
fn attribute_end(text: &str, start: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut depth = 0_i64;
    let mut index = start + 1;
    while index < bytes.len() {
        if starts_at(bytes, index, b"//") {
            index = position_from(bytes, index + 2, b'\n')? + 1;
            continue;
        }
        if starts_at(bytes, index, b"/*") {
            index = block_comment_end(bytes, index);
            continue;
        }
        if let Some(end) = raw_string_end(text, index) {
            index = end;
            continue;
        }
        match bytes.get(index) {
            Some(b'"') => {
                index = quoted_end(bytes, index);
                continue;
            }
            Some(b'[') => depth += 1,
            Some(b']') => {
                depth -= 1;
                if depth == 0 {
                    return Some(index + 1);
                }
            }
            _ => {}
        }
        index += 1;
    }
    None
}

fn parse_feature_attribute(attribute: &str, line: usize) -> Option<FeatureAttribute> {
    let head = ATTRIBUTE_HEAD.captures(attribute)?;
    let form = if head.get(1)?.as_str() == "cfg" {
        AttributeForm::Cfg
    } else {
        AttributeForm::CfgAttr
    };
    let open = attribute.find('(')?;
    let close = matching_paren(attribute, open)?;
    let body = attribute.get(open + 1..close)?;
    let predicate = match form {
        AttributeForm::CfgAttr => first_top_level_part(body),
        AttributeForm::Cfg => body,
    };
    let normalized = collapse_whitespace(predicate);
    let mut features: Vec<String> = Vec::new();
    for found in LITERAL_FEATURE.captures_iter(&normalized) {
        if let Some(name) = found.get(1) {
            if !features.iter().any(|known| known == name.as_str()) {
                features.push(name.as_str().to_string());
            }
        }
    }
    if features.is_empty() {
        return FEATURE_WORD.is_match(&normalized).then(|| FeatureAttribute {
            line,
            form,
            predicate: normalized,
            polarity: Polarity::Unknown,
            features: Vec::new(),
            unsupported_reason: Some("non-literal-feature-name"),
        });
    }
    let polarity = if EXACT_POSITIVE.is_match(&normalized) {
        Polarity::Positive
    } else if EXACT_NEGATIVE.is_match(&normalized) {
        Polarity::Negative
    } else {
        Polarity::Compound
    };
    Some(FeatureAttribute {
        line,
        form,
        predicate: normalized,
        polarity,
        features,
        unsupported_reason: None,
    })
}

/// The index of the `)` that closes the `(` at `open`, quotes skipped.
fn matching_paren(value: &str, open: usize) -> Option<usize> {
    let mut depth = 0_i64;
    let mut in_quote = false;
    let mut escaped = false;
    for (index, character) in value.char_indices().skip_while(|(at, _)| *at < open) {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' && in_quote {
            escaped = true;
            continue;
        }
        if character == '"' {
            in_quote = !in_quote;
            continue;
        }
        if in_quote {
            continue;
        }
        if character == '(' {
            depth += 1;
        }
        if character == ')' {
            depth -= 1;
            if depth == 0 {
                return Some(index);
            }
        }
    }
    None
}

/// What comes before the first comma that is outside quotes and brackets, trimmed.
fn first_top_level_part(value: &str) -> &str {
    let mut depth = 0_i64;
    let mut in_quote = false;
    let mut escaped = false;
    for (index, character) in value.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' && in_quote {
            escaped = true;
            continue;
        }
        if character == '"' {
            in_quote = !in_quote;
            continue;
        }
        if in_quote {
            continue;
        }
        if matches!(character, '(' | '[' | '{') {
            depth += 1;
        }
        if matches!(character, ')' | ']' | '}') {
            depth -= 1;
        }
        if character == ',' && depth == 0 {
            return answer_format::whitespace::trim(value.get(..index).unwrap_or_default());
        }
    }
    answer_format::whitespace::trim(value)
}

/// The index after the block comment that starts at `start`; block comments nest.
fn block_comment_end(bytes: &[u8], start: usize) -> usize {
    let mut depth = 1;
    let mut index = start + 2;
    while index < bytes.len() && depth > 0 {
        if starts_at(bytes, index, b"/*") {
            depth += 1;
            index += 2;
        } else if starts_at(bytes, index, b"*/") {
            depth -= 1;
            index += 2;
        } else {
            index += 1;
        }
    }
    index.min(bytes.len())
}

/// The index after a raw string (`r"…"`, `r#"…"#`, `br"…"`) that starts at `start`; a raw string
/// that never closes runs to the end of the text.
fn raw_string_end(text: &str, start: usize) -> Option<usize> {
    let rest = text.get(start..)?;
    let head = RAW_STRING_HEAD.captures(rest)?;
    let opening = head.get(0)?.len();
    let hashes = head.get(1)?.as_str();
    let terminator = format!("\"{hashes}");
    match rest.get(opening..)?.find(&terminator) {
        Some(offset) => Some(start + opening + offset + terminator.len()),
        None => Some(text.len()),
    }
}

/// The index after a string that starts at the quote at `start`; one that never closes runs to the
/// end of the text.
fn quoted_end(bytes: &[u8], start: usize) -> usize {
    let mut escaped = false;
    let mut index = start + 1;
    while index < bytes.len() {
        match bytes.get(index) {
            _ if escaped => escaped = false,
            Some(b'\\') => escaped = true,
            Some(b'"') => return index + 1,
            _ => {}
        }
        index += 1;
    }
    bytes.len()
}

/// The index after a character literal (`'"'`, `'\n'`, `'\u{1F600}'`) that starts at `start`.
/// A lifetime (`'a`) has no closing quote after one character and is not one.
fn character_literal_end(text: &str, start: usize) -> Option<usize> {
    let rest = text.get(start + 1..)?;
    let mut characters = rest.chars();
    let first = characters.next()?;
    if first == '\\' {
        let escaped = characters.next()?;
        let skipped = first.len_utf8() + escaped.len_utf8();
        let closing = rest.get(skipped..)?.find('\'')?;
        let end = start + 1 + skipped + closing + 1;
        let literal = text.get(start..end)?;
        return (!literal.contains('\n')).then_some(end);
    }
    let after = characters.next()?;
    (after == '\'' && first != '\'' && first != '\n')
        .then(|| start + 1 + first.len_utf8() + 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(text: &str) -> Vec<(usize, &'static str, Vec<String>)> {
        extract_rust_feature_attributes(text)
            .into_iter()
            .map(|row| (row.line, row.polarity.name(), row.features))
            .collect()
    }

    #[test]
    fn an_attribute_after_a_quote_character_literal_is_still_found() {
        let found = names("fn q() -> char { '\"' }\n#[cfg(feature = \"fast\")]\nfn a() {}\n");
        assert_eq!(found, [(2, "positive", vec!["fast".to_string()])]);
    }

    #[test]
    fn a_comment_and_a_string_hide_an_attribute_and_a_lifetime_does_not() {
        let text = "// #[cfg(feature = \"a\")]\nlet s = \"#[cfg(feature = \\\"b\\\")]\";\nfn f<'a>(x: &'a str) {}\n#[cfg(not(feature = \"c\"))]\nfn g() {}\n";
        assert_eq!(names(text), [(4, "negative", vec!["c".to_string()])]);
    }

    #[test]
    fn polarity_follows_the_exact_forms_and_a_computed_name_is_unsupported() {
        let text = "#[cfg(feature = \"a\")]\n#[cfg(not(feature = \"b\"))]\n#[cfg_attr(feature = \"c\", derive(Debug))]\n#[cfg(feature = NAME)]\n";
        let rows = extract_rust_feature_attributes(text);
        let polarity: Vec<_> = rows.iter().map(|row| row.polarity.name()).collect();
        assert_eq!(polarity, ["positive", "negative", "positive", "unknown"]);
        assert_eq!(rows[3].unsupported_reason, Some("non-literal-feature-name"));
    }
}
