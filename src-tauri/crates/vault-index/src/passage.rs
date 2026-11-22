//! The pieces of a Markdown file that search by meaning embeds; the only splitter, also used by the quality harness.
//! One pass over the lines, normalised to NFC `NFC_WINDOW_CHARS` at a time: time O(n log w) for windows of w
//! characters, memory the kept passages plus one passage and one window.

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
pub(crate) const PASSAGE_VERSION: u32 = 4;
const NFC_WINDOW_CHARS: usize = MAX_PASSAGE_CHARS;
/// How far past a window's end its cut may move to land before a character that composes and
/// reorders with nothing before it; a run without one is cut at the window's end.
const NFC_LOOKAHEAD_CHARS: usize = 64;

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

/// ASCII, Hangul syllables and CJK ideographs: starters no composition takes as its second part,
/// so NFC of text cut before one equals NFC of each side.
fn starts_window(c: char) -> bool {
    c.is_ascii() || ('\u{AC00}'..='\u{D7A3}').contains(&c) || ('\u{4E00}'..='\u{9FFF}').contains(&c)
}

/// Calls `each` with the NFC form of `text`, one window after another, until it returns false.
fn for_each_nfc(text: &str, mut each: impl FnMut(&str) -> bool) {
    let mut rest = text;
    while !rest.is_empty() {
        let cut = match rest.char_indices().nth(NFC_WINDOW_CHARS) {
            None => rest.len(),
            Some((end, _)) => rest
                .get(end..)
                .unwrap_or("")
                .char_indices()
                .take(NFC_LOOKAHEAD_CHARS)
                .find(|&(_, c)| starts_window(c))
                .map_or(end, |(at, _)| end + at),
        };
        let Some((window, tail)) = rest.split_at_checked(cut) else {
            return;
        };
        if !each(&nfc(window)) {
            return;
        }
        rest = tail;
    }
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

/// An opening fence: a backtick fence's info string holds no backtick (CommonMark).
fn opens_fence(line: &str) -> Option<(u8, usize)> {
    fence_run(line)
        .filter(|&(mark, _, after)| mark != b'`' || !after.contains('`'))
        .map(|(mark, run, _)| (mark, run))
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

/// The heading's text: marks, a closing run of `#` after a space, and spaces dropped; NFC, then
/// cut to `MAX_HEADING_CHARS`.
fn heading_text(line: &str) -> String {
    let rest = line.trim().trim_start_matches('#').trim();
    let before_closing = rest.trim_end_matches('#');
    let text = if before_closing.is_empty() || before_closing.ends_with([' ', '\t']) {
        before_closing.trim_end()
    } else {
        rest
    };
    let mut heading = String::new();
    let mut chars = 0;
    for_each_nfc(text, |window| {
        for c in window.chars().take(MAX_HEADING_CHARS - chars) {
            heading.push(c);
            chars += 1;
        }
        chars < MAX_HEADING_CHARS
    });
    heading
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
            None => match opens_fence(line) {
                Some(opened) => {
                    fence = Some(opened);
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
    fn fits(&self, chars: usize) -> bool {
        self.chars + 2 + chars <= MAX_PASSAGE_CHARS
    }

    /// Callers check `fits` first. A preamble joined to a heading section takes its heading.
    fn join(self, next: Piece) -> Piece {
        let mut text = self.text;
        text.push_str("\n\n");
        text.push_str(&next.text);
        Piece {
            line_start: self.line_start,
            line_end: next.line_end,
            heading: self.heading.or(next.heading),
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

struct Chunk<'j> {
    joiner: &'j mut Joiner,
    heading: Option<String>,
    text: String,
    /// Characters held, each line counted with its line end.
    chars: usize,
    lines: usize,
    /// 1-based numbers of the chunk's first and last lines that hold text.
    first_filled: Option<usize>,
    last_filled: usize,
    /// The section's first piece, held until a second shows whether the section is whole.
    first: Option<Piece>,
    pieces: usize,
    /// The line being fed, reused from line to line.
    line: String,
}

impl Chunk<'_> {
    fn push(&mut self, line: &str, chars: usize, number: usize) {
        if self.lines > 0 {
            self.text.push('\n');
        }
        self.text.push_str(line);
        self.chars += chars + 1;
        self.lines += 1;
        if !is_blank(line) {
            self.first_filled.get_or_insert(number);
            self.last_filled = number;
        }
    }

    fn room(&self) -> usize {
        if self.lines == 0 {
            MAX_PASSAGE_CHARS
        } else {
            MAX_PASSAGE_CHARS.saturating_sub(self.chars)
        }
    }

    fn push_line(&mut self, raw: &str, number: usize) {
        let mut line = std::mem::take(&mut self.line);
        line.clear();
        let mut chars = 0;
        for_each_nfc(raw, |window| {
            line.push_str(window);
            chars += window.chars().count();
            self.make_room(&mut line, &mut chars, number);
            true
        });
        self.push(&line, chars, number);
        self.line = line;
    }

    /// Takes pieces off the front of `line` until the rest fits beside the open chunk. A chunk of at
    /// least `MIN_SECTION_CHARS` is closed first; a shorter one is filled from the line instead, so
    /// a bare heading never stands alone before a long line.
    fn make_room(&mut self, line: &mut String, chars: &mut usize, number: usize) {
        loop {
            let room = self.room();
            if *chars <= room {
                return;
            }
            if self.lines > 0 && (self.chars >= MIN_SECTION_CHARS || room == 0) {
                self.flush();
                continue;
            }
            let cut = line
                .char_indices()
                .nth(room)
                .map_or(line.len(), |(at, _)| at);
            let rest = line.split_off(cut);
            self.push(line, room, number);
            self.flush();
            *line = rest;
            *chars -= room;
        }
    }

    fn flush(&mut self) {
        let text = nfc(self.text.trim()).into_owned();
        let start = self.first_filled.take();
        self.text.clear();
        self.chars = 0;
        self.lines = 0;
        let Some(line_start) = start.filter(|_| !text.is_empty()) else {
            return;
        };
        let piece = Piece {
            line_start,
            line_end: self.last_filled,
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

    fn finish(mut self) {
        if self.lines > 0 {
            self.flush();
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
        first_filled: None,
        last_filled: 0,
        first: None,
        pieces: 0,
        line: String::new(),
    };
    for (at, line) in section.text.split('\n').map(without_cr).enumerate() {
        chunk.push_line(line, section.first_line + 1 + at);
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
                (5, 5, None, a),
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
        let sizes: Vec<usize> = split(&raw).0.iter().map(Passage::chars).collect();
        assert_eq!(
            sizes,
            vec![MAX_PASSAGE_CHARS, "# Q\n".len() + 3_000 - MAX_PASSAGE_CHARS]
        );
    }

    #[test]
    fn a_bare_heading_is_filled_from_a_long_first_line_not_left_alone() {
        let raw = format!("# Q\n{}", "w".repeat(1_998));
        let passages = spans(&raw);
        assert_eq!(passages[0].0, 1);
        assert_eq!(passages[0].3.chars().count(), MAX_PASSAGE_CHARS);
        assert!(passages[0].3.starts_with("# Q\nwww"));
        assert_eq!(
            (passages[1].0, passages[1].1, passages[1].3.as_str()),
            (2, 2, "ww")
        );
    }

    #[test]
    fn a_short_preamble_joined_to_a_heading_section_takes_its_heading() {
        let raw = format!("A preamble.\n\n# Topic\n{}", long('t'));
        assert_eq!(spans(&raw)[0].2.as_deref(), Some("Topic"));
    }

    #[test]
    fn a_span_starts_and_ends_on_a_line_with_text() {
        let raw = format!("\n\n{}\n\n\n# B\n\n{}\n\n", long('a'), long('b'));
        assert_eq!(lines(&raw), vec![(3, 3), (6, 8)]);
    }

    #[test]
    fn a_backtick_run_with_a_backtick_after_it_opens_no_fence() {
        let raw = format!("# A\n```x```\n{}\n# B\n{}", long('a'), long('b'));
        assert_eq!(lines(&raw), vec![(1, 3), (4, 5)]);
    }

    #[test]
    fn a_heading_is_normalised_before_it_is_cut() {
        let line = format!("# {}e\u{0301}tail", "a".repeat(MAX_HEADING_CHARS - 1));
        let heading = spans(&format!("{line}\n{}", long('x')))[0]
            .2
            .clone()
            .unwrap();
        assert_eq!(heading.chars().count(), MAX_HEADING_CHARS);
        assert_eq!(heading.chars().last(), Some('\u{00E9}'));
    }

    #[test]
    fn a_line_of_combining_marks_is_normalised_in_bounded_windows() {
        let raw = format!("# M\na{}", "\u{0301}\u{0323}".repeat(400_000));
        let (passages, over) = split(&raw);
        assert!(passages.iter().all(|p| p.chars() <= MAX_PASSAGE_CHARS));
        let total: usize = passages.iter().map(Passage::chars).sum();
        assert_eq!(over, 0);
        assert_eq!(
            passages.len(),
            total.div_ceil(MAX_PASSAGE_CHARS),
            "full passages but the last"
        );
        assert_eq!(split(&raw).0[3].sha, passages[3].sha, "deterministic");
    }

    #[test]
    fn a_short_last_section_joins_the_last_piece_past_the_cap_or_is_counted() {
        let body = long('b');
        let fits: String = (0..MAX_PASSAGES_PER_FILE + 1)
            .map(|i| format!("# H{i}\n{body}\n"))
            .collect();
        assert_eq!(split(&format!("{fits}# Tail\nshort\n")).1, 1);
        let full = "f".repeat(MAX_PASSAGE_CHARS - 4);
        let last_full = format!("{fits}# F\n{full}\n# Tail\nshort\n");
        assert_eq!(split(&last_full).1, 3);
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
