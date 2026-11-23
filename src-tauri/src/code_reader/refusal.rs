use super::{OUTSIDE, SECRET};
use crate::harness_source::scope::{is_denied_name, read_class, ReadClass};
use crate::vault::scope::normalize_relative_path;

const PATH_MAX_BYTES: usize = 1024;

/// Why the reader will not open `path`, or none. A name that holds keys is `SECRET`; `.git/`, a
/// dot folder the Harness read does not show as plain text, and any path leaving the folder are
/// `OUTSIDE`. Dot files the Harness read projects (`.mcp.json`) are refused rather than shown raw.
pub(super) fn path_refusal(path: &str) -> Option<&'static str> {
    if path.is_empty() || path.len() > PATH_MAX_BYTES || path.contains('\0') || path.contains('\\')
    {
        return Some(OUTSIDE);
    }
    let Ok(normalized) = normalize_relative_path(path) else {
        return Some(OUTSIDE);
    };
    let mut parts = Vec::new();
    for component in normalized.components() {
        let Some(part) = component.as_os_str().to_str() else {
            return Some(OUTSIDE);
        };
        parts.push(part);
    }
    if parts.is_empty() {
        return Some(OUTSIDE);
    }
    if parts.iter().any(|part| part.eq_ignore_ascii_case(".git")) {
        return Some(OUTSIDE);
    }
    if parts.iter().any(|part| is_denied_name(part)) {
        return Some(SECRET);
    }
    if parts.iter().any(|part| part.starts_with('.'))
        && read_class(&parts.join("/")) != ReadClass::Text
    {
        return Some(OUTSIDE);
    }
    None
}
