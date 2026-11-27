//! What a slug may name before any path is built from it: the vault's raw-source folder and the
//! names a write tool never creates, edits or deletes. The sentences are the ones an agent reads.

use icu_normalizer::ComposingNormalizerBorrowed;
use regex::Regex;
use std::sync::OnceLock;

/// The vault folder of raw sources: every file below it is a source, never a node.
pub const VAULT_SOURCES_DIR: &str = "sources";

/// Instruction files that coding agents load; compared after NFKC and lower-casing.
const AGENT_INSTRUCTION_FILE_STEMS: [&str; 5] = [
    "agents",
    "agents.override",
    "claude",
    "claude.local",
    "gemini",
];

fn invisible_character() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // A constant pattern: the tests below compile and run it on every build.
        Regex::new(r"[\p{Cc}\p{Cf}\u{2028}\u{2029}]").expect("a constant, valid pattern")
    })
}

/// A slug is a vault-relative name; the raw-source folder is not a place for nodes.
pub fn is_vault_source_path(relative_path: &str) -> bool {
    relative_path.starts_with("sources/")
}

/// The raw file a source slug names: the slug itself when it has an extension, else `<slug>.md`.
fn raw_source_file_for_slug(slug: &str) -> String {
    let last = slug.rsplit('/').next().unwrap_or(slug);
    let has_extension = last.rfind('.').is_some_and(|dot| {
        // `/\.[^/.]+$/` needs at least one character after the last dot.
        dot + 1 < last.len()
    });
    if has_extension {
        slug.to_string()
    } else {
        format!("{slug}.md")
    }
}

/// Why a slug under `sources/` is refused, or `None` for any other slug.
pub fn raw_source_slug_issue(slug: &str) -> Option<String> {
    if !is_vault_source_path(slug) {
        return None;
    }
    Some(format!(
        "slug \"{slug}\" must not name a file under {VAULT_SOURCES_DIR}/: every file there is a raw source, never a node. \
Write or move a node into a kind folder such as domains/ or capabilities/, \
and read the source with read_source({{ path: \"{}\" }}).",
        raw_source_file_for_slug(slug)
    ))
}

/// JavaScript's `JSON.stringify` of a string, for the one place the sentence quotes a slug that way.
fn json_string(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 2);
    out.push('"');
    for character in text.chars() {
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            control if (control as u32) < 0x20 => {
                out.push_str(&format!("\\u{:04x}", control as u32));
            }
            other => out.push(other),
        }
    }
    out.push('"');
    out
}

fn ends_like_short_file_name(segment: &str) -> bool {
    // `/~\d+$/`: a tilde, then ASCII digits to the end.
    let digits = segment.bytes().rev().take_while(u8::is_ascii_digit).count();
    digits > 0
        && segment
            .len()
            .checked_sub(digits + 1)
            .and_then(|tilde| segment.as_bytes().get(tilde))
            == Some(&b'~')
}

fn nfkc_lowercase(text: &str) -> String {
    ComposingNormalizerBorrowed::new_nfkc()
        .normalize(text)
        .to_lowercase()
}

/// Why a write tool may not create, edit or delete the file `slug` names, or `None` when it may:
/// an invisible character, a Windows short-name ending, a hidden segment, an agent instruction
/// file in any letter case, or the vault README.
pub fn unwritable_slug_issue(slug: &str) -> Option<String> {
    if let Some(found) = invisible_character().find(slug) {
        let code_point = found.as_str().chars().next().map_or(0, u32::from);
        return Some(format!(
            "slug {} contains U+{code_point:04X}, a control or invisible formatting character, and a write \
tool never names one: it can break a line or disguise which file is meant. Type the slug in visible characters only.",
            json_string(slug)
        ));
    }
    let segments: Vec<&str> = slug.split(['\\', '/']).collect();
    if let Some(short_name) = segments
        .iter()
        .find(|segment| ends_like_short_file_name(segment))
    {
        return Some(format!(
            "slug \"{slug}\" has the segment \"{short_name}\", which ends like a Windows short file name (\"~1\"), and a write \
tool never names one: on Windows it can open a different file. Drop the \"~<number>\" ending."
        ));
    }
    if let Some(hidden) = segments.iter().find(|segment| segment.starts_with('.')) {
        return Some(format!(
            "slug \"{slug}\" has the path segment \"{hidden}\", and a write tool never names a segment that starts with \".\": \
hidden folders such as .claude, .agents, .codex, .github and .git hold agent and tool configuration, \
and the vault never reads them as nodes. Use a slug without a leading-dot segment, such as \"capabilities/<name>\"."
        ));
    }
    let last = segments.last().copied().unwrap_or("");
    let stem = nfkc_lowercase(last);
    if AGENT_INSTRUCTION_FILE_STEMS.contains(&stem.as_str()) {
        return Some(format!(
            "slug \"{slug}\" names {last}.md, a file coding agents load as their instructions \
(AGENTS.md, AGENTS.override.md, CLAUDE.md, CLAUDE.local.md or GEMINI.md, in any letter case, because macOS \
and Windows open those as one file). A write tool never creates, edits or deletes one; a person edits it by hand. \
Name the node for what it means instead, such as \"domains/agent-runtime\"."
        ));
    }
    if segments.len() == 1 && stem == "readme" {
        return Some(format!(
            "slug \"{slug}\" is the vault README (kind vault-readme), which a write tool never authors. \
Write the overview as a document node instead, such as \"overview\"."
        ));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_source_slug_is_named_with_the_raw_file_to_read_instead() {
        assert_eq!(raw_source_slug_issue("domains/auth"), None);
        assert_eq!(raw_source_slug_issue("sources"), None);
        let issue = raw_source_slug_issue("sources/notes/a").expect("refused");
        assert!(issue.starts_with(
            "slug \"sources/notes/a\" must not name a file under sources/: every file there is a raw source, never a node."
        ));
        assert!(issue.ends_with("read_source({ path: \"sources/notes/a.md\" })."));
        let with_extension = raw_source_slug_issue("sources/data.json").expect("refused");
        assert!(with_extension.ends_with("read_source({ path: \"sources/data.json\" })."));
        let trailing_dot = raw_source_slug_issue("sources/a.").expect("refused");
        assert!(trailing_dot.ends_with("read_source({ path: \"sources/a..md\" })."));
    }

    #[test]
    fn invisible_characters_are_named_by_code_point_and_quoted_as_json() {
        let issue = unwritable_slug_issue("a\u{202e}b").expect("refused");
        assert!(issue.starts_with("slug \"a\u{202e}b\" contains U+202E, "));
        let tab = unwritable_slug_issue("a\tb").expect("refused");
        assert!(tab.starts_with("slug \"a\\tb\" contains U+0009, "));
        let line_separator = unwritable_slug_issue("a\u{2028}b").expect("refused");
        assert!(line_separator.contains("U+2028"));
        assert_eq!(unwritable_slug_issue("domains/\u{d55c}\u{ae00}"), None);
    }

    #[test]
    fn a_short_name_ending_hidden_segment_and_instruction_file_are_refused() {
        assert!(unwritable_slug_issue("docs/PROGRA~1")
            .expect("short")
            .contains("ends like a Windows short file name"));
        assert_eq!(unwritable_slug_issue("docs/a~"), None);
        assert_eq!(unwritable_slug_issue("docs/a~x1"), None);
        assert!(unwritable_slug_issue(".claude/rules")
            .expect("hidden")
            .contains("the path segment \".claude\""));
        assert!(unwritable_slug_issue("docs/.git/x")
            .expect("hidden")
            .contains("\".git\""));
        for slug in [
            "AGENTS",
            "docs/claude",
            "Gemini",
            "agents.override",
            "docs\\CLAUDE.local",
            // A full-width spelling folds to the same file name under NFKC.
            "\u{ff21}\u{ff27}\u{ff25}\u{ff2e}\u{ff34}\u{ff33}",
        ] {
            assert!(
                unwritable_slug_issue(slug)
                    .expect(slug)
                    .contains("coding agents load as their instructions"),
                "{slug}"
            );
        }
        assert!(unwritable_slug_issue("README")
            .expect("readme")
            .contains("is the vault README"));
        assert_eq!(unwritable_slug_issue("docs/README"), None);
        assert_eq!(unwritable_slug_issue("capabilities/read-vault"), None);
    }
}
