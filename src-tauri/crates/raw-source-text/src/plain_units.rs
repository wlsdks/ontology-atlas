//! The units of the formats that are text all the way down: a text file by line, a CSV or TSV by
//! record, an HTML file by line of what a browser shows.

use answer_format::whitespace::trim;

use crate::citable_unit::{Unit, UnitKind, UnitPlace};
use crate::markup_scan::{decode_xml_text, rewrite_tags, without_elements};
use crate::unit_window::WindowCollector;

/// A text file: one unit per non-empty line, `l<n>` counting physical lines from the first.
pub(crate) fn offer_line_units(text: &str, collector: &mut WindowCollector) {
    for (index, line) in text.split('\n').enumerate() {
        let line = trim(line.strip_suffix('\r').unwrap_or(line));
        if !line.is_empty() {
            collector.offer(|| Unit {
                anchor: format!("l{}", index + 1),
                place: UnitPlace::Bare,
                text: line.to_string(),
                kind: UnitKind::Line,
            });
        }
    }
}

fn offer_record(
    source: &str,
    start: usize,
    end: usize,
    line: usize,
    collector: &mut WindowCollector,
) {
    let record = source.get(start..end).unwrap_or_default();
    if !trim(record).is_empty() {
        collector.offer(|| Unit {
            anchor: format!("r{line}"),
            place: UnitPlace::Bare,
            text: record.to_string(),
            kind: UnitKind::Row,
        });
    }
}

/// A CSV or TSV: one unit per non-empty record, `r<n>` naming its physical starting line. A scan
/// for the boundary of a record that knows quotes, not a validator: a quote that never closes holds
/// the rest of the file as one record, so no text is dropped. Returns the line that opened such a
/// quote.
pub(crate) fn offer_table_units(
    text: &str,
    delimiter: u8,
    collector: &mut WindowCollector,
) -> Option<usize> {
    let source = text.strip_prefix('\u{feff}').unwrap_or(text);
    let bytes = source.as_bytes();
    let mut record_start = 0;
    let mut record_line = 1;
    let mut line = 1;
    let mut in_quotes = false;
    let mut at_field_start = true;
    let mut at = 0;
    while let Some(&byte) = bytes.get(at) {
        let is_break = byte == b'\r' || byte == b'\n';
        if in_quotes {
            if byte == b'"' {
                if bytes.get(at + 1) == Some(&b'"') {
                    at += 1;
                } else {
                    in_quotes = false;
                    at_field_start = false;
                }
            } else if is_break {
                let crlf = byte == b'\r' && bytes.get(at + 1) == Some(&b'\n');
                line += 1;
                at += usize::from(crlf);
            }
            at += 1;
            continue;
        }
        if byte == b'"' && at_field_start {
            in_quotes = true;
        } else if byte == delimiter {
            at_field_start = true;
        } else if !is_break {
            at_field_start = false;
        } else {
            let crlf = byte == b'\r' && bytes.get(at + 1) == Some(&b'\n');
            line += 1;
            offer_record(source, record_start, at, record_line, collector);
            at += usize::from(crlf);
            record_start = at + 1;
            record_line = line;
            at_field_start = true;
        }
        at += 1;
    }
    offer_record(source, record_start, source.len(), record_line, collector);
    in_quotes.then_some(record_line)
}

const BLOCK_ELEMENTS: [&str; 15] = [
    "p", "div", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "br", "section", "article",
    "header", "footer",
];

fn is_word_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

/// Whether `rest` begins with `name`, in any letter case, and the name ends there.
fn begins_with_name(rest: &str, name: &str) -> bool {
    rest.get(..name.len())
        .is_some_and(|head| head.eq_ignore_ascii_case(name))
        && !rest
            .as_bytes()
            .get(name.len())
            .is_some_and(|&byte| is_word_byte(byte))
}

/// A line break for the end of a block and for `<br>`, nothing for any other tag.
fn line_break_for(tag: &str) -> Option<&'static str> {
    let breaks = match tag.strip_prefix('/') {
        Some(closing) => BLOCK_ELEMENTS
            .iter()
            .any(|name| begins_with_name(closing, name)),
        None => begins_with_name(tag, "br"),
    };
    breaks.then_some("\n")
}

/// An HTML file: scripts and styles dropped, the end of a block a line break, every tag gone,
/// references decoded; then lines like a text file.
pub(crate) fn offer_html_units(html: &str, collector: &mut WindowCollector) {
    let visible = without_elements(&without_elements(html, "script"), "style");
    let text = decode_xml_text(&rewrite_tags(&visible, line_break_for));
    offer_line_units(&text, collector);
}
