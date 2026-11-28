//! The lines of a text with the data lines blanked, so line numbers still hold.

/// A longer line is data (a minified bundle, an embedded blob), never a declaration; it is read as
/// blank.
const LINE_UNITS: usize = 2000;

pub fn bounded_lines(text: &str) -> Vec<String> {
    text.split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .map(|line| {
            if answer_format::utf16::len(line) > LINE_UNITS {
                String::new()
            } else {
                line.to_string()
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_data_line_is_blanked_and_the_numbering_stays() {
        let text = format!("a\r\n{}\nb", "x".repeat(2001));
        assert_eq!(bounded_lines(&text), ["a", "", "b"]);
    }
}
