//! How much of a body an answer carries, and what it says was left out. A silent cut would hide
//! the evidence and boundaries the construction rules put in the body, so every answer states the
//! body's length and, when it was cut, how much was withheld.

use answer_format::utf16;
use answer_format::whitespace::{is_whitespace, trim};
use pulldown_cmark::{Event, Options, Parser, Tag};
use serde::Serialize;

/// The most characters `body: "full"` returns for one document: a vault file can be a pasted log of
/// hundreds of kilobytes, and one document must not fill an agent's context. Measured bodies run 1
/// to 3 KB.
pub const FULL_BODY_MAX_CHARS: usize = 40_000;

/// The most documents one `get_concepts({ body: "full" })` returns.
pub const FULL_BODY_MAX_DOCUMENTS: usize = 20;

/// The longest excerpt `get_concepts` gives, and the longest summary a list gives.
pub const EXCERPT_MAX_CHARS: usize = 800;
pub const SUMMARY_MAX_CHARS: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BodyMode {
    Excerpt,
    Full,
}

impl BodyMode {
    fn name(self) -> &'static str {
        match self {
            Self::Excerpt => "excerpt",
            Self::Full => "full",
        }
    }
}

/// What was delivered of a body: the mode, its length, what came back and whether that is all.
#[derive(Debug, Clone, Serialize)]
pub struct BodyInfo {
    mode: &'static str,
    #[serde(rename = "totalChars")]
    total_chars: usize,
    #[serde(rename = "returnedChars")]
    returned_chars: usize,
    truncated: bool,
    #[serde(rename = "omittedChars", skip_serializing_if = "Option::is_none")]
    omitted_chars: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    hint: Option<String>,
}

impl BodyInfo {
    pub fn truncated(&self) -> bool {
        self.truncated
    }

    pub fn total_chars(&self) -> usize {
        self.total_chars
    }
}

#[derive(Debug, Clone)]
pub struct BodyDelivery {
    pub text: String,
    pub info: BodyInfo,
}

/// `text` with every run of whitespace one space, trimmed: what two texts are compared by when one
/// joins lines with spaces.
fn flatten(text: &str) -> String {
    let mut flat = String::with_capacity(text.len());
    let mut pending = false;
    for character in text.chars() {
        if is_whitespace(character) {
            pending = !flat.is_empty();
            continue;
        }
        if pending {
            flat.push(' ');
            pending = false;
        }
        flat.push(character);
    }
    flat
}

/// The first line of a paragraph that a reader would skip over: a table row or an image.
fn starts_like_other_content(first_line: &str) -> bool {
    first_line.starts_with('|') || first_line.starts_with("![")
}

/// The first paragraph of prose, its lines joined with spaces, so a preview is a sentence a person
/// wrote rather than table or code syntax. Falls back to the whole body when it holds no prose.
pub fn summary_excerpt(body: &str, max_chars: usize) -> String {
    let options = Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH;
    let mut depth = 0usize;
    for (event, range) in Parser::new_ext(body, options).into_offset_iter() {
        match event {
            Event::Start(Tag::Paragraph) if depth == 0 => {
                let lines: Vec<&str> = body
                    .get(range)
                    .unwrap_or_default()
                    .split('\n')
                    .map(trim)
                    .filter(|line| !line.is_empty())
                    .collect();
                if lines
                    .first()
                    .is_some_and(|first| starts_like_other_content(first))
                {
                    depth += 1;
                    continue;
                }
                if !lines.is_empty() {
                    return shortened(&lines.join(" "), max_chars);
                }
                depth += 1;
            }
            Event::Start(_) => depth += 1,
            Event::End(_) => depth = depth.saturating_sub(1),
            _ => {}
        }
    }
    shortened(trim(body), max_chars)
}

/// `text` cut to `max_chars` UTF-16 units with an ellipsis when it is longer.
fn shortened(text: &str, max_chars: usize) -> String {
    if utf16::len(text) <= max_chars {
        return text.to_string();
    }
    format!(
        "{}…",
        utf16::prefix(text, max_chars).trim_end_matches(is_whitespace)
    )
}

/// The body as an answer carries it. `hint` is the call that reads the rest, said only when
/// something was withheld.
pub fn describe_body_delivery(
    body: &str,
    mode: BodyMode,
    max_chars: usize,
    hint: Option<&str>,
) -> BodyDelivery {
    let total_chars = utf16::len(body);
    let text = match mode {
        BodyMode::Full if total_chars > FULL_BODY_MAX_CHARS => {
            utf16::prefix(body, FULL_BODY_MAX_CHARS).to_string()
        }
        BodyMode::Full => body.to_string(),
        BodyMode::Excerpt => summary_excerpt(body, max_chars),
    };
    let truncated = match mode {
        BodyMode::Full => total_chars > FULL_BODY_MAX_CHARS,
        BodyMode::Excerpt => flatten(&text) != flatten(body),
    };
    let returned_chars = utf16::len(&text);
    let info = BodyInfo {
        mode: mode.name(),
        total_chars,
        returned_chars,
        truncated,
        omitted_chars: truncated.then(|| total_chars.saturating_sub(returned_chars)),
        hint: hint.filter(|_| truncated).map(str::to_string),
    };
    BodyDelivery { text, info }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_excerpt_is_the_first_paragraph_of_prose() {
        let body = "# Title\n\n```\ncode\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- item\n\nFirst line\nsecond line.\n\nLater paragraph.\n";
        assert_eq!(summary_excerpt(body, 800), "First line second line.");
    }

    #[test]
    fn a_body_with_no_prose_is_returned_whole_and_a_long_paragraph_is_cut_with_an_ellipsis() {
        assert_eq!(
            summary_excerpt("# Only a heading\n", 800),
            "# Only a heading"
        );
        assert_eq!(summary_excerpt("abcdef ghij", 6), "abcdef…");
        let delivery = describe_body_delivery("abcdef ghij", BodyMode::Excerpt, 6, Some("read it"));
        assert_eq!(
            (delivery.info.truncated(), delivery.info.total_chars()),
            (true, 11)
        );
    }

    #[test]
    fn a_body_that_is_one_paragraph_is_not_reported_as_cut() {
        let delivery = describe_body_delivery("one\ntwo\n", BodyMode::Excerpt, 800, None);
        assert_eq!(delivery.text, "one two");
        assert!(!delivery.info.truncated());
    }
}
