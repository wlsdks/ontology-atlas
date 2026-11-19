//! Passages: the pieces of one Markdown file that search by meaning embeds. Frontmatter is
//! dropped, a passage starts at every heading outside a code fence, a heading with no body is
//! skipped, and a passage holds at most `MAX_PASSAGE_CHARS` characters (split at line ends, a
//! longer line cut). Text is NFC, so a passage typed on macOS (NFD) hashes as one typed elsewhere.
//! The rule matches `splitPassages` in `scripts/perf/meaning-quality.mjs`, which measured quality.

use crate::stamps::Sha;
use icu_normalizer::ComposingNormalizerBorrowed;
use sha2::{Digest, Sha256};

/// The embedding client refuses longer passages.
pub(crate) const MAX_PASSAGE_CHARS: usize = 2_000;
/// Passages beyond this many in one file are counted as not prepared.
pub(crate) const MAX_PASSAGES_PER_FILE: usize = 500;
/// Changing the split rule changes this; stored passage lists are then read again, while vectors
/// of passages whose text did not change are kept.
pub(crate) const PASSAGE_VERSION: u32 = 1;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Passage {
    /// 1-based, inclusive, in the file as written (frontmatter lines counted).
    pub(crate) line_start: u32,
    pub(crate) line_end: u32,
    /// The heading that opens the passage's section, without its `#` marks.
    pub(crate) heading: Option<String>,
    /// NFC, trimmed, at most `MAX_PASSAGE_CHARS` characters.
    pub(crate) text: String,
    pub(crate) sha: Sha,
}

impl Passage {
    pub(crate) fn chars(&self) -> usize {
        self.text.chars().count()
    }
}

/// The file's first `MAX_PASSAGES_PER_FILE` passages, and how many more it holds. O(n) in the
/// text's length.
pub(crate) fn split(raw: &str) -> (Vec<Passage>, usize) {
    let mut passages = split_all(raw);
    let over = passages.len().saturating_sub(MAX_PASSAGES_PER_FILE);
    passages.truncate(MAX_PASSAGES_PER_FILE);
    (passages, over)
}

pub(crate) fn sha_of(text: &str) -> Sha {
    Sha256::digest(text.as_bytes()).into()
}

pub(crate) fn nfc(text: &str) -> std::borrow::Cow<'_, str> {
    ComposingNormalizerBorrowed::new_nfc().normalize(text)
}

struct Section<'a> {
    /// 0-based index of the section's first line.
    start: usize,
    lines: Vec<&'a str>,
    heading: bool,
}

fn is_blank(line: &str) -> bool {
    line.trim().is_empty()
}

/// `^ {0,3}#{1,6}(?:[ \t]|$)`
fn is_heading(line: &str) -> bool {
    let Some(rest) = strip_indent(line) else {
        return false;
    };
    let marks = rest.bytes().take_while(|&byte| byte == b'#').count();
    (1..=6).contains(&marks) && matches!(rest.as_bytes().get(marks), None | Some(b' ' | b'\t'))
}

/// The run of three or more backticks or tildes that opens a fence: `^ {0,3}(`{3,}|~{3,})`.
fn fence_of(line: &str) -> Option<(u8, usize)> {
    let rest = strip_indent(line)?;
    let mark = *rest.as_bytes().first()?;
    if mark != b'`' && mark != b'~' {
        return None;
    }
    let run = rest.bytes().take_while(|&byte| byte == mark).count();
    (run >= 3).then_some((mark, run))
}

/// The line after at most three leading spaces, or `None` when more are there.
fn strip_indent(line: &str) -> Option<&str> {
    let spaces = line.bytes().take_while(|&byte| byte == b' ').count();
    (spaces <= 3).then(|| line.get(spaces..)).flatten()
}

fn heading_text(line: &str) -> String {
    let text = line
        .trim()
        .trim_start_matches('#')
        .trim()
        .trim_end_matches('#')
        .trim();
    nfc(text).into_owned()
}

/// `^(?:---|\.\.\.)\s*$`
fn closes_frontmatter(line: &str) -> bool {
    (line.starts_with("---") || line.starts_with("...")) && line.get(3..).is_some_and(is_blank)
}

fn sections<'a>(lines: &[&'a str]) -> Vec<Section<'a>> {
    let mut first = 0;
    if lines.first().is_some_and(|line| line.trim() == "---") {
        first = lines
            .iter()
            .enumerate()
            .skip(1)
            .find(|(_, line)| closes_frontmatter(line))
            .map_or(0, |(at, _)| at + 1);
    }
    let mut sections: Vec<Section> = Vec::new();
    let mut fence: Option<(u8, usize)> = None;
    for (index, line) in lines.iter().enumerate().skip(first) {
        let fenced = fence_of(line);
        match (fence, fenced) {
            (Some((mark, run)), Some((closing, length))) if closing == mark && length >= run => {
                fence = None
            }
            (Some(_), _) => {}
            (None, Some(opened)) => fence = Some(opened),
            (None, None) if is_heading(line) => sections.push(Section {
                start: index,
                lines: Vec::new(),
                heading: true,
            }),
            (None, None) => {}
        }
        if sections.is_empty() {
            sections.push(Section {
                start: index,
                lines: Vec::new(),
                heading: false,
            });
        }
        if let Some(section) = sections.last_mut() {
            section.lines.push(line);
        }
    }
    sections
}

/// Collects one section's lines into passages of at most `MAX_PASSAGE_CHARS`.
struct Chunker<'p> {
    out: &'p mut Vec<Passage>,
    heading: Option<String>,
    lines: Vec<String>,
    chars: usize,
    /// 1-based line the chunk starts on.
    start: usize,
}

impl Chunker<'_> {
    fn flush(&mut self, end: usize) {
        let joined = self.lines.join("\n");
        self.lines.clear();
        self.chars = 0;
        let normal = nfc(joined.trim());
        // NFC can lengthen a few rare characters past the cap the raw count respected.
        let text: String = normal.chars().take(MAX_PASSAGE_CHARS).collect();
        if text.is_empty() {
            return;
        }
        self.out.push(Passage {
            line_start: line_number(self.start),
            line_end: line_number(end),
            heading: self.heading.clone(),
            sha: sha_of(&text),
            text,
        });
    }
}

fn line_number(line: usize) -> u32 {
    u32::try_from(line).unwrap_or(u32::MAX)
}

fn split_all(raw: &str) -> Vec<Passage> {
    let lines: Vec<&str> = raw
        .split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .collect();
    let mut passages = Vec::new();
    for section in sections(&lines) {
        let body = if section.heading {
            section.lines.get(1..).unwrap_or_default()
        } else {
            section.lines.as_slice()
        };
        if body.iter().all(|line| is_blank(line)) {
            continue;
        }
        let mut chunk = Chunker {
            out: &mut passages,
            heading: section
                .heading
                .then(|| section.lines.first().map(|line| heading_text(line)))
                .flatten(),
            lines: Vec::new(),
            chars: 0,
            start: section.start + 1,
        };
        for (at, line) in section.lines.iter().enumerate() {
            let number = section.start + 1 + at;
            let mut rest: Vec<char> = line.chars().collect();
            while rest.len() > MAX_PASSAGE_CHARS {
                if !chunk.lines.is_empty() {
                    chunk.flush(number - 1);
                }
                chunk.start = number;
                chunk.lines.push(rest.drain(..MAX_PASSAGE_CHARS).collect());
                chunk.flush(number);
                chunk.start = number;
            }
            if !chunk.lines.is_empty() && chunk.chars + rest.len() + 1 > MAX_PASSAGE_CHARS {
                chunk.flush(number - 1);
                chunk.start = number;
            }
            if chunk.lines.is_empty() {
                chunk.start = number;
            }
            chunk.chars += rest.len() + 1;
            chunk.lines.push(rest.into_iter().collect());
        }
        if !chunk.lines.is_empty() {
            let mut end = section.start + section.lines.len();
            while end > chunk.start
                && section
                    .lines
                    .get(end - 1 - section.start)
                    .is_some_and(|line| is_blank(line))
            {
                end -= 1;
            }
            chunk.flush(end);
        }
    }
    passages
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spans(raw: &str) -> Vec<(u32, u32, Option<String>, String)> {
        split(raw)
            .0
            .into_iter()
            .map(|passage| {
                (
                    passage.line_start,
                    passage.line_end,
                    passage.heading,
                    passage.text,
                )
            })
            .collect()
    }

    #[test]
    fn frontmatter_is_dropped_and_every_heading_with_a_body_starts_a_passage() {
        let raw = "---\ntitle: A\n---\n\nIntro line.\n\n# One\n\nFirst body.\n\n## Empty\n\n## Two ##\nSecond body.\n\n";
        assert_eq!(
            spans(raw),
            vec![
                (4, 5, None, "Intro line.".to_string()),
                (7, 9, Some("One".into()), "# One\n\nFirst body.".to_string()),
                (
                    13,
                    14,
                    Some("Two".into()),
                    "## Two ##\nSecond body.".to_string()
                ),
            ]
        );
    }

    #[test]
    fn a_heading_inside_a_code_fence_does_not_split() {
        let raw = "# Code\n```md\n# not a heading\n```\n~~~\n## nor this\n~~~~\nafter";
        let passages = split(raw).0;
        assert_eq!(passages.len(), 1);
        assert_eq!((passages[0].line_start, passages[0].line_end), (1, 8));
    }

    #[test]
    fn a_long_section_splits_at_line_ends_and_a_longer_line_is_cut() {
        let line = "a".repeat(1_500);
        let raw = format!("# Long\n{line}\n{line}\n{}", "b".repeat(4_500));
        let passages = split(&raw).0;
        let sizes: Vec<(u32, u32, usize)> = passages
            .iter()
            .map(|passage| (passage.line_start, passage.line_end, passage.chars()))
            .collect();
        assert_eq!(
            sizes,
            vec![
                (1, 2, 1_507),
                (3, 3, 1_500),
                (4, 4, 2_000),
                (4, 4, 2_000),
                (4, 4, 500)
            ]
        );
        assert!(passages
            .iter()
            .all(|passage| passage.heading.as_deref() == Some("Long")));
    }

    #[test]
    fn nfd_and_nfc_text_hash_alike() {
        let nfc_text = "# 지도\n한글 문서";
        let nfd_text: String = "# \u{110C}\u{1175}\u{1103}\u{1169}\n\u{1112}\u{1161}\u{11AB}\u{1100}\u{1173}\u{11AF} \u{1106}\u{116E}\u{11AB}\u{1109}\u{1165}".to_string();
        assert_ne!(nfc_text, nfd_text);
        let (a, b) = (split(nfc_text).0, split(&nfd_text).0);
        assert_eq!(a[0].sha, b[0].sha);
        assert_eq!(b[0].heading.as_deref(), Some("지도"));
    }

    #[test]
    fn a_file_contributes_at_most_five_hundred_passages() {
        let raw: String = (0..620).map(|i| format!("# H{i}\nbody {i}\n")).collect();
        let (passages, over) = split(&raw);
        assert_eq!((passages.len(), over), (MAX_PASSAGES_PER_FILE, 120));
    }

    #[test]
    fn crlf_line_ends_split_like_lf() {
        assert_eq!(
            split("# A\r\nbody\r\n").0[0].sha,
            split("# A\nbody\n").0[0].sha
        );
    }
}
