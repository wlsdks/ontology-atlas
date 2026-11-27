//! Finding the few elements of a DOCX, XLSX or HTML file the units are made of, by one forward
//! scan for a fixed tag, never by a pattern that backs up. The documents are the three shapes
//! Office and browsers write, a hostile one is only a long one, and a scan that finds no closing
//! tag stops, so the cost is the size of the text and no more.
//!
//! An index is a byte offset: every tag, quote and angle bracket is ASCII, so a slice between two
//! of them is a whole piece of text.

fn is_word(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

/// Whether the byte before `at` is a letter, a digit or `_`: a name that starts at `at` does not
/// start a word.
fn follows_word(text: &str, at: usize) -> bool {
    at.checked_sub(1)
        .and_then(|before| text.as_bytes().get(before))
        .is_some_and(|&byte| is_word(byte))
}

/// The text between `&` and `;` of a reference, the way an XML file spells a character.
fn reference_value(body: &str) -> Option<char> {
    match body.strip_prefix('#') {
        Some(hex) if hex.starts_with('x') => {
            let digits = &hex[1..];
            (!digits.is_empty() && digits.bytes().all(|byte| byte.is_ascii_hexdigit()))
                .then(|| u32::from_str_radix(digits, 16).ok().and_then(char::from_u32))
                .flatten()
        }
        Some(decimal) => (!decimal.is_empty() && decimal.bytes().all(|byte| byte.is_ascii_digit()))
            .then(|| decimal.parse::<u32>().ok().and_then(char::from_u32))
            .flatten(),
        None => match body {
            "lt" => Some('<'),
            "gt" => Some('>'),
            "amp" => Some('&'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            _ => None,
        },
    }
}

/// `&amp;` and its kin, and numeric references, back to characters. A reference that names no
/// character (`&#99999999;`, a half of a surrogate pair, an unknown word) stays as it was written.
pub(crate) fn decode_xml_text(text: &str) -> String {
    let mut decoded = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find('&') {
        decoded.push_str(&rest[..at]);
        let after = &rest[at + 1..];
        let end = after
            .bytes()
            .position(|byte| !(byte.is_ascii_alphanumeric() || byte == b'#'))
            .filter(|&end| after.as_bytes().get(end) == Some(&b';'));
        match end.and_then(|end| reference_value(&after[..end]).map(|character| (end, character))) {
            Some((end, character)) => {
                decoded.push(character);
                rest = &after[end + 1..];
            }
            None => {
                decoded.push('&');
                rest = after;
            }
        }
    }
    decoded.push_str(rest);
    decoded
}

/// `xml` with every tag dropped.
pub(crate) fn strip_tags(xml: &str) -> String {
    rewrite_tags(xml, |_| None)
}

/// `xml` with each tag replaced by what `replace` returns for its inside (`w:t xml:space="preserve"`
/// for `<w:t xml:space="preserve">`), or dropped when it returns `None`. A `<` with no `>` before
/// the next `<` is no tag and stays.
pub(crate) fn rewrite_tags(xml: &str, replace: impl Fn(&str) -> Option<&'static str>) -> String {
    let bytes = xml.as_bytes();
    let mut out = String::with_capacity(xml.len());
    let mut copied = 0;
    let mut at = 0;
    while let Some(offset) = xml[at..].find('<') {
        let open = at + offset;
        let inside_end = bytes
            .get(open + 1..)
            .unwrap_or_default()
            .iter()
            .position(|&byte| byte == b'<' || byte == b'>')
            .map(|length| open + 1 + length);
        match inside_end {
            Some(end) if bytes.get(end) == Some(&b'>') => {
                out.push_str(&xml[copied..open]);
                if let Some(text) = replace(&xml[open + 1..end]) {
                    out.push_str(text);
                }
                copied = end + 1;
                at = end + 1;
            }
            _ => at = open + 1,
        }
    }
    out.push_str(&xml[copied..]);
    out
}

/// The text of `xml`: tags dropped, references decoded.
pub(crate) fn text_of(xml: &str) -> String {
    decode_xml_text(&strip_tags(xml))
}

/// Where `<name` starts at or after `from`, skipping a longer name that begins the same (`<w:pPr`
/// is not `<w:p`).
fn tag_start(xml: &str, name: &str, from: usize) -> Option<usize> {
    let open = format!("<{name}");
    let mut at = xml.get(from..)?.find(&open)? + from;
    loop {
        let next = xml.as_bytes().get(at + open.len());
        if !next.is_some_and(|&byte| is_word(byte)) {
            return Some(at);
        }
        at = xml[at + 1..].find(&open)? + at + 1;
    }
}

/// Every `<name ...>...</name>` in order, whole, not nested.
pub(crate) fn element_spans<'a>(xml: &'a str, name: &str) -> Vec<&'a str> {
    let close = format!("</{name}>");
    let mut spans = Vec::new();
    let mut from = 0;
    while let Some(start) = tag_start(xml, name, from) {
        let Some(end) = xml[start..].find(&close).map(|offset| start + offset) else {
            break;
        };
        spans.push(&xml[start..end + close.len()]);
        from = end + close.len();
    }
    spans
}

/// What lies between each `open` and the next `close`.
pub(crate) fn between<'a>(xml: &'a str, open: &str, close: &str) -> Vec<&'a str> {
    let mut found = Vec::new();
    let mut from = 0;
    while let Some(start) = xml[from..].find(open).map(|offset| from + offset) {
        let inside = start + open.len();
        let Some(end) = xml[inside..].find(close).map(|offset| inside + offset) else {
            break;
        };
        found.push(&xml[inside..end]);
        from = end + close.len();
    }
    found
}

/// Each `<name ...` up to its `>`, without the `>`.
pub(crate) fn open_tags<'a>(xml: &'a str, name: &str) -> Vec<&'a str> {
    let mut tags = Vec::new();
    let mut from = 0;
    while let Some(start) = tag_start(xml, name, from) {
        let Some(end) = xml[start..].find('>').map(|offset| start + offset) else {
            break;
        };
        tags.push(&xml[start..end]);
        from = end + 1;
    }
    tags
}

/// The value of `name="..."` in `tag` and the offset just past it. The name must begin at a word
/// boundary; `allow_empty` says whether `name=""` counts.
fn attribute<'a>(tag: &'a str, name: &str, allow_empty: bool) -> Option<(&'a str, usize)> {
    let needle = format!("{name}=\"");
    let mut from = 0;
    while let Some(found) = tag[from..].find(&needle).map(|offset| from + offset) {
        let at_boundary = !follows_word(tag, found);
        let value_start = found + needle.len();
        if at_boundary {
            let length = tag[value_start..].find('"')?;
            if allow_empty || length > 0 {
                return Some((&tag[value_start..value_start + length], value_start + length + 1));
            }
        }
        from = found + 1;
    }
    None
}

/// The value of one attribute that may be empty, for a tag that has it at a word boundary.
pub(crate) fn attribute_value<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    attribute(tag, name, false).map(|(value, _)| value)
}

/// Two attributes of one tag, the second after the first: `name` then `r:id` of a `<sheet>`.
pub(crate) fn attribute_pair<'a>(
    tag: &'a str,
    first: &str,
    second: &str,
) -> Option<(&'a str, &'a str)> {
    let (head, end) = attribute(tag, first, true)?;
    let (tail, _) = attribute(&tag[end..], second, false)?;
    Some((head, tail))
}

/// The digits of `name="123"`, as written.
fn numeric_attribute<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let needle = format!("{name}=\"");
    let mut from = 0;
    while let Some(found) = tag[from..].find(&needle).map(|offset| from + offset) {
        let value_start = found + needle.len();
        let at_boundary = !follows_word(tag, found);
        let digits = tag
            .as_bytes()
            .get(value_start..)
            .unwrap_or_default()
            .iter()
            .take_while(|byte| byte.is_ascii_digit())
            .count();
        if at_boundary && digits > 0 && tag.as_bytes().get(value_start + digits) == Some(&b'"') {
            return Some(&tag[value_start..value_start + digits]);
        }
        from = found + 1;
    }
    None
}

/// One `<row r="N">` of a sheet and what is inside it.
pub(crate) struct SheetRow<'a> {
    pub number: &'a str,
    pub body: &'a str,
}

/// The rows of a sheet that carry a number, in order. A row with no number is skipped; a row with
/// no `</row>` ends the list.
pub(crate) fn sheet_rows(xml: &str) -> Vec<SheetRow<'_>> {
    let mut rows = Vec::new();
    let mut from = 0;
    while let Some(start) = tag_start(xml, "row", from) {
        let Some(tag_end) = xml[start..].find('>').map(|offset| start + offset) else {
            break;
        };
        let number = numeric_attribute(&xml[start..tag_end], "r");
        let Some(number) = number else {
            from = tag_end + 1;
            continue;
        };
        let Some(close) = xml[tag_end + 1..]
            .find("</row>")
            .map(|offset| tag_end + 1 + offset)
        else {
            break;
        };
        rows.push(SheetRow {
            number,
            body: &xml[tag_end + 1..close],
        });
        from = close + "</row>".len();
    }
    rows
}

/// One `<c ...>` of a row: its attributes and what is inside it.
pub(crate) struct RowCell<'a> {
    pub attributes: &'a str,
    pub body: &'a str,
}

/// The cells of a row in order. Once a `<c>` has no `</c>` after it, no later one is searched for
/// a closing tag (a row of ten thousand open cells is ten thousand looks, not ten thousand scans
/// to its end); a self-closing `<c .../>` is an empty cell.
pub(crate) fn row_cells(xml: &str) -> Vec<RowCell<'_>> {
    let mut cells = Vec::new();
    let mut close_may_follow = true;
    let mut from = 0;
    while let Some(start) = tag_start(xml, "c", from) {
        let Some(tag_end) = xml[start..].find('>').map(|offset| start + offset) else {
            break;
        };
        let attributes = &xml[start + 2..tag_end];
        let close = if close_may_follow {
            xml[tag_end + 1..].find("</c>").map(|offset| tag_end + 1 + offset)
        } else {
            None
        };
        if let Some(close) = close {
            cells.push(RowCell {
                attributes,
                body: &xml[tag_end + 1..close],
            });
            from = close + "</c>".len();
            continue;
        }
        close_may_follow = false;
        if let Some(open) = attributes.strip_suffix('/') {
            cells.push(RowCell {
                attributes: open,
                body: "",
            });
        }
        from = tag_end + 1;
    }
    cells
}

/// `html` without each `<name ...>...</name>`, a tag name in any letter case. An element with no
/// closing tag stays, because dropping the rest of the file for a missing tag would lose text.
pub(crate) fn without_elements(html: &str, name: &str) -> String {
    let lowered = html.to_ascii_lowercase();
    let open = format!("<{name}");
    let close = format!("</{name}>");
    let mut kept = String::with_capacity(html.len());
    let mut from = 0;
    loop {
        let start = find_element_start(&lowered, &open, from);
        let end = start.and_then(|start| lowered[start..].find(&close).map(|offset| start + offset));
        match (start, end) {
            (Some(start), Some(end)) => {
                kept.push_str(&html[from..start]);
                from = end + close.len();
            }
            _ => {
                kept.push_str(&html[from..]);
                return kept;
            }
        }
    }
}

fn find_element_start(lowered: &str, open: &str, from: usize) -> Option<usize> {
    let mut at = lowered.get(from..)?.find(open)? + from;
    loop {
        let next = lowered.as_bytes().get(at + open.len());
        if !next.is_some_and(|&byte| is_word(byte)) {
            return Some(at);
        }
        at = lowered[at + 1..].find(open)? + at + 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_reference_that_names_no_character_stays_as_written() {
        assert_eq!(decode_xml_text("a &amp; b &#x41;&#66; &lt;"), "a & b AB <");
        for kept in ["&#99999999;", "&#xD800;", "&#9999999999999999999999;", "&nbsp;", "&", "&amp"] {
            assert_eq!(decode_xml_text(kept), kept);
        }
    }

    #[test]
    fn a_longer_tag_name_is_not_the_one_asked_for() {
        let xml = "<w:pPr/><w:p>one</w:p><w:p w:x=\"1\">two</w:p>";
        assert_eq!(element_spans(xml, "w:p"), ["<w:p>one</w:p>", "<w:p w:x=\"1\">two</w:p>"]);
    }

    #[test]
    fn an_unclosed_cell_does_not_make_every_later_cell_scan_to_the_end() {
        let row = "<c r=\"A1\"><v>1</v></c><c r=\"B1\"><c r=\"C1\"/>";
        let cells = row_cells(row);
        assert_eq!(cells.len(), 3);
        assert_eq!(cells[0].body, "<v>1</v>");
        assert_eq!(cells[2].attributes, " r=\"C1\"");
    }
}
