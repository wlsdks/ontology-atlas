//! Passages: the pieces of a Markdown file that search by meaning embeds; the quality harness
//! asks the bench binary for them, so this is the only splitter. One pass over the text's lines:
//! O(n) time, and memory for the passages kept plus the one being built.

use crate::stamps::Sha;
use icu_normalizer::ComposingNormalizerBorrowed;
use sha2::{Digest, Sha256};

/// The embedding client refuses longer passages.
pub(crate) const MAX_PASSAGE_CHARS: usize = 2_000;
/// A whole section shorter than this joins the section after it (the file's last joins the one
/// before), up to `MAX_PASSAGE_CHARS`: alone, a heading-sized section embeds too little to match.
pub(crate) const MIN_SECTION_CHARS: usize = 400;
/// A longer heading is cut, so the copy each of its section's passages carries stays small.
pub(crate) const MAX_HEADING_CHARS: usize = 200;
/// Passages beyond this many in one file are counted as not prepared, never kept.
pub(crate) const MAX_PASSAGES_PER_FILE: usize = 500;
/// Changing the split rule changes this; stored passage lists are then read again, while vectors
/// of passages whose text did not change are kept.
pub(crate) const PASSAGE_VERSION: u32 = 3;

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

/// After a leading BOM and the frontmatter: one passage per heading section outside code fences
/// (a heading with no body skipped), cut at line ends to `MAX_PASSAGE_CHARS` of NFC text, a short
/// section joined to its neighbour. Returns the first `MAX_PASSAGES_PER_FILE` and how many more.
pub(crate) fn split(raw: &str) -> (Vec<Passage>, usize) {
    let raw = raw.strip_prefix('\u{FEFF}').unwrap_or(raw);
    let mut joiner = Joiner::default();
    for_each_section(raw, |section| split_section(&section, &mut joiner));
    joiner.finish()
}

pub(crate) fn sha_of(text: &str) -> Sha {
    Sha256::digest(text.as_bytes()).into()
}

pub(crate) fn nfc(text: &str) -> std::borrow::Cow<'_, str> {
    ComposingNormalizerBorrowed::new_nfc().normalize(text)
}

fn without_cr(line: &str) -> &str {
    line.strip_suffix('\r').unwrap_or(line)
}

fn is_blank(line: &str) -> bool {
    line.trim().is_empty()
}

/// The line after at most three leading spaces, or `None` when more are there.
fn strip_indent(line: &str) -> Option<&str> {
    let spaces = line.bytes().take_while(|&byte| byte == b' ').count();
    (spaces <= 3).then(|| line.get(spaces..)).flatten()
}

/// `^ {0,3}#{1,6}(?:[ \t]|$)`
fn is_heading(line: &str) -> bool {
    let Some(rest) = strip_indent(line) else {
        return false;
    };
    let marks = rest.bytes().take_while(|&byte| byte == b'#').count();
    (1..=6).contains(&marks) && matches!(rest.as_bytes().get(marks), None | Some(b' ' | b'\t'))
}

/// The mark and length of a run of three or more backticks or tildes opening a fence, with what
/// follows the run.
fn fence_run(line: &str) -> Option<(u8, usize, &str)> {
    let rest = strip_indent(line)?;
    let mark = *rest.as_bytes().first()?;
    if mark != b'`' && mark != b'~' {
        return None;
    }
    let run = rest.bytes().take_while(|&byte| byte == mark).count();
    (run >= 3).then(|| (mark, run, rest.get(run..).unwrap_or("")))
}

/// A closing fence: the opener's mark, at least as long, and nothing but spaces after it.
fn closes_fence(line: &str, mark: u8, length: usize) -> bool {
    fence_run(line)
        .is_some_and(|(found, run, after)| found == mark && run >= length && is_blank(after))
}

/// `^(?:---|\.\.\.)\s*$`
fn closes_frontmatter(line: &str) -> bool {
    (line.starts_with("---") || line.starts_with("...")) && line.get(3..).is_some_and(is_blank)
}

/// The heading's text: marks, a closing run of `#` after a space, and spaces dropped; NFC.
fn heading_text(line: &str) -> String {
    let rest = line.trim().trim_start_matches('#').trim();
    let before_closing = rest.trim_end_matches('#');
    let text = if before_closing.is_empty() || before_closing.ends_with([' ', '\t']) {
        before_closing.trim_end()
    } else {
        rest
    };
    let cut: String = text.chars().take(MAX_HEADING_CHARS).collect();
    nfc(&cut).chars().take(MAX_HEADING_CHARS).collect()
}

/// 0-based index of the first line after the frontmatter, or 0 when there is none.
fn frontmatter_end(raw: &str) -> usize {
    let mut lines = raw.split('\n').map(without_cr);
    if lines.next().map(str::trim) != Some("---") {
        return 0;
    }
    lines.position(closes_frontmatter).map_or(0, |at| at + 2)
}

struct Section<'a> {
    /// 0-based number of the section's first line.
    first_line: usize,
    /// The section's lines as written, `\n`-separated.
    text: &'a str,
    heading: bool,
}

/// Calls `each` with every section after the frontmatter, in order, without collecting them.
fn for_each_section<'a>(raw: &'a str, mut each: impl FnMut(Section<'a>)) {
    let first = frontmatter_end(raw);
    // The open section: its first line, its first byte, and whether a heading opened it.
    let mut open: Option<(usize, usize, bool)> = None;
    let mut fence: Option<(u8, usize)> = None;
    let mut offset = 0;
    for (index, piece) in raw.split('\n').enumerate() {
        let start = offset;
        offset += piece.len() + 1;
        if index < first {
            continue;
        }
        let line = without_cr(piece);
        let opens = match fence {
            Some((mark, length)) => {
                if closes_fence(line, mark, length) {
                    fence = None;
                }
                false
            }
            None => match fence_run(line) {
                Some((mark, length, _)) => {
                    fence = Some((mark, length));
                    false
                }
                None => is_heading(line),
            },
        };
        if opens || open.is_none() {
            if let Some((first_line, from, heading)) = open.take() {
                let text = raw.get(from..start.saturating_sub(1)).unwrap_or("");
                each(Section {
                    first_line,
                    text,
                    heading,
                });
            }
            open = Some((index, start, opens));
        }
    }
    if let Some((first_line, from, heading)) = open {
        each(Section {
            first_line,
            text: raw.get(from..).unwrap_or(""),
            heading,
        });
    }
}

/// A passage before it has a hash: lines 1-based.
struct Piece {
    line_start: usize,
    line_end: usize,
    heading: Option<String>,
    text: String,
    chars: usize,
}

impl Piece {
    /// Whether a piece of `chars` joined after this one stays within `MAX_PASSAGE_CHARS`.
    fn fits(&self, chars: usize) -> bool {
        self.chars + 2 + chars <= MAX_PASSAGE_CHARS
    }

    /// Callers check `fits` first.
    fn join(self, next: Piece) -> Piece {
        let mut text = self.text;
        text.push_str("\n\n");
        text.push_str(&next.text);
        Piece {
            line_start: self.line_start,
            line_end: next.line_end,
            heading: self.heading,
            text,
            chars: self.chars + 2 + next.chars,
        }
    }

    fn into_passage(self) -> Passage {
        Passage {
            line_start: line_number(self.line_start),
            line_end: line_number(self.line_end),
            heading: self.heading,
            sha: sha_of(&self.text),
            text: self.text,
        }
    }
}

fn line_number(line: usize) -> u32 {
    u32::try_from(line).unwrap_or(u32::MAX)
}

/// Joins short whole sections as pieces arrive, keeps the first `MAX_PASSAGES_PER_FILE` and counts
/// the rest.
#[derive(Default)]
struct Joiner {
    kept: Vec<Piece>,
    over: usize,
    /// A short piece waiting to join the next one.
    carry: Option<Piece>,
    /// Characters of the last piece counted past the cap, which a short last section may join.
    last_over_chars: Option<usize>,
}

impl Joiner {
    fn push(&mut self, piece: Piece, whole: bool) {
        let mut short = whole && piece.chars < MIN_SECTION_CHARS;
        let mut current = piece;
        if let Some(held) = self.carry.take() {
            if held.fits(current.chars) {
                current = held.join(current);
                short = short && current.chars < MIN_SECTION_CHARS;
            } else {
                self.emit(held);
            }
        }
        if short {
            self.carry = Some(current);
        } else {
            self.emit(current);
        }
    }

    fn emit(&mut self, piece: Piece) {
        if self.kept.len() < MAX_PASSAGES_PER_FILE {
            self.kept.push(piece);
        } else {
            self.over += 1;
            self.last_over_chars = Some(piece.chars);
        }
    }

    fn finish(mut self) -> (Vec<Passage>, usize) {
        if let Some(held) = self.carry.take() {
            match self.last_over_chars {
                Some(chars) if chars + 2 + held.chars <= MAX_PASSAGE_CHARS => {}
                Some(_) => self.over += 1,
                None => match self.kept.pop() {
                    Some(last) if last.fits(held.chars) => self.kept.push(last.join(held)),
                    Some(last) => {
                        self.kept.push(last);
                        self.emit(held);
                    }
                    None => self.emit(held),
                },
            }
        }
        let kept = self.kept.into_iter().map(Piece::into_passage).collect();
        (kept, self.over)
    }
}

/// One section's lines gathered into pieces of at most `MAX_PASSAGE_CHARS`.
struct Chunk<'j> {
    joiner: &'j mut Joiner,
    heading: Option<String>,
    text: String,
    /// Characters held, each line counted with its line end.
    chars: usize,
    lines: usize,
    /// 1-based line the chunk starts on.
    start: usize,
    last_filled: usize,
    /// The section's first piece, held until a second shows whether the section is whole.
    first: Option<Piece>,
    pieces: usize,
}

impl Chunk<'_> {
    fn push(&mut self, line: &str, chars: usize, number: usize) {
        if self.lines == 0 {
            self.start = number;
        } else {
            self.text.push('\n');
        }
        self.text.push_str(line);
        self.chars += chars + 1;
        self.lines += 1;
        if !is_blank(line) {
            self.last_filled = number;
        }
    }

    fn flush(&mut self, end: usize) {
        let text = nfc(self.text.trim()).into_owned();
        self.text.clear();
        self.chars = 0;
        self.lines = 0;
        if text.is_empty() {
            return;
        }
        let piece = Piece {
            line_start: self.start,
            line_end: end,
            heading: self.heading.clone(),
            chars: text.chars().count(),
            text,
        };
        self.pieces += 1;
        if self.pieces == 1 {
            self.first = Some(piece);
            return;
        }
        if let Some(first) = self.first.take() {
            self.joiner.push(first, false);
        }
        self.joiner.push(piece, false);
    }

    /// The end of the section: the chunk closes at its last line that is not blank.
    fn finish(mut self) {
        if self.lines > 0 {
            let end = self.last_filled.max(self.start);
            self.flush(end);
        }
        if let Some(first) = self.first.take() {
            self.joiner.push(first, self.pieces == 1);
        }
    }
}

fn split_section(section: &Section, joiner: &mut Joiner) {
    let mut lines = section.text.split('\n').map(without_cr);
    let body = lines.clone().skip(usize::from(section.heading));
    if body.clone().all(is_blank) {
        return;
    }
    let heading = section
        .heading
        .then(|| lines.next().map(heading_text))
        .flatten();
    let mut chunk = Chunk {
        joiner,
        heading,
        text: String::new(),
        chars: 0,
        lines: 0,
        start: section.first_line + 1,
        last_filled: 0,
        first: None,
        pieces: 0,
    };
    for (at, line) in section.text.split('\n').map(without_cr).enumerate() {
        let number = section.first_line + 1 + at;
        let normal = nfc(line);
        let mut rest: &str = &normal;
        let mut rest_chars = rest.chars().count();
        while rest_chars > MAX_PASSAGE_CHARS {
            if chunk.lines > 0 {
                chunk.flush(number - 1);
            }
            let cut = rest
                .char_indices()
                .nth(MAX_PASSAGE_CHARS)
                .map_or(rest.len(), |(at, _)| at);
            let (head, tail) = rest.split_at(cut);
            chunk.push(head, MAX_PASSAGE_CHARS, number);
            chunk.flush(number);
            rest = tail;
            rest_chars -= MAX_PASSAGE_CHARS;
        }
        if chunk.lines > 0 && chunk.chars + rest_chars + 1 > MAX_PASSAGE_CHARS {
            chunk.flush(number - 1);
        }
        chunk.push(rest, rest_chars, number);
    }
    chunk.finish();
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

    fn lines(raw: &str) -> Vec<(u32, u32)> {
        split(raw)
            .0
            .iter()
            .map(|p| (p.line_start, p.line_end))
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
    fn a_leading_bom_does_not_hide_the_frontmatter() {
        let body = long('a');
        let raw = format!("\u{FEFF}---\ntitle: A\n---\n{body}\n");
        assert_eq!(spans(&raw), vec![(4, 4, None, body)]);
    }

    #[test]
    fn a_closing_run_of_hashes_needs_a_space_before_it() {
        let body = long('a');
        let heading = |line: &str| spans(&format!("{line}\n{body}"))[0].2.clone();
        assert_eq!(heading("# C#").as_deref(), Some("C#"));
        assert_eq!(heading("## Two ##").as_deref(), Some("Two"));
        assert_eq!(heading("# ###").as_deref(), Some(""));
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
        assert!(split(&raw).0.iter().all(|p| p.chars() <= MAX_PASSAGE_CHARS));
        assert_eq!(lines(&raw), vec![(1, 2), (3, 4), (5, 6)]);
    }

    #[test]
    fn a_short_tail_of_a_long_section_does_not_join() {
        let (line, full) = ("l".repeat(1_500), "f".repeat(1_996));
        let raw = format!("# Long\n{line}\n{full}\ntail\n# Next\n{}", long('n'));
        assert_eq!(lines(&raw), vec![(1, 2), (3, 3), (4, 4), (5, 6)]);
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
        assert_eq!(lines(raw), vec![(1, 8)]);
    }

    #[test]
    fn a_fence_run_with_an_info_string_does_not_close_a_fence() {
        let raw = format!("# A\n```\ncode\n```js\n# inside\n```\n{}", long('x'));
        assert_eq!(lines(&raw), vec![(1, 7)]);
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
    fn text_that_nfc_lengthens_is_cut_by_its_normal_length_and_kept_whole() {
        // U+0958 is excluded from composition: NFC writes it as two characters.
        let raw = format!("# Q\n{}", "\u{0958}".repeat(1_500));
        let passages = split(&raw).0;
        assert!(passages.iter().all(|p| p.chars() <= MAX_PASSAGE_CHARS));
        let total: usize = passages.iter().map(Passage::chars).sum();
        assert_eq!(total, "# Q".len() + 3_000);
    }

    #[test]
    fn a_multi_megabyte_heading_line_yields_bounded_passages_and_headings() {
        let raw = format!("# {}\nx", "h".repeat(4 * 1024 * 1024));
        let (passages, over) = split(&raw);
        assert_eq!(passages.len(), MAX_PASSAGES_PER_FILE);
        assert_eq!(
            passages.len() + over,
            (4 * 1024 * 1024 + 2) / MAX_PASSAGE_CHARS + 1
        );
        assert!(passages.iter().all(|p| p
            .heading
            .as_ref()
            .is_some_and(|h| h.chars().count() == MAX_HEADING_CHARS)));
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
