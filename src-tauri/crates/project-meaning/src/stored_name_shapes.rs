//! The shapes a name must have to be stored in a receipt or cited in an answer: a vault slug, the
//! hash of a project's graph, an opaque id, the time of a measurement. Lengths count UTF-16 units,
//! as the script server counted them.

use std::sync::LazyLock;

use answer_format::iso_time::{parse_iso, to_iso_string};
use answer_format::utf16;
use answer_format::whitespace::trim;
use regex::Regex;

pub const SLUG_MAX_UNITS: usize = 300;
pub const PROJECT_SLUG_MAX_UNITS: usize = 200;

static GRAPH_HASH: LazyLock<Regex> = LazyLock::new(|| pattern(r"^project-graph-v1:[a-f0-9]{8}$"));
static OPAQUE: LazyLock<Regex> = LazyLock::new(|| pattern(r"^[A-Za-z0-9][A-Za-z0-9._:-]*$"));

pub(crate) fn pattern(source: &str) -> Regex {
    Regex::new(source).unwrap_or_else(|error| unreachable!("a built-in pattern is invalid: {error}"))
}

fn has_control_character(value: &str) -> bool {
    value
        .chars()
        .any(|character| character <= '\u{1f}' || character == '\u{7f}')
}

fn has_drive_prefix(value: &str) -> bool {
    let mut characters = value.chars();
    matches!(
        (characters.next(), characters.next(), characters.next()),
        (Some(letter), Some(':'), Some('/' | '\\')) if letter.is_ascii_alphabetic()
    )
}

/// A slug as a vault names a node: relative, `/`-separated, with no empty, `.` or `..` part.
pub fn safe_vault_slug(value: &str, max_units: usize) -> bool {
    !value.is_empty()
        && utf16::len(value) <= max_units
        && trim(value) == value
        && !value.starts_with('/')
        && !has_drive_prefix(value)
        && !value.contains('\\')
        && !has_control_character(value)
        && value
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..")
}

pub fn safe_graph_hash(value: &str) -> bool {
    GRAPH_HASH.is_match(value)
}

/// An id that carries no space, slash or other character a Markdown line would misread.
pub fn safe_opaque(value: &str) -> bool {
    utf16::len(value) <= 200 && OPAQUE.is_match(value)
}

/// A one-line label of at most `max_units`, with nothing around it.
pub fn non_blank(value: &str, max_units: usize) -> bool {
    !value.is_empty()
        && utf16::len(value) <= max_units
        && trim(value) == value
        && !has_control_character(value)
}

/// An instant written as `toISOString` writes it.
pub fn safe_measured_at(value: &str) -> bool {
    parse_iso(value).is_some_and(|milliseconds| to_iso_string(milliseconds) == value)
}

/// A repository-relative path as the witness inventory holds it: `.` or a `/`-separated path with
/// no empty, `.` or `..` part, at most 500 units.
pub fn safe_relative_path(value: &str) -> bool {
    value == "."
        || (!value.is_empty()
            && utf16::len(value) <= 500
            && trim(value) == value
            && !value.starts_with('/')
            && !has_drive_prefix(value)
            && !value.contains('\\')
            && !has_control_character(value)
            && value
                .split('/')
                .all(|part| !part.is_empty() && part != "." && part != ".."))
}

/// A path or citation as the assessment accepts it in an inventory: no escape out of the root, no
/// NUL, at most 500 units. Looser than [`safe_relative_path`]: a pinned citation passes.
pub fn inventory_entry_is_safe(value: &str) -> bool {
    if value.is_empty() || utf16::len(value) > 500 {
        return false;
    }
    let unified = value.replace('\\', "/");
    !unified.starts_with('/')
        && !has_drive_prefix(&unified)
        && !unified.split('/').any(|part| part == "..")
        && !unified.contains('\0')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_slug_is_relative_slash_separated_and_free_of_dot_parts() {
        assert!(safe_vault_slug("domains/billing", SLUG_MAX_UNITS));
        for bad in ["", "/a", "a//b", "a/../b", "C:/a", "a\\b", " a", "a\u{7f}"] {
            assert!(!safe_vault_slug(bad, SLUG_MAX_UNITS), "{bad:?}");
        }
        assert!(!safe_vault_slug(&"a".repeat(201), PROJECT_SLUG_MAX_UNITS));
    }

    #[test]
    fn a_time_is_stored_only_in_the_one_spelling_toisostring_writes() {
        assert!(safe_measured_at("2026-11-28T10:00:00.000Z"));
        assert!(!safe_measured_at("2026-11-28T10:00:00Z"));
        assert!(!safe_measured_at("2026-02-30T10:00:00.000Z"));
    }
}
