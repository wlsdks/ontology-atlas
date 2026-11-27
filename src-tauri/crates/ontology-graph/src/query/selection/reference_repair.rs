//! What to do about a reference no node has: which existing node it most likely meant, and the
//! slug and title a new node for it would carry.

use answer_format::whitespace::trim;

use crate::compiled_graph::CompiledGraph;

fn last_segment(slug: &str) -> &str {
    match slug.rsplit('/').next() {
        Some(tail) if !tail.is_empty() => tail,
        _ => slug,
    }
}

/// The one node a dangling reference most likely meant: a slug whose last segment is the
/// reference, else a slug whose last segment starts with it or that it starts with. Two
/// candidates mean nothing is proposed, so a confidently wrong fix is never given.
pub fn near_match_slug<'a>(graph: &'a CompiledGraph, reference: &str) -> Option<&'a str> {
    let raw = trim(reference);
    if raw.is_empty() {
        return None;
    }
    let lower = raw.to_lowercase();
    let mut exact: Vec<&str> = Vec::new();
    let mut by_prefix: Vec<&str> = Vec::new();
    for node in graph.nodes() {
        let slug = node.slug();
        if slug == raw {
            continue;
        }
        let tail = last_segment(slug).to_lowercase();
        if tail == lower {
            exact.push(slug);
        } else if tail.starts_with(&lower) || lower.starts_with(&tail) {
            by_prefix.push(slug);
        }
    }
    match (exact.as_slice(), by_prefix.as_slice()) {
        ([only], _) => Some(only),
        ([], [only]) => Some(only),
        _ => None,
    }
}

/// The folder a new node of `kind` is written under.
fn folder_name(kind: &str) -> &'static str {
    match kind {
        "domain" => "domains",
        "capability" => "capabilities",
        _ => "elements",
    }
}

/// One path segment as a slug writes it: lowercase letters, digits, `.`, `_` and `-`.
fn slug_segment(segment: &str) -> String {
    let lower = trim(segment).to_lowercase();
    let mut written = String::with_capacity(lower.len());
    let mut in_gap = false;
    for character in lower.chars() {
        if character.is_ascii_lowercase() || character.is_ascii_digit() || "._-".contains(character)
        {
            written.push(character);
            in_gap = false;
        } else if !in_gap {
            written.push('-');
            in_gap = true;
        }
    }
    written.trim_matches('-').to_string()
}

/// The slug a new node of `kind` would take for `reference`: its path without the extension,
/// each segment written as a slug, under the folder of the kind.
pub fn suggested_slug(reference: &str, kind: &str) -> String {
    let folder = folder_name(kind);
    let raw = trim(reference);
    let without_extension = match raw.rfind('.') {
        Some(dot) if raw.get(dot + 1..).is_some_and(|rest| {
            !rest.is_empty() && !rest.contains(['.', '/', '\\'])
        }) =>
        {
            raw.get(..dot).unwrap_or(raw)
        }
        _ => raw,
    };
    let normalized: Vec<String> = without_extension
        .split(['/', '\\'])
        .map(slug_segment)
        .filter(|segment| !segment.is_empty())
        .collect();
    let joined = normalized.join("/");
    if joined.is_empty() {
        format!("{folder}/unnamed")
    } else if joined.starts_with(&format!("{folder}/")) {
        joined
    } else {
        format!("{folder}/{joined}")
    }
}

/// The title a new node for `reference` would carry: the file name without its extension, its
/// separators as spaces, the first letter in capitals.
pub fn title_from_reference(reference: &str) -> String {
    let raw = trim(reference);
    let last = raw.rsplit(['/', '\\']).next().unwrap_or(raw);
    let base = match last.rfind('.') {
        Some(dot) if dot + 1 < last.len() => last.get(..dot).unwrap_or(last),
        _ => last,
    };
    let base = if base.is_empty() { raw } else { base };
    let base = if base.is_empty() { "Untitled" } else { base };
    let mut spaced = String::with_capacity(base.len());
    let mut in_separator = false;
    for character in base.chars() {
        if character == '_' || character == '-' {
            if !in_separator {
                spaced.push(' ');
            }
            in_separator = true;
        } else {
            spaced.push(character);
            in_separator = false;
        }
    }
    let words = trim(&spaced);
    let mut characters = words.chars();
    match characters.next() {
        None => "Untitled".to_string(),
        Some(first) => {
            let head: String = if first.len_utf16() == 1 {
                first.to_uppercase().collect()
            } else {
                first.to_string()
            };
            format!("{head}{}", characters.as_str())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_reference_becomes_a_slug_under_the_folder_of_its_kind() {
        assert_eq!(
            suggested_slug("src/Auth Service/login.ts", "capability"),
            "capabilities/src/auth-service/login"
        );
        assert_eq!(
            suggested_slug("elements/already.md", "element"),
            "elements/already"
        );
        assert_eq!(suggested_slug("...", "domain"), "domains/unnamed");
    }

    #[test]
    fn a_reference_becomes_a_title() {
        assert_eq!(title_from_reference("src/auth_service-core.ts"), "Auth service core");
        assert_eq!(title_from_reference("src/"), "Src/");
        assert_eq!(title_from_reference("_.ts"), "Untitled");
    }
}
