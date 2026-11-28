//! What the document tests share: the check that a write to one key leaves every other key alone.

use std::ops::RangeInclusive;

use vault_document::frontmatter::{Diagnostic, Value};
use vault_document::schema::GRAPH_ARRAY_KEYS;
use vault_document::Document;

/// A key the writer can put on a line as `key: value` without quoting.
fn is_plain_key(key: &str) -> bool {
    let mut letters = key.chars();
    letters
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic() || first == '_')
        && letters.all(|letter| letter.is_ascii_alphanumeric() || letter == '_')
}

fn others(document: &Document, key: &str) -> Vec<(String, Value)> {
    document
        .frontmatter()
        .iter()
        .filter(|(name, _)| name.as_str() != key)
        .map(|(name, value)| (name.to_string(), value.clone()))
        .collect()
}

/// The faults of the file that are not on `lines`: the key's own lines may well have held some, and
/// a write that puts a good value there takes them away.
fn faults_outside(document: &Document, lines: &RangeInclusive<usize>) -> Vec<Diagnostic> {
    document
        .diagnostics()
        .iter()
        .filter(|fault| !lines.contains(&fault.line))
        .cloned()
        .collect()
}

/// Writes `rewritten` into every key of `text` in turn, in the file's own line ending, and reads the
/// file again. The key must hold the new value; every other key must hold what it held, in the same
/// order, and the file's faults off the key's own lines must be the same ones on the same lines; on
/// them there must be none, since what was written is a good value. The new lines are as many as the
/// old, the rest of them comments, so that a fault on a later line stays on its line number and any
/// change in the faults is the write's doing. A relation key is written as a list, the one shape
/// the schema accepts of it.
///
/// Returns how many keys it rewrote, so a caller can insist that the check ran.
pub fn assert_a_write_changes_only_its_key(text: &str) -> usize {
    let document = Document::from_text(text);
    let mut rewritten_keys = 0;
    for key in document
        .frontmatter()
        .keys()
        .filter(|key| is_plain_key(key))
    {
        let Some(range) = document.entry_range(key) else {
            continue;
        };
        let old_lines = text
            .get(range.clone())
            .expect("an entry range is inside the file")
            .matches('\n')
            .count()
            .max(1);
        let first_line = text
            .get(..range.start)
            .unwrap_or_default()
            .matches('\n')
            .count()
            + 1;
        let lines = first_line..=first_line + old_lines - 1;
        let ending = document.line_ending();
        let (written, read) = if GRAPH_ARRAY_KEYS.contains(&key) {
            ("[rewritten]", Value::List(vec!["rewritten".to_string()]))
        } else {
            ("rewritten", Value::Text("rewritten".to_string()))
        };
        let mut replacement = format!("{key}: {written}{ending}");
        for _ in 1..old_lines {
            replacement.push('#');
            replacement.push_str(ending);
        }
        let changed = document
            .with_range_replaced(range, &replacement)
            .expect("an entry range is on character boundaries");
        let again = Document::from_text(&changed);
        assert_eq!(
            again.frontmatter().get(key),
            Some(&read),
            "{key} holds what was written, in {changed:?}"
        );
        assert_eq!(
            others(&again, key),
            others(&document, key),
            "a write to {key} changed another key, in {changed:?}"
        );
        assert_eq!(
            faults_outside(&again, &lines),
            faults_outside(&document, &lines),
            "a write to {key} changed the file's faults, in {changed:?}"
        );
        assert!(
            again
                .diagnostics()
                .iter()
                .all(|fault| !lines.contains(&fault.line)),
            "what was written to {key} is read with a fault, in {changed:?}"
        );
        rewritten_keys += 1;
    }
    rewritten_keys
}
