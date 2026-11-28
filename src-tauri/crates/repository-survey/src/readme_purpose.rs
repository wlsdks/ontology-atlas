//! What the README says the repository is for: its first prose paragraphs, without code, quotes,
//! headings, badges and the paragraphs that are about the project's community.

use std::sync::LazyLock;

use regex::Regex;

use crate::js_pattern::js_regex;
use crate::survey_files::SurveyFiles;

const README_NAMES: [&str; 7] = [
    "README.md",
    "Readme.md",
    "readme.md",
    "README.rst",
    "README.markdown",
    "README.txt",
    "README",
];
const READ_UNITS: usize = 64 * 1024;
/// The purpose is cut to this many UTF-16 units.
pub const PURPOSE_UNITS: usize = 600;
/// A paragraph shorter than this says nothing about what the product is for.
const MIN_PARAGRAPH_UNITS: usize = 20;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReadmePurpose {
    pub path: String,
    /// Empty when the README holds no prose paragraph.
    pub purpose: String,
}

static BLOCK_BREAK: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\r?\n[ \t]*\r?\n"));
static LEADING_BREAKS: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^\r?\n+"));
static CODE_OR_QUOTE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^(?: {4}|\t|\s*>)"));
static LABEL_LINE: LazyLock<Regex> =
    LazyLock::new(|| js_regex(r"^\s*(?:#|[=\-~*_]{3,}\s*$|\||\.\. )"));
static TAG: LazyLock<Regex> = LazyLock::new(|| js_regex(r"<[^>]+>"));
static IMAGE: LazyLock<Regex> = LazyLock::new(|| js_regex(r"!\[[^\]]*\]\([^)]*\)"));
static LINK: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\[([^\]]*)\]\([^)]*\)"));
static SPACES: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\s+"));
static ABOUT_THE_PROJECT: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(
        r"(?i)\b(?:licen[sc]e|contribut|bug reports?|pull requests?|security vulnerabilit|sponsor|backers?)\b",
    )
});

/// `text` with each span from an `opener` to the nearest `closer` after it removed, in one forward
/// pass. An opener without a closer stays as written.
pub fn without_spans(text: &str, opener: &str, closer: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut kept = 0;
    let mut from = 0;
    while let Some(found) = text.get(from..).and_then(|rest| rest.find(opener)) {
        let start = from + found;
        let after_opener = start + opener.len();
        let Some(close) = text.get(after_opener..).and_then(|rest| rest.find(closer)) else {
            break;
        };
        let end = after_opener + close + closer.len();
        output.push_str(text.get(kept..start).unwrap_or(""));
        kept = end;
        from = end;
    }
    output.push_str(text.get(kept..).unwrap_or(""));
    output
}

fn paragraph_text(block: &str) -> String {
    let kept: Vec<&str> = block
        .split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .filter(|line| !LABEL_LINE.is_match(line))
        .collect();
    let joined = kept.join(" ");
    let without_tags = TAG.replace_all(&joined, " ");
    let without_images = IMAGE.replace_all(&without_tags, " ");
    let without_links = LINK.replace_all(&without_images, "$1");
    SPACES
        .replace_all(&without_links, " ")
        .trim_matches(|character: char| answer_format::whitespace::is_whitespace(character))
        .to_string()
}

pub fn readme_purpose(files: &SurveyFiles<'_>) -> Option<ReadmePurpose> {
    let name = README_NAMES
        .iter()
        .find(|candidate| files.file(candidate).is_some())?;
    let raw = files.text(name, READ_UNITS);
    let text = without_spans(&without_spans(&raw, "<!--", "-->"), "```", "```");
    let paragraphs: Vec<String> = BLOCK_BREAK
        .split(&text)
        .filter(|block| !CODE_OR_QUOTE.is_match(&LEADING_BREAKS.replace(block, "")))
        .map(paragraph_text)
        .filter(|block| {
            answer_format::utf16::len(block) >= MIN_PARAGRAPH_UNITS
                && !ABOUT_THE_PROJECT.is_match(block)
        })
        .collect();
    let joined = paragraphs.join(" ");
    let purpose =
        answer_format::whitespace::trim(answer_format::utf16::prefix(&joined, PURPOSE_UNITS));
    Some(ReadmePurpose {
        path: (*name).to_string(),
        purpose: purpose.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_span_with_no_closer_stays_and_a_closed_one_goes() {
        assert_eq!(without_spans("a <!-- x --> b", "<!--", "-->"), "a  b");
        assert_eq!(without_spans("a <!-- x b", "<!--", "-->"), "a <!-- x b");
        assert_eq!(without_spans("a ```x``` b ```y```", "```", "```"), "a  b ");
    }

    #[test]
    fn the_paragraph_text_loses_its_markup_and_headings() {
        assert_eq!(
            paragraph_text("# Title\nA [small](http://x) shop <b>for</b>\nthe test.\n---"),
            "A small shop for the test."
        );
    }
}
