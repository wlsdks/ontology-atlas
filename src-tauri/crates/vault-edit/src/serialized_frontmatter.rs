//! One frontmatter entry as the vault format writes it. The app's own editor writes the same
//! lines, so a key written here and one written there never differ in spelling.
//!
//! A text is quoted when reading it back unquoted would change it: a character the reader treats
//! as syntax, an edge space, or a text that reads as a number or a boolean.

use answer_format::number;
use answer_format::whitespace::is_whitespace;
use vault_document::frontmatter::javascript_number;

use crate::setting::Setting;

const SYNTAX: [char; 18] = [
    ':', ',', '#', '[', ']', '"', '\'', '{', '}', '&', '|', '*', '!', '%', '@', '`', '\n', '\t',
];

fn has_syntax_or_edge_space(text: &str) -> bool {
    text.contains(SYNTAX)
        || text.chars().next().is_some_and(is_whitespace)
        || text.chars().next_back().is_some_and(is_whitespace)
}

/// A text the reader would take for another type if it were written bare.
fn reads_as_another_type(text: &str) -> bool {
    text == "true" || text == "false" || (!text.is_empty() && javascript_number(text).is_some())
}

fn needs_quote(text: &str) -> bool {
    has_syntax_or_edge_space(text) || reads_as_another_type(text)
}

/// Backslashes first, or a `\\` inside the text loses a layer on every read.
fn escape_quoted(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\t', "\\t")
}

fn quoted(text: &str) -> String {
    format!("\"{}\"", escape_quoted(text))
}

fn key_text(key: &str) -> String {
    if has_syntax_or_edge_space(key) {
        quoted(key)
    } else {
        key.to_string()
    }
}

fn flow_value(setting: &Setting) -> String {
    match setting {
        Setting::Null => "null".to_string(),
        Setting::Bool(flag) => flag.to_string(),
        Setting::Number(value) => number::text(*value),
        Setting::Text(text) if needs_quote(text) => quoted(text),
        Setting::Text(text) => text.clone(),
        Setting::List(items) => {
            let written: Vec<String> = items
                .iter()
                .map(|item| match item {
                    Setting::Text(text) if needs_quote(text) => quoted(text),
                    other => other.display(),
                })
                .collect();
            format!("[{}]", written.join(", "))
        }
        Setting::Map(members) => {
            let written: Vec<String> = members
                .iter()
                .map(|(key, member)| format!("{}: {}", key_text(key), flow_value(member)))
                .collect();
            format!("{{ {} }}", written.join(", "))
        }
    }
}

/// A multi-line text as a block scalar: a raw newline inside quotes would turn every later line
/// into a key of its own. The explicit indent digit pins the base indent when the first line
/// starts with a space, and `-` strips the last break so a round trip never grows the value.
fn block_scalar(key: &str, text: &str, ending: &str) -> String {
    let lines: Vec<&str> = text.split('\n').collect();
    let first_content = lines.iter().find(|line| !line.is_empty());
    let indent = if first_content.is_some_and(|line| line.chars().next().is_some_and(is_whitespace))
    {
        "2"
    } else {
        ""
    };
    let body: Vec<String> = lines
        .iter()
        .map(|line| {
            if line.is_empty() {
                String::new()
            } else {
                format!("  {line}")
            }
        })
        .collect();
    format!("{key}: |{indent}-{ending}{}", body.join(ending))
}

/// The lines of `key: value`, without the final line ending; `None` for `Null`, which is the
/// absence of a key.
pub fn entry_text(key: &str, setting: &Setting, ending: &str) -> Option<String> {
    match setting {
        Setting::Null => None,
        Setting::Text(text) if text.contains('\n') => Some(block_scalar(&key_text(key), text, ending)),
        other => Some(format!("{}: {}", key_text(key), flow_value(other))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn written(key: &str, setting: Setting) -> String {
        entry_text(key, &setting, "\n").expect("a value")
    }

    #[test]
    fn a_text_is_quoted_only_when_it_would_read_back_as_something_else() {
        assert_eq!(written("title", Setting::text("Order checkout")), "title: Order checkout");
        for (text, line) in [
            ("a: b", "title: \"a: b\""),
            ("2026", "title: \"2026\""),
            ("true", "title: \"true\""),
            (" edge", "title: \" edge\""),
            ("say \"hi\"\tnow", "title: \"say \\\"hi\\\"\\tnow\""),
            ("back\\slash:", "title: \"back\\\\slash:\""),
        ] {
            assert_eq!(written("title", Setting::text(text)), line, "{text}");
        }
        assert_eq!(written("capabilities", Setting::texts(["a/b", "c: d"])), "capabilities: [a/b, \"c: d\"]");
        assert_eq!(written("elements", Setting::List(Vec::new())), "elements: []");
        assert_eq!(written("my key", Setting::Bool(true)), "my key: true");
        assert_eq!(written("a:b", Setting::Number(2.5)), "\"a:b\": 2.5");
    }

    #[test]
    fn a_multi_line_text_is_a_block_scalar_the_reader_gives_back_unchanged() {
        assert_eq!(written("note", Setting::text("one\n\ntwo")), "note: |-\n  one\n\n  two");
        assert_eq!(written("note", Setting::text("\n  indented")), "note: |2-\n\n    indented");
    }

    #[test]
    fn a_map_is_one_flow_line_and_null_is_no_line() {
        let notes = Setting::Map(vec![("a/b".to_string(), Setting::text("why: because"))]);
        assert_eq!(written("relation_notes", notes), "relation_notes: { a/b: \"why: because\" }");
        assert_eq!(entry_text("x", &Setting::Null, "\n"), None);
    }
}
