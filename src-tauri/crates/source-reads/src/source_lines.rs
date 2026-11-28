//! The text of a source file as the lines a read quotes: each line keeps its own terminator
//! (`\r\n`, `\n` or a lone `\r`), so what is served is the file's bytes, not a rewrite of them.

/// `text` cut after each line terminator; the last line has none when the file does not end in
/// one. No empty line is listed.
pub fn complete_lines(text: &str) -> Vec<String> {
    let mut lines = Vec::new();
    let mut start = 0;
    let bytes = text.as_bytes();
    let mut at = 0;
    while let Some(&byte) = bytes.get(at) {
        if byte == b'\n' {
            at += 1;
        } else if byte == b'\r' {
            at += if bytes.get(at + 1) == Some(&b'\n') { 2 } else { 1 };
        } else {
            at += 1;
            continue;
        }
        if let Some(line) = text.get(start..at) {
            lines.push(line.to_string());
        }
        start = at;
    }
    if let Some(rest) = text.get(start..).filter(|rest| !rest.is_empty()) {
        lines.push(rest.to_string());
    }
    lines
}

/// The text of `bytes`, or `None` when they are not UTF-8. A leading byte-order mark stays: a
/// quoted line must show what the file holds.
pub fn decode_source(bytes: &[u8]) -> Option<&str> {
    std::str::from_utf8(bytes).ok()
}

/// The indentation of a 1-based line: its leading spaces and tabs.
pub fn indent_at(lines: &[String], line: usize) -> usize {
    line.checked_sub(1)
        .and_then(|index| lines.get(index))
        .map_or(0, |text| {
            text.chars()
                .take_while(|character| matches!(character, ' ' | '\t'))
                .count()
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lines_keep_their_terminators_and_a_lone_carriage_return_ends_one() {
        assert_eq!(complete_lines("a\r\nb\rc\nd"), ["a\r\n", "b\r", "c\n", "d"]);
        assert!(complete_lines("").is_empty());
        assert_eq!(complete_lines("\n\n"), ["\n", "\n"]);
        assert_eq!(decode_source(b"\xEF\xBB\xBFx"), Some("\u{feff}x"));
        assert_eq!(decode_source(b"\xFF"), None);
    }
}
