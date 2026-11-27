//! A `|` or `>` block scalar: the indented lines under a key read as one text.

use answer_format::whitespace::{is_whitespace, trim};

use super::line::Line;

/// The indicator of a block scalar: `|` or `>`, then at most one indentation digit and one chomping
/// sign in either order.
pub(super) struct BlockIndicator<'a>(&'a str);

impl<'a> BlockIndicator<'a> {
    /// `value` as an indicator, or `None` when it is any other value.
    pub fn of(value: &'a str) -> Option<Self> {
        let rest = value.strip_prefix(['|', '>'])?;
        let valid = match rest.as_bytes() {
            [] => true,
            [first] => matches!(first, b'1'..=b'9' | b'-' | b'+'),
            [first, second] => {
                (matches!(first, b'1'..=b'9') && matches!(second, b'-' | b'+'))
                    || (matches!(first, b'-' | b'+') && matches!(second, b'1'..=b'9'))
            }
            _ => false,
        };
        valid.then_some(Self(value))
    }

    fn folds(&self) -> bool {
        self.0.starts_with('>')
    }

    fn keeps_final_newline(&self) -> bool {
        !self.0.contains('-') && self.0.contains('+')
    }

    fn explicit_indent(&self) -> Option<usize> {
        self.0
            .chars()
            .find(|character| ('1'..='9').contains(character))
            .and_then(|digit| digit.to_digit(10))
            .and_then(|digit| usize::try_from(digit).ok())
    }
}

/// The text of a block scalar and the index of the first line after it.
pub(super) struct BlockScalar {
    pub text: String,
    pub next: usize,
}

/// Reads the lines from `start` that belong to a block scalar: blank lines, and lines indented at
/// least as far as the first (or the explicit digit). Without it, an indented `kind: element` line
/// inside prose would become a key of the node.
pub(super) fn read_block_scalar(
    lines: &[Line<'_>],
    start: usize,
    indicator: &BlockIndicator<'_>,
) -> BlockScalar {
    let mut collected: Vec<&str> = Vec::new();
    let mut base_indent = indicator.explicit_indent();
    let mut next = start;
    while let Some(line) = lines.get(next) {
        if trim(line.text).is_empty() {
            collected.push("");
            next += 1;
            continue;
        }
        let indent = line
            .text
            .chars()
            .take_while(|character| is_whitespace(*character))
            .count();
        if indent == 0 {
            break;
        }
        let base = *base_indent.get_or_insert(indent);
        if indent < base {
            break;
        }
        let content_start = line
            .text
            .char_indices()
            .nth(base)
            .map_or(line.text.len(), |(index, _)| index);
        collected.push(line.text.get(content_start..).unwrap_or_default());
        next += 1;
    }
    while collected.last() == Some(&"") {
        collected.pop();
    }
    let mut text = if indicator.folds() {
        fold(&collected)
    } else {
        collected.join("\n")
    };
    if indicator.keeps_final_newline() {
        text.push('\n');
    }
    BlockScalar { text, next }
}

/// A folded scalar: consecutive lines join with a space and a blank line is a newline.
fn fold(lines: &[&str]) -> String {
    let mut folded: Vec<String> = Vec::new();
    for line in lines {
        if line.is_empty() {
            folded.push(String::new());
            continue;
        }
        match folded.last_mut() {
            Some(last) if !last.is_empty() => {
                last.push(' ');
                last.push_str(line);
            }
            _ => folded.push((*line).to_string()),
        }
    }
    folded.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lines<'a>(text: &'a str) -> Vec<Line<'a>> {
        Line::all(text)
    }

    fn read(text: &str, indicator: &str) -> (String, usize) {
        let lines = lines(text);
        let indicator = BlockIndicator::of(indicator).expect("an indicator");
        let scalar = read_block_scalar(&lines, 0, &indicator);
        (scalar.text, scalar.next)
    }

    #[test]
    fn an_indicator_is_a_bar_or_arrow_with_at_most_a_digit_and_a_sign() {
        for good in ["|", ">", "|-", ">+", "|2", "|2-", "|-2", ">1+"] {
            assert!(BlockIndicator::of(good).is_some(), "{good}");
        }
        for bad in ["|0", "|--", "|22", "x|", "|a", "||", ""] {
            assert!(BlockIndicator::of(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn a_literal_scalar_keeps_its_lines_and_stops_at_the_next_key() {
        assert_eq!(
            read("  one\n  two\n\n  three\nnext: x\n", "|"),
            ("one\ntwo\n\nthree".into(), 4)
        );
    }

    #[test]
    fn a_folded_scalar_joins_lines_and_an_explicit_digit_fixes_the_indent() {
        // A blank line stays a blank line, where YAML folds it to one newline: the app's reader and
        // the files already written read it this way.
        assert_eq!(read("  one\n  two\n\n  three\n", ">").0, "one two\n\nthree");
        assert_eq!(read("    deep\n  shallow\n", "|2").0, "  deep\nshallow");
        assert_eq!(read("  one\n\n\n", "|+").0, "one\n");
    }
}
