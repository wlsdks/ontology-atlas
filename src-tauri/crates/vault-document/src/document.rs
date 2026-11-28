//! One Markdown file read as a node: its frontmatter, its body, and where every part sits in the
//! bytes, so a later write replaces the lines it means to change and leaves every other byte as it
//! was.
//!
//! Nothing is normalised in the file: a byte-order mark, CRLF line endings, comments, blank lines,
//! the order and quoting of keys all stay in [`Document::raw`]. What a reader sees ([`Document::body`],
//! [`Document::frontmatter`]) is read from it, LF-only, the way agents have always seen it.

use std::borrow::Cow;
use std::ops::Range;

use crate::frontmatter::{read_block, Diagnostic, Frontmatter, Line, ReadEntry};

const BYTE_ORDER_MARK: char = '\u{feff}';

/// How a file opens, which decides what is read of it and what a validator says.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RawShape {
    /// No bytes at all.
    Empty,
    /// No opening `---`: plain Markdown with no frontmatter.
    Plain,
    /// An opening `---` that no line closes: not read as a node.
    Unclosed,
    /// An opening and a closing `---` line.
    Framed,
}

/// A parsed file. Cheap to hold: the text once, the spans and the values read from it.
#[derive(Debug, Clone)]
pub struct Document {
    raw: String,
    /// Whether the file was valid UTF-8. When it was not, [`Document::raw`] holds the text with
    /// U+FFFD in place of each bad byte, and a write must refuse the file rather than save that.
    exact: bool,
    layout: Layout,
    frontmatter: Frontmatter,
    diagnostics: Vec<Diagnostic>,
}

#[derive(Debug, Clone)]
enum Layout {
    Empty,
    Plain { body_start: usize },
    Unclosed { body_start: usize },
    Framed(Framed),
}

#[derive(Debug, Clone)]
struct Framed {
    /// The opening fence line, with its line ending.
    opening: Range<usize>,
    /// Every line between the fences.
    region: Range<usize>,
    entries: Vec<EntrySpan>,
    closing: Range<usize>,
    body_start: usize,
}

/// A top-level key and the bytes of the whole lines it owns.
#[derive(Debug, Clone)]
struct EntrySpan {
    key: String,
    range: Range<usize>,
    /// Whether the reader kept the key (it refuses `__proto__` and its kind).
    kept: bool,
}

impl Document {
    /// Reads a file from its bytes. Bytes that are not UTF-8 become U+FFFD, as Node decodes them,
    /// and the document says so ([`Document::is_exact`]).
    ///
    /// A `Vec` is read in place; a slice is copied once.
    pub fn from_bytes(bytes: impl Into<Vec<u8>>) -> Self {
        match String::from_utf8(bytes.into()) {
            Ok(text) => Self::parse(text, true),
            Err(error) => Self::parse(
                String::from_utf8_lossy(error.as_bytes()).into_owned(),
                false,
            ),
        }
    }

    pub fn from_text(text: &str) -> Self {
        Self::parse(text.to_string(), true)
    }

    fn parse(raw: String, exact: bool) -> Self {
        let bom = if raw.starts_with(BYTE_ORDER_MARK) {
            BYTE_ORDER_MARK.len_utf8()
        } else {
            0
        };
        let lines = Line::all_from(raw.get(bom..).unwrap_or_default(), bom);
        let closing = match lines.first() {
            Some(first) if is_fence(first.text) => lines
                .iter()
                .skip(1)
                .position(|line| is_fence(line.text))
                .map(|offset| offset + 1),
            _ => None,
        };
        let (layout, frontmatter, diagnostics) = match (lines.first(), closing) {
            _ if raw.is_empty() => (Layout::Empty, Frontmatter::default(), Vec::new()),
            (Some(opening), Some(closing_index)) => {
                let between = lines.get(1..closing_index).unwrap_or_default();
                let read = read_block(between);
                let entries = read
                    .entries
                    .iter()
                    .filter_map(|entry| entry_span(entry, between))
                    .collect();
                let region_start = between.first().map_or(opening.end, |line| line.start);
                let closing_line = lines.get(closing_index).copied().unwrap_or(*opening);
                let framed = Framed {
                    opening: opening.start..opening.end,
                    region: region_start..closing_line.start,
                    entries,
                    closing: closing_line.start..closing_line.end,
                    body_start: closing_line.end,
                };
                (
                    Layout::Framed(framed),
                    Frontmatter::from_entries(read.entries),
                    read.diagnostics,
                )
            }
            (Some(first), None) if is_fence(first.text) => (
                Layout::Unclosed { body_start: bom },
                Frontmatter::default(),
                Vec::new(),
            ),
            _ => (
                Layout::Plain { body_start: bom },
                Frontmatter::default(),
                Vec::new(),
            ),
        };
        Self {
            raw,
            exact,
            layout,
            frontmatter,
            diagnostics,
        }
    }

    /// Every byte of the file as the text read from it.
    pub fn raw(&self) -> &str {
        &self.raw
    }

    /// Whether the file was valid UTF-8, so that writing [`Document::raw`] back changes no byte
    /// outside the lines a write means to change.
    pub fn is_exact(&self) -> bool {
        self.exact
    }

    pub fn shape(&self) -> RawShape {
        match self.layout {
            Layout::Empty => RawShape::Empty,
            Layout::Plain { .. } => RawShape::Plain,
            Layout::Unclosed { .. } => RawShape::Unclosed,
            Layout::Framed(_) => RawShape::Framed,
        }
    }

    pub fn frontmatter(&self) -> &Frontmatter {
        &self.frontmatter
    }

    /// The frontmatter alone, once the rest has been used.
    pub fn into_frontmatter(self) -> Frontmatter {
        self.frontmatter
    }

    pub fn diagnostics(&self) -> &[Diagnostic] {
        &self.diagnostics
    }

    /// The bytes of the body: everything after the closing fence line, or the whole file after its
    /// byte-order mark when there is no frontmatter.
    pub fn body_range(&self) -> Range<usize> {
        let start = match &self.layout {
            Layout::Empty => 0,
            Layout::Plain { body_start } | Layout::Unclosed { body_start } => *body_start,
            Layout::Framed(framed) => framed.body_start,
        };
        start..self.raw.len()
    }

    /// The body as readers see it: LF line endings only.
    pub fn body(&self) -> Cow<'_, str> {
        let body = self.raw.get(self.body_range()).unwrap_or_default();
        if body.contains("\r\n") {
            Cow::Owned(body.replace("\r\n", "\n"))
        } else {
            Cow::Borrowed(body)
        }
    }

    /// `\r\n` when the file has any, else `\n`: one CRLF makes a CRLF file, because a Windows editor
    /// appends CRLF from there on.
    pub fn line_ending(&self) -> &'static str {
        if self.raw.contains("\r\n") {
            "\r\n"
        } else {
            "\n"
        }
    }

    /// The bytes of the whole lines the top-level `key` owns, for the last time it is written.
    pub fn entry_range(&self, key: &str) -> Option<Range<usize>> {
        let Layout::Framed(framed) = &self.layout else {
            return None;
        };
        framed
            .entries
            .iter()
            .rev()
            .find(|entry| entry.kept && entry.key == key)
            .map(|entry| entry.range.clone())
    }

    /// Where a new key is added: the start of the closing fence line.
    pub fn insertion_point(&self) -> Option<usize> {
        match &self.layout {
            Layout::Framed(framed) => Some(framed.closing.start),
            _ => None,
        }
    }

    /// The file's text with `range` replaced, every other byte as it was. `None` when `range` is
    /// not inside the file on character boundaries.
    pub fn with_range_replaced(&self, range: Range<usize>, replacement: &str) -> Option<String> {
        let before = self.raw.get(..range.start)?;
        let after = self.raw.get(range.end..)?;
        let mut text = String::with_capacity(before.len() + replacement.len() + after.len());
        text.push_str(before);
        text.push_str(replacement);
        text.push_str(after);
        Some(text)
    }

    /// The parts of the file in order, each exactly the bytes it covers: the byte-order mark, the
    /// opening fence, every line between the fences, the closing fence and the body. Joined they
    /// are the file; a part that is not the bytes it names is a bug in the layout.
    pub fn parts(&self) -> Vec<&str> {
        let slice = |range: Range<usize>| self.raw.get(range).unwrap_or_default();
        match &self.layout {
            Layout::Empty => Vec::new(),
            Layout::Plain { body_start } | Layout::Unclosed { body_start } => {
                vec![slice(0..*body_start), slice(*body_start..self.raw.len())]
            }
            Layout::Framed(framed) => {
                let mut parts = vec![
                    slice(0..framed.opening.start),
                    slice(framed.opening.clone()),
                ];
                let mut cursor = framed.region.start;
                for entry in &framed.entries {
                    if entry.range.start > cursor {
                        parts.push(slice(cursor..entry.range.start));
                    }
                    parts.push(slice(entry.range.clone()));
                    cursor = entry.range.end;
                }
                if framed.region.end > cursor {
                    parts.push(slice(cursor..framed.region.end));
                }
                parts.push(slice(framed.closing.clone()));
                parts.push(slice(framed.body_start..self.raw.len()));
                parts
            }
        }
    }
}

/// A fence line: `---` and nothing but spaces or tabs after it.
fn is_fence(text: &str) -> bool {
    text.strip_prefix("---").is_some_and(|rest| {
        rest.chars()
            .all(|character| character == ' ' || character == '\t')
    })
}

fn entry_span(entry: &ReadEntry, lines: &[Line<'_>]) -> Option<EntrySpan> {
    let first = lines.get(entry.first_line)?;
    let last = lines.get(entry.first_line + entry.line_count - 1)?;
    Some(EntrySpan {
        key: entry.key.clone(),
        range: first.start..last.end,
        kept: entry.value.is_some(),
    })
}
