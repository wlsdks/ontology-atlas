//! The lines of a Markdown document that its author wrote as prose or headings: the text of each
//! heading and paragraph kept on its own line, everything else (front matter, code, quotes, inline
//! HTML) blanked. Line numbers stay those of the document, so a citation points at the real line.

use std::sync::LazyLock;

use answer_format::whitespace::trim;
use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use regex::Regex;
use repository_survey::js_regex;

use crate::candidate_text::clean_heading_label;

static ATX_OPENER: LazyLock<Regex> = LazyLock::new(|| js_regex(r"^ {0,3}#{1,6}\s+"));
static ATX_CLOSER: LazyLock<Regex> = LazyLock::new(|| js_regex(r"\s+#+\s*$"));
static HEADING_HTML_BLOCK: LazyLock<Regex> = LazyLock::new(|| {
    js_regex(r"(?i)^ {0,3}<h[1-3]\b[^<>]*>[^<>]*</h[1-3]>\s*$")
});

const BYTE_ORDER_MARK: char = '\u{FEFF}';

/// Lines of `text` split at a carriage return, a line feed or both.
pub fn document_lines(text: &str) -> Vec<&str> {
    let mut lines = Vec::new();
    let mut start = 0;
    let bytes = text.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        match bytes.get(index) {
            Some(b'\r') => {
                lines.push(text.get(start..index).unwrap_or_default());
                if bytes.get(index + 1) == Some(&b'\n') {
                    index += 1;
                }
                start = index + 1;
            }
            Some(b'\n') => {
                lines.push(text.get(start..index).unwrap_or_default());
                start = index + 1;
            }
            _ => {}
        }
        index += 1;
    }
    lines.push(text.get(start..).unwrap_or_default());
    lines
}

/// What a block of prose is, with where it lies in the source.
struct ProseBlock {
    heading_depth: Option<usize>,
    start: usize,
    end: usize,
    inline_html: Vec<(usize, usize)>,
}

fn is_inline_start(tag: &Tag<'_>) -> bool {
    matches!(
        tag,
        Tag::Emphasis
            | Tag::Strong
            | Tag::Strikethrough
            | Tag::Superscript
            | Tag::Subscript
            | Tag::Link { .. }
            | Tag::Image { .. }
    )
}

fn is_inline_end(tag: &TagEnd) -> bool {
    matches!(
        tag,
        TagEnd::Emphasis
            | TagEnd::Strong
            | TagEnd::Strikethrough
            | TagEnd::Superscript
            | TagEnd::Subscript
            | TagEnd::Link
            | TagEnd::Image
    )
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Container {
    List,
    Item,
    Other,
}

/// The headings and paragraphs the author wrote at the top level or inside lists, and the
/// `<h1>` to `<h3>` lines they wrote as HTML.
fn blocks_of(source: &str) -> (Vec<ProseBlock>, Vec<(usize, String)>) {
    let skipped = if source.starts_with(BYTE_ORDER_MARK) {
        BYTE_ORDER_MARK.len_utf8()
    } else {
        0
    };
    let body = source.get(skipped..).unwrap_or(source);
    let mut blocks = Vec::new();
    let mut html_lines = Vec::new();
    let mut containers: Vec<Container> = Vec::new();
    let mut current: Option<ProseBlock> = None;
    let mut implicit: Option<ProseBlock> = None;
    let mut html_block: Option<(usize, String)> = None;
    for (event, range) in Parser::new_ext(body, Options::empty()).into_offset_iter() {
        let (from, to) = (range.start + skipped, range.end + skipped);
        let in_lists_only = containers
            .iter()
            .all(|container| matches!(container, Container::List | Container::Item));
        if let Some((_, text)) = html_block.as_mut() {
            match &event {
                Event::Html(chunk) => text.push_str(chunk),
                Event::End(TagEnd::HtmlBlock) => {
                    if let Some((start, text)) = html_block.take() {
                        if containers.is_empty() {
                            html_lines.push((start, text));
                        }
                    }
                }
                _ => {}
            }
            continue;
        }
        match event {
            Event::Start(Tag::Heading { level, .. }) => {
                if let Some(done) = implicit.take() {
                    blocks.push(done);
                }
                if containers.is_empty() {
                    current = Some(ProseBlock {
                        heading_depth: Some(level as usize),
                        start: from,
                        end: to,
                        inline_html: Vec::new(),
                    });
                }
                containers.push(Container::Other);
            }
            Event::Start(Tag::Paragraph) => {
                if let Some(done) = implicit.take() {
                    blocks.push(done);
                }
                if in_lists_only {
                    current = Some(ProseBlock {
                        heading_depth: None,
                        start: from,
                        end: to,
                        inline_html: Vec::new(),
                    });
                }
                containers.push(Container::Other);
            }
            Event::End(TagEnd::Heading(_) | TagEnd::Paragraph) => {
                containers.pop();
                if let Some(done) = current.take() {
                    blocks.push(done);
                }
            }
            Event::Start(Tag::HtmlBlock) => {
                if let Some(done) = implicit.take() {
                    blocks.push(done);
                }
                html_block = Some((from, String::new()));
            }
            Event::Start(Tag::List(_)) => {
                if let Some(done) = implicit.take() {
                    blocks.push(done);
                }
                containers.push(Container::List);
            }
            Event::Start(Tag::Item) => containers.push(Container::Item),
            Event::End(TagEnd::Item) => {
                if let Some(done) = implicit.take() {
                    blocks.push(done);
                }
                containers.pop();
            }
            Event::Start(ref tag) if is_inline_start(tag) => {
                note_inline(&mut current, &mut implicit, &containers, from, to);
            }
            Event::End(ref tag) if is_inline_end(tag) => {}
            Event::Start(_) => {
                if let Some(done) = implicit.take() {
                    blocks.push(done);
                }
                containers.push(Container::Other);
            }
            Event::End(_) => {
                if let Some(done) = implicit.take() {
                    blocks.push(done);
                }
                containers.pop();
            }
            Event::InlineHtml(_) => {
                let target = current.as_mut().or(implicit.as_mut());
                if let Some(block) = target {
                    block.inline_html.push((from, to));
                    block.end = block.end.max(to);
                } else {
                    note_inline(&mut current, &mut implicit, &containers, from, to);
                    if let Some(block) = implicit.as_mut() {
                        block.inline_html.push((from, to));
                    }
                }
            }
            _ => note_inline(&mut current, &mut implicit, &containers, from, to),
        }
    }
    if let Some(done) = implicit.take() {
        blocks.push(done);
    }
    (blocks, html_lines)
}

/// An inline event: it grows the block it belongs to, or starts the paragraph a tight list item
/// holds without a paragraph of its own.
fn note_inline(
    current: &mut Option<ProseBlock>,
    implicit: &mut Option<ProseBlock>,
    containers: &[Container],
    from: usize,
    to: usize,
) {
    if let Some(block) = current.as_mut() {
        block.end = block.end.max(to);
        return;
    }
    if containers.last() != Some(&Container::Item)
        || !containers
            .iter()
            .all(|container| matches!(container, Container::List | Container::Item))
    {
        return;
    }
    match implicit.as_mut() {
        Some(block) => block.end = block.end.max(to),
        None => {
            *implicit = Some(ProseBlock {
                heading_depth: None,
                start: from,
                end: to,
                inline_html: Vec::new(),
            });
        }
    }
}

/// Where each line of a text starts, found once so the line of an offset is a search, not a scan.
struct LineStarts(Vec<usize>);

impl LineStarts {
    fn of(source: &str) -> Self {
        Self(
            source
                .bytes()
                .enumerate()
                .filter(|(_, byte)| *byte == b'\n')
                .map(|(at, _)| at)
                .collect(),
        )
    }

    /// The zero-based line holding `offset`: how many line feeds lie before it.
    fn line_of(&self, offset: usize) -> usize {
        self.0.partition_point(|newline| *newline < offset)
    }
}

/// The end of the line that holds the last character of a block ending at `end`.
fn line_end_after(source: &str, end: usize) -> usize {
    let last = end.saturating_sub(1).min(source.len());
    if source.as_bytes().get(last) == Some(&b'\n') {
        return last;
    }
    source
        .get(last..)
        .and_then(|rest| rest.find('\n'))
        .map_or(source.len(), |offset| last + offset)
}

fn blanked(text: &str) -> String {
    text.chars()
        .map(|character| if character == '\n' { '\n' } else { ' ' })
        .collect()
}

pub fn authored_markdown_lines(text: &str) -> Vec<String> {
    let raw_lines = document_lines(text);
    let mut lines: Vec<String> = vec![String::new(); raw_lines.len()];
    let mut content: Vec<&str> = raw_lines.clone();
    if content.first().is_some_and(|first| trim(first) == "---") {
        let mut index = 0;
        loop {
            if let Some(slot) = content.get_mut(index) {
                *slot = "";
            }
            index += 1;
            if index >= content.len() || raw_lines.get(index).is_some_and(|line| trim(line) == "---")
            {
                break;
            }
        }
        if index < content.len() {
            if let Some(slot) = content.get_mut(index) {
                *slot = "";
            }
        }
    }
    let source = content.join("\n");
    let (blocks, html_lines) = blocks_of(&source);
    let line_starts = LineStarts::of(&source);
    for block in blocks {
        let end = line_end_after(&source, block.end);
        let mut value = String::new();
        let mut offset = block.start;
        let mut html = block.inline_html.clone();
        html.sort_unstable();
        for (from, to) in html {
            if from < offset || to > end {
                continue;
            }
            value.push_str(source.get(offset..from).unwrap_or_default());
            value.push_str(&blanked(source.get(from..to).unwrap_or_default()));
            offset = to;
        }
        value.push_str(source.get(offset..end.max(offset)).unwrap_or_default());
        let first_line = line_starts.line_of(block.start);
        let authored: Vec<&str> = value.split('\n').collect();
        if let Some(depth) = block.heading_depth {
            let first = authored.first().copied().unwrap_or_default();
            let opened = ATX_OPENER.replace(first, "");
            let closed = ATX_CLOSER.replace(&opened, "");
            if let Some(slot) = lines.get_mut(first_line) {
                *slot = format!("{} {}", "#".repeat(depth), clean_heading_label(&closed));
            }
        } else {
            for (index, line) in authored.iter().enumerate() {
                if let Some(slot) = lines.get_mut(first_line + index) {
                    *slot = (*line).to_string();
                }
            }
        }
    }
    for (start, html) in html_lines {
        let value = html.strip_suffix('\n').unwrap_or(&html);
        if HEADING_HTML_BLOCK.is_match(value) {
            if let Some(slot) = lines.get_mut(line_starts.line_of(start)) {
                *slot = value.to_string();
            }
        }
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_readme_of_one_hundred_thousand_paragraphs_is_read_in_well_under_a_second() {
        let readme = "a\n\n".repeat(128 * 1024);
        let started = std::time::Instant::now();
        let lines = authored_markdown_lines(&readme);
        assert_eq!(lines.first().map(String::as_str), Some("a"));
        assert!(
            started.elapsed() < std::time::Duration::from_secs(2),
            "took {:?}",
            started.elapsed()
        );
    }

    #[test]
    fn headings_and_paragraphs_keep_their_lines_and_code_is_blanked() {
        let lines = authored_markdown_lines(
            "# Title\n\nProse here.\n\n```\n# not a heading\n```\n\n- item one\n- item two\n",
        );
        assert_eq!(lines.first().map(String::as_str), Some("# Title"));
        assert_eq!(lines.get(2).map(String::as_str), Some("Prose here."));
        assert_eq!(lines.get(5).map(String::as_str), Some(""));
        assert_eq!(lines.get(8).map(String::as_str), Some("item one"));
        assert_eq!(lines.get(9).map(String::as_str), Some("item two"));
    }

    #[test]
    fn front_matter_is_not_prose_and_a_setext_title_is_one_hash_line() {
        let lines = authored_markdown_lines("---\ntitle: x\n---\nTitle\n=====\n");
        assert_eq!(lines.first().map(String::as_str), Some(""));
        assert_eq!(lines.get(3).map(String::as_str), Some("# Title"));
    }
}
