//! Changing a file by its lines. A key that is set replaces the lines of that key where it sits,
//! or is added just before the closing fence; a key that is removed takes its lines away. Every
//! other byte stays: comments, blank lines, quoting, the order of the other keys, the byte-order
//! mark and the file's own line ending.
//!
//! The file is read again after each change, so a later change sees the lines an earlier one made.

use vault_document::{Document, RawShape};

use crate::serialized_frontmatter::entry_text;
use crate::setting::Setting;

/// One change to a top-level key.
#[derive(Debug, Clone, PartialEq)]
pub enum KeyChange {
    /// `Setting::Null` here removes the key.
    Set { key: String, value: Setting },
    Remove { key: String },
}

impl KeyChange {
    pub fn set(key: impl Into<String>, value: Setting) -> Self {
        Self::Set {
            key: key.into(),
            value,
        }
    }

    pub fn remove(key: impl Into<String>) -> Self {
        Self::Remove { key: key.into() }
    }
}

/// Why a file cannot be edited by its lines.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum EditRefusal {
    #[error("the frontmatter opens with --- and never closes, so no line of it can be changed safely. Close it with a --- line, then retry.")]
    Unclosed,
}

/// The file with a frontmatter block, so the changes below have lines to land in: a file with none
/// gets an empty block above its text.
fn framed(raw: &str) -> Result<String, EditRefusal> {
    let document = Document::from_text(raw);
    match document.shape() {
        RawShape::Framed => Ok(raw.to_string()),
        RawShape::Unclosed => Err(EditRefusal::Unclosed),
        RawShape::Empty => Ok("---\n---\n\n".to_string()),
        RawShape::Plain => {
            let body = document.body();
            Ok(format!("---\n---\n\n{}", body.trim_start_matches('\n')))
        }
    }
}

fn apply(text: &str, change: &KeyChange) -> String {
    let document = Document::from_text(text);
    let ending = document.line_ending();
    let (key, setting) = match change {
        KeyChange::Set { key, value } => (key.as_str(), Some(value)),
        KeyChange::Remove { key } => (key.as_str(), None),
    };
    let lines = setting.and_then(|value| entry_text(key, value, ending));
    let Some(lines) = lines else {
        let mut current = text.to_string();
        while let Some(range) = Document::from_text(&current).entry_range(key) {
            let Some(next) = Document::from_text(&current).with_range_replaced(range, "") else {
                break;
            };
            current = next;
        }
        return current;
    };
    let replacement = format!("{lines}{ending}");
    let edited = match document.entry_range(key) {
        Some(range) => document.with_range_replaced(range, &replacement),
        None => document
            .insertion_point()
            .and_then(|at| document.with_range_replaced(at..at, &replacement)),
    };
    edited.unwrap_or_else(|| text.to_string())
}

/// `raw` with `changes` applied in order.
pub fn edit_frontmatter(raw: &str, changes: &[KeyChange]) -> Result<String, EditRefusal> {
    let mut text = framed(raw)?;
    for change in changes {
        text = apply(&text, change);
    }
    Ok(text)
}

/// `raw` with its body replaced. The body starts after one blank line, whatever the old one had,
/// and takes the file's line ending, so a CRLF file does not end up with both.
pub fn replace_body(raw: &str, body: &str) -> Result<String, EditRefusal> {
    let text = framed(raw)?;
    let document = Document::from_text(&text);
    let ending = document.line_ending();
    let start = document.body_range().start;
    let mut head = text.get(..start).unwrap_or_default().to_string();
    if !head.ends_with('\n') {
        head.push_str(ending);
    }
    head.push_str(ending);
    let clean = body.trim_start_matches('\n');
    if ending == "\r\n" {
        head.push_str(&clean.replace("\r\n", "\n").replace('\n', "\r\n"));
    } else {
        head.push_str(clean);
    }
    Ok(head)
}

/// A new file: the entries in order, one blank line, then the body.
pub fn new_file(entries: &[(String, Setting)], body: &str) -> String {
    let mut text = String::from("---\n");
    for (key, setting) in entries {
        if let Some(lines) = entry_text(key, setting, "\n") {
            text.push_str(&lines);
            text.push('\n');
        }
    }
    text.push_str("---\n\n");
    text.push_str(body.trim_start_matches('\n'));
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_change_touches_only_its_own_lines_in_a_file_with_comments_and_odd_quoting() {
        let raw = "---\n# kept\nuid: x\ntitle:   'Odd'\ncapabilities:\n  - b\n  - a\nnote: keep   me\n---\nBody\n";
        let edited = edit_frontmatter(
            raw,
            &[
                KeyChange::set("capabilities", Setting::texts(["a", "b", "c"])),
                KeyChange::set("status", Setting::text("ok")),
            ],
        )
        .expect("edits");
        assert_eq!(
            edited,
            "---\n# kept\nuid: x\ntitle:   'Odd'\ncapabilities: [a, b, c]\nnote: keep   me\nstatus: ok\n---\nBody\n"
        );
    }

    #[test]
    fn a_crlf_file_stays_crlf_and_a_removed_key_leaves_no_blank_line() {
        let raw = "---\r\nuid: x\r\ndomain: d\r\n---\r\n\r\nBody\r\n";
        let edited = edit_frontmatter(
            raw,
            &[KeyChange::remove("domain"), KeyChange::set("title", Setting::text("T"))],
        )
        .expect("edits");
        assert_eq!(edited, "---\r\nuid: x\r\ntitle: T\r\n---\r\n\r\nBody\r\n");
        let replaced = replace_body(&edited, "\n\nnew\nlines").expect("replaces");
        assert_eq!(replaced, "---\r\nuid: x\r\ntitle: T\r\n---\r\n\r\nnew\r\nlines");
    }

    #[test]
    fn a_file_without_frontmatter_gets_a_block_above_its_text_and_an_unclosed_one_is_refused() {
        let edited = edit_frontmatter("# Notes\n\ntext\n", &[KeyChange::set("kind", Setting::text("domain"))])
            .expect("edits");
        assert_eq!(edited, "---\nkind: domain\n---\n\n# Notes\n\ntext\n");
        assert_eq!(
            edit_frontmatter("---\nkind: domain\n", &[KeyChange::remove("kind")]),
            Err(EditRefusal::Unclosed)
        );
    }

    #[test]
    fn a_new_file_has_one_blank_line_before_the_body() {
        let text = new_file(
            &[("uid".to_string(), Setting::text("u")), ("slug".to_string(), Setting::text("a"))],
            "\n\n# A\n",
        );
        assert_eq!(text, "---\nuid: u\nslug: a\n---\n\n# A\n");
    }
}
