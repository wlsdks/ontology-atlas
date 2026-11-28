//! A file's text as the parser should see it for an outline: one row per line a read quotes.

use std::borrow::Cow;

use answer_format::utf16;

/// A line longer than this many UTF-16 units is generated or minified and is blanked.
pub(crate) const OUTLINE_LINE_UNITS: usize = 1000;

/// `text` with every line ending (`\r\n`, `\n` or a lone `\r`, as the lines a read quotes end) as
/// `\n`, so a declaration's line number agrees with the line a read cites, and a line over
/// [`OUTLINE_LINE_UNITS`] blanked with its row kept, so no declaration sits on it. The flag says
/// whether a line was blanked: the outline stopped early.
pub(crate) fn one_line_per_row(text: &str) -> (Cow<'_, str>, bool) {
    let bytes = text.as_bytes();
    let may_change =
        bytes.contains(&b'\r') || text.split('\n').any(|line| line.len() > OUTLINE_LINE_UNITS);
    if !may_change {
        return (Cow::Borrowed(text), false);
    }
    let mut rows = String::with_capacity(text.len());
    let mut blanked = false;
    let mut start = 0;
    let mut at = 0;
    loop {
        let (end, next) = match bytes.get(at) {
            None => (text.len(), None),
            Some(b'\n') => (at, Some(at + 1)),
            Some(b'\r') if bytes.get(at + 1) == Some(&b'\n') => (at, Some(at + 2)),
            Some(b'\r') => (at, Some(at + 1)),
            Some(_) => {
                at += 1;
                continue;
            }
        };
        let row = text.get(start..end).unwrap_or("");
        if utf16::len(row) > OUTLINE_LINE_UNITS {
            blanked = true;
        } else {
            rows.push_str(row);
        }
        let Some(next) = next else {
            break;
        };
        rows.push('\n');
        start = next;
        at = next;
    }
    (Cow::Owned(rows), blanked)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_line_ending_is_one_row_and_a_wide_line_keeps_its_row_blank() {
        assert_eq!(one_line_per_row("a\nb"), (Cow::Borrowed("a\nb"), false));
        assert_eq!(one_line_per_row("a\r\nb\rc\nd").0, "a\nb\nc\nd");
        assert_eq!(one_line_per_row("a\r").0, "a\n");
        let wide = "x".repeat(OUTLINE_LINE_UNITS + 1);
        let text = format!("a\n{wide}\nb");
        let (rows, blanked) = one_line_per_row(&text);
        assert_eq!((rows.as_ref(), blanked), ("a\n\nb", true));
        // 600 emoji are 1,200 UTF-16 units in 2,400 bytes; 500 are 1,000 units and stay.
        let emoji = "\u{1f600}".repeat(500);
        assert!(!one_line_per_row(&format!("{emoji}\r")).1);
        assert!(one_line_per_row(&format!("{emoji}\u{1f600}\r")).1);
    }
}
