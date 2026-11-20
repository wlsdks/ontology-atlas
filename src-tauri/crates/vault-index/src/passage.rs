//! Passages: the pieces of one Markdown file that search by meaning embeds. Frontmatter is
//! dropped, a passage starts at every heading outside a code fence, a heading with no body is
//! skipped, and a passage holds at most `MAX_PASSAGE_CHARS` characters (split at line ends, a
//! longer line cut). A section shorter than `MIN_SECTION_CHARS` joins its neighbour. Text is NFC,
//! so NFD text typed on macOS hashes alike. `splitPassages` in `scripts/perf/meaning-quality.mjs`
//! is the same rule, which measured quality.

use crate::stamps::Sha;
use icu_normalizer::ComposingNormalizerBorrowed;
use sha2::{Digest, Sha256};

/// The embedding client refuses longer passages.
pub(crate) const MAX_PASSAGE_CHARS: usize = 2_000;
/// A whole section shorter than this joins the section after it (the file's last joins the one
/// before), up to `MAX_PASSAGE_CHARS`: alone, a heading-sized section embeds too little to match.
pub(crate) const MIN_SECTION_CHARS: usize = 400;
/// Passages beyond this many in one file are counted as not prepared.
pub(crate) const MAX_PASSAGES_PER_FILE: usize = 500;
/// Changing the split rule changes this; stored passage lists are then read again, while vectors
/// of passages whose text did not change are kept.
pub(crate) const PASSAGE_VERSION: u32 = 2;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Passage {
    /// 1-based, inclusive, in the file as written (frontmatter lines counted).
    pub(crate) line_start: u32,
    pub(crate) line_end: u32,
    /// The heading that opens the passage's (first) section, without its `#` marks.
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
    let mut passages = join_short(split_all(raw));
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

/// Each section's passages, with whether the passage is its section's only one.
fn split_all(raw: &str) -> Vec<(Passage, bool)> {
    let lines: Vec<&str> = raw
        .split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .collect();
    let mut passages = Vec::new();
    let mut whole = Vec::new();
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
        let made = passages.len() - whole.len();
        whole.extend(std::iter::repeat_n(made == 1, made));
    }
    passages.into_iter().zip(whole).collect()
}

fn joined(first: &Passage, second: &Passage) -> Option<Passage> {
    let chars = first.chars() + 2 + second.chars();
    (chars <= MAX_PASSAGE_CHARS).then(|| {
        let text = format!("{}\n\n{}", first.text, second.text);
        Passage {
            line_start: first.line_start,
            line_end: second.line_end,
            heading: first.heading.clone(),
            sha: sha_of(&text),
            text,
        }
    })
}

/// Joins each whole section under `MIN_SECTION_CHARS` to the passage after it while the result
/// stays short, and a short one left at the end to the passage before. O(n) in the text's length.
fn join_short(passages: Vec<(Passage, bool)>) -> Vec<Passage> {
    let mut out: Vec<Passage> = Vec::with_capacity(passages.len());
    let mut carry: Option<Passage> = None;
    for (passage, whole) in passages {
        let mut short = whole && passage.chars() < MIN_SECTION_CHARS;
        let mut current = passage;
        if let Some(held) = carry.take() {
            match joined(&held, &current) {
                Some(both) => {
                    short = short && both.chars() < MIN_SECTION_CHARS;
                    current = both;
                }
                None => out.push(held),
            }
        }
        if short {
            carry = Some(current);
        } else {
            out.push(current);
        }
    }
    if let Some(held) = carry {
        match out.last().and_then(|last| joined(last, &held)) {
            Some(both) => {
                out.pop();
                out.push(both);
            }
            None => out.push(held),
        }
    }
    out
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

    /// A body long enough that its section stands alone.
    fn long(mark: char) -> String {
        mark.to_string().repeat(MIN_SECTION_CHARS)
    }

    #[test]
    fn frontmatter_is_dropped_and_every_heading_with_a_body_starts_a_passage() {
        let (a, b, c) = (long('a'), long('b'), long('c'));
        let raw =
            format!("---\ntitle: A\n---\n\n{a}\n\n# One\n\n{b}\n\n## Empty\n\n## Two ##\n{c}\n\n");
        assert_eq!(
            spans(&raw),
            vec![
                (4, 5, None, a),
                (7, 9, Some("One".into()), format!("# One\n\n{b}")),
                (13, 14, Some("Two".into()), format!("## Two ##\n{c}")),
            ]
        );
    }

    #[test]
    fn a_short_section_joins_the_next_and_the_passage_spans_both() {
        let body = long('b');
        let raw = format!("# A\nshort\n\n# B\n{body}\n\n# C\n{body}");
        let passages = spans(&raw);
        assert_eq!(passages.len(), 2);
        assert_eq!(
            passages[0],
            (1, 5, Some("A".into()), format!("# A\nshort\n\n# B\n{body}"))
        );
        assert_eq!((passages[1].0, passages[1].1), (7, 8));
    }

    #[test]
    fn short_sections_in_a_row_keep_joining_until_the_floor() {
        let raw = format!("# A\none\n# B\ntwo\n# C\n{}", long('c'));
        let passages = spans(&raw);
        assert_eq!(passages.len(), 1);
        assert_eq!((passages[0].0, passages[0].1), (1, 6));
        assert!(passages[0].3.starts_with("# A\none\n\n# B\ntwo\n\n# C\n"));
    }

    #[test]
    fn the_last_short_section_joins_the_one_before() {
        let body = long('a');
        let raw = format!("# A\n{body}\n\n# B\nshort\n");
        assert_eq!(
            spans(&raw),
            vec![(1, 5, Some("A".into()), format!("# A\n{body}\n\n# B\nshort"))]
        );
    }

    #[test]
    fn a_join_never_passes_two_thousand_characters() {
        let near_cap = "n".repeat(MAX_PASSAGE_CHARS - 6);
        let raw = format!("# A\nshort\n# B\n{near_cap}\n# C\ntail");
        let passages = split(&raw).0;
        assert!(passages.iter().all(|p| p.chars() <= MAX_PASSAGE_CHARS));
        let lines: Vec<(u32, u32)> = passages
            .iter()
            .map(|p| (p.line_start, p.line_end))
            .collect();
        assert_eq!(lines, vec![(1, 2), (3, 4), (5, 6)]);
    }

    #[test]
    fn a_short_tail_of_a_long_section_does_not_join() {
        let (line, full) = ("l".repeat(1_500), "f".repeat(1_996));
        let raw = format!("# Long\n{line}\n{full}\ntail\n# Next\n{}", long('n'));
        let lines: Vec<(u32, u32)> = split(&raw)
            .0
            .iter()
            .map(|p| (p.line_start, p.line_end))
            .collect();
        assert_eq!(lines, vec![(1, 2), (3, 3), (4, 4), (5, 6)]);
    }

    #[test]
    fn a_file_of_one_short_section_is_one_passage() {
        assert_eq!(
            spans("# Only\nA little.\n"),
            vec![(1, 2, Some("Only".into()), "# Only\nA little.".to_string())]
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
        let body = long('b');
        let raw: String = (0..620).map(|i| format!("# H{i}\n{body}\n")).collect();
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
