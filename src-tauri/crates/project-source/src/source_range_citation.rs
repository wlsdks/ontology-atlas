//! A pinned citation of source lines, `source:<path>#L<a>-L<b>@sha256:<64 hex>`, and the rules for a
//! path a stored answer may carry: relative, free of the characters a Markdown list or a Windows
//! drive would misread.

use std::sync::LazyLock;

use answer_format::utf16;
use answer_format::whitespace::trim;
use regex::Regex;

const SOURCE_RANGE_PREFIX: &str = "source:";

static SOURCE_RANGE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^source:(.+)#L([1-9][0-9]*)-L([1-9][0-9]*)@sha256:([a-f0-9]{64})$")
        .unwrap_or_else(|error| unreachable!("a built-in pattern is invalid: {error}"))
});

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceRangeCitation {
    pub path: String,
    pub start_line: u64,
    pub end_line: u64,
    pub sha256: String,
}

fn has_drive_prefix(value: &str) -> bool {
    let mut characters = value.chars();
    matches!(
        (characters.next(), characters.next(), characters.next()),
        (Some(letter), Some(':'), Some('/' | '\\')) if letter.is_ascii_alphabetic()
    )
}

fn has_control_character(value: &str) -> bool {
    value.chars().any(|character| character <= '\u{1f}' || character == '\u{7f}')
}

/// A repository-relative path: at most 500 UTF-16 units, no surrounding space, no backslash,
/// backtick, `, ` or control character, no empty, `.` or `..` part. `allow_root` also accepts `.`.
pub fn is_persistable_relative_path(value: &str, allow_root: bool) -> bool {
    if allow_root && value == "." {
        return true;
    }
    !value.is_empty()
        && utf16::len(value) <= 500
        && trim(value) == value
        && !value.starts_with('/')
        && !has_drive_prefix(value)
        && !value.contains('\\')
        && !value.contains('`')
        && !value.contains(", ")
        && !has_control_character(value)
        && value
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..")
}

pub fn parse_source_range_citation(value: &str) -> Option<SourceRangeCitation> {
    if !value.starts_with(SOURCE_RANGE_PREFIX) {
        return None;
    }
    let captures = SOURCE_RANGE.captures(value)?;
    let path = captures.get(1)?.as_str();
    if path.contains([':', '#']) || !is_persistable_relative_path(path, false) {
        return None;
    }
    let start_line: u64 = captures.get(2)?.as_str().parse().ok()?;
    let end_line: u64 = captures.get(3)?.as_str().parse().ok()?;
    // Lines past 2^53 are not integers a JavaScript number holds exactly.
    let safe = |line: u64| line < (1_u64 << 53);
    if !safe(start_line) || !safe(end_line) || end_line < start_line {
        return None;
    }
    Some(SourceRangeCitation {
        path: path.to_string(),
        start_line,
        end_line,
        sha256: captures.get(4)?.as_str().to_string(),
    })
}

/// A path witness is a plain path, never a pinned citation.
pub fn is_persistable_path_witness(value: &str) -> bool {
    !value.starts_with(SOURCE_RANGE_PREFIX) && is_persistable_relative_path(value, true)
}

/// An evidence reference is a pinned citation that parses, or a plain path.
pub fn is_persistable_evidence_reference(value: &str) -> bool {
    if value.starts_with(SOURCE_RANGE_PREFIX) {
        parse_source_range_citation(value).is_some()
    } else {
        is_persistable_relative_path(value, true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DIGEST: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn a_pinned_citation_names_one_path_a_forward_range_and_a_digest() {
        let good = format!("source:src/a.ts#L3-L9@sha256:{DIGEST}");
        let parsed = parse_source_range_citation(&good).expect("parses");
        assert_eq!((parsed.path.as_str(), parsed.start_line, parsed.end_line), ("src/a.ts", 3, 9));
        for bad in [
            format!("source:src/a.ts#L9-L3@sha256:{DIGEST}"),
            format!("source:src/a.ts#L0-L3@sha256:{DIGEST}"),
            format!("source:../a.ts#L1-L3@sha256:{DIGEST}"),
            format!("source:C:/a.ts#L1-L3@sha256:{DIGEST}"),
            "source:src/a.ts#L1-L3@sha256:abc".to_string(),
        ] {
            assert!(parse_source_range_citation(&bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn a_path_a_stored_answer_may_carry_has_no_list_separator_drive_or_dot_part() {
        assert!(is_persistable_relative_path("src/a.ts", false));
        assert!(is_persistable_relative_path(".", true));
        assert!(!is_persistable_relative_path(".", false));
        for bad in ["a, b", "a`b", "/a", "a\\b", "a//b", "a/../b", " a", "C:\\a", "a\u{7f}"] {
            assert!(!is_persistable_relative_path(bad, true), "{bad:?}");
        }
        assert!(!is_persistable_path_witness(&format!("source:a.ts#L1-L2@sha256:{DIGEST}")));
    }
}
