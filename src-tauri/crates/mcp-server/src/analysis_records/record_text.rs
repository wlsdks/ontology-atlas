//! A record file as text: `---`, one `name: <JSON>` line per field, `---`, and then the body, which
//! is a run's answer or a review's rationale exactly as written. JSON on every line is valid YAML
//! and keeps line breaks inside the text, so no YAML reader is needed and the file still opens in
//! any editor.

use super::analysis_record::{validate, AnalysisRecord};
use super::archive_limits::MAX_RECORD_BYTES;
use super::record_fault::RecordFault;
use super::record_value::RecordValue;

/// The longest metadata block, in UTF-16 units.
const METADATA_MAX_UNITS: usize = 1_500_000;

/// The name in the file for each field whose name there is not the field's own.
fn field_name(written: &str) -> &str {
    match written {
        "analysis_schema" => "schema",
        "record_type" => "recordType",
        "created_at" => "createdAt",
        other => other,
    }
}

/// `name: value` where the name starts with a letter and holds letters, digits and `_`.
fn metadata_line(line: &str) -> Option<(&str, &str)> {
    let (name, value) = line.split_once(": ")?;
    let mut characters = name.chars();
    let starts = characters.next().is_some_and(|c| c.is_ascii_alphabetic());
    let rest = characters.all(|c| c.is_ascii_alphanumeric() || c == '_');
    (starts && rest).then_some((name, value))
}

/// Where the line `---` that closes the metadata starts, and where the body begins after it.
fn closing_fence(rest: &str) -> Option<(usize, usize)> {
    let bytes = rest.as_bytes();
    let mut from = 0;
    while let Some(found) = rest.get(from..)?.find("\n---") {
        let newline = from + found;
        let after = newline + 4;
        let body = match bytes.get(after) {
            Some(b'\n') => Some(after + 1),
            Some(b'\r') if bytes.get(after + 1) == Some(&b'\n') => Some(after + 2),
            _ => None,
        };
        if let Some(body) = body {
            let start = if newline > 0 && bytes.get(newline - 1) == Some(&b'\r') {
                newline - 1
            } else {
                newline
            };
            return Some((start, body));
        }
        from = newline + 1;
    }
    None
}

/// The record a file's text holds, or the first rule it breaks.
pub fn parse_record(markdown: &str) -> Result<AnalysisRecord, RecordFault> {
    if markdown.len() > MAX_RECORD_BYTES {
        return Err(RecordFault::new(
            "Analysis record exceeds the supported byte budget.",
        ));
    }
    let rest = markdown
        .strip_prefix("---\r\n")
        .or_else(|| markdown.strip_prefix("---\n"))
        .ok_or_else(|| RecordFault::new("Analysis frontmatter is missing."))?;
    let (metadata_end, body_start) = closing_fence(rest)
        .filter(|(end, _)| {
            rest.get(..*end)
                .is_some_and(|metadata| answer_format::utf16::len(metadata) <= METADATA_MAX_UNITS)
        })
        .ok_or_else(|| RecordFault::new("Analysis frontmatter is incomplete."))?;
    let metadata = rest.get(..metadata_end).unwrap_or_default();
    let mut fields = super::field_checks::Row::new();
    for line in metadata.split('\n') {
        let line = line.strip_suffix('\r').unwrap_or(line);
        let (name, value) = metadata_line(line).ok_or_else(unsupported_metadata)?;
        let key = field_name(name);
        if fields.contains_key(key) {
            return Err(RecordFault::new(format!(
                "Duplicate analysis metadata: {key}."
            )));
        }
        let value: RecordValue = serde_json::from_str(value).map_err(|_| unsupported_metadata())?;
        fields.insert(key.to_string(), value);
    }
    let body = rest.get(body_start..).unwrap_or_default();
    let body_key = if fields.get("recordType").and_then(RecordValue::as_text) == Some("review") {
        "rationale"
    } else {
        "answer"
    };
    fields.insert(body_key.to_string(), RecordValue::Text(body.to_string()));
    validate(fields)
}

fn unsupported_metadata() -> RecordFault {
    RecordFault::new("Analysis metadata must use the supported JSON flow values.")
}
