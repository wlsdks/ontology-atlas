//! The schema checks every packet an agent hands in is held to, written once: a meaning proposal
//! and a construction qualification both say what is wrong with a field by a [`PacketFinding`], and
//! both name a source by the same citation forms. A check here is a fact about one field; what a
//! packet means is judged by the review that reads the findings.

use std::collections::HashSet;

use answer_format::utf16;
use answer_format::whitespace::trim;
use serde_json::Value;

/// How serious a finding is; a packet with an error is not accepted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PacketSeverity {
    Error,
    Warning,
}

impl PacketSeverity {
    pub const fn name(self) -> &'static str {
        match self {
            Self::Error => "error",
            Self::Warning => "warning",
        }
    }
}

/// One thing wrong with one field of a packet: a code to branch on, where it is, and a sentence.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PacketFinding {
    pub code: &'static str,
    pub severity: PacketSeverity,
    /// The path of the field, such as `scenarios[2].id`.
    pub path: String,
    pub message: String,
    pub category: Option<&'static str>,
    pub refs: Vec<String>,
}

impl PacketFinding {
    /// An error finding with no category and no references.
    pub fn error(code: &'static str, path: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code,
            severity: PacketSeverity::Error,
            path: path.into(),
            message: message.into(),
            category: None,
            refs: Vec::new(),
        }
    }

    pub fn warning(
        code: &'static str,
        path: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            severity: PacketSeverity::Warning,
            ..Self::error(code, path, message)
        }
    }

    pub fn in_category(mut self, category: &'static str) -> Self {
        self.category = Some(category);
        self
    }

    pub fn citing(mut self, refs: impl IntoIterator<Item = String>) -> Self {
        self.refs = refs.into_iter().collect();
        self
    }
}

/// Whether the value is a JSON object.
pub fn is_record(value: &Value) -> bool {
    value.is_object()
}

/// Text that is not empty, is at most `max_length` UTF-16 units and has no space at either end.
pub fn non_blank(value: &Value, max_length: usize) -> bool {
    value.as_str().is_some_and(|text| {
        let length = utf16::len(text);
        length > 0 && length <= max_length && trim(text) == text
    })
}

/// The default bound of [`non_blank`].
pub const NON_BLANK_DEFAULT_MAX: usize = 1000;

/// A moment written the way `Date.prototype.toISOString` writes it: `2026-11-28T09:30:00.000Z`,
/// and a real one (no thirteenth month, no 30 February).
pub fn valid_timestamp(value: &Value) -> bool {
    if !non_blank(value, 100) {
        return false;
    }
    value.as_str().is_some_and(is_canonical_iso_time)
}

fn is_canonical_iso_time(text: &str) -> bool {
    let bytes = text.as_bytes();
    if bytes.len() != 24 {
        return false;
    }
    let digits = |from: usize, to: usize| -> Option<u32> {
        let part = bytes.get(from..to)?;
        if !part.iter().all(u8::is_ascii_digit) {
            return None;
        }
        std::str::from_utf8(part).ok()?.parse().ok()
    };
    let punctuation = [(4, b'-'), (7, b'-'), (10, b'T'), (13, b':'), (16, b':'), (19, b'.'), (23, b'Z')];
    if !punctuation
        .iter()
        .all(|(at, expected)| bytes.get(*at) == Some(expected))
    {
        return false;
    }
    let (Some(year), Some(month), Some(day), Some(hour), Some(minute), Some(second), Some(_)) = (
        digits(0, 4),
        digits(5, 7),
        digits(8, 10),
        digits(11, 13),
        digits(14, 16),
        digits(17, 19),
        digits(20, 23),
    ) else {
        return false;
    };
    let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    (1..=days_in_month).contains(&day) && hour < 24 && minute < 60 && second < 60
}

/// A list of distinct texts, each at most 500 units with no space at either end.
pub fn unique_strings(value: &Value) -> bool {
    let Some(items) = value.as_array() else {
        return false;
    };
    let mut seen = HashSet::new();
    items
        .iter()
        .all(|item| non_blank(item, 500) && item.as_str().is_some_and(|text| seen.insert(text)))
}

/// A source named so that it means the same on every machine: not absolute, not in a home folder,
/// not a `file:` address and not a drive path.
pub fn portable_source_ref(value: &Value) -> bool {
    if !non_blank(value, NON_BLANK_DEFAULT_MAX) {
        return false;
    }
    value.as_str().is_some_and(|text| {
        !text.starts_with('/')
            && !text.starts_with('~')
            && !text.starts_with("file:")
            && !starts_with_drive(text)
    })
}

fn starts_with_drive(text: &str) -> bool {
    let bytes = text.as_bytes();
    matches!(
        (bytes.first(), bytes.get(1), bytes.get(2)),
        (Some(letter), Some(b':'), Some(b'/' | b'\\')) if letter.is_ascii_alphabetic()
    )
}

/// `sha256:` and sixty-four lower-case hexadecimal digits.
pub fn is_digest(value: &Value) -> bool {
    value.as_str().is_some_and(|text| {
        text.strip_prefix("sha256:").is_some_and(|hex| {
            hex.len() == 64 && hex.bytes().all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
        })
    })
}

/// How many rows hold each status, in the order the statuses are given.
pub fn count_by<'a>(
    rows: &[Value],
    statuses: impl IntoIterator<Item = &'a str>,
) -> Vec<(&'a str, usize)> {
    statuses
        .into_iter()
        .map(|status| {
            let count = rows
                .iter()
                .filter(|row| row.get("status").and_then(Value::as_str) == Some(status))
                .count();
            (status, count)
        })
        .collect()
}

/// The rows of `rows` by the text under `key`, refusing a row without one and a repeated one. A
/// refusal is a finding at `path[index].key`; the first row with a name keeps it.
pub fn map_unique<'a>(
    rows: &'a Value,
    key: &str,
    findings: &mut Vec<PacketFinding>,
    path: &str,
) -> Vec<(&'a str, &'a Value)> {
    let Some(items) = rows.as_array() else {
        findings.push(PacketFinding::error(
            "invalid-array",
            path,
            format!("{path} must be an array."),
        ));
        return Vec::new();
    };
    let mut kept: Vec<(&str, &Value)> = Vec::new();
    for (index, row) in items.iter().enumerate() {
        let named = row
            .get(key)
            .filter(|value| non_blank(value, NON_BLANK_DEFAULT_MAX))
            .and_then(Value::as_str);
        match named {
            Some(name) if !kept.iter().any(|(existing, _)| *existing == name) => {
                kept.push((name, row));
            }
            _ => findings.push(PacketFinding::error(
                "invalid-or-duplicate-id",
                format!("{path}[{index}].{key}"),
                format!("{path} rows need unique non-empty {key} values."),
            )),
        }
    }
    kept
}

const SOURCE_RANGE_PREFIX: &str = "source:";

/// A citation of the lines of a source: `source:<path>#L<from>-L<to>@sha256:<digest>`. The digest
/// is of the lines, so a citation stops matching when they change.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceRangeCitation {
    pub reference: String,
    pub path: String,
    pub start_line: u64,
    pub end_line: u64,
    pub sha256: String,
}

/// A path a packet may keep: relative, forward slashes, no `.` or `..` part, no control character,
/// no backtick and no comma and space. `allow_root` accepts `.` for the root itself.
pub fn is_persistable_relative_path(value: &str, allow_root: bool) -> bool {
    if allow_root && value == "." {
        return true;
    }
    let length = utf16::len(value);
    length > 0
        && length <= 500
        && trim(value) == value
        && !value.starts_with('/')
        && !starts_with_drive(value)
        && !value.contains('\\')
        && !value.contains('`')
        && !value.contains(", ")
        && !value.chars().any(|character| character <= '\u{1f}' || character == '\u{7f}')
        && value
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..")
}

/// Reads a source range citation, or `None` for any text that is not exactly one.
pub fn parse_source_range_citation(value: &str) -> Option<SourceRangeCitation> {
    let rest = value.strip_prefix(SOURCE_RANGE_PREFIX)?;
    let (path, tail) = rest.rsplit_once("#L")?;
    let (lines, digest) = tail.split_once("@sha256:")?;
    let (start, end) = lines.split_once("-L")?;
    let whole = |text: &str| {
        let counted = !text.is_empty()
            && !text.starts_with('0')
            && text.bytes().all(|byte| byte.is_ascii_digit());
        counted.then(|| text.parse::<u64>().ok()).flatten()
    };
    let (start_line, end_line) = (whole(start)?, whole(end)?);
    let is_safe = |line: u64| line <= 9_007_199_254_740_991;
    let digest_is_hex = digest.len() == 64
        && digest
            .bytes()
            .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'));
    if path.is_empty()
        || path.contains([':', '#'])
        || !is_persistable_relative_path(path, false)
        || !is_safe(start_line)
        || !is_safe(end_line)
        || end_line < start_line
        || !digest_is_hex
    {
        return None;
    }
    Some(SourceRangeCitation {
        reference: value.to_string(),
        path: path.to_string(),
        start_line,
        end_line,
        sha256: digest.to_string(),
    })
}

/// A path that names a place and not a range: persistable, the root allowed.
pub fn is_persistable_path_witness(value: &str) -> bool {
    !value.starts_with(SOURCE_RANGE_PREFIX) && is_persistable_relative_path(value, true)
}

/// A path witness or a well-formed source range citation.
pub fn is_persistable_evidence_reference(value: &str) -> bool {
    if value.starts_with(SOURCE_RANGE_PREFIX) {
        parse_source_range_citation(value).is_some()
    } else {
        is_persistable_relative_path(value, true)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn a_timestamp_is_the_form_an_iso_string_writes_and_a_real_moment() {
        assert!(valid_timestamp(&json!("2024-02-29T23:59:59.999Z")));
        for wrong in [
            "2023-02-29T00:00:00.000Z",
            "2024-13-01T00:00:00.000Z",
            "2024-01-01T24:00:00.000Z",
            "2024-01-01T00:00:00Z",
            "2024-01-01 00:00:00.000Z",
        ] {
            assert!(!valid_timestamp(&json!(wrong)), "{wrong}");
        }
    }

    #[test]
    fn a_citation_names_one_path_and_a_forward_range_of_lines() {
        let digest = "a".repeat(64);
        let good = format!("source:src/a.ts#L3-L9@sha256:{digest}");
        let parsed = parse_source_range_citation(&good).expect("well formed");
        assert_eq!((parsed.path.as_str(), parsed.start_line, parsed.end_line), ("src/a.ts", 3, 9));
        for wrong in [
            format!("source:src/a.ts#L9-L3@sha256:{digest}"),
            format!("source:src/a.ts#L0-L3@sha256:{digest}"),
            format!("source:../a.ts#L1-L3@sha256:{digest}"),
            format!("source:src\\a.ts#L1-L3@sha256:{digest}"),
            format!("source:/a.ts#L1-L3@sha256:{digest}"),
            "source:src/a.ts#L1-L3@sha256:short".to_string(),
        ] {
            assert!(parse_source_range_citation(&wrong).is_none(), "{wrong}");
        }
    }

    #[test]
    fn a_source_a_packet_names_means_the_same_on_every_machine() {
        for local in ["/etc/hosts", "~/notes", "file:///x", "C:\\x", "d:/x"] {
            assert!(!portable_source_ref(&json!(local)), "{local}");
        }
        assert!(portable_source_ref(&json!("docs/spec.md")));
    }

    #[test]
    fn rows_are_keyed_by_their_first_unique_name_and_each_refusal_is_located() {
        let rows = json!([{"id": "a"}, {"id": "a"}, {}, {"id": "b"}]);
        let mut findings = Vec::new();
        let kept = map_unique(&rows, "id", &mut findings, "scenarios");
        assert_eq!(kept.iter().map(|(name, _)| *name).collect::<Vec<_>>(), ["a", "b"]);
        let paths: Vec<_> = findings.iter().map(|finding| finding.path.as_str()).collect();
        assert_eq!(paths, ["scenarios[1].id", "scenarios[2].id"]);
    }
}
