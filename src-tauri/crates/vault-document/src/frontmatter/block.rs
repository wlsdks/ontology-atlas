//! The lines between the two `---` fences read as top-level keys and their values.
//!
//! The shapes are the ones a vault holds: `key: scalar`, `key: [a, b]`, `key: { x: 1 }`, a block
//! list under `key:`, a block mapping under `key:` and a `|` or `>` block scalar. A line that is
//! none of them is a diagnostic, never a refusal: the node still loads with what could be read.

use answer_format::whitespace::{is_line_terminator, is_whitespace, trim};
use indexmap::IndexMap;

use super::block_scalar::{read_block_scalar, BlockIndicator};
use super::diagnostic::Diagnostic;
use super::entry_line::{read_entry, EntryLine};
use super::inline::split_top_level;
use super::line::Line;
use super::quoting::{parse_scalar, quote_fault, suggested_value, unquote, QuoteFault};
use super::value::{Scalar, Value};

/// Keys whose value is a list of relations: a scalar or object under one draws no edge, so it is
/// reported.
const RELATION_KEYS: [&str; 9] = [
    "domains",
    "capabilities",
    "elements",
    "dependencies",
    "depends_on",
    "relates",
    "contains",
    "describes",
    "broader",
];

/// Keys that would shadow what a JavaScript object inherits; the vault never holds them.
const UNSAFE_KEYS: [&str; 3] = ["__proto__", "constructor", "prototype"];

/// One top-level key and the lines it owns.
#[derive(Debug, Clone, PartialEq)]
pub struct ReadEntry {
    pub key: String,
    /// Index of the key's line among the lines read, and how many lines the entry covers: the key
    /// line and the indented lines that belong to it.
    pub first_line: usize,
    pub line_count: usize,
    /// `None` for a key the reader refuses.
    pub value: Option<Value>,
}

#[derive(Debug, Default)]
pub struct ReadBlock {
    pub entries: Vec<ReadEntry>,
    pub diagnostics: Vec<Diagnostic>,
}

/// Reads `lines`, the lines between the fences; `lines[0]` is line 2 of the file.
pub fn read_block(lines: &[Line<'_>]) -> ReadBlock {
    let mut block = ReadBlock::default();
    let mut index = 0;
    while index < lines.len() {
        index = read_entry_at(lines, index, &mut block);
    }
    block
}

/// The line number a diagnostic reports for `lines[index]`.
fn number(index: usize) -> usize {
    index + 2
}

fn text_at<'a>(lines: &[Line<'a>], index: usize) -> &'a str {
    lines.get(index).map_or("", |line| line.text)
}

fn starts_with_whitespace(text: &str) -> bool {
    text.chars().next().is_some_and(is_whitespace)
}

/// `^\s+-\s+` : an indented list item that no key owns.
fn is_indented_list_item(text: &str) -> bool {
    starts_with_whitespace(text) && list_marker_rest(text).is_some()
}

/// What follows `-` and at least one whitespace character after optional leading whitespace.
fn list_marker_rest(text: &str) -> Option<&str> {
    let rest = text.trim_start_matches(is_whitespace).strip_prefix('-')?;
    rest.starts_with(is_whitespace).then_some(rest)
}

/// `^\s*-\s+(.+)$` : the item of a block list. `.` takes no line break, so a break inside the item
/// ends the list.
fn list_item(text: &str) -> Option<&str> {
    let rest = list_marker_rest(text)?;
    let whitespace = rest
        .chars()
        .take_while(|character| is_whitespace(*character))
        .count();
    (1..=whitespace).rev().find_map(|skipped| {
        let start = rest
            .char_indices()
            .nth(skipped)
            .map_or(rest.len(), |(index, _)| index);
        let item = rest.get(start..)?;
        (!item.is_empty() && !item.chars().any(is_line_terminator)).then_some(item)
    })
}

#[derive(PartialEq, Eq)]
enum Nested {
    List,
    Mapping,
}

/// What the line after a key with no value says follows: a block list, a block mapping or nothing.
fn nested_kind(lines: &[Line<'_>], start: usize) -> Option<Nested> {
    let next = lines.get(start)?.text;
    if list_marker_rest(next).is_some() {
        return Some(Nested::List);
    }
    let indented_content = starts_with_whitespace(next) && !trim(next).is_empty();
    (indented_content && !trim(next).starts_with('#')).then_some(Nested::Mapping)
}

fn read_entry_at(lines: &[Line<'_>], index: usize, block: &mut ReadBlock) -> usize {
    let text = text_at(lines, index);
    if trim(text).starts_with(':') {
        return index + 1;
    }
    let Some(EntryLine { key, value }) = read_entry(text) else {
        report_line_without_entry(text, number(index), &mut block.diagnostics);
        return index + 1;
    };
    let line_number = number(index);
    if let Some(indicator) = BlockIndicator::of(&value) {
        let scalar = read_block_scalar(lines, index + 1, &indicator);
        block.finish_entry(
            key,
            Value::Text(scalar.text),
            index,
            scalar.next,
            line_number,
            true,
        );
        return scalar.next;
    }
    if value.is_empty() {
        return match nested_kind(lines, index + 1) {
            Some(Nested::List) => {
                let (items, next) = read_block_list(lines, index + 1);
                block.finish_entry(key, Value::List(items), index, next, line_number, false);
                next
            }
            Some(Nested::Mapping) => {
                let (members, next) = read_block_mapping(lines, index + 1, &mut block.diagnostics);
                block.finish_entry(key, Value::Map(members), index, next, line_number, true);
                next
            }
            None => {
                block.finish_entry(
                    key,
                    Value::Text(String::new()),
                    index,
                    index + 1,
                    line_number,
                    true,
                );
                index + 1
            }
        };
    }
    if value.starts_with('[') && value.ends_with(']') && value.chars().count() >= 2 {
        let inner = value.get(1..value.len() - 1).unwrap_or_default();
        let items = split_top_level(inner, ',', false)
            .into_iter()
            .map(|part| unquote(trim(part)))
            .filter(|item| !item.is_empty())
            .collect();
        block.finish_entry(
            key,
            Value::List(items),
            index,
            index + 1,
            line_number,
            false,
        );
        return index + 1;
    }
    if value.starts_with('{') && value.ends_with('}') && value.chars().count() >= 2 {
        let members = read_inline_mapping(&value, line_number, &mut block.diagnostics);
        block.finish_entry(
            key,
            Value::Map(members),
            index,
            index + 1,
            line_number,
            true,
        );
        return index + 1;
    }
    report_quote_fault(&key, line_number, &value, &mut block.diagnostics);
    let scalar = match parse_scalar(&value) {
        Scalar::Text(text) => Value::Text(text),
        Scalar::Number(number) => Value::Number(number),
        Scalar::Bool(flag) => Value::Bool(flag),
    };
    block.finish_entry(key, scalar, index, index + 1, line_number, true);
    index + 1
}

fn report_line_without_entry(text: &str, line_number: usize, diagnostics: &mut Vec<Diagnostic>) {
    let trimmed = trim(text);
    if is_indented_list_item(text) {
        diagnostics.push(Diagnostic::list_item_without_key(line_number));
    } else if !trimmed.is_empty() && !trimmed.starts_with('#') {
        diagnostics.push(Diagnostic::must_use_key_value(line_number));
    }
}

fn read_block_list(lines: &[Line<'_>], start: usize) -> (Vec<String>, usize) {
    let mut items = Vec::new();
    let mut next = start;
    while let Some(item) = lines.get(next).and_then(|line| list_item(line.text)) {
        items.push(unquote(trim(item)));
        next += 1;
    }
    (items, next)
}

/// The members of an indented block under a key. Deeper lines are members of the same mapping, not
/// nested ones: the vault holds no nesting.
fn read_block_mapping(
    lines: &[Line<'_>],
    start: usize,
    diagnostics: &mut Vec<Diagnostic>,
) -> (IndexMap<String, Scalar>, usize) {
    let mut members = IndexMap::new();
    let mut next = start;
    while let Some(line) = lines.get(next) {
        if !starts_with_whitespace(line.text) || trim(line.text).is_empty() {
            break;
        }
        let line_number = number(next);
        if let Some(member) = read_mapping_member(line.text, line_number, diagnostics) {
            report_quote_fault(&member.key, line_number, &member.value, diagnostics);
            insert_member(&mut members, member, line_number, diagnostics);
        }
        next += 1;
    }
    (members, next)
}

fn read_inline_mapping(
    value: &str,
    line_number: usize,
    diagnostics: &mut Vec<Diagnostic>,
) -> IndexMap<String, Scalar> {
    let mut members = IndexMap::new();
    let inner = trim(value.get(1..value.len() - 1).unwrap_or_default());
    if inner.is_empty() {
        return members;
    }
    for part in split_top_level(inner, ',', true) {
        if let Some(member) = read_mapping_member(part, line_number, diagnostics) {
            report_quote_fault(&member.key, line_number, &member.value, diagnostics);
            insert_member(&mut members, member, line_number, diagnostics);
        }
    }
    members
}

fn read_mapping_member(
    text: &str,
    line_number: usize,
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<EntryLine> {
    let member = read_entry(text);
    let trimmed = trim(text);
    if member.is_none() && !trimmed.is_empty() && !trimmed.starts_with('#') {
        diagnostics.push(Diagnostic::must_use_key_value(line_number));
    }
    member
}

fn insert_member(
    members: &mut IndexMap<String, Scalar>,
    member: EntryLine,
    line_number: usize,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if UNSAFE_KEYS.contains(&member.key.as_str()) {
        diagnostics.push(Diagnostic::unsafe_key(line_number, &member.key));
        return;
    }
    members.insert(member.key, parse_scalar(&member.value));
}

/// A value that opens a quote it does not close as its last character is read as literal text
/// everywhere, while the node loads cleanly; say so.
fn report_quote_fault(
    key: &str,
    line_number: usize,
    value: &str,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let Some(fault) = quote_fault(value) else {
        return;
    };
    let suggestion = suggested_value(value);
    let repair = if suggestion.is_empty() {
        String::new()
    } else {
        format!(": `{key}: {suggestion}`")
    };
    let how = match fault {
        QuoteFault::ClosesEarly => {
            "closes its quote before the end of the value, so the rest is read as literal text"
        }
        QuoteFault::NeverCloses => {
            "opens a quote the value never closes, so the quote is read as literal text"
        }
    };
    diagnostics.push(Diagnostic {
        code: super::diagnostic::DiagnosticCode::MalformedQuotedScalar,
        line: line_number,
        message: format!(
            "Frontmatter line {line_number} `{key}:` {how}. Close the quote or remove it{repair}"
        ),
    });
}

impl ReadBlock {
    /// Records an entry that ended before line `next`. `check_relation` is whether a value that is
    /// not a list is reported for a relation key.
    fn finish_entry(
        &mut self,
        key: String,
        value: Value,
        first_line: usize,
        next: usize,
        line_number: usize,
        check_relation: bool,
    ) {
        let line_count = next.saturating_sub(first_line).max(1);
        if UNSAFE_KEYS.contains(&key.as_str()) {
            self.diagnostics
                .push(Diagnostic::unsafe_key(line_number, &key));
            self.entries.push(ReadEntry {
                key,
                first_line,
                line_count,
                value: None,
            });
            return;
        }
        if check_relation && RELATION_KEYS.contains(&key.as_str()) && value.as_list().is_none() {
            self.diagnostics
                .push(Diagnostic::relation_not_a_list(line_number, &key));
        }
        self.entries.push(ReadEntry {
            key,
            first_line,
            line_count,
            value: Some(value),
        });
    }
}
