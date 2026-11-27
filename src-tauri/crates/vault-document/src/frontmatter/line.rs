//! The lines of a text with the byte range each one covers, so a line can be named and replaced
//! without touching the bytes around it.

/// One line: its text without the line ending, and where it sits in the file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Line<'a> {
    /// The text without `\n` or the `\r\n` that ended it.
    pub text: &'a str,
    /// Byte offset of the first character.
    pub start: usize,
    /// Byte offset after the line ending, or the end of the text for a last line with none.
    pub end: usize,
}

impl<'a> Line<'a> {
    /// Every line of `text`, which starts at byte `offset` of the file. A final line ending does
    /// not begin another line.
    pub fn all(text: &'a str) -> Vec<Self> {
        Self::all_from(text, 0)
    }

    pub fn all_from(text: &'a str, offset: usize) -> Vec<Self> {
        let mut lines = Vec::new();
        let mut start = 0;
        while start < text.len() {
            let rest = text.get(start..).unwrap_or_default();
            let (content, consumed) = match rest.find('\n') {
                Some(newline) => (rest.get(..newline).unwrap_or_default(), newline + 1),
                None => (rest, rest.len()),
            };
            lines.push(Self {
                text: content.strip_suffix('\r').unwrap_or(content),
                start: offset + start,
                end: offset + start + consumed,
            });
            start += consumed;
        }
        lines
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_line_ending_belongs_to_its_line_and_carriage_returns_are_not_text() {
        let lines = Line::all("a\r\nb\n\nc");
        let shown: Vec<(&str, usize, usize)> = lines
            .iter()
            .map(|line| (line.text, line.start, line.end))
            .collect();
        assert_eq!(shown, [("a", 0, 3), ("b", 3, 5), ("", 5, 6), ("c", 6, 7)]);
        assert_eq!(Line::all("a\n").len(), 1);
        assert!(Line::all("").is_empty());
    }
}
